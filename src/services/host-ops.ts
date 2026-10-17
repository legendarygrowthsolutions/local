import "server-only";
import type { AddChargeInput, Booking, BookingItem, BulkScheduleInput, ExtendBookingInput, HostBookingInput, HostRescheduleSchema, Listing, PaymentMethod, PriceBreakdown, Venue } from "@/contracts";
import type { z } from "zod";
import { repo } from "@/repositories";
import type { BookingEvent, NotificationRecord } from "@/repositories/types";
import { newId, randomCode } from "@/lib/crypto";
import { addDays, daysBetween, formatWhen, fromISO, istParts, toISO, weekdayOf } from "@/lib/time";
import { buildCourtLine, buildTicketLines, courtItem, courtLabel, courtSlots, ticketValue } from "./booking-items";
import { rescheduleBooking } from "./bookings";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { assertApproved, hostTargets, type HostBookingRow, type HostContext, bookingRow } from "./host";
import { canEditBookings, canOverridePrice, hostSettings } from "./host-settings";
import { loadInventory } from "./inventory";
import { queueNotification } from "./notifications";
import { cancelWithRefund } from "./payments";

/**
 * What a host team does with bookings beyond watching them arrive: record walk-ins and phone
 * bookings, book or block in bulk, add time or charges to a booking in progress, collect what's
 * due, move or cancel a booking. Who may do what, and how, comes from the host's settings.
 *
 * Money recorded here never enters the weekly payout statement: the venue already has it. Online
 * bookings keep flowing through the gateway and payouts exactly as before.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const EDITABLE: Booking["status"][] = ["confirmed", "checked_in"];
const CANCELLABLE: Booking["status"][] = ["confirmed", "requested", "checked_in"];
const MAX_BULK = 200;

/** Host bookings carry no platform fee: the guest pays the ticket value, nothing on top. */
const hostPrice = (subtotal: number): PriceBreakdown => ({ subtotal: r2(subtotal), discount: 0, convenienceFee: 0, gstOnFee: 0, total: r2(subtotal) });

function assertCanEdit(ctx: HostContext) {
  assertApproved(ctx);
  if (!canEditBookings(ctx)) throw forbidden("Your owner hasn't allowed managers to change bookings");
}

function priceOverride(ctx: HostContext, price: number | undefined, computed: number) {
  if (price === undefined) return computed;
  if (!canOverridePrice(ctx)) throw forbidden("Only the owner can change prices");
  return r2(price);
}

/** A booking for one of this member's venues or events. */
async function ownBooking(ctx: HostContext, id: string) {
  const b = await repo.bookings.byId(id);
  const { listings, venues } = await hostTargets(ctx);
  if (!b || !(listings.some((l) => l.id === b.listingId) || venues.some((v) => v.id === b.venueId))) throw notFound("Booking not found");
  return b;
}

/**
 * The account a host booking belongs to. With a phone number it's that person's account (created
 * if needed, so the booking shows up once they log in); without one it's the host's shared
 * walk-in account, which can't log in.
 */
async function guestAccount(ctx: HostContext, customer: { name: string; phone?: string }) {
  if (customer.phone) {
    const u = await repo.users.byPhone(customer.phone);
    if (u) return u;
    return repo.users.insert({ id: newId("u"), phone: customer.phone, name: customer.name, gender: null, dob: null, cityId: ctx.host.cityId, interests: [], role: "user", saved: [], following: [], createdAt: new Date().toISOString() });
  }
  const phone = `walkin-${ctx.host.id}`.slice(0, 60);
  return (await repo.users.byPhone(phone)) ?? repo.users.insert({ id: newId("u"), phone, name: `Walk-in guests · ${ctx.host.brandName}`, gender: null, dob: null, cityId: ctx.host.cityId, interests: [], role: "user", saved: [], following: [], createdAt: new Date().toISOString() });
}

async function recordOfflinePayment(bookingId: string, method: Exclude<PaymentMethod, "online" | "pay_later">, amount: number, now: Date) {
  if (amount <= 0) return;
  await repo.payments.insert({ id: newId("pay"), bookingId, provider: "offline", method, status: "success", amount: r2(amount), ref: "", createdAt: now.toISOString() });
}

const event = (bookingId: string, kind: BookingEvent["kind"], ctx: HostContext, data: Record<string, unknown>, now: Date) =>
  repo.bookingEvents.insert({ id: newId("be"), bookingId, kind, actorUserId: ctx.user.id, actorRole: "host", data, createdAt: now.toISOString() });

function assertMethodAllowed(ctx: HostContext, method: PaymentMethod) {
  const s = hostSettings(ctx.host);
  if (!s.hostBookings.enabled) throw forbidden("Recording bookings from the console is switched off in your settings");
  if (!s.hostBookings.methods.includes(method as Exclude<PaymentMethod, "online">)) throw badRequest(`"${method}" isn't an allowed payment method in your settings`);
}

/** The date window a host may book into. Hosts see the whole day, so the public window doesn't apply. */
function assertHostDate(ctx: HostContext, date: string, now: Date) {
  const today = istParts(now).ymd;
  const diff = daysBetween(today, date);
  if (diff < 0) throw badRequest("That date has passed");
  if (diff >= hostSettings(ctx.host).hostBookings.advanceDays) throw badRequest(`You can book up to ${hostSettings(ctx.host).hostBookings.advanceDays} days ahead (change this in Settings)`);
}

// ---------------------------------------------------------------------------
// Record a booking (walk-in, phone, regular)
// ---------------------------------------------------------------------------

export async function createHostBooking(ctx: HostContext, input: HostBookingInput, now = new Date()): Promise<Booking> {
  assertCanEdit(ctx);
  assertMethodAllowed(ctx, input.paymentMethod);
  const { listings, venues } = await hostTargets(ctx);
  const user = await guestAccount(ctx, input.customer);
  const code = "LCL" + randomCode(6);
  const base = {
    id: "bk_" + code,
    code,
    userId: user.id,
    couponCode: null,
    attendee: { name: input.customer.name, phone: input.customer.phone ?? "", answers: {} },
    holdExpiresAt: null,
    createdAt: now.toISOString(),
    paymentRef: null,
    source: "host" as const,
    paymentMethod: input.paymentMethod,
    notes: input.notes || null,
    createdBy: ctx.user.id,
  };
  const booking = await repo.transaction(async () => {
    let b: Booking;
    if (input.items.kind === "venue") {
      const pick = input.items;
      const resource = (await repo.venues.resources(venues.map((v) => v.id))).find((r) => r.id === pick.resourceId);
      const venue = resource ? venues.find((v) => v.id === resource.venueId) : undefined;
      if (!resource || !venue) throw notFound("Court not found");
      assertHostDate(ctx, pick.date, now);
      const line = await buildCourtLine(venue, pick, now, { wholeDay: true, ignoreMax: true, advanceDays: 365 });
      if (new Date(line.endsAt).getTime() <= now.getTime()) throw badRequest("That time has already passed");
      const subtotal = input.paymentMethod === "complimentary" ? 0 : priceOverride(ctx, input.price, line.subtotal);
      b = await repo.bookings.insert({ ...base, kind: "venue", listingId: null, venueId: venue.id, cityId: venue.cityId, title: line.title, venueName: venue.name, status: "confirmed", items: [{ ...line.item, unitPrice: subtotal }], price: hostPrice(subtotal), startsAt: line.startsAt, endsAt: line.endsAt, amountDue: input.paymentMethod === "pay_later" ? subtotal : 0 });
    } else {
      const req = input.items;
      const listing = listings.find((l) => l.id === req.listingId);
      if (!listing) throw notFound("Listing not found");
      const tpl = (await repo.templates.byId(listing.templateId))!;
      const lines = await buildTicketLines(listing, tpl, req, now, { ignoreOrderLimits: true });
      const subtotal = input.paymentMethod === "complimentary" ? 0 : priceOverride(ctx, input.price, lines.subtotal);
      // A price override spreads across the lines so per-line totals still add up.
      const factor = lines.subtotal > 0 ? subtotal / lines.subtotal : 0;
      const items = lines.items.map((i) => ({ ...i, unitPrice: r2(i.unitPrice * factor) }));
      b = await repo.bookings.insert({ ...base, kind: "listing", listingId: listing.id, venueId: null, cityId: listing.cityId, title: listing.title, venueName: listing.venueName, status: "confirmed", items, price: hostPrice(subtotal), startsAt: lines.startsAt, endsAt: lines.endsAt, amountDue: input.paymentMethod === "pay_later" ? subtotal : 0 });
    }
    if (input.paymentMethod !== "pay_later" && input.paymentMethod !== "complimentary") await recordOfflinePayment(b.id, input.paymentMethod, b.price.total, now);
    await event(b.id, "created", ctx, { source: "host", paymentMethod: input.paymentMethod, price: b.price.total }, now);
    return b;
  });
  if (input.notify) queueNotification(booking.id, "confirmed", { actor: "host" });
  return booking;
}

// ---------------------------------------------------------------------------
// Bulk book / block
// ---------------------------------------------------------------------------

export interface BulkResult {
  action: "block" | "book";
  created: number;
  skipped: { date: string; resourceId: string; resourceName: string; reason: string }[];
  groupId: string | null;
  bookingIds: string[];
  blockIds: string[];
}

/** Every (date, court) the request covers, in order. */
export function bulkOccurrences(input: Pick<BulkScheduleInput, "from" | "to" | "weekdays" | "resourceIds">) {
  const out: { date: string; resourceId: string }[] = [];
  const days = daysBetween(input.from, input.to);
  if (days < 0 || days > 366) throw badRequest("Pick a range of up to a year");
  for (let i = 0; i <= days; i++) {
    const date = addDays(input.from, i);
    if (input.weekdays.length && !input.weekdays.includes(weekdayOf(date))) continue;
    for (const resourceId of input.resourceIds) out.push({ date, resourceId });
  }
  if (out.length > MAX_BULK) throw badRequest(`That's ${out.length} slots; do up to ${MAX_BULK} at a time`);
  if (!out.length) throw badRequest("No dates match that range and weekdays");
  return out;
}

export async function bulkSchedule(ctx: HostContext, input: BulkScheduleInput, now = new Date()): Promise<BulkResult> {
  assertCanEdit(ctx);
  if (input.action === "book") assertMethodAllowed(ctx, input.paymentMethod!);
  const { venues } = await hostTargets(ctx);
  const resources = await repo.venues.resources(venues.map((v) => v.id));
  for (const id of input.resourceIds) if (!resources.some((r) => r.id === id)) throw notFound("Court not found");
  const rules = await repo.venues.slotRules(input.resourceIds);
  const occurrences = bulkOccurrences(input);
  const today = istParts(now).ymd;
  const guest = input.action === "book" ? await guestAccount(ctx, input.customer!) : null;
  const groupId = input.action === "book" ? newId("grp") : null;
  const result: BulkResult = { action: input.action, created: 0, skipped: [], groupId, bookingIds: [], blockIds: [] };

  await repo.transaction(async () => {
    for (const { date, resourceId } of occurrences) {
      const resource = resources.find((r) => r.id === resourceId)!;
      const venue = venues.find((v) => v.id === resource.venueId)!;
      const skip = (reason: string) => {
        if (!input.skipConflicts) throw conflict(`${resource.name} on ${date}: ${reason}`, "bulk_conflict");
        result.skipped.push({ date, resourceId, resourceName: resource.name, reason });
      };
      if (daysBetween(today, date) < 0 || new Date(toISO(date, input.endMins)).getTime() <= now.getTime()) {
        skip("already passed");
        continue;
      }
      if (input.action === "block") {
        const rule = rules.find((r) => r.resourceId === resourceId)!;
        const slots = (await courtSlots(resource, rule, date, now, { wholeDay: true })).filter((s) => s.startMins >= input.startMins && s.endMins <= input.endMins);
        if (!slots.length) {
          skip("outside opening hours");
          continue;
        }
        if (slots.some((s) => s.status === "booked" || s.status === "held")) {
          skip("already booked");
          continue;
        }
        if (slots.every((s) => s.status === "blocked")) {
          skip("already blocked");
          continue;
        }
        const bl = await repo.venues.insertBlock({ id: newId("b"), resourceId, startsAt: toISO(date, input.startMins), endsAt: toISO(date, input.endMins), reason: input.reason || "Blocked" });
        result.blockIds.push(bl.id);
        result.created++;
        continue;
      }
      // Book
      try {
        assertHostDate(ctx, date, now);
        const line = await buildCourtLine(venue, { resourceId, date, startMins: input.startMins, endMins: input.endMins }, now, { wholeDay: true, ignoreMax: true, advanceDays: 365 });
        const subtotal = input.paymentMethod === "complimentary" ? 0 : priceOverride(ctx, input.price, line.subtotal);
        const code = "LCL" + randomCode(6);
        const b = await repo.bookings.insert({
          id: "bk_" + code,
          code,
          userId: guest!.id,
          kind: "venue",
          listingId: null,
          venueId: venue.id,
          cityId: venue.cityId,
          title: line.title,
          venueName: venue.name,
          status: "confirmed",
          items: [{ ...line.item, unitPrice: subtotal }],
          price: hostPrice(subtotal),
          couponCode: null,
          attendee: { name: input.customer!.name, phone: input.customer!.phone ?? "", answers: {} },
          startsAt: line.startsAt,
          endsAt: line.endsAt,
          holdExpiresAt: null,
          createdAt: now.toISOString(),
          paymentRef: null,
          source: "host",
          paymentMethod: input.paymentMethod!,
          amountDue: input.paymentMethod === "pay_later" ? subtotal : 0,
          notes: input.notes || null,
          createdBy: ctx.user.id,
          groupId,
        });
        if (input.paymentMethod !== "pay_later" && input.paymentMethod !== "complimentary") await recordOfflinePayment(b.id, input.paymentMethod!, b.price.total, now);
        await event(b.id, "created", ctx, { source: "host", bulk: true, groupId, paymentMethod: input.paymentMethod, price: b.price.total }, now);
        result.bookingIds.push(b.id);
        result.created++;
      } catch (e) {
        const msg = (e as Error).message;
        if (e instanceof Error && "status" in e && ((e as { status: number }).status === 409 || (e as { status: number }).status === 400) && /slot|available|passed|hours|ahead/i.test(msg)) skip(msg.replace(/^Some slots are no longer available$/, "already booked or blocked"));
        else throw e;
      }
    }
  });
  if (result.bookingIds.length && input.notify) queueNotification(result.bookingIds[0], "confirmed", { actor: "host", count: result.bookingIds.length });
  return result;
}

// ---------------------------------------------------------------------------
// Edits to a booking in progress
// ---------------------------------------------------------------------------

function nextLines(b: Booking, items: BookingItem[], deltaSubtotal: number, deltaDue: number): Partial<Booking> {
  const subtotal = r2(b.price.subtotal + deltaSubtotal);
  return {
    items,
    price: { ...b.price, subtotal, total: r2(b.price.total + deltaSubtotal) },
    amountDue: Math.max(0, r2((b.amountDue ?? 0) + deltaDue)),
  };
}

export async function extendBooking(ctx: HostContext, id: string, input: ExtendBookingInput, now = new Date()) {
  assertCanEdit(ctx);
  const result = await repo.transaction(async () => {
    const b = await ownBooking(ctx, id);
    if (!EDITABLE.includes(b.status)) throw conflict("Only confirmed bookings can be extended");
    const court = courtItem(b);
    if (b.kind !== "venue" || !court || !b.venueId) throw badRequest("Only court bookings can be extended");
    const venue = (await repo.venues.byId(b.venueId))!;
    const { ymd: date, mins: curEnd } = fromISO(court.endsAt!);
    if (input.endMins <= curEnd) throw badRequest("Pick a later end time");
    const resource = (await repo.venues.resources([venue.id])).find((r) => r.id === court.resourceId)!;
    const rule = (await repo.venues.slotRules([resource.id]))[0];
    // With a buffer between slots the next slot starts after the current end; extend from there.
    const all = await courtSlots(resource, rule, date, now, { wholeDay: true, exceptBookingId: b.id });
    const first = all.find((s) => s.startMins >= curEnd);
    if (!first || first.startMins >= input.endMins) throw badRequest("No slot to add after this booking");
    let line: Awaited<ReturnType<typeof buildCourtLine>>;
    try {
      line = await buildCourtLine(venue, { resourceId: resource.id, date, startMins: first.startMins, endMins: input.endMins }, now, { wholeDay: true, ignoreMax: true, advanceDays: 365, exceptBookingId: b.id });
    } catch (e) {
      if (e instanceof Error && "code" in e && (e as { code: string }).code === "slot_unavailable") throw conflict("The court is taken after this booking, so it can't be extended that far", "slot_unavailable");
      throw e;
    }
    const add = priceOverride(ctx, input.price, line.subtotal);
    const startMins = fromISO(court.startsAt!).mins;
    const items = b.items.map((i) => (i === court ? { ...i, endsAt: line.endsAt, label: courtLabel(resource, startMins, input.endMins), unitPrice: r2(i.unitPrice + add) } : i));
    const updated = (await repo.bookings.update(b.id, { ...nextLines(b, items, add, input.collect ? 0 : add), endsAt: line.endsAt }))!;
    if (input.collect) await recordOfflinePayment(b.id, input.collect.method, add, now);
    const ev = { from: court.endsAt, to: line.endsAt, amount: add, collected: input.collect?.method ?? null };
    await event(b.id, "extended", ctx, ev, now);
    return { booking: updated, added: add, to: line.endsAt };
  });
  if (input.notify) queueNotification(id, "updated", { actor: "host", dedupe: `extended:${result.to}`, change: `extended to ${formatWhen(result.to, now).split(" · ")[1]}` });
  return result;
}

export async function addCharge(ctx: HostContext, id: string, input: AddChargeInput, now = new Date()) {
  assertCanEdit(ctx);
  const result = await repo.transaction(async () => {
    const b = await ownBooking(ctx, id);
    if (!EDITABLE.includes(b.status)) throw conflict("Only confirmed bookings can be changed");
    let label = input.label?.trim() ?? "";
    let unit = input.amount ?? 0;
    if (input.extraId) {
      const x = hostSettings(ctx.host).extras.find((e) => e.id === input.extraId && e.active);
      if (!x) throw badRequest("That extra isn't available");
      label = x.name;
      unit = x.price;
      if (x.per === "hour") {
        const court = courtItem(b);
        const hours = court ? (new Date(court.endsAt!).getTime() - new Date(court.startsAt!).getTime()) / 3_600_000 : 1;
        unit = r2(x.price * Math.max(1, hours));
      }
    } else if (!canOverridePrice(ctx)) {
      // A custom amount is a price decision; without that permission the team uses the extras list.
      throw forbidden("Only the owner can add custom charges. Pick one of the extras instead.");
    }
    if (!label) throw badRequest("Name the charge");
    const amount = r2(unit * input.qty);
    const item: BookingItem = { ticketTypeId: null, sessionId: null, resourceId: null, startsAt: null, endsAt: null, label, qty: input.qty, unitPrice: unit };
    const updated = (await repo.bookings.update(b.id, nextLines(b, [...b.items, item], amount, input.collect ? 0 : amount)))!;
    if (input.collect) await recordOfflinePayment(b.id, input.collect.method, amount, now);
    await event(b.id, "charge_added", ctx, { label, qty: input.qty, unitPrice: unit, amount, collected: input.collect?.method ?? null, extraId: input.extraId ?? null }, now);
    return { booking: updated, amount, label };
  });
  if (input.notify) queueNotification(id, "updated", { actor: "host", dedupe: `charge:${result.booking.items.length}`, change: `${result.label} added` });
  return result;
}

/** Remove an uncollected extra line (the court or ticket lines stay). */
export async function removeCharge(ctx: HostContext, id: string, line: number, now = new Date()) {
  assertCanEdit(ctx);
  return repo.transaction(async () => {
    const b = await ownBooking(ctx, id);
    const item = b.items[line];
    if (!item || item.resourceId || item.ticketTypeId) throw badRequest("Only added charges can be removed");
    const amount = r2(item.unitPrice * item.qty);
    // Charges collected on the spot stay on the bill. Lines carry no id, so match on what they are.
    const sig = (x: { label: string; unitPrice: number; qty: number }) => `${x.label}|${x.unitPrice}|${x.qty}`;
    const events = await repo.bookingEvents.listByBooking(b.id);
    const collected = events.filter((e) => e.kind === "charge_added" && e.data.collected && sig(e.data as { label: string; unitPrice: number; qty: number }) === sig(item)).length;
    const alike = b.items.filter((i) => !i.resourceId && !i.ticketTypeId && sig(i) === sig(item)).length;
    if (alike - collected <= 0 || (b.amountDue ?? 0) + 0.005 < amount) throw conflict("This charge was already collected. Record a refund by hand instead.");
    const updated = (await repo.bookings.update(b.id, nextLines(b, b.items.filter((_, i) => i !== line), -amount, -amount)))!;
    await event(b.id, "charge_removed", ctx, { label: item.label, amount }, now);
    return { booking: updated };
  });
}

export async function settleDue(ctx: HostContext, id: string, input: { method: Exclude<PaymentMethod, "online" | "pay_later">; amount?: number }, now = new Date()) {
  assertCanEdit(ctx);
  assertMethodAllowed(ctx, input.method);
  return repo.transaction(async () => {
    const b = await ownBooking(ctx, id);
    const due = b.amountDue ?? 0;
    if (due <= 0) throw conflict("Nothing is due on this booking");
    const amount = r2(input.amount ?? due);
    if (amount <= 0 || amount > due + 0.005) throw badRequest(`Enter an amount up to ${due}`);
    await recordOfflinePayment(b.id, input.method, amount, now);
    const updated = (await repo.bookings.update(b.id, { amountDue: r2(due - amount), paymentMethod: b.paymentMethod === "pay_later" && amount >= due - 0.005 ? input.method : b.paymentMethod }))!;
    await event(b.id, "settled", ctx, { method: input.method, amount, remaining: updated.amountDue }, now);
    return { booking: updated, amount };
  });
}

export async function setBookingNotes(ctx: HostContext, id: string, notes: string, now = new Date()) {
  assertApproved(ctx);
  const b = await ownBooking(ctx, id);
  const updated = (await repo.bookings.update(b.id, { notes: notes || null }))!;
  await event(b.id, "notes", ctx, { notes }, now);
  return { booking: updated };
}

// ---------------------------------------------------------------------------
// Cancel and move
// ---------------------------------------------------------------------------

export async function cancelByHost(ctx: HostContext, id: string, input: { refundPct?: 0 | 50 | 100; reason?: string; notify?: boolean }, now = new Date()) {
  assertCanEdit(ctx);
  const b = await ownBooking(ctx, id);
  if (!CANCELLABLE.includes(b.status)) throw conflict("This booking can't be cancelled");
  const setting = hostSettings(ctx.host).cancellation.hostCancelRefundPct;
  if (input.refundPct !== undefined && input.refundPct !== setting && !ctx.isOwner) throw forbidden("Only the owner can choose a different refund");
  const pct = input.refundPct ?? setting;
  // Only money that came through the gateway can be sent back automatically.
  const online = !!b.paymentRef && b.price.total > 0;
  const amount = online ? r2((ticketValue(b) * pct) / 100) : 0;
  const booking = await cancelWithRefund(id, [b.status], amount, "host_cancelled", now);
  await repo.bookings.update(id, { amountDue: 0 });
  await event(id, "cancelled", ctx, { reason: input.reason ?? null, refundAmount: amount, refundPct: online ? pct : null, offline: !online }, now);
  if (input.notify ?? true) queueNotification(id, "cancelled", { actor: "host", refundAmount: amount });
  return { booking: { ...booking, amountDue: 0 }, refundAmount: amount };
}

export async function rescheduleByHost(ctx: HostContext, id: string, input: z.infer<typeof HostRescheduleSchema>, now = new Date()) {
  assertCanEdit(ctx);
  await ownBooking(ctx, id);
  return rescheduleBooking(id, input.to, { userId: null, byHost: { ctxUserId: ctx.user.id } }, now);
}

// ---------------------------------------------------------------------------
// Detail for the console
// ---------------------------------------------------------------------------

export interface HostBookingDetail {
  booking: HostBookingRow;
  items: { line: number; label: string; qty: number; unitPrice: number | null; amount: number | null; kind: "court" | "ticket" | "extra" }[];
  price: PriceBreakdown | null;
  amountDue: number | null;
  paymentMethod: PaymentMethod | null;
  paymentRef: string | null;
  online: boolean;
  notes: string | null;
  rescheduledFrom: string | null;
  rescheduledCount: number;
  events: { kind: BookingEvent["kind"]; at: string; by: string; summary: string }[];
  messages: { at: string; audience: NotificationRecord["audience"]; channel: string; status: string; to: string }[];
  can: { edit: boolean; price: boolean; extend: boolean; reschedule: boolean; cancel: boolean; settle: boolean };
  /** End times the booking can be extended to right now (free, contiguous slots after it). Empty = nothing free. */
  extendOptions: { endMins: number; price: number | null }[];
  extras: { id: string; name: string; price: number; per: "booking" | "hour" }[];
  methods: PaymentMethod[];
  hostCancelRefundPct: 0 | 50 | 100;
}

const summarise = (e: BookingEvent, now: Date): string => {
  const d = e.data as Record<string, string | number | null | boolean>;
  switch (e.kind) {
    case "created":
      return d.bulk ? "Recorded in a bulk booking" : `Recorded at the venue (${String(d.paymentMethod ?? "").replace("_", " ")})`;
    case "extended":
      return `Extended to ${formatWhen(String(d.to), now).split(" · ")[1]}${d.collected ? `, ${d.collected} collected` : ", added to amount due"}`;
    case "charge_added":
      return `${d.label} added${d.collected ? ` (${d.collected} collected)` : ""}`;
    case "charge_removed":
      return `${d.label} removed`;
    case "settled":
      return `Collected ₹${d.amount} by ${String(d.method).toUpperCase()}`;
    case "rescheduled":
      return `Moved from ${formatWhen(String(d.from), now)} to ${formatWhen(String(d.to), now)}`;
    case "cancelled":
      return d.refundAmount ? `Cancelled, ₹${d.refundAmount} refunded` : "Cancelled";
    case "notes":
      return "Notes updated";
  }
};

export async function hostBookingDetail(ctx: HostContext, id: string, now = new Date()): Promise<HostBookingDetail> {
  assertApproved(ctx);
  const b = await ownBooking(ctx, id);
  const [events, messages, members] = await Promise.all([repo.bookingEvents.listByBooking(id), repo.notifications.listByBooking(id), repo.members.listByHost(ctx.host.id)]);
  const s = hostSettings(ctx.host);
  const money = (v: number) => (ctx.isOwner ? r2(v) : null);
  const who = (e: BookingEvent) => (e.actorRole === "guest" ? "Guest" : e.actorRole === "admin" ? "local. support" : e.actorRole === "system" ? "System" : (members.find((m) => m.userId === e.actorUserId)?.name ?? (e.actorUserId === ctx.user.id ? "You" : "Team")));
  const editable = EDITABLE.includes(b.status) && canEditBookings(ctx);
  const extendOptions: HostBookingDetail["extendOptions"] = [];
  const court = courtItem(b);
  if (editable && b.kind === "venue" && court && b.venueId) {
    const resource = (await repo.venues.resources([b.venueId])).find((r) => r.id === court.resourceId);
    const rule = resource ? (await repo.venues.slotRules([resource.id]))[0] : null;
    if (resource && rule) {
      const { ymd, mins: curEnd } = fromISO(court.endsAt!);
      const after = (await courtSlots(resource, rule, ymd, now, { wholeDay: true, exceptBookingId: b.id })).filter((s) => s.startMins >= curEnd);
      let price = 0;
      for (const s of after) {
        if (s.status !== "available") break;
        price += s.price;
        extendOptions.push({ endMins: s.endMins, price: money(price) });
      }
    }
  }
  return {
    booking: bookingRow(ctx, b, now),
    items: b.items.map((i, line) => ({ line, label: i.label, qty: i.qty, unitPrice: money(i.unitPrice), amount: money(i.unitPrice * i.qty), kind: i.resourceId ? "court" : i.ticketTypeId ? "ticket" : "extra" })),
    price: ctx.isOwner ? b.price : null,
    amountDue: money(b.amountDue ?? 0),
    paymentMethod: b.paymentMethod ?? (b.paymentRef ? "online" : null),
    paymentRef: ctx.isOwner ? b.paymentRef : null,
    online: !!b.paymentRef,
    notes: b.notes ?? null,
    rescheduledFrom: b.rescheduledFrom ?? null,
    rescheduledCount: b.rescheduledCount ?? 0,
    events: events.map((e) => ({ kind: e.kind, at: e.createdAt, by: who(e), summary: summarise(e, now) })),
    messages: messages.map((m) => ({ at: m.createdAt, audience: m.audience, channel: m.channel, status: m.status, to: `${m.recipient.slice(0, 2)}XXXXX${m.recipient.slice(-3)}` })),
    can: {
      edit: editable,
      price: canOverridePrice(ctx, s),
      extend: editable && b.kind === "venue",
      reschedule: ["confirmed", "requested"].includes(b.status) && canEditBookings(ctx) && new Date(b.endsAt).getTime() > now.getTime(),
      cancel: CANCELLABLE.includes(b.status) && canEditBookings(ctx),
      settle: (b.amountDue ?? 0) > 0 && canEditBookings(ctx),
    },
    extendOptions,
    extras: s.extras.filter((x) => x.active).map(({ id, name, price, per }) => ({ id, name, price, per })),
    methods: s.hostBookings.methods,
    hostCancelRefundPct: s.cancellation.hostCancelRefundPct,
  };
}

/** A listing's dates and ticket types with what's left, for recording a booking from the console. */
export async function hostListingInventory(ctx: HostContext, listingId: string) {
  assertApproved(ctx);
  const { listings } = await hostTargets(ctx);
  const listing = listings.find((l) => l.id === listingId);
  if (!listing) throw notFound("Listing not found");
  const inv = (await loadInventory([listing])).get(listing.id)!;
  return {
    sessions: inv.upcoming.map((s) => ({ id: s.id, label: s.label, startsAt: s.startsAt, endsAt: s.endsAt, remaining: s.remaining })),
    tickets: inv.tickets.map((t) => ({ id: t.id, name: t.name, price: ctx.isOwner ? t.price : null, remaining: t.remaining, sessionId: t.sessionId, isPass: t.isPass })),
  };
}

export type { Listing, Venue };
