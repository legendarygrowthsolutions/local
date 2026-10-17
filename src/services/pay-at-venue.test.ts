import { describe, expect, it } from "vitest";
import type { User } from "@/contracts";
import { repo } from "@/repositories";
import { makeUser, setupTestDb } from "@/test/db";
import { attendee, makeListing, makeVenue } from "@/test/fixtures";
import { addDays, todayIST } from "@/lib/time";
import { cancelBooking, cancelQuote, getMyBooking, holdBooking, listMyBookings, payAtVenue, payAtVenueQuote } from "./bookings";
import { ServiceError } from "./errors";
import { checkIn, hostBookings, resolveHostContext } from "./host";
import { cancelByHost, hostBookingDetail, markNoShow, markPaidAtVenue, settleDue, undoNoShow } from "./host-ops";
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

/** A held court booking at h_mumbai_5 (owner u_venue, manager u_manager). */
async function heldCourt(userId: string, suffix: string, dayOffset = 1, couponCode?: string) {
  const { venueId, resourceId } = await makeVenue(suffix);
  const b = await holdBooking(userId, { kind: "venue", targetId: venueId, slots: { resourceId, date: day(dayOffset), startMins: 600, endMins: 720 }, attendee: attendee(), couponCode });
  return { b, venueId, resourceId };
}

describe("pay at the venue", () => {
  it("is off until the host accepts cash; then confirms the hold at the ticket value with the amount due", async () => {
    const owner = await ctxFor("u_venue");
    await updateHostSettings(owner, { payAtVenue: { enabled: false } });
    const guest = await makeUser();
    const { b } = await heldCourt(guest.id, "pav1");
    expect(b.status).toBe("held");
    expect(b.price.convenienceFee).toBeGreaterThan(0);
    expect(await payAtVenueQuote(b)).toMatchObject({ allowed: false, reason: expect.stringContaining("online payments only") });
    expect(await err(payAtVenue(guest.id, b.id))).toMatchObject({ status: 409, code: "pay_at_venue_not_allowed" });
    // The guest's view hides the option entirely when the host doesn't take cash.
    expect((await getMyBooking(guest.id, b.id)).payAtVenue.allowed).toBe(false);

    await updateHostSettings(owner, { payAtVenue: { enabled: true } });
    expect(hostSettings(owner.host).payAtVenue.enabled).toBe(true);
    const view = await getMyBooking(guest.id, b.id);
    expect(view.payAtVenue).toMatchObject({ allowed: true, amount: 1200, couponDropped: null, noShows: 0, limit: 2 });

    const payoutsBefore = (await hostPayouts(owner)).cycles.map((c) => [c.bookings, c.gross]);
    const r = await payAtVenue(guest.id, b.id);
    expect(r.outcome).toBe("success");
    expect(r.booking).toMatchObject({ status: "confirmed", holdExpiresAt: null, paymentRef: null, paymentMethod: "cash", source: "online", amountDue: 1200, couponCode: null });
    expect(r.booking.price).toEqual({ subtotal: 1200, discount: 0, convenienceFee: 0, gstOnFee: 0, total: 1200 });
    expect((await repo.bookingEvents.listByBooking(b.id))[0]).toMatchObject({ kind: "pay_at_venue", actorRole: "guest", data: { amount: 1200 } });
    // Nothing in the payments ledger and nothing in payouts: the platform never touched the money.
    expect(await repo.payments.listByBooking(b.id)).toEqual([]);
    expect((await hostPayouts(owner)).cycles.map((c) => [c.bookings, c.gross])).toEqual(payoutsBefore);
    // The guest is told it's due at the venue.
    await flushNotifications();
    const msg = (await repo.notifications.listByBooking(b.id)).find((n) => n.audience === "guest");
    expect(msg?.body).toContain("₹1,200 is due at the venue");
    // And can't pay twice.
    expect(await err(payAtVenue(guest.id, b.id))).toMatchObject({ status: 409 });
    const mine = await listMyBookings(guest.id);
    expect(mine.upcoming[0]).toMatchObject({ id: b.id, dueAtVenue: true, amountDue: 1200 });
  });

  it("drops a coupon (platform-funded) and shows the host the booking flagged, with mark-paid for any team member", async () => {
    const owner = await ctxFor("u_venue");
    const manager = await ctxFor("u_manager");
    await updateHostSettings(owner, { payAtVenue: { enabled: true } });
    const guest = await makeUser();
    const { b } = await heldCourt(guest.id, "pav2", 1, "LOCAL10");
    expect(b.couponCode).toBe("LOCAL10");
    expect(b.price.discount).toBeGreaterThan(0);
    expect((await payAtVenueQuote(b)).couponDropped).toBe("LOCAL10");
    const { booking } = await payAtVenue(guest.id, b.id);
    expect(booking).toMatchObject({ couponCode: null, amountDue: 1200 });
    expect(booking.price.discount).toBe(0);

    const list = await hostBookings(owner, { when: "upcoming", pay: "venue" });
    expect(list.items.find((r) => r.id === b.id)).toMatchObject({ payAtVenue: true, dueAtVenue: true, paymentMethod: "cash", amountDue: 1200 });
    expect((await hostBookings(owner, { when: "upcoming", pay: "online" })).items.find((r) => r.id === b.id)).toBeUndefined();
    const detail = await hostBookingDetail(manager, b.id);
    expect(detail).toMatchObject({ payAtVenue: true, online: false, guestNoShows: 0, noShowLimit: 2, can: { markPaid: true, settle: true, noShow: false } });
    // Managers see no money but can still collect: the row says it's due at the venue.
    expect(detail.amountDue).toBeNull();
    expect(detail.booking.dueAtVenue).toBe(true);

    // Check-in before payment admits but tells the desk to collect first.
    const at = new Date(new Date(booking.startsAt).getTime() - 10 * 60_000);
    expect((await checkIn(manager, b.code, at)).message).toContain("collect ₹1,200 in cash first");

    // Console-booking permissions are locked down for managers, but the desk can still take the cash.
    const payoutsBefore = (await hostPayouts(owner)).cycles.map((c) => [c.bookings, c.gross]);
    await updateHostSettings(owner, { hostBookings: { ...hostSettings(owner.host).hostBookings, editBy: "owner", methods: ["pay_later"] } });
    const paid = await markPaidAtVenue(manager, b.id, "upi");
    expect(paid).toMatchObject({ amount: 1200, booking: { amountDue: 0, paymentMethod: "upi", status: "checked_in" } });
    expect((await repo.payments.listByBooking(b.id))[0]).toMatchObject({ provider: "offline", method: "upi", status: "success", amount: 1200 });
    expect(await err(markPaidAtVenue(manager, b.id))).toMatchObject({ status: 409 });
    const after = await hostBookings(owner, { when: "upcoming", pay: "venue" });
    expect(after.items.find((r) => r.id === b.id)).toMatchObject({ payAtVenue: true, dueAtVenue: false });
    // Still out of payouts: it was never gateway money.
    expect((await hostPayouts(owner)).cycles.map((c) => [c.bookings, c.gross])).toEqual(payoutsBefore);
    // A manager without edit rights still can't settle an ordinary pay-later booking this way.
    expect(await err(settleDue(manager, b.id, { method: "cash" }))).toMatchObject({ status: 409 });
  });

  it("no-shows are counted per guest across hosts and shut the option after two", async () => {
    const owner = await ctxFor("u_venue");
    await updateHostSettings(owner, { payAtVenue: { enabled: true } });
    const guest = await makeUser();
    const first = await heldCourt(guest.id, "pav3a");
    const { booking: b1 } = await payAtVenue(guest.id, first.b.id);
    const start = new Date(b1.startsAt);

    // Too early: the booking hasn't started.
    expect(await err(markNoShow(owner, b1.id, new Date(start.getTime() - 60_000)))).toMatchObject({ status: 400, message: expect.stringContaining("once the booking has started") });
    const ns1 = await markNoShow(owner, b1.id, new Date(start.getTime() + 60_000));
    expect(ns1).toMatchObject({ noShows: 1, booking: { status: "no_show", amountDue: 0 } });
    expect((await repo.bookingEvents.listByBooking(b1.id)).at(-1)).toMatchObject({ kind: "no_show", data: { unpaid: 1200, payAtVenue: true } });
    await flushNotifications();
    expect((await repo.notifications.listByBooking(b1.id)).find((n) => n.kind === "guest_no_show")?.body).toContain("marked as a no-show");
    expect(await err(markNoShow(owner, b1.id, new Date(start.getTime() + 60_000)))).toMatchObject({ status: 409 });
    expect((await checkIn(owner, b1.code, new Date(start.getTime() + 60_000))).message).toContain("no-show");
    expect((await listMyBookings(guest.id)).past[0]).toMatchObject({ id: b1.id, status: "no_show" });

    // Undo restores the booking and what was due.
    const undone = await undoNoShow(owner, b1.id);
    expect(undone).toMatchObject({ noShows: 0, booking: { status: "confirmed", amountDue: 1200 } });
    await markNoShow(owner, b1.id, new Date(start.getTime() + 60_000));

    // One no-show: still allowed, but warned.
    const second = await heldCourt(guest.id, "pav3b", 2);
    expect(await payAtVenueQuote(second.b)).toMatchObject({ allowed: true, noShows: 1 });
    const { booking: b2 } = await payAtVenue(guest.id, second.b.id);
    await markNoShow(owner, b2.id, new Date(new Date(b2.startsAt).getTime() + 60_000));
    expect((await repo.bookings.noShowCounts([guest.id])).get(guest.id)).toBe(2);

    // Two: refused, with the reason in the guest's view.
    const third = await heldCourt(guest.id, "pav3c", 3);
    const q = await payAtVenueQuote(third.b);
    expect(q).toMatchObject({ allowed: false, noShows: 2, reason: expect.stringContaining("switched off for your account") });
    expect(await err(payAtVenue(guest.id, third.b.id))).toMatchObject({ status: 409, code: "pay_at_venue_not_allowed" });
    // Other guests are unaffected.
    const other = await makeUser();
    const theirs = await heldCourt(other.id, "pav3d", 4);
    expect((await payAtVenueQuote(theirs.b)).allowed).toBe(true);
    const report = await hostReport(owner, "custom", { from: day(0), to: day(4) });
    expect(report.summary.noShows).toBe(2);
  });

  it("cancelling a pay-at-venue booking refunds nothing and clears the amount due, guest or host side", async () => {
    const owner = await ctxFor("u_venue");
    await updateHostSettings(owner, { payAtVenue: { enabled: true } });
    const guest = await makeUser();
    const { b } = await heldCourt(guest.id, "pav4", 3);
    const { booking } = await payAtVenue(guest.id, b.id);
    const q = await cancelQuote(booking);
    expect(q).toMatchObject({ allowed: true, refundAmount: 0, reason: expect.stringContaining("Nothing has been paid") });
    const c = await cancelBooking(guest.id, b.id);
    expect(c).toMatchObject({ refundAmount: 0, booking: { status: "cancelled", amountDue: 0 } });
    expect(await repo.payments.listByBooking(b.id)).toEqual([]);

    const again = await heldCourt(guest.id, "pav4b", 3);
    const { booking: b2 } = await payAtVenue(guest.id, again.b.id);
    const hc = await cancelByHost(owner, b2.id, { refundPct: 100, notify: false });
    expect(hc).toMatchObject({ refundAmount: 0, booking: { status: "cancelled", amountDue: 0 } });
  });

  it("works for event tickets as well as courts, and never for free places", async () => {
    const owner = await ctxFor("u_venue");
    await updateHostSettings(owner, { payAtVenue: { enabled: true } });
    const guest = await makeUser();
    const { listing, tickets } = await makeListing({ listing: { hostId: "h_mumbai_5" }, tickets: [{ price: 250, qty: 10 }] });
    const b = await holdBooking(guest.id, { kind: "listing", targetId: listing.id, tickets: [{ ticketTypeId: tickets[0].id, qty: 2 }], attendee: attendee() });
    expect((await payAtVenueQuote(b)).amount).toBe(500);
    const { booking } = await payAtVenue(guest.id, b.id);
    expect(booking).toMatchObject({ status: "confirmed", amountDue: 500, kind: "listing" });
    expect(booking.price.total).toBe(500);

    const { listing: free, tickets: ft } = await makeListing({ listing: { hostId: "h_mumbai_5", templateId: "tpl_rsvp" }, tickets: [{ price: 0, qty: 10 }] });
    const fb = await holdBooking(guest.id, { kind: "listing", targetId: free.id, tickets: [{ ticketTypeId: ft[0].id, qty: 1 }], attendee: attendee() });
    expect(fb.status).toBe("confirmed");
    expect((await payAtVenueQuote(fb)).allowed).toBe(false);
    await flushNotifications();
  });
});
