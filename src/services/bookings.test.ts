import { describe, expect, it } from "vitest";
import type { HoldRequest } from "@/contracts";
import { repo } from "@/repositories";
import { addDays, todayIST } from "@/lib/time";
import { makeUser, setupTestDb } from "@/test/db";
import { attendee, bookingRow, makeListing, makeVenue } from "@/test/fixtures";
import { applyCoupon, cancelBooking, cancelQuote, holdBooking, listMyBookings, payBooking } from "./bookings";
import { getAvailability } from "./availability";
import { loadInventory } from "./inventory";
import { ServiceError } from "./errors";

setupTestDb();

async function err(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return { status: e.status, code: e.code, message: e.message };
    throw e;
  }
  return null;
}

const ticketed = (targetId: string, tickets: { ticketTypeId: string; qty: number }[], extra: Partial<HoldRequest> = {}): HoldRequest => ({
  kind: "listing",
  targetId,
  tickets,
  attendee: attendee(),
  ...extra,
});

const slotHold = (venueId: string, resourceId: string, date: string, startMins: number, endMins: number): HoldRequest => ({
  kind: "venue",
  targetId: venueId,
  slots: { resourceId, date, startMins, endMins },
  attendee: attendee(),
});

describe("holdBooking — ticketed listings", () => {
  it("holds seats with server-side pricing and a hold timer", async () => {
    const u = await makeUser();
    const { listing, sessions, tickets } = await makeListing({ tickets: [{ price: 99.5, qty: 10 }] });
    const now = new Date();
    const b = await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 2 }]), now);
    expect(b).toMatchObject({ status: "held", userId: u.id, listingId: listing.id, kind: "listing", startsAt: sessions[0].startsAt });
    expect(b.items).toEqual([expect.objectContaining({ ticketTypeId: tickets[0].id, sessionId: sessions[0].id, qty: 2, unitPrice: 99.5 })]);
    // tpl_ticket_single: 3.75% fee + 18% GST on the fee
    expect(b.price).toEqual({ subtotal: 199, discount: 0, convenienceFee: 7.46, gstOnFee: 1.34, total: 207.8 });
    expect(new Date(b.holdExpiresAt!).getTime()).toBe(now.getTime() + 10 * 60_000);
    expect(await repo.bookings.byId(b.id)).toEqual({ ...b, seeded: false, checkedInAt: null, source: "online", paymentMethod: null, amountDue: 0, notes: null, rescheduledCount: 0, rescheduledFrom: null, createdBy: null, groupId: null });
    const inv = (await loadInventory([listing])).get(listing.id)!;
    expect(inv.tickets[0].remaining).toBe(8);
  });

  it("rejects sold-out, over perOrderMax, over the template's maxPerOrder, and unknown tickets", async () => {
    const u = await makeUser();
    const { listing, tickets } = await makeListing({ tickets: [{ qty: 2, perOrderMax: 4 }, { qty: 50, perOrderMax: 2 }, { qty: 50, perOrderMax: 6 }] });
    expect(await err(holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 3 }])))).toMatchObject({ status: 409, code: "sold_out" });
    expect(await err(holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[1].id, qty: 3 }])))).toMatchObject({ status: 400, message: expect.stringContaining("Max 2") });
    // tpl_ticket_single allows 6 per order in total
    expect(
      await err(holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[1].id, qty: 2 }, { ticketTypeId: tickets[2].id, qty: 5 }]))),
    ).toMatchObject({ status: 400, message: expect.stringContaining("up to 6") });
    expect(await err(holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: "t_nope", qty: 1 }])))).toMatchObject({ status: 400 });
    expect(await err(holdBooking(u.id, ticketed(listing.id, [])))).toMatchObject({ status: 400 });
    expect(await repo.bookings.countLiveHolds(u.id)).toBe(0);
  });

  it("rejects a day-specific ticket for another session, and unknown sessions", async () => {
    const u = await makeUser();
    const { listing, sessions, tickets } = await makeListing({
      listing: { templateId: "tpl_ticket_multi" },
      sessionDays: [3, 4],
      tickets: [{ sessionIndex: 0 }, { sessionIndex: 1 }],
    });
    expect(await err(holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }], { sessionId: sessions[1].id })))).toMatchObject({
      status: 400,
      message: expect.stringContaining("isn't valid for that date"),
    });
    expect(await err(holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }], { sessionId: "s_nope" })))).toMatchObject({ status: 409, code: "session_unavailable" });
    const ok = await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[1].id, qty: 1 }], { sessionId: sessions[1].id }));
    expect(ok.items[0].sessionId).toBe(sessions[1].id);
  });

  it("past sessions can't be booked; non-live listings are 404", async () => {
    const u = await makeUser();
    const past = await makeListing({ sessionDays: [-2] });
    expect(await err(holdBooking(u.id, ticketed(past.listing.id, [{ ticketTypeId: past.tickets[0].id, qty: 1 }])))).toMatchObject({ status: 409, code: "session_unavailable" });
    const draft = await makeListing({ listing: { status: "draft" } });
    expect(await err(holdBooking(u.id, ticketed(draft.listing.id, [{ ticketTypeId: draft.tickets[0].id, qty: 1 }])))).toMatchObject({ status: 404 });
  });

  it("caps live holds per user at 4 (across different listings)", async () => {
    const u = await makeUser();
    const made = await Promise.all(Array.from({ length: 5 }, () => makeListing()));
    for (const { listing, tickets } of made.slice(0, 4)) await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }]));
    const { listing, tickets } = made[4];
    expect(await err(holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }])))).toMatchObject({ status: 409, code: "too_many_holds" });
  });

  it("never oversells the last seats under concurrent holds", async () => {
    const { listing, tickets } = await makeListing({ tickets: [{ qty: 3 }] });
    const users = await Promise.all(Array.from({ length: 8 }, () => makeUser()));
    const results = await Promise.allSettled(users.map((u) => holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }]))));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(3);
    for (const r of results.filter((r) => r.status === "rejected")) expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: "sold_out" });
    const q = await repo.bookings.activeQuantities([listing.id]);
    expect(q.byTicket.get(tickets[0].id)).toBe(3);
  });

  it("expired holds release their seats", async () => {
    const { listing, tickets, sessions } = await makeListing({ tickets: [{ qty: 1 }] });
    const a = await makeUser();
    const b = await makeUser();
    const item = { ticketTypeId: tickets[0].id, sessionId: sessions[0].id, resourceId: null, startsAt: sessions[0].startsAt, endsAt: sessions[0].endsAt, label: "T", qty: 1, unitPrice: 500 };
    await repo.bookings.insert(bookingRow({ userId: a.id, listingId: listing.id, status: "held", holdExpiresAt: new Date(Date.now() - 1000).toISOString(), items: [item] }));
    await expect(holdBooking(b.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }]))).resolves.toMatchObject({ status: "held" });
  });
});

describe("holdBooking — free RSVP", () => {
  it("confirms immediately with no hold timer; needs attendee details", async () => {
    const u = await makeUser();
    const { listing } = await makeListing({ listing: { templateId: "tpl_rsvp", categoryId: "cat_meetups" }, tickets: [{ price: 0, qty: 20, perOrderMax: 2 }] });
    expect(await err(holdBooking(u.id, { kind: "listing", targetId: listing.id }))).toMatchObject({ status: 400 });
    const b = await holdBooking(u.id, { kind: "listing", targetId: listing.id, attendee: attendee() });
    expect(b).toMatchObject({ status: "confirmed", holdExpiresAt: null, price: { total: 0 } });
    expect(b.items).toHaveLength(1);
    expect(b.items[0].qty).toBe(1);
    // One free place per user per date.
    expect(await err(holdBooking(u.id, { kind: "listing", targetId: listing.id, attendee: attendee() }))).toMatchObject({ status: 409, code: "already_booked" });
  });

  it("goes to `requested` when the template needs host approval", async () => {
    const base = (await repo.templates.byId("tpl_rsvp"))!;
    await repo.templates.insert({ ...base, id: "tpl_rsvp_approval", rules: { ...base.rules, hostApprovalPerBooking: true } });
    const { listing } = await makeListing({ listing: { templateId: "tpl_rsvp_approval", categoryId: "cat_meetups" }, tickets: [{ price: 0, qty: 20 }] });
    const u = await makeUser();
    const b = await holdBooking(u.id, { kind: "listing", targetId: listing.id, attendee: attendee() });
    expect(b.status).toBe("requested");
  });
});

describe("holdBooking — court slots", () => {
  it("holds a valid range at the rule price and blocks the slot for others", async () => {
    const { venueId, resourceId } = await makeVenue("a");
    const date = addDays(todayIST(), 2);
    const a = await makeUser();
    const b = await holdBooking(a.id, slotHold(venueId, resourceId, date, 600, 720));
    expect(b).toMatchObject({ status: "held", kind: "venue", venueId, startsAt: `${date}T10:00:00+05:30`, endsAt: `${date}T12:00:00+05:30` });
    expect(b.items[0]).toMatchObject({ resourceId, qty: 1, unitPrice: 1200 });
    expect(b.price.subtotal).toBe(1200);

    const avail = await getAvailability(venueId, "pickleball", date);
    const slots = avail.resources[0].slots.filter((s) => s.startMins >= 600 && s.startMins < 720);
    expect(slots.map((s) => s.status)).toEqual(["held", "held"]);

    const other = await makeUser();
    expect(await err(holdBooking(other.id, slotHold(venueId, resourceId, date, 660, 780)))).toMatchObject({ status: 409, code: "slot_unavailable" });
  });

  it("validates ranges: alignment, max duration, outside the bookable window", async () => {
    const { venueId, resourceId } = await makeVenue("b");
    const u = await makeUser();
    const date = addDays(todayIST(), 2);
    expect(await err(holdBooking(u.id, slotHold(venueId, resourceId, date, 610, 670)))).toMatchObject({ status: 409, code: "slot_unavailable" });
    expect(await err(holdBooking(u.id, slotHold(venueId, resourceId, date, 600, 780)))).toMatchObject({ status: 409, message: "Above maximum duration" });
    expect(await err(holdBooking(u.id, slotHold(venueId, resourceId, addDays(todayIST(), 30), 600, 660)))).toMatchObject({ status: 400 });
    expect(await err(holdBooking(u.id, { ...slotHold(venueId, resourceId, date, 600, 660), slots: { resourceId: "r_other", date, startMins: 600, endMins: 660 } }))).toMatchObject({ status: 400 });
  });

  it("only one of several concurrent holds on the same slot succeeds", async () => {
    const { venueId, resourceId } = await makeVenue("c");
    const date = addDays(todayIST(), 3);
    const users = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    const results = await Promise.allSettled(users.map((u) => holdBooking(u.id, slotHold(venueId, resourceId, date, 900, 960))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const taken = await repo.venues.taken([resourceId], date);
    expect(taken).toEqual([{ resourceId, date, startMins: 900, endMins: 960, kind: "held" }]);
  });

  it("a blocked slot can't be held", async () => {
    const { venueId, resourceId } = await makeVenue("d");
    const date = addDays(todayIST(), 2);
    await repo.venues.insertBlock({ id: "blk_bt_d", resourceId, startsAt: `${date}T08:00:00+05:30`, endsAt: `${date}T09:00:00+05:30`, reason: "Coaching" });
    const u = await makeUser();
    expect(await err(holdBooking(u.id, slotHold(venueId, resourceId, date, 480, 540)))).toMatchObject({ status: 409, code: "slot_unavailable" });
  });
});

describe("payBooking", () => {
  it("failure keeps the hold (pending_payment); success confirms; both attempts are recorded", async () => {
    const u = await makeUser();
    const { listing, tickets } = await makeListing({ tickets: [{ price: 99.5 }] });
    const held = await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }]));

    const f = await payBooking(u.id, held.id, { method: "upi", outcome: "failure" });
    expect(f.outcome).toBe("failed");
    expect(f.booking).toMatchObject({ status: "pending_payment", holdExpiresAt: held.holdExpiresAt, paymentRef: null });
    expect(await repo.bookings.countLiveHolds(u.id)).toBe(1);

    const s = await payBooking(u.id, held.id, { method: "card", outcome: "success" });
    expect(s.outcome).toBe("success");
    expect(s.booking).toMatchObject({ status: "confirmed", holdExpiresAt: null, paymentRef: expect.stringMatching(/^pay_test_/) });

    const pays = await repo.payments.listByBooking(held.id);
    expect(pays.map((p) => [p.status, p.method, p.amount])).toEqual([
      ["failed", "upi", held.price.total],
      ["success", "card", held.price.total],
    ]);
    expect(pays[1].ref).toBe(s.booking.paymentRef);
    // Can't pay twice.
    expect(await err(payBooking(u.id, held.id, { method: "upi", outcome: "success" }))).toMatchObject({ status: 409 });
  });

  it("another user's booking is 404; an expired hold is 410", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const { listing, tickets } = await makeListing();
    const held = await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }]));
    expect(await err(payBooking(other.id, held.id, { method: "upi", outcome: "success" }))).toMatchObject({ status: 404 });
    expect((await repo.bookings.byId(held.id))!.status).toBe("held");

    await repo.bookings.update(held.id, { holdExpiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(await err(payBooking(u.id, held.id, { method: "upi", outcome: "success" }))).toMatchObject({ status: 410, code: "hold_expired" });
    expect(await repo.payments.listByBooking(held.id)).toEqual([]);
  });
});

describe("coupons", () => {
  it("apply / swap / remove re-prices the hold server-side", async () => {
    const u = await makeUser();
    const { listing, tickets } = await makeListing({ tickets: [{ price: 1000 }] });
    const held = await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 3 }]));
    expect(held.price).toMatchObject({ subtotal: 3000, discount: 0 });

    const ten = (await applyCoupon(u.id, held.id, "local10"))!;
    expect(ten.couponCode).toBe("LOCAL10");
    expect(ten.price).toEqual({ subtotal: 3000, discount: 200, convenienceFee: 105, gstOnFee: 18.9, total: 2923.9 }); // 10% capped at ₹200

    const flat = (await applyCoupon(u.id, held.id, "FIRST100"))!;
    expect(flat).toMatchObject({ couponCode: "FIRST100", price: { discount: 100 } });

    const none = (await applyCoupon(u.id, held.id, null))!;
    expect(none.couponCode).toBeNull();
    expect(none.price).toEqual(held.price);

    expect(await err(applyCoupon(u.id, held.id, "BOGUS"))).toMatchObject({ status: 400, code: "coupon_invalid" });
    expect(await err(applyCoupon((await makeUser()).id, held.id, "LOCAL10"))).toMatchObject({ status: 404 });
  });

  it("can be given at hold time; invalid codes fail the hold", async () => {
    const u = await makeUser();
    const { listing, tickets } = await makeListing({ tickets: [{ price: 500 }] });
    const b = await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }], { couponCode: "LOCAL10" }));
    expect(b).toMatchObject({ couponCode: "LOCAL10", price: { discount: 50 } });
    expect(await err(holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }], { couponCode: "NOPE" })))).toMatchObject({ code: "coupon_invalid" });
  });
});

describe("cancelBooking", () => {
  async function paid(days: number, templateId = "tpl_ticket_single", qty = 2) {
    const u = await makeUser();
    const { listing, tickets } = await makeListing({ listing: { templateId }, sessionDays: [days], tickets: [{ price: 1000 }] });
    const held = await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty }]));
    const { booking } = await payBooking(u.id, held.id, { method: "upi", outcome: "success" });
    return { u, booking };
  }

  it("refunds the ticket price (not fees) before the cut-off", async () => {
    const { u, booking } = await paid(5); // tpl_ticket_single: full refund until 48h before
    const r = await cancelBooking(u.id, booking.id);
    expect(r.refundAmount).toBe(2000);
    expect(r.booking.status).toBe("refunded");
    expect(await err(cancelBooking(u.id, booking.id))).toMatchObject({ status: 409, code: "cancel_not_allowed" });
  });

  it("refuses inside the cut-off window", async () => {
    const { u, booking } = await paid(1);
    expect(await err(cancelBooking(u.id, booking.id))).toMatchObject({ status: 409, code: "cancel_not_allowed" });
    expect((await repo.bookings.byId(booking.id))!.status).toBe("confirmed");
  });

  it("partial policy refunds the configured percentage", async () => {
    const { booking } = await paid(10, "tpl_competition", 1); // registration: 1 per order
    expect(await cancelQuote(booking)).toMatchObject({ allowed: true, refundPct: 50, refundAmount: 500 });
  });

  it("free bookings cancel without a refund; other users get 404", async () => {
    const u = await makeUser();
    const { listing } = await makeListing({ listing: { templateId: "tpl_rsvp", categoryId: "cat_meetups" }, tickets: [{ price: 0, qty: 20 }] });
    const b = await holdBooking(u.id, { kind: "listing", targetId: listing.id, attendee: attendee() });
    expect(await err(cancelBooking((await makeUser()).id, b.id))).toMatchObject({ status: 404 });
    const r = await cancelBooking(u.id, b.id);
    expect(r).toMatchObject({ refundAmount: 0, booking: { status: "cancelled" } });
  });

  it("listMyBookings buckets upcoming / past / cancelled and hides holds", async () => {
    const { u, booking } = await paid(5);
    const { listing, tickets } = await makeListing();
    await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }]));
    let mine = await listMyBookings(u.id);
    expect(mine.upcoming.map((b) => b.id)).toEqual([booking.id]);
    expect(mine.upcoming[0]).toMatchObject({ citySlug: "mumbai", kindLabel: "Event", href: expect.stringMatching(/^\/mumbai\/e\//) });
    await cancelBooking(u.id, booking.id);
    mine = await listMyBookings(u.id);
    expect(mine.upcoming).toEqual([]);
    expect(mine.cancelled.map((b) => b.id)).toEqual([booking.id]);
  });
});

describe("starting over (Back from review)", () => {
  it("a new hold on the same listing replaces the earlier one, so coupons and the hold cap don't lock people out", async () => {
    const u = await makeUser();
    const { listing, tickets } = await makeListing({ tickets: [{ price: 500, qty: 10 }] });
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const b = await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }]));
      await applyCoupon(u.id, b.id, "FIRST100");
      ids.push(b.id);
    }
    const statuses = await Promise.all(ids.map(async (id) => (await repo.bookings.byId(id))!.status));
    expect(statuses.slice(0, -1).every((s) => s === "expired")).toBe(true);
    expect(statuses.at(-1)).toBe("held");
    // Released seats are back in stock.
    expect((await loadInventory([listing])).get(listing.id)!.tickets[0].remaining).toBe(9);
  });

  it("a failed new hold keeps the earlier one (the release rolls back)", async () => {
    const u = await makeUser();
    const { listing, tickets } = await makeListing({ tickets: [{ price: 500, qty: 2 }] });
    const first = await holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 1 }]));
    expect(await err(holdBooking(u.id, ticketed(listing.id, [{ ticketTypeId: tickets[0].id, qty: 50 }])))).toMatchObject({ status: 400 });
    expect((await repo.bookings.byId(first.id))!.status).toBe("held");
  });
});
