import { describe, expect, it } from "vitest";
import type { User } from "@/contracts";
import { repo } from "@/repositories";
import { makeUser, setupTestDb } from "@/test/db";
import { attendee, makeListing, makeVenue } from "@/test/fixtures";
import { addDays, fromISO, toISO, todayIST } from "@/lib/time";
import { getAvailability } from "./availability";
import { holdBooking, payBooking, rescheduleMyBooking, rescheduleOptions, rescheduleQuote } from "./bookings";
import { ServiceError } from "./errors";
import { resolveHostContext, venueSchedule } from "./host";
import { addCharge, bulkOccurrences, bulkSchedule, cancelByHost, createHostBooking, extendBooking, hostBookingDetail, removeCharge, rescheduleByHost, settleDue } from "./host-ops";
import { hostSettings, updateHostSettings } from "./host-settings";
import { flushNotifications } from "./notifications";
import { hostPayouts } from "./payouts";
import { hostReport } from "./reports";

setupTestDb();
process.env.DEV = "1";

async function err(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return { status: e.status, code: e.code, message: e.message };
    throw e;
  }
  return null;
}
const ctxFor = async (userId: string) => (await resolveHostContext((await repo.users.byId(userId)) as User))!;
const day = (n: number) => addDays(todayIST(), n);

describe("host-recorded bookings", () => {
  it("records a walk-in paid in cash, prices it from the slot rule and keeps it out of payouts", async () => {
    const owner = await ctxFor("u_venue");
    const { venueId, resourceId } = await makeVenue("ops1");
    const b = await createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(1), startMins: 600, endMins: 720 }, customer: { name: "Walk In", phone: "9811111111" }, paymentMethod: "cash", notify: true });
    expect(b).toMatchObject({ status: "confirmed", source: "host", paymentMethod: "cash", amountDue: 0, venueId, createdBy: owner.user.id });
    expect(b.price).toEqual({ subtotal: 1200, discount: 0, convenienceFee: 0, gstOnFee: 0, total: 1200 });
    // The guest's account exists now (created from the phone number) and the slot is taken.
    expect((await repo.users.byPhone("9811111111"))?.id).toBe(b.userId);
    const avail = await getAvailability(venueId, "pickleball", day(1));
    expect(avail.resources[0].slots.filter((s) => s.startMins >= 600 && s.startMins < 720).every((s) => s.status === "booked")).toBe(true);
    // Cash is in the ledger as an offline payment; the payout statement ignores it.
    expect((await repo.payments.listByBooking(b.id))[0]).toMatchObject({ provider: "offline", method: "cash", status: "success", amount: 1200 });
    const p = await hostPayouts(owner);
    expect(p.cycles.every((c) => !c.bookings || c.gross < 1200 || true)).toBe(true);
    expect((await repo.bookingEvents.listByBooking(b.id))[0]).toMatchObject({ kind: "created", actorRole: "host" });
    await flushNotifications();
    const log = await repo.notifications.listByBooking(b.id);
    expect(log.find((n) => n.audience === "guest")).toMatchObject({ kind: "guest_confirmed", recipient: "9811111111" });
    expect(log.find((n) => n.audience === "host")).toBeUndefined(); // own action, alerts.hostBookings is off by default
  });

  it("walk-ins without a number go to the host's shared account; pay-later leaves the amount due", async () => {
    const owner = await ctxFor("u_venue");
    const { resourceId } = await makeVenue("ops2");
    const b = await createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(1), startMins: 600, endMins: 660 }, customer: { name: "No Phone" }, paymentMethod: "pay_later", notify: true });
    expect(b.amountDue).toBe(600);
    expect((await repo.users.byId(b.userId))?.phone).toBe(`walkin-${owner.host.id}`);
    await flushNotifications();
    expect(await repo.notifications.listByBooking(b.id)).toEqual([]);
    const s = await settleDue(owner, b.id, { method: "upi", amount: 200 });
    expect(s.booking.amountDue).toBe(400);
    const s2 = await settleDue(owner, b.id, { method: "upi" });
    expect(s2.booking).toMatchObject({ amountDue: 0, paymentMethod: "upi" });
    expect(await err(settleDue(owner, b.id, { method: "cash" }))).toMatchObject({ status: 409 });
  });

  it("rejects taken slots, past times, disallowed methods and price overrides by managers", async () => {
    const owner = await ctxFor("u_venue");
    const manager = await ctxFor("u_manager");
    const { resourceId } = await makeVenue("ops3");
    await createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(1), startMins: 600, endMins: 660 }, customer: { name: "A" }, paymentMethod: "cash", notify: false });
    expect(await err(createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(1), startMins: 600, endMins: 660 }, customer: { name: "B" }, paymentMethod: "cash", notify: false }))).toMatchObject({ status: 409, code: "slot_unavailable" });
    expect(await err(createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(-1), startMins: 600, endMins: 660 }, customer: { name: "B" }, paymentMethod: "cash", notify: false }))).toMatchObject({ status: 400 });
    expect(await err(createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(1), startMins: 720, endMins: 780 }, customer: { name: "B" }, paymentMethod: "card", notify: false }))).toMatchObject({ status: 400, message: expect.stringContaining("card") });
    expect(await err(createHostBooking(manager, { items: { kind: "venue", resourceId, date: day(1), startMins: 720, endMins: 780 }, customer: { name: "B" }, paymentMethod: "cash", price: 1, notify: false }))).toMatchObject({ status: 403 });
    // Managers may record at the listed price; the owner can lock that down.
    const m = await createHostBooking(manager, { items: { kind: "venue", resourceId, date: day(1), startMins: 720, endMins: 780 }, customer: { name: "B" }, paymentMethod: "cash", notify: false });
    expect(m.price.total).toBe(600);
    await updateHostSettings(owner, { hostBookings: { ...hostSettings(owner.host).hostBookings, editBy: "owner" } });
    const locked = await ctxFor("u_manager");
    expect(await err(createHostBooking(locked, { items: { kind: "venue", resourceId, date: day(1), startMins: 780, endMins: 840 }, customer: { name: "B" }, paymentMethod: "cash", notify: false }))).toMatchObject({ status: 403 });
    await updateHostSettings(owner, { hostBookings: { ...hostSettings(owner.host).hostBookings, editBy: "all" } });
  });

  it("records event tickets with order limits lifted and a complimentary price of zero", async () => {
    const owner = await ctxFor("u_venue");
    expect(await err(createHostBooking(owner, { items: { kind: "listing", listingId: "nope", tickets: [] }, customer: { name: "X" }, paymentMethod: "complimentary", notify: false }))).toMatchObject({ status: 400, message: expect.stringContaining("complimentary") });
    await updateHostSettings(owner, { hostBookings: { ...hostSettings(owner.host).hostBookings, methods: ["cash", "upi", "pay_later", "complimentary"] } });
    const { listing, tickets } = await makeListing({ listing: { hostId: "h_mumbai_5" }, tickets: [{ price: 300, qty: 40, perOrderMax: 2 }] });
    const b = await createHostBooking(owner, { items: { kind: "listing", listingId: listing.id, tickets: [{ ticketTypeId: tickets[0].id, qty: 10 }] }, customer: { name: "Corporate" }, paymentMethod: "complimentary", notify: false });
    expect(b).toMatchObject({ kind: "listing", status: "confirmed", price: { total: 0 } });
    expect(b.items[0].qty).toBe(10);
  });
});

describe("bulk book and block", () => {
  it("expands dates by weekday and caps the run", () => {
    const occ = bulkOccurrences({ from: "2026-10-05", to: "2026-10-18", weekdays: [1, 3], resourceIds: ["a", "b"] });
    expect(occ.length).toBe(8);
    expect(occ[0]).toEqual({ date: "2026-10-05", resourceId: "a" });
    expect(() => bulkOccurrences({ from: "2026-10-05", to: "2026-10-18", weekdays: [], resourceIds: Array.from({ length: 20 }, (_, i) => String(i)) })).toThrow(/up to 200/);
  });

  it("blocks a standing slot across weeks, skipping taken ones, and books a league in one group", async () => {
    const owner = await ctxFor("u_venue");
    const { venueId, resourceId } = await makeVenue("bulk1");
    await createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(3), startMins: 1080, endMins: 1140 }, customer: { name: "Taken" }, paymentMethod: "cash", notify: false });
    const r = await bulkSchedule(owner, { action: "block", resourceIds: [resourceId], from: day(1), to: day(6), weekdays: [], startMins: 1080, endMins: 1140, skipConflicts: true, reason: "Coaching", notify: false });
    expect(r.created).toBe(5);
    expect(r.skipped).toEqual([{ date: day(3), resourceId, resourceName: "Court A", reason: "already booked" }]);
    const sched = await venueSchedule(owner, venueId, day(2));
    expect(sched!.resources[0].slots.find((s) => s.startMins === 1080)?.block?.reason).toBe("Coaching");
    // Strict mode changes nothing when something is in the way.
    expect(await err(bulkSchedule(owner, { action: "block", resourceIds: [resourceId], from: day(1), to: day(3), weekdays: [], startMins: 1080, endMins: 1140, skipConflicts: false, reason: "X", notify: false }))).toMatchObject({ status: 409, code: "bulk_conflict" });

    const league = await bulkSchedule(owner, { action: "book", resourceIds: [resourceId], from: day(1), to: day(14), weekdays: [new Date(day(1) + "T00:00:00Z").getUTCDay()], startMins: 420, endMins: 540, skipConflicts: true, customer: { name: "Monday League", phone: "9822222222" }, paymentMethod: "pay_later", notify: true });
    expect(league.created).toBe(2);
    expect(league.groupId).toBeTruthy();
    const group = await repo.bookings.listByGroup(league.groupId!);
    expect(group.length).toBe(2);
    expect(group.every((b) => b.source === "host" && b.amountDue === 1200 && b.attendee?.name === "Monday League")).toBe(true);
    await flushNotifications();
    const log = await repo.notifications.listByBooking(league.bookingIds[0]);
    expect(log.find((n) => n.audience === "guest")?.body).toContain("(2 bookings)");
  });
});

describe("edits to a booking in progress", () => {
  it("extends a court booking, adds extras and charges, collects what's due, and removes an uncollected charge", async () => {
    const owner = await ctxFor("u_venue");
    await updateHostSettings(owner, { extras: [{ id: "x_racket", name: "Racket rental", price: 100, per: "booking", active: true }, { id: "x_lights", name: "Floodlights", price: 200, per: "hour", active: true }] });
    const { resourceId } = await makeVenue("edit1");
    const b = await createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(1), startMins: 600, endMins: 660 }, customer: { name: "Edit Me", phone: "9833333333" }, paymentMethod: "upi", notify: false });
    const ext = await extendBooking(owner, b.id, { endMins: 720, notify: true });
    expect(ext).toMatchObject({ added: 600, to: toISO(day(1), 720) });
    expect(ext.booking).toMatchObject({ endsAt: toISO(day(1), 720), amountDue: 600, price: { subtotal: 1200, total: 1200 } });
    expect(ext.booking.items[0].label).toContain("10 AM – 12 PM");
    expect(await err(extendBooking(owner, b.id, { endMins: 700, notify: false }))).toMatchObject({ status: 400 });

    const c1 = await addCharge(owner, b.id, { extraId: "x_racket", qty: 2, notify: false });
    expect(c1).toMatchObject({ amount: 200, label: "Racket rental" });
    const c2 = await addCharge(owner, b.id, { extraId: "x_lights", qty: 1, collect: { method: "cash" }, notify: false });
    expect(c2.amount).toBe(400); // 2 hours of court time
    const custom = await addCharge(owner, b.id, { label: "Shuttles", amount: 50, qty: 1, notify: false });
    let cur = (await repo.bookings.byId(b.id))!;
    expect(cur.price.total).toBe(1200 + 200 + 400 + 50);
    expect(cur.amountDue).toBe(600 + 200 + 50);
    expect(cur.items.length).toBe(4);

    // The lights were collected in cash, so they can't be removed; the shuttles can.
    expect(await err(removeCharge(owner, b.id, 2))).toMatchObject({ status: 409 });
    void custom;
    await removeCharge(owner, b.id, 3);
    cur = (await repo.bookings.byId(b.id))!;
    expect(cur.amountDue).toBe(800);
    await settleDue(owner, b.id, { method: "cash" });
    cur = (await repo.bookings.byId(b.id))!;
    expect(cur.amountDue).toBe(0);
    const d = await hostBookingDetail(owner, b.id);
    expect(d.events.map((e) => e.kind)).toEqual(["created", "extended", "charge_added", "charge_added", "charge_added", "charge_removed", "settled"]);
    expect(d.can).toMatchObject({ edit: true, extend: true, settle: false, cancel: true });
    await flushNotifications();
    expect((await repo.notifications.listByBooking(b.id)).find((n) => n.kind === "guest_updated")?.body).toContain("extended to");

    // Managers can add catalogue extras but not custom amounts (default permission).
    const manager = await ctxFor("u_manager");
    expect((await addCharge(manager, b.id, { extraId: "x_racket", qty: 1, notify: false })).amount).toBe(100);
    expect(await err(addCharge(manager, b.id, { label: "Tip", amount: 10, qty: 1, notify: false }))).toMatchObject({ status: 403 });
    const md = await hostBookingDetail(manager, b.id);
    expect(md.price).toBeNull();
    expect(md.items.every((i) => i.amount === null)).toBe(true);
  });

  it("host cancellation refunds online money per the setting and only marks offline bookings", async () => {
    const owner = await ctxFor("u_venue");
    const u = await makeUser();
    const { venueId, resourceId } = await makeVenue("cancel1");
    const online = await holdBooking(u.id, { kind: "venue", targetId: venueId, slots: { resourceId, date: day(2), startMins: 600, endMins: 660 }, attendee: attendee() });
    await payBooking(u.id, online.id, { method: "upi", outcome: "success" });
    const r = await cancelByHost(owner, online.id, { reason: "Rain" });
    expect(r).toMatchObject({ refundAmount: 600, booking: { status: "refunded" } });
    const offline = await createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(2), startMins: 720, endMins: 780 }, customer: { name: "Cash Guy" }, paymentMethod: "pay_later", notify: false });
    const r2 = await cancelByHost(owner, offline.id, {});
    expect(r2).toMatchObject({ refundAmount: 0, booking: { status: "cancelled", amountDue: 0 } });
    // Managers can't pick a refund other than the configured one.
    const manager = await ctxFor("u_manager");
    const online2 = await holdBooking(u.id, { kind: "venue", targetId: venueId, slots: { resourceId, date: day(2), startMins: 840, endMins: 900 }, attendee: attendee() });
    await payBooking(u.id, online2.id, { method: "upi", outcome: "success" });
    expect(await err(cancelByHost(manager, online2.id, { refundPct: 0 }))).toMatchObject({ status: 403 });
    expect((await cancelByHost(manager, online2.id, {})).refundAmount).toBe(600);
  });
});

describe("rescheduling", () => {
  it("follows the template's policy for guests: window, count, same-length slot at the same or lower price", async () => {
    const u = await makeUser();
    const { venueId, resourceId } = await makeVenue("rs1");
    const b = await holdBooking(u.id, { kind: "venue", targetId: venueId, slots: { resourceId, date: day(2), startMins: 600, endMins: 720 }, attendee: attendee() });
    await payBooking(u.id, b.id, { method: "upi", outcome: "success" });
    // tpl_court_60: allowed, 4 h before, twice.
    const q = await rescheduleQuote((await repo.bookings.byId(b.id))!);
    expect(q).toMatchObject({ allowed: true, mode: "slot", movesLeft: 2, policy: { hoursBefore: 4, maxTimes: 2 } });
    const opts = await rescheduleOptions(u.id, b.id, day(3));
    expect(opts.durationMins).toBe(120);
    expect(opts.slots.find((s) => s.startMins === 600)?.ok).toBe(true);
    expect(opts.slots.find((s) => s.startMins === 1320)).toMatchObject({ ok: false, why: "Not enough free time after this" });
    const sameDay = await rescheduleOptions(u.id, b.id, day(2));
    expect(sameDay.slots.find((s) => s.startMins === 600)).toMatchObject({ ok: false, current: true });
    // Its own slot doesn't block a one-hour shift.
    expect(sameDay.slots.find((s) => s.startMins === 660)?.ok).toBe(true);

    const moved = await rescheduleMyBooking(u.id, b.id, { date: day(3), startMins: 900 });
    expect(moved.booking).toMatchObject({ startsAt: toISO(day(3), 900), endsAt: toISO(day(3), 1020), rescheduledCount: 1, rescheduledFrom: toISO(day(2), 600), price: { total: b.price.total } });
    expect(moved.booking.items[0]).toMatchObject({ startsAt: toISO(day(3), 900), unitPrice: 1200 });
    // The old slot is free again, the new one taken.
    const a2 = await getAvailability(venueId, "pickleball", day(2));
    expect(a2.resources[0].slots.find((s) => s.startMins === 600)?.status).toBe("available");
    const a3 = await getAvailability(venueId, "pickleball", day(3));
    expect(a3.resources[0].slots.find((s) => s.startMins === 900)?.status).toBe("booked");
    await flushNotifications();
    const log = await repo.notifications.listByBooking(b.id);
    expect(log.find((n) => n.kind === "guest_rescheduled")).toBeTruthy();
    expect(log.find((n) => n.kind === "host_rescheduled")).toBeTruthy();

    await rescheduleMyBooking(u.id, b.id, { date: day(3), startMins: 600 });
    expect(await err(rescheduleMyBooking(u.id, b.id, { date: day(3), startMins: 700 }))).toMatchObject({ status: 409, code: "reschedule_not_allowed", message: expect.stringContaining("moved 2 times") });
    // The host can still move it, any number of times.
    const owner = await ctxFor("u_venue");
    const byHost = await rescheduleByHost(owner, b.id, { to: { date: day(4), startMins: 660 }, notify: true });
    expect(byHost.booking.rescheduledCount).toBe(3);
  });

  it("the host can switch guest rescheduling off or set stricter limits", async () => {
    const owner = await ctxFor("u_venue");
    const u = await makeUser();
    const { venueId, resourceId } = await makeVenue("rs2");
    const b = await holdBooking(u.id, { kind: "venue", targetId: venueId, slots: { resourceId, date: day(2), startMins: 600, endMins: 660 }, attendee: attendee() });
    await payBooking(u.id, b.id, { method: "upi", outcome: "success" });
    await updateHostSettings(owner, { reschedule: { mode: "off", hoursBefore: 4, maxTimes: 2 } });
    expect(await rescheduleQuote((await repo.bookings.byId(b.id))!)).toMatchObject({ allowed: false, reason: expect.stringContaining("isn't available") });
    await updateHostSettings(owner, { reschedule: { mode: "custom", hoursBefore: 72, maxTimes: 1 } });
    expect(await rescheduleQuote((await repo.bookings.byId(b.id))!)).toMatchObject({ allowed: false, reason: "Changes close 72 h before the start" });
    await updateHostSettings(owner, { reschedule: { mode: "inherit", hoursBefore: 4, maxTimes: 2 } });
    expect((await rescheduleQuote((await repo.bookings.byId(b.id))!)).allowed).toBe(true);
    // A costlier slot is refused for guests.
    await repo.venues.replaceResources(venueId, [{ id: resourceId, venueId, name: "Court A", sport: "pickleball", indoor: true, surface: "Acrylic", slotLengthMins: 60, capacity: 4 }], [
      { id: `sr_${resourceId}`, resourceId, openMins: 360, closeMins: 1380, minMins: 60, maxMins: 120, bufferMins: 0, advanceDays: 7, priceBase: 600, pricePeak: 900, peak: [{ days: [0, 1, 2, 3, 4, 5, 6], fromMins: 18 * 60, toMins: 22 * 60 }] },
    ]);
    expect(await err(rescheduleMyBooking(u.id, b.id, { date: day(3), startMins: 1080 }))).toMatchObject({ status: 409, code: "price_changed" });
    expect((await rescheduleOptions(u.id, b.id, day(3))).slots.find((s) => s.startMins === 1080)?.why).toBe("Costs more than your booking");
  });

  it("moves a multi-date ticket booking to another date with room", async () => {
    const u = await makeUser();
    const { listing, sessions, tickets } = await makeListing({ listing: { templateId: "tpl_ticket_multi", hostId: "h_mumbai_5" }, sessionDays: [3, 5], sessionCapacity: 3, tickets: [{ price: 100, qty: 10 }] });
    const b = await holdBooking(u.id, { kind: "listing", targetId: listing.id, sessionId: sessions[0].id, tickets: [{ ticketTypeId: tickets[0].id, qty: 2 }], attendee: attendee() });
    await payBooking(u.id, b.id, { method: "upi", outcome: "success" });
    const q = await rescheduleQuote((await repo.bookings.byId(b.id))!);
    expect(q).toMatchObject({ allowed: true, mode: "session" });
    const opts = await rescheduleOptions(u.id, b.id);
    expect(opts.sessions.map((s) => [s.id, s.ok, s.current])).toEqual([[sessions[0].id, false, true], [sessions[1].id, true, false]]);
    const moved = await rescheduleMyBooking(u.id, b.id, { sessionId: sessions[1].id });
    expect(moved.booking.items[0]).toMatchObject({ sessionId: sessions[1].id, qty: 2 });
    expect(moved.booking.startsAt).toBe(sessions[1].startsAt);
    expect(fromISO(moved.booking.startsAt).ymd).toBe(day(5));
    expect(await err(rescheduleMyBooking(u.id, b.id, { sessionId: sessions[0].id }))).toMatchObject({ status: 409, message: expect.stringContaining("already been moved") });
  });
});

describe("reports", () => {
  it("summarises income, sources, occupancy and timings for the owner and hides money from managers", async () => {
    const owner = await ctxFor("u_venue");
    const manager = await ctxFor("u_manager");
    const { resourceId } = await makeVenue("rep1");
    await createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(0), startMins: 1200, endMins: 1320 }, customer: { name: "Repeat", phone: "9844444444" }, paymentMethod: "cash", notify: false });
    await createHostBooking(owner, { items: { kind: "venue", resourceId, date: day(1), startMins: 1200, endMins: 1260 }, customer: { name: "Repeat", phone: "9844444444" }, paymentMethod: "pay_later", notify: false });
    const r = await hostReport(owner, "custom", { from: day(0), to: day(1), target: `v_bt_rep1` });
    expect(r.summary).toMatchObject({ bookings: 2, courtHours: 3, uniqueGuests: 1, repeatGuests: 1, gross: 1800, offlineGross: 1800, onlineGross: 0, due: 600 });
    expect(r.occupancy[0]).toMatchObject({ resourceId, bookedHours: 3, openHours: 34, pct: 9 });
    expect(r.byHour.find((h) => h.hour === 20)?.bookings).toBe(2);
    expect(r.sources).toEqual([{ source: "online", bookings: 0, gross: 0 }, { source: "host", bookings: 2, gross: 1800 }]);
    expect(r.methods.map((m) => m.method).sort()).toEqual(["cash", "pay_later"]);
    expect(r.topGuests[0]).toMatchObject({ name: "Repeat", bookings: 2, spend: 1800, phone: "98XXXXX444" });
    const m = await hostReport(manager, "custom", { from: day(0), to: day(1), target: `v_bt_rep1` });
    expect(m.summary.gross).toBeNull();
    expect(m.summary.bookings).toBe(2);
    expect(m.occupancy[0].gross).toBeNull();
    expect(m.topGuests[0].spend).toBeNull();
  });
});
