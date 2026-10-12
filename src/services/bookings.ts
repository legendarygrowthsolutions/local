import "server-only";
import type { Booking, BookingItem, HoldRequest, PayRequest } from "@/contracts";
import { repo } from "@/repositories";
import { computePrice } from "@/lib/pricing";
import { validateRange } from "@/lib/slots/engine";
import { formatMins, fromISO, toISO } from "@/lib/time";
import { getAvailability } from "./availability";
import { loadInventory } from "./inventory";
import { toneFor } from "./cards";
import { randomCode } from "@/lib/crypto";
import { config } from "@/lib/config";
import { badRequest, conflict, notFound, ServiceError } from "./errors";
import { rateLimit } from "./rate-limit";
import { assertCouponUsable } from "./coupons";
import { isPublic } from "./visibility";

const ACTIVE_HOLD: Booking["status"][] = ["held", "pending_payment"];
/** Unpaid holds lock inventory, so cap how many one account can keep at once. */
const MAX_LIVE_HOLDS = 4;

/**
 * Hold seats or a court slot. Availability is re-checked and the hold inserted in one transaction,
 * so two people can't both get the last seat.
 */
export async function holdBooking(userId: string, req: HoldRequest, now = new Date()): Promise<Booking> {
  await rateLimit(`hold:${userId}`, 30, 10 * 60_000, "You're doing that a lot. Please wait a few minutes.", now);
  for (let attempt = 0; ; attempt++) {
    try {
      return await repo.transaction(() => holdOnce(userId, req, now));
    } catch (e) {
      // A booking-code collision (unique index) is astronomically rare; just retry with a new code.
      if (attempt < 2 && /unique|duplicate/i.test(String((e as Error).message)) && /code/i.test(String((e as Error).message))) continue;
      throw e;
    }
  }
}

async function holdOnce(userId: string, req: HoldRequest, now: Date): Promise<Booking> {
  // A new hold for the same listing/venue replaces any earlier unpaid one (e.g. Back from review).
  await repo.bookings.releaseHolds(userId, req.targetId);
  if ((await repo.bookings.countLiveHolds(userId)) >= MAX_LIVE_HOLDS)
    throw conflict("You have several unpaid bookings in progress. Finish or let them expire first.", "too_many_holds");
  const code = "LCL" + randomCode(6);
  const base = { id: "bk_" + code, code, userId, couponCode: null as string | null, createdAt: now.toISOString(), paymentRef: null };
  const coupon = req.couponCode ? await repo.coupons.byCode(req.couponCode) : null;
  if (req.couponCode && !coupon) throw badRequest("That coupon code isn't valid", "coupon_invalid");

  if (req.kind === "venue") {
    if (!req.slots) throw badRequest("Pick a slot first");
    const venue = await repo.venues.byId(req.targetId);
    if (!venue || !(await isPublic(venue))) throw notFound("Venue not found");
    const tpl = (await repo.templates.byId(venue.templateId))!;
    const resource = (await repo.venues.resources([venue.id])).find((r) => r.id === req.slots!.resourceId);
    if (!resource) throw badRequest("Unknown court");
    const avail = await getAvailability(venue.id, resource.sport, req.slots.date, now);
    if (avail.date !== req.slots.date) throw badRequest("That date can't be booked yet");
    const ra = avail.resources.find((r) => r.resource.id === resource.id)!;
    const v = validateRange(ra.slots, { startMins: req.slots.startMins, endMins: req.slots.endMins }, ra.rule);
    if (!v.ok) throw conflict(v.reason, "slot_unavailable");
    if (coupon) await assertCouponUsable(userId, coupon, v.price, { now });
    const startsAt = toISO(req.slots.date, req.slots.startMins);
    const endsAt = toISO(req.slots.date, req.slots.endMins);
    const sportName = (await repo.categories.list()).find((c) => c.slug === resource.sport && c.parentId === "cat_sports")?.name ?? resource.sport;
    const items: BookingItem[] = [
      {
        ticketTypeId: null,
        sessionId: null,
        resourceId: resource.id,
        startsAt,
        endsAt,
        label: `${resource.name} · ${formatMins(req.slots.startMins, { compact: true })} – ${formatMins(req.slots.endMins, { compact: true })}`,
        qty: 1,
        unitPrice: v.price,
      },
    ];
    return repo.bookings.insert({
      ...base,
      kind: "venue",
      listingId: null,
      venueId: venue.id,
      cityId: venue.cityId,
      title: `${sportName} · ${resource.name}`,
      venueName: venue.name,
      status: "held",
      items,
      price: computePrice(v.price, tpl.fees, coupon),
      couponCode: coupon?.code ?? null,
      attendee: req.attendee ?? null,
      startsAt,
      endsAt,
      holdExpiresAt: new Date(now.getTime() + tpl.rules.seatHoldMins * 60_000).toISOString(),
    });
  }

  const listing = await repo.listings.byId(req.targetId);
  if (!listing || !(await isPublic(listing))) throw notFound("Listing not found");
  const tpl = (await repo.templates.byId(listing.templateId))!;
  if (tpl.bookingMode === "none") throw badRequest("This listing doesn't take bookings");
  const inv = (await loadInventory([listing], now)).get(listing.id)!;

  const isPassOnly = (req.tickets ?? []).length > 0 && (req.tickets ?? []).every((t) => inv.tickets.find((x) => x.id === t.ticketTypeId)?.isPass);
  const session = req.sessionId ? inv.upcoming.find((s) => s.id === req.sessionId) : inv.upcoming[0];
  if (!session && !isPassOnly) throw conflict("That date is no longer available", "session_unavailable");

  // One line per ticket type, so per-type limits can't be dodged by repeating a type.
  const merged = new Map<string, number>();
  for (const l of req.tickets ?? []) merged.set(l.ticketTypeId, (merged.get(l.ticketTypeId) ?? 0) + l.qty);
  let lines = [...merged].map(([ticketTypeId, qty]) => ({ ticketTypeId, qty }));
  if (tpl.bookingMode === "rsvp" && lines.length === 0) {
    const t = inv.tickets[0];
    if (t) lines = [{ ticketTypeId: t.id, qty: 1 }];
  }
  if (lines.length === 0) throw badRequest("Pick at least one ticket");

  const total = lines.reduce((s, l) => s + l.qty, 0);
  if (total > tpl.rules.maxPerOrder) throw badRequest(`You can book up to ${tpl.rules.maxPerOrder} per order`);
  let nonPass = 0;
  const items: BookingItem[] = [];
  for (const line of lines) {
    const t = inv.tickets.find((x) => x.id === line.ticketTypeId);
    if (!t) throw badRequest("Unknown ticket type");
    if (!t.isPass && t.sessionId && t.sessionId !== session?.id) throw badRequest(`${t.name} isn't valid for that date`);
    if (line.qty > t.perOrderMax) throw badRequest(`Max ${t.perOrderMax} × ${t.name} per order`);
    if (t.remaining < line.qty) throw conflict(`Only ${t.remaining} × ${t.name} left`, "sold_out");
    if (!t.isPass) nonPass += line.qty;
    const sess = t.isPass ? null : session!;
    items.push({
      ticketTypeId: t.id,
      sessionId: sess?.id ?? null,
      resourceId: null,
      startsAt: sess?.startsAt ?? inv.upcoming[0]?.startsAt ?? null,
      endsAt: sess?.endsAt ?? inv.upcoming[inv.upcoming.length - 1]?.endsAt ?? null,
      label: t.name,
      qty: line.qty,
      unitPrice: t.price,
    });
  }
  if (session && nonPass > session.remaining) throw conflict(`Only ${session.remaining} spots left for that date`, "sold_out");

  const required = tpl.bookingMode === "rsvp" || tpl.bookingMode === "registration";
  if (required && !req.attendee?.name) throw badRequest("Add your details to continue");
  for (const f of listing.formFields.filter((f) => f.required)) {
    if (!req.attendee?.answers?.[f.id]) throw badRequest(`${f.label} is required`);
  }

  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  if (coupon) await assertCouponUsable(userId, coupon, subtotal, { now });
  const price = computePrice(subtotal, tpl.fees, coupon);
  const free = price.total === 0;
  // Free places are confirmed straight away, so one booking per person per date.
  if (free) {
    const mine = await repo.bookings.listByUser(userId);
    const dup = mine.some(
      (b) => b.listingId === listing.id && ["requested", "confirmed", "checked_in"].includes(b.status) && b.items.some((i) => i.sessionId === (session?.id ?? null)),
    );
    if (dup) throw conflict("You already have a place for this date. Find it under My bookings.", "already_booked");
  }
  const startsAt = items[0].startsAt ?? session!.startsAt;
  const endsAt = items[0].endsAt ?? session!.endsAt;
  return repo.bookings.insert({
    ...base,
    kind: "listing",
    listingId: listing.id,
    venueId: null,
    cityId: listing.cityId,
    title: listing.title,
    venueName: listing.venueName,
    status: free ? (tpl.rules.hostApprovalPerBooking ? "requested" : "confirmed") : "held",
    items,
    price,
    couponCode: coupon?.code ?? null,
    attendee: req.attendee ?? null,
    startsAt,
    endsAt,
    holdExpiresAt: free ? null : new Date(now.getTime() + Math.max(1, tpl.rules.seatHoldMins) * 60_000).toISOString(),
  });
}

async function ownBooking(userId: string, id: string) {
  const b = await repo.bookings.byId(id);
  if (!b || b.userId !== userId) throw notFound("Booking not found");
  return b;
}

/**
 * Dummy gateway. A failed attempt keeps the hold (status pending_payment) so the user can retry
 * until the timer runs out; success confirms the booking.
 */
export async function payBooking(userId: string, id: string, req: PayRequest, now = new Date()) {
  await rateLimit(`pay:${userId}`, 20, 10 * 60_000, "Too many payment attempts. Please wait a few minutes.", now);
  if (config.paymentProvider() !== "test") throw new ServiceError(503, "payments_unavailable", "Payments aren't available right now. Please try again later.");
  return repo.transaction(async () => {
    const b = await ownBooking(userId, id);
    if (b.status === "expired") throw new ServiceError(410, "hold_expired", "Your hold expired. Please pick your tickets again.");
    if (!ACTIVE_HOLD.includes(b.status)) throw conflict("This booking can't be paid for");
    // Re-check one-per-account coupons: parallel holds could each have applied the same code.
    if (b.couponCode && req.outcome === "success") {
      const coupon = await repo.coupons.byCode(b.couponCode);
      if (coupon) await assertCouponUsable(userId, coupon, b.price.subtotal, { bookingId: b.id, now });
    }
    const ref = `pay_test_${randomCode(12, "abcdefghijkmnpqrstuvwxyz23456789")}`;
    await repo.payments.insert({
      id: ref,
      bookingId: id,
      provider: "test",
      method: req.method,
      status: req.outcome === "failure" ? "failed" : "success",
      amount: b.price.total,
      ref,
      createdAt: now.toISOString(),
    });
    if (req.outcome === "failure") {
      await repo.bookings.update(id, { status: "pending_payment" });
      return { outcome: "failed" as const, booking: (await repo.bookings.byId(id))! };
    }
    const updated = await repo.bookings.update(id, { status: "confirmed", holdExpiresAt: null, paymentRef: ref });
    return { outcome: "success" as const, booking: updated! };
  });
}

export interface CancelQuote {
  allowed: boolean;
  refundAmount: number;
  refundPct: number;
  reason: string;
}

export async function cancelQuote(b: Booking, now = new Date()): Promise<CancelQuote> {
  if (b.status !== "confirmed" && b.status !== "requested") return { allowed: false, refundAmount: 0, refundPct: 0, reason: "This booking can't be cancelled" };
  const start = new Date(b.startsAt).getTime();
  if (start <= now.getTime()) return { allowed: false, refundAmount: 0, refundPct: 0, reason: "This booking has already started" };
  const tplId = b.listingId ? (await repo.listings.byId(b.listingId))?.templateId : (await repo.venues.byId(b.venueId!))?.templateId;
  const tpl = tplId ? await repo.templates.byId(tplId) : null;
  const policy = tpl?.cancellation ?? { policy: "none", hoursBefore: 0, refundPct: 0 };
  const hoursLeft = (start - now.getTime()) / 3_600_000;
  const refundBase = b.price.total - b.price.convenienceFee - b.price.gstOnFee;
  if (b.price.total === 0) return { allowed: true, refundAmount: 0, refundPct: 0, reason: "Free booking — cancel anytime" };
  if (policy.policy === "none") return { allowed: false, refundAmount: 0, refundPct: 0, reason: "This booking is non-refundable" };
  if (hoursLeft < policy.hoursBefore)
    return { allowed: false, refundAmount: 0, refundPct: 0, reason: `Cancellations close ${policy.hoursBefore} h before the start` };
  const pct = policy.policy === "full_until" ? 100 : policy.refundPct;
  return {
    allowed: true,
    refundAmount: Math.round(refundBase * pct) / 100,
    refundPct: pct,
    reason: pct === 100 ? "Full refund of the ticket price (fees are non-refundable)" : `${pct}% refund of the ticket price`,
  };
}

export async function cancelBooking(userId: string, id: string, now = new Date()) {
  return repo.transaction(async () => {
    const b = await ownBooking(userId, id);
    const q = await cancelQuote(b, now);
    if (!q.allowed) throw conflict(q.reason, "cancel_not_allowed");
    const updated = await repo.bookings.update(id, { status: q.refundAmount > 0 ? "refunded" : "cancelled" });
    return { booking: updated!, refundAmount: q.refundAmount };
  });
}

export interface BookingView extends Booking {
  href: string | null;
  citySlug: string;
  tone: number;
  dateYmd: string;
  cancel: CancelQuote;
  /** "Event", "Meetup", "Workshop"… or "Court" (wireframe 15 overline) */
  kindLabel: string;
  /** Row heading: the listing title, or "Pickleball · Court 1" for courts */
  heading: string;
}

async function toView(b: Booking, now: Date): Promise<BookingView> {
  const city = await repo.cities.byId(b.cityId);
  let href: string | null = null;
  let kindLabel = b.kind === "venue" ? "Court" : "Event";
  let heading = b.title;
  const cats = await repo.categories.list();
  if (b.listingId) {
    const l = await repo.listings.byId(b.listingId);
    if (l) {
      href = `/${city?.slug}/e/${l.slug}`;
      kindLabel = cats.find((c) => c.id === l.categoryId)?.singular ?? kindLabel;
    }
  } else if (b.venueId) {
    const v = await repo.venues.byId(b.venueId);
    if (v) href = `/${city?.slug}/v/${v.slug}`;
    const resId = b.items.find((i) => i.resourceId)?.resourceId;
    const res = resId ? (await repo.venues.resources([b.venueId])).find((r) => r.id === resId) : undefined;
    if (res) heading = `${cats.find((c) => c.slug === res.sport)?.name ?? res.sport} · ${res.name}`;
  }
  return {
    ...b,
    href,
    citySlug: city?.slug ?? "",
    tone: toneFor(b.listingId ?? b.venueId ?? b.id),
    dateYmd: fromISO(b.startsAt).ymd,
    cancel: await cancelQuote(b, now),
    kindLabel,
    heading,
  };
}

export async function getMyBooking(userId: string, id: string, now = new Date()) {
  return toView(await ownBooking(userId, id), now);
}

export async function listMyBookings(userId: string, now = new Date()) {
  const all = (await repo.bookings.listByUser(userId)).filter((b) => b.status !== "held" && b.status !== "pending_payment" && b.status !== "expired" && b.status !== "failed");
  const views = await Promise.all(all.map((b) => toView(b, now)));
  const t = now.getTime();
  return {
    upcoming: views.filter((b) => (b.status === "confirmed" || b.status === "requested") && new Date(b.endsAt).getTime() > t).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: views.filter((b) => b.status === "checked_in" || ((b.status === "confirmed" || b.status === "requested") && new Date(b.endsAt).getTime() <= t)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    cancelled: views.filter((b) => b.status === "cancelled" || b.status === "refunded").sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  };
}

/** Apply or remove a coupon on a held booking (re-prices server-side). */
export async function applyCoupon(userId: string, id: string, code: string | null) {
  const b = await ownBooking(userId, id);
  if (!ACTIVE_HOLD.includes(b.status)) throw conflict("This booking can't be changed");
  if (code) await rateLimit(`coupon:${userId}`, 15, 10 * 60_000, "Too many coupon attempts. Please wait a few minutes.");
  const coupon = code ? await repo.coupons.byCode(code) : null;
  if (code && !coupon) throw badRequest("That coupon code isn't valid", "coupon_invalid");
  if (coupon) await assertCouponUsable(userId, coupon, b.price.subtotal, { bookingId: b.id });
  const tplId = b.listingId ? (await repo.listings.byId(b.listingId))?.templateId : (await repo.venues.byId(b.venueId!))?.templateId;
  const tpl = (await repo.templates.byId(tplId!))!;
  return repo.bookings.update(id, { couponCode: coupon?.code ?? null, price: computePrice(b.price.subtotal, tpl.fees, coupon) });
}

/** Review screen edits (wireframe 12): who the booking is for, while it's still held. */
export async function updateAttendee(userId: string, id: string, attendee: NonNullable<Booking["attendee"]>) {
  const b = await ownBooking(userId, id);
  if (!ACTIVE_HOLD.includes(b.status)) throw conflict("This booking can't be changed");
  if (attendee.name.trim().length < 2) throw badRequest("Please enter a name");
  if (!/^[6-9]\d{9}$/.test(attendee.phone)) throw badRequest("Enter a valid 10-digit mobile number");
  const listing = b.listingId ? await repo.listings.byId(b.listingId) : null;
  for (const f of listing?.formFields.filter((f) => f.required) ?? []) {
    if (!attendee.answers?.[f.id]) throw badRequest(`${f.label} is required`);
  }
  return repo.bookings.update(id, { attendee: { ...attendee, name: attendee.name.trim() } });
}
