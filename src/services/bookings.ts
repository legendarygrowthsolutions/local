import "server-only";
import type { Booking, HoldRequest, Listing, PayRequest, RescheduleRequest } from "@/contracts";
import { repo } from "@/repositories";
import { computePrice } from "@/lib/pricing";
import { bookableDates } from "@/lib/slots/engine";
import { dateStripParts, formatDay, fromISO } from "@/lib/time";
import { buildCourtLine, buildTicketLines, courtItem, courtSlots } from "./booking-items";
import { loadInventory } from "./inventory";
import { toneFor } from "./cards";
import { effectiveReschedule } from "./host-settings";
import { queueNotification } from "./notifications";
import { newId } from "@/lib/crypto";
import { randomCode } from "@/lib/crypto";
import { config } from "@/lib/config";
import { badRequest, conflict, notFound, ServiceError } from "./errors";
import { rateLimit } from "./rate-limit";
import { assertCouponUsable } from "./coupons";
import { isPublic } from "./visibility";
import { cancelWithRefund, confirmCheckout } from "./payments";

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
      const b = await repo.transaction(() => holdOnce(userId, req, now));
      // Free places are confirmed on the spot; paid ones are confirmed by the payment.
      if (b.status === "confirmed" || b.status === "requested") queueNotification(b.id, "confirmed", { actor: "guest" });
      return b;
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
    const rule0 = (await repo.venues.slotRules((await repo.venues.resources([venue.id])).map((r) => r.id)))[0];
    if (!rule0 || !bookableDates(rule0, now).includes(req.slots.date)) throw badRequest("That date can't be booked yet");
    const line = await buildCourtLine(venue, req.slots, now);
    if (coupon) await assertCouponUsable(userId, coupon, line.subtotal, { now, cityId: venue.cityId });
    return repo.bookings.insert({
      ...base,
      kind: "venue",
      listingId: null,
      venueId: venue.id,
      cityId: venue.cityId,
      title: line.title,
      venueName: venue.name,
      status: "held",
      items: [line.item],
      price: computePrice(line.subtotal, tpl.fees, coupon),
      couponCode: coupon?.code ?? null,
      attendee: req.attendee ?? null,
      startsAt: line.startsAt,
      endsAt: line.endsAt,
      holdExpiresAt: new Date(now.getTime() + tpl.rules.seatHoldMins * 60_000).toISOString(),
    });
  }

  const listing = await repo.listings.byId(req.targetId);
  if (!listing || !(await isPublic(listing))) throw notFound("Listing not found");
  const tpl = (await repo.templates.byId(listing.templateId))!;
  const { items, subtotal, session, startsAt, endsAt } = await buildTicketLines(listing, tpl, req, now);

  const required = tpl.bookingMode === "rsvp" || tpl.bookingMode === "registration";
  if (required && !req.attendee?.name) throw badRequest("Add your details to continue");
  for (const f of listing.formFields.filter((f) => f.required)) {
    if (!req.attendee?.answers?.[f.id]) throw badRequest(`${f.label} is required`);
  }

  if (coupon) await assertCouponUsable(userId, coupon, subtotal, { now, cityId: listing.cityId });
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
  if ("razorpayPaymentId" in req) return confirmCheckout(userId, id, req, now);
  if (config.paymentProvider() !== "test") throw new ServiceError(503, "payments_unavailable", "Payments aren't available right now. Please try again later.");
  const r = await repo.transaction(async () => {
    const b = await ownBooking(userId, id);
    if (b.status === "expired") throw new ServiceError(410, "hold_expired", "Your hold expired. Please pick your tickets again.");
    if (!ACTIVE_HOLD.includes(b.status)) throw conflict("This booking can't be paid for");
    // Re-check one-per-account coupons: parallel holds could each have applied the same code.
    if (b.couponCode && req.outcome === "success") {
      const coupon = await repo.coupons.byCode(b.couponCode);
      if (coupon) await assertCouponUsable(userId, coupon, b.price.subtotal, { bookingId: b.id, now, cityId: b.cityId });
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
    const updated = await repo.bookings.update(id, { status: "confirmed", holdExpiresAt: null, paymentRef: ref, paymentMethod: "online" });
    return { outcome: "success" as const, booking: updated! };
  });
  if (r.outcome === "success") queueNotification(id, "confirmed", { actor: "guest" });
  return r;
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
  if (b.price.total === 0) return { allowed: true, refundAmount: 0, refundPct: 0, reason: "Free booking, cancel anytime" };
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
  const b = await ownBooking(userId, id);
  const q = await cancelQuote(b, now);
  if (!q.allowed) throw conflict(q.reason, "cancel_not_allowed");
  const booking = await cancelWithRefund(id, [b.status], q.refundAmount, "guest_cancelled", now);
  await repo.bookingEvents.insert({ id: newId("be"), bookingId: id, kind: "cancelled", actorUserId: userId, actorRole: "guest", data: { refundAmount: q.refundAmount }, createdAt: now.toISOString() });
  queueNotification(id, "cancelled", { actor: "guest", refundAmount: q.refundAmount });
  return { booking, refundAmount: q.refundAmount };
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

export interface RescheduleQuote {
  allowed: boolean;
  reason: string;
  /** How the guest picks the new time: a court slot of the same length, or another date of the listing. */
  mode: "slot" | "session" | null;
  movesLeft: number;
  policy: { hoursBefore: number; maxTimes: number };
}

/** What the applicable policy (host override, else booking type) says about moving this booking now. */
export async function rescheduleQuote(b: Booking, now = new Date()): Promise<RescheduleQuote> {
  const none = (reason: string, policy = { hoursBefore: 0, maxTimes: 0 }): RescheduleQuote => ({ allowed: false, reason, mode: null, movesLeft: 0, policy });
  if (b.status !== "confirmed" && b.status !== "requested") return none("This booking can't be moved");
  const start = new Date(b.startsAt).getTime();
  if (start <= now.getTime()) return none("This booking has already started");
  const target = b.listingId ? await repo.listings.byId(b.listingId) : await repo.venues.byId(b.venueId!);
  const host = target ? await repo.hosts.byId(target.hostId) : null;
  const tpl = target ? await repo.templates.byId(target.templateId) : null;
  if (!target || !host || !tpl) return none("This booking can't be moved");
  const policy = effectiveReschedule(host, tpl);
  const pol = { hoursBefore: policy.hoursBefore, maxTimes: policy.maxTimes };
  if (!policy.allowed) return none("Rescheduling isn't available for this booking", pol);
  const mode: RescheduleQuote["mode"] = b.kind === "venue" ? "slot" : "session";
  if (mode === "session") {
    const inv = (await loadInventory([target as Listing], now)).get(target.id);
    if (!inv || inv.upcoming.filter((s) => s.id !== b.items[0]?.sessionId).length === 0) return none("There's no other date to move to", pol);
    if (b.items.some((i) => i.ticketTypeId && inv.tickets.find((t) => t.id === i.ticketTypeId)?.sessionId)) return none("These tickets are for a specific date", pol);
  }
  const used = b.rescheduledCount ?? 0;
  if (used >= policy.maxTimes) return none(policy.maxTimes === 1 ? "This booking has already been moved once" : `This booking has already been moved ${policy.maxTimes} times`, pol);
  const hoursLeft = (start - now.getTime()) / 3_600_000;
  if (hoursLeft < policy.hoursBefore) return none(`Changes close ${policy.hoursBefore} h before the start`, pol);
  return {
    allowed: true,
    reason: mode === "slot" ? "Move to another slot of the same length at the same or a lower price. Any difference isn't refunded." : "Move to another date. Your tickets stay the same.",
    mode,
    movesLeft: policy.maxTimes - used,
    policy: pol,
  };
}

/**
 * Move a booking. Availability is re-checked and the booking updated in one transaction. Guests are
 * bound by the policy; the host console passes `byHost` (any time, any number of moves, courts of
 * the same sport, and no price ceiling since they settle differences by hand).
 */
export async function rescheduleBooking(
  id: string,
  req: RescheduleRequest,
  who: { userId: string | null; byHost?: { ctxUserId: string } },
  now = new Date(),
): Promise<{ booking: Booking; from: string }> {
  const result = await repo.transaction(async () => {
    const b = await repo.bookings.byId(id);
    if (!b || (who.userId && b.userId !== who.userId)) throw notFound("Booking not found");
    if (!who.byHost) {
      const q = await rescheduleQuote(b, now);
      if (!q.allowed) throw conflict(q.reason, "reschedule_not_allowed");
    } else if (b.status !== "confirmed" && b.status !== "requested") throw conflict("This booking can't be moved");
    const from = b.startsAt;
    let patch: Partial<Booking>;
    if ("sessionId" in req) {
      if (b.kind !== "venue" && b.listingId) {
        const listing = (await repo.listings.byId(b.listingId))!;
        const tpl = (await repo.templates.byId(listing.templateId))!;
        const ticketLines = b.items.filter((i) => i.ticketTypeId);
        if (ticketLines.some((i) => i.sessionId === req.sessionId)) throw badRequest("That's the date you already have");
        const lines = await buildTicketLines(listing, tpl, { sessionId: req.sessionId, tickets: ticketLines.map((i) => ({ ticketTypeId: i.ticketTypeId!, qty: i.qty })) }, now, { ignoreOrderLimits: true });
        if (Math.abs(lines.subtotal - ticketLines.reduce((s, i) => s + i.qty * i.unitPrice, 0)) > 0.005) throw conflict("Those tickets are priced differently on that date", "price_changed");
        patch = { items: [...lines.items, ...b.items.filter((i) => !i.ticketTypeId)], startsAt: lines.startsAt, endsAt: lines.endsAt };
      } else throw badRequest("Pick a slot for this booking");
    } else {
      const court = courtItem(b);
      if (b.kind !== "venue" || !court || !b.venueId) throw badRequest("Pick a date for this booking");
      const venue = (await repo.venues.byId(b.venueId))!;
      const mins = (new Date(court.endsAt!).getTime() - new Date(court.startsAt!).getTime()) / 60_000;
      const resourceId = req.resourceId ?? court.resourceId!;
      if (resourceId !== court.resourceId) {
        const [a, c] = await Promise.all([repo.venues.resources([venue.id]).then((rs) => rs.find((r) => r.id === court.resourceId)), repo.venues.resources([venue.id]).then((rs) => rs.find((r) => r.id === resourceId))]);
        if (!a || !c || a.sport !== c.sport) throw badRequest("Pick a court for the same sport");
      }
      const rule0 = (await repo.venues.slotRules([resourceId]))[0];
      if (!who.byHost && (!rule0 || !bookableDates(rule0, now).includes(req.date))) throw badRequest("That date can't be booked yet");
      const line = await buildCourtLine(venue, { resourceId, date: req.date, startMins: req.startMins, endMins: req.startMins + mins }, now, { exceptBookingId: b.id, wholeDay: !!who.byHost, advanceDays: who.byHost ? 365 : undefined, ignoreMax: !!who.byHost });
      if (line.startsAt === court.startsAt && line.item.resourceId === court.resourceId) throw badRequest("That's the slot you already have");
      if (!who.byHost && line.subtotal > court.unitPrice + 0.005) throw conflict("Pick a slot at the same or a lower price", "price_changed");
      if (who.byHost && new Date(line.endsAt).getTime() <= now.getTime()) throw badRequest("That time has already passed");
      // Keep the price the guest paid; the court line records the new time at the original rate.
      patch = { items: [{ ...line.item, unitPrice: court.unitPrice }, ...b.items.filter((i) => i !== court)], startsAt: line.startsAt, endsAt: line.endsAt, title: line.title };
    }
    const updated = (await repo.bookings.update(b.id, { ...patch, rescheduledCount: (b.rescheduledCount ?? 0) + 1, rescheduledFrom: b.rescheduledFrom ?? from }))!;
    await repo.bookingEvents.insert({
      id: newId("be"),
      bookingId: b.id,
      kind: "rescheduled",
      actorUserId: who.byHost?.ctxUserId ?? who.userId,
      actorRole: who.byHost ? "host" : "guest",
      data: { from, to: updated.startsAt },
      createdAt: now.toISOString(),
    });
    return { booking: updated, from };
  });
  queueNotification(id, "rescheduled", { actor: who.byHost ? "host" : "guest", dedupe: `rescheduled:${result.booking.rescheduledCount}`, oldStartsAt: result.from });
  return result;
}

export interface RescheduleOptions {
  quote: RescheduleQuote;
  /** Court bookings: dates in the public window and that date's slots for the same court. */
  dates: { date: string; label: string; weekday: string; day: string }[];
  date: string | null;
  durationMins: number;
  maxPrice: number;
  slots: { startMins: number; endMins: number; price: number; peak: boolean; ok: boolean; why: string | null; current: boolean }[];
  /** Listing bookings: other dates with room for the same tickets. */
  sessions: { id: string; startsAt: string; endsAt: string; label: string; remaining: number; ok: boolean; current: boolean }[];
}

/** Everything the guest needs to pick a new time, with each option marked possible or not and why. */
export async function rescheduleOptions(userId: string, id: string, date?: string, now = new Date()): Promise<RescheduleOptions> {
  const b = await ownBooking(userId, id);
  const quote = await rescheduleQuote(b, now);
  const empty: RescheduleOptions = { quote, dates: [], date: null, durationMins: 0, maxPrice: 0, slots: [], sessions: [] };
  if (!quote.allowed) return empty;
  if (quote.mode === "slot") {
    const court = courtItem(b)!;
    const venue = (await repo.venues.byId(b.venueId!))!;
    const resource = (await repo.venues.resources([venue.id])).find((r) => r.id === court.resourceId)!;
    const rule = (await repo.venues.slotRules([resource.id]))[0];
    const dates = bookableDates(rule, now);
    const day = date && dates.includes(date) ? date : dates[0];
    const durationMins = (new Date(court.endsAt!).getTime() - new Date(court.startsAt!).getTime()) / 60_000;
    const all = await courtSlots(resource, rule, day, now, { exceptBookingId: b.id });
    const cur = fromISO(court.startsAt!);
    const slots = all.map((s) => {
      const inside = all.filter((x) => x.startMins >= s.startMins && x.endMins <= s.startMins + durationMins);
      const covered = inside.length ? inside[inside.length - 1].endMins - inside[0].startMins : 0;
      const price = inside.reduce((sum, x) => sum + x.price, 0);
      const current = cur.ymd === day && cur.mins === s.startMins;
      let why: string | null = null;
      if (current) why = "Your current slot";
      else if (s.status === "past") why = "Past";
      else if (covered !== durationMins || inside.some((x) => x.status !== "available")) why = s.status === "available" ? "Not enough free time after this" : "Taken";
      else if (price > court.unitPrice + 0.005) why = "Costs more than your booking";
      return { startMins: s.startMins, endMins: s.startMins + durationMins, price, peak: s.peak, ok: why === null, why, current };
    });
    return { ...empty, dates: dates.map((d) => ({ date: d, ...dateStripParts(d), label: formatDay(d, now) })), date: day, durationMins, maxPrice: court.unitPrice, slots };
  }
  const listing = (await repo.listings.byId(b.listingId!))!;
  const inv = (await loadInventory([listing], now)).get(listing.id)!;
  const qty = b.items.filter((i) => i.ticketTypeId).reduce((s, i) => s + i.qty, 0);
  const currentId = b.items.find((i) => i.sessionId)?.sessionId ?? null;
  return {
    ...empty,
    sessions: inv.upcoming.map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, label: s.label, remaining: s.remaining, ok: s.id !== currentId && s.remaining >= qty, current: s.id === currentId })),
  };
}

/** Guest-side: the booking must be theirs. */
export async function rescheduleMyBooking(userId: string, id: string, req: RescheduleRequest, now = new Date()) {
  await rateLimit(`reschedule:${userId}`, 10, 10 * 60_000, "Too many changes. Please wait a few minutes.", now);
  return rescheduleBooking(id, req, { userId }, now);
}

export interface BookingView extends Booking {
  href: string | null;
  citySlug: string;
  tone: number;
  dateYmd: string;
  cancel: CancelQuote;
  reschedule: RescheduleQuote;
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
    reschedule: await rescheduleQuote(b, now),
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
  if (coupon) await assertCouponUsable(userId, coupon, b.price.subtotal, { bookingId: b.id, cityId: b.cityId });
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
