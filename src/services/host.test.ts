import { describe, expect, it } from "vitest";
import type { EventListingInput, User } from "@/contracts";
import { repo } from "@/repositories";
import { addDays, todayIST, toISO } from "@/lib/time";
import { makeUser, setupTestDb } from "@/test/db";
import { attendee, bookingRow, makeListing, makeVenue } from "@/test/fixtures";
import { decideListing, listModeration } from "./admin";
import { getListingDetail, searchListings } from "./discover";
import { getAvailability } from "./availability";
import { ServiceError } from "./errors";
import { hostPayouts } from "./payouts";
import {
  addBlock, applyAsHost, checkIn, getListingInput, hostBookings, hostDashboard, inviteMember, listHostListings, removeBlock, removeMember, resolveHostContext, saveListing,
  setMemberScope, teamTargets, venueSchedule,
} from "./host";

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
const ctxFor = async (userId: string) => (await resolveHostContext((await repo.users.byId(userId)) as User))!;

describe("host context & roles", () => {
  it("resolves owner vs manager memberships", async () => {
    const owner = await ctxFor("u_venue");
    const manager = await ctxFor("u_manager");
    expect(owner).toMatchObject({ isOwner: true, host: { id: "h_mumbai_5" } });
    expect(manager).toMatchObject({ isOwner: false, host: { id: "h_mumbai_5" } });
    expect(await resolveHostContext((await repo.users.byId("u_demo"))!)).toBeNull();
  });

  it("strips money for managers on the dashboard, bookings and payouts", async () => {
    const owner = await ctxFor("u_venue");
    const manager = await ctxFor("u_manager");
    const [od, md] = [await hostDashboard(owner), await hostDashboard(manager)];
    expect(typeof od.kpis.grossSales30d).toBe("number");
    expect(od.kpis.nextPayout).not.toBeNull();
    expect(typeof od.week.gross).toBe("number");
    expect(md.kpis.grossSales30d).toBeNull();
    expect(md.kpis.nextPayout).toBeNull();
    expect(md.week.gross).toBeNull();
    expect(md.week.grossTrend).toBeNull();
    expect(md.recent.every((r) => r.amount === null)).toBe(true);
    // Non-money numbers are the same for both.
    expect(md.kpis.upcomingBookings).toBe(od.kpis.upcomingBookings);

    const [ob, mb] = [await hostBookings(owner, { when: "upcoming" }), await hostBookings(manager, { when: "upcoming" })];
    expect(ob.total).toBeGreaterThan(0);
    expect(mb.total).toBe(ob.total);
    expect(ob.items.some((r) => typeof r.amount === "number")).toBe(true);
    expect(mb.items.every((r) => r.amount === null)).toBe(true);

    expect((await listHostListings(manager)).every((r) => r.revenue === null)).toBe(true);
    expect(await err(hostPayouts(manager))).toMatchObject({ status: 403 });
    await expect(hostPayouts(owner)).resolves.toMatchObject({ cycles: expect.any(Array) });
  });

  it("team management is owner-only; the owner can't be removed", async () => {
    const owner = await ctxFor("u_venue");
    const manager = await ctxFor("u_manager");
    expect(await err(inviteMember(manager, "9000000088"))).toMatchObject({ status: 403 });
    const m = await inviteMember(owner, "9000000088", "New Person");
    expect(m).toMatchObject({ status: "invited", role: "manager", userId: null });
    expect(await err(inviteMember(owner, "9000000088"))).toMatchObject({ status: 409 });
    expect(await err(removeMember(owner, owner.member.id))).toMatchObject({ status: 400 });
    await removeMember(owner, m.id);
  });
});

describe("venue / event scoping", () => {
  it("a manager scoped to some venues sees, books, schedules and checks in only those", async () => {
    const owner = await ctxFor("u_venue"); // h_mumbai_5 runs several venues
    const all = await teamTargets(owner);
    const venues = all.filter((t) => t.kind === "venue");
    expect(venues.length).toBeGreaterThan(1);
    const [mine, theirs] = venues;

    const staff = await makeUser({ name: "Scoped Staff" });
    const m = await inviteMember(owner, staff.phone, undefined, [mine.id]);
    expect(m).toMatchObject({ status: "active", scope: [mine.id] });
    const ctx = await ctxFor(staff.id);
    expect(ctx.scope).toEqual([mine.id]);
    expect(owner.scope).toBeNull();

    // Listings and bookings are filtered.
    const rows = await listHostListings(ctx);
    expect(rows.map((r) => r.id)).toEqual([mine.id]);
    const b = await hostBookings(ctx, { when: "upcoming" });
    expect(b.targets.map((t) => t.id)).toEqual([mine.id]);
    const ownerB = await hostBookings(owner, { when: "upcoming" });
    expect(ownerB.total).toBeGreaterThan(b.total);
    expect(b.total).toBe((await hostBookings(owner, { when: "upcoming", target: mine.id })).total);
    // Asking for the other venue by id yields nothing.
    expect((await hostBookings(ctx, { when: "upcoming", target: theirs.id })).total).toBe(0);
    expect((await hostDashboard(ctx)).listings.map((r) => r.id)).toEqual([mine.id]);

    // The court calendar never shows the other venue, even when asked for it.
    const sched = await venueSchedule(ctx, theirs.id, undefined);
    expect(sched?.venueId).toBe(mine.id);
    expect(sched?.venues.map((v) => v.id)).toEqual([mine.id]);
    const otherRes = (await repo.venues.resources([theirs.id]))[0];
    expect(await err(addBlock(ctx, { resourceId: otherRes.id, date: addDays(todayIST(), 2), startMins: 600, endMins: 660, reason: "Nope" }))).toMatchObject({ status: 404 });

    // Editing the other venue is a 404, like a listing from another host.
    expect(await err(getListingInput(ctx, theirs.id))).toMatchObject({ status: 404 });
    await expect(getListingInput(ctx, mine.id)).resolves.toMatchObject({ status: expect.any(String) });
    const { input } = await getListingInput(owner, theirs.id);
    expect(await err(saveListing(ctx, input, false, theirs.id))).toMatchObject({ status: 404 });

    // Check-in at the other venue is refused.
    const guest = await makeUser();
    const starts = toISO(addDays(todayIST(), 1), 600);
    const booking = bookingRow({
      userId: guest.id, kind: "venue", listingId: null, venueId: theirs.id, status: "confirmed", startsAt: starts, endsAt: toISO(addDays(todayIST(), 1), 660), attendee: attendee("Other Guest"),
      items: [{ ticketTypeId: null, sessionId: null, resourceId: otherRes.id, startsAt: starts, endsAt: toISO(addDays(todayIST(), 1), 660), label: "Court", qty: 1, unitPrice: 800 }],
    });
    await repo.bookings.insert(booking);
    expect(await err(checkIn(ctx, booking.code, new Date(starts)))).toMatchObject({ status: 404 });
    expect((await checkIn(owner, booking.code, new Date(starts))).result).toBe("ok");

    // The owner widens access; the member sees both. Then back to everything.
    await setMemberScope(owner, m.id, [mine.id, theirs.id]);
    expect((await listHostListings(await ctxFor(staff.id))).map((r) => r.id).sort()).toEqual([mine.id, theirs.id].sort());
    await setMemberScope(owner, m.id, null);
    expect((await ctxFor(staff.id)).scope).toBeNull();
    expect((await listHostListings(await ctxFor(staff.id))).length).toBe((await listHostListings(owner)).length);

    // Guard rails: ids must be the host's own; the owner can't be scoped; managers can't change scopes.
    expect(await err(setMemberScope(owner, m.id, ["l_not_ours"]))).toMatchObject({ status: 400 });
    expect(await err(setMemberScope(owner, owner.member.id, [mine.id]))).toMatchObject({ status: 400 });
    expect(await err(setMemberScope(await ctxFor("u_manager"), m.id, null))).toMatchObject({ status: 403 });
    await removeMember(owner, m.id);
  });

  it("a scoped manager keeps access to a listing they create", async () => {
    const owner = await ctxFor("u_host"); // Tidewater Collective (organiser)
    const targetsBefore = await teamTargets(owner);
    const staff = await makeUser({ name: "Event Staff" });
    const m = await inviteMember(owner, staff.phone, undefined, [targetsBefore[0].id]);
    const ctx = await ctxFor(staff.id);
    const { input } = await getListingInput(owner, targetsBefore.find((t) => t.kind === "event")!.id);
    const saved = await saveListing(ctx, { ...(input as EventListingInput), title: "Scoped staff draft" }, false);
    expect(ctx.scope).toContain(saved.id);
    const again = await ctxFor(staff.id);
    expect(again.scope).toEqual([targetsBefore[0].id, saved.id]);
    expect((await listHostListings(again)).map((r) => r.id).sort()).toEqual([targetsBefore[0].id, saved.id].sort());
    await removeMember(owner, m.id);
  });
});

describe("check-in", () => {
  it("checks in by code (case-insensitive, LOCAL: prefix), once, and only for own listings", async () => {
    const owner = await ctxFor("u_host"); // Tidewater Collective
    const { listing, sessions, tickets } = await makeListing();
    const guest = await makeUser();
    const b = bookingRow({
      userId: guest.id,
      listingId: listing.id,
      status: "confirmed",
      startsAt: sessions[0].startsAt,
      endsAt: sessions[0].endsAt,
      attendee: attendee("Guest Name"),
      items: [{ ticketTypeId: tickets[0].id, sessionId: sessions[0].id, resourceId: null, startsAt: sessions[0].startsAt, endsAt: sessions[0].endsAt, label: "GA", qty: 2, unitPrice: 500 }],
      price: { subtotal: 1000, discount: 0, convenienceFee: 37.5, gstOnFee: 6.75, total: 1044.25 },
    });
    await repo.bookings.insert(b);
    const start = new Date(sessions[0].startsAt).getTime();

    const early = await checkIn(owner, b.code, new Date(start - 5 * 3_600_000));
    expect(early.result).toBe("early");

    const other = await ctxFor("u_venue");
    expect(await err(checkIn(other, b.code, new Date(start)))).toMatchObject({ status: 404 });

    const at = new Date(start - 30 * 60_000);
    const ok = await checkIn(owner, `LOCAL:${b.code.toLowerCase()}`, at);
    expect(ok).toMatchObject({ result: "ok", message: "2 admitted", booking: { status: "checked_in", amount: 1000, customer: "Guest Name" } });
    expect(await repo.bookings.byId(b.id)).toMatchObject({ status: "checked_in", checkedInAt: at.toISOString() });

    expect((await checkIn(owner, b.code, at)).result).toBe("already");
    expect(await err(checkIn(owner, "LCLNOPE00", at))).toMatchObject({ status: 404 });
  });

  it("refuses cancelled and unpaid bookings", async () => {
    const owner = await ctxFor("u_host");
    const { listing, sessions } = await makeListing();
    const guest = await makeUser();
    const cancelled = bookingRow({ userId: guest.id, listingId: listing.id, status: "cancelled", startsAt: sessions[0].startsAt, endsAt: sessions[0].endsAt });
    const held = bookingRow({ userId: guest.id, listingId: listing.id, status: "held", holdExpiresAt: new Date(Date.now() + 600_000).toISOString(), startsAt: sessions[0].startsAt, endsAt: sessions[0].endsAt });
    await repo.bookings.insert(cancelled);
    await repo.bookings.insert(held);
    const at = new Date(sessions[0].startsAt);
    expect((await checkIn(owner, cancelled.code, at)).result).toBe("invalid");
    expect((await checkIn(owner, held.code, at)).result).toBe("invalid");
    expect((await repo.bookings.byId(held.id))!.status).toBe("held");
  });
});

describe("court blocks", () => {
  const date = addDays(todayIST(), 4);

  it("owner can block and unblock own courts; slot shows as blocked", async () => {
    const owner = await ctxFor("u_venue");
    const { venueId, resourceId } = await makeVenue("host_blk"); // Smash Arena's, no seeded occupancy
    const blk = await addBlock(owner, { resourceId, date, startMins: 1260, endMins: 1380, reason: "Tournament" });
    expect(blk).toMatchObject({ resourceId, startsAt: toISO(date, 1260), endsAt: toISO(date, 1380), reason: "Tournament" });
    expect((await repo.venues.blocks([resourceId])).map((b) => b.id)).toEqual([blk.id]);
    const avail = await getAvailability(venueId, "pickleball", date);
    expect(avail.resources[0].slots.filter((s) => s.startMins >= 1260).map((s) => s.status)).toEqual(["blocked", "blocked"]);

    const other = await ctxFor("u_host");
    expect(await err(removeBlock(other, blk.id))).toMatchObject({ status: 404 });
    await removeBlock(owner, blk.id);
    expect(await repo.venues.blocks([resourceId])).toEqual([]);
  });

  it("can't block another host's court, or over an existing booking", async () => {
    const other = await ctxFor("u_host");
    expect(await err(addBlock(other, { resourceId: "r_v_mumbai_01_2", date, startMins: 600, endMins: 660, reason: "x" }))).toMatchObject({ status: 404 });

    const owner = await ctxFor("u_venue");
    const guest = await makeUser();
    await repo.bookings.insert(
      bookingRow({
        userId: guest.id,
        kind: "venue",
        venueId: "v_mumbai_01",
        status: "confirmed",
        startsAt: toISO(date, 1320),
        endsAt: toISO(date, 1380),
        items: [{ ticketTypeId: null, sessionId: null, resourceId: "r_v_mumbai_01_2", startsAt: toISO(date, 1320), endsAt: toISO(date, 1380), label: "c", qty: 1, unitPrice: 600 }],
      }),
    );
    expect(await err(addBlock(owner, { resourceId: "r_v_mumbai_01_2", date, startMins: 1260, endMins: 1380, reason: "x" }))).toMatchObject({ status: 409 });
  });
});

describe("listing lifecycle", () => {
  const input = (title: string): EventListingInput => ({
    kind: "event",
    title,
    categoryId: "cat_events",
    subcategoryId: null,
    summary: "A brand new integration test show",
    description: "A long enough description for the listing wizard to accept it without complaint.",
    ageLimit: "18+",
    languages: ["English"],
    areaId: "a_mumbai_bandra-west",
    venueName: "Test Hall",
    address: "12 Hill Road, Bandra West",
    media: [],
    templateId: "tpl_ticket_single",
    sessions: [{ date: addDays(todayIST(), 6), startMins: 1200, endMins: 1320, capacity: 0, label: "" }],
    tickets: [
      { name: "Early bird", description: "", price: 299.5, qty: 40, perOrderMax: 4, isPass: false, sessionIndex: null },
      { name: "Regular", description: "", price: 499, qty: 60, perOrderMax: 10, isPass: false, sessionIndex: null },
    ],
    thingsToKnow: ["Doors at 7:30"],
    formFields: [],
    externalUrl: null,
  });

  it("create → review → admin approve → discoverable; edits keep ticket ids and sold counts", async () => {
    const ctx = await ctxFor("u_host");
    const title = "Zyzzyva Integration Night";
    const { id, status } = await saveListing(ctx, input(title), true);
    expect(status).toBe("review");
    const created = (await repo.listings.byId(id))!;
    expect(created).toMatchObject({ hostId: "h_mumbai_1", cityId: "c_mumbai", status: "review", title });
    const tickets = await repo.listings.ticketTypes([id]);
    expect(tickets.map((t) => [t.name, t.price, t.qty, t.perOrderMax])).toEqual([
      ["Early bird", 299.5, 40, 4],
      ["Regular", 499, 60, 6], // capped at the template's maxPerOrder
    ]);
    const sessions = await repo.listings.sessions([id]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].capacity).toBe(100); // follows the tickets on sale

    expect((await searchListings({ city: "mumbai", q: "zyzzyva" })).total).toBe(0);
    expect(await err(decideListing(id, "reject"))).toMatchObject({ status: 400 });
    await decideListing(id, "approve");
    expect((await repo.listings.byId(id))!.status).toBe("live");

    const found = await searchListings({ city: "mumbai", q: "zyzzyva" });
    expect(found.items.map((c) => c.id)).toEqual([id]);
    const detail = await getListingDetail("mumbai", created.slug);
    expect(detail.ticketTypes.map((t) => t.remaining)).toEqual([40, 60]);

    // Simulate external sales, then edit: ids and `sold` survive.
    await repo.listings.replaceTicketTypes(id, tickets.map((t, i) => ({ ...t, sold: i === 0 ? 5 : 0 })));
    const edit = input(title + " II");
    edit.sessions[0].id = sessions[0].id;
    edit.tickets[0].id = tickets[0].id;
    edit.tickets[1].id = tickets[1].id;
    const saved = await saveListing(ctx, edit, true, id);
    expect(saved.status).toBe("live"); // live listings stay live on edit
    const after = await repo.listings.ticketTypes([id]);
    expect(after.map((t) => [t.id, t.sold])).toEqual([
      [tickets[0].id, 5],
      [tickets[1].id, 0],
    ]);
    expect((await repo.listings.sessions([id]))[0].id).toBe(sessions[0].id);
  });

  it("other hosts can't edit it; paid tickets need verified KYC", async () => {
    const ctx = await ctxFor("u_host");
    const { id } = await saveListing(ctx, input("Draft For Ownership"), false);
    expect((await repo.listings.byId(id))!.status).toBe("draft");
    const other = await ctxFor("u_venue");
    expect(await err(saveListing(other, input("Hijack attempt"), false, id))).toMatchObject({ status: 404 });
    const otherOrganiser = { ...ctx, host: { ...ctx.host, id: "h_mumbai_2" } };
    expect(await err(saveListing(otherOrganiser, input("Hijack attempt"), false, id))).toMatchObject({ status: 404 });
    const unverified = { ...ctx, host: { ...ctx.host, kycStatus: "pending" as const } };
    expect(await err(saveListing(unverified, input("Paid without KYC"), true))).toMatchObject({ status: 403, code: "kyc_required" });
  });

  it("removing a session with bookings is refused", async () => {
    const ctx = await ctxFor("u_host");
    const two = { ...input("Two Date Thing"), templateId: "tpl_ticket_multi" };
    two.sessions = [
      { date: addDays(todayIST(), 6), startMins: 1200, endMins: 1320, capacity: 0, label: "" },
      { date: addDays(todayIST(), 7), startMins: 1200, endMins: 1320, capacity: 0, label: "" },
    ];
    const { id } = await saveListing(ctx, two, true);
    await decideListing(id, "approve");
    const sessions = await repo.listings.sessions([id]);
    const tickets = await repo.listings.ticketTypes([id]);
    const guest = await makeUser();
    await repo.bookings.insert(
      bookingRow({ userId: guest.id, listingId: id, items: [{ ticketTypeId: tickets[0].id, sessionId: sessions[1].id, resourceId: null, startsAt: sessions[1].startsAt, endsAt: sessions[1].endsAt, label: "x", qty: 1, unitPrice: 299.5 }] }),
    );
    const edit = { ...two, sessions: [{ ...two.sessions[0], id: sessions[0].id }, { ...two.sessions[0], date: addDays(todayIST(), 8) }], tickets: two.tickets.map((t, i) => ({ ...t, id: tickets[i].id })) };
    expect(await err(saveListing(ctx, edit, true, id))).toMatchObject({ status: 409, code: "has_bookings" });
  });

  it("host application: creates a pending host + owner membership; no duplicates", async () => {
    const u = await makeUser();
    const app = {
      type: "organiser" as const, brandName: "Fresh Host", cityId: "c_pune", contactName: "C", email: "", instagram: "", website: "", bio: "We host things for people in Pune.",
      expectedPerMonth: "1–2" as const, wantsPaid: true, gstin: "27abcde1234f1z5", documents: [{ kind: "pan" as const, fileName: "pan.pdf", data: PDF }, { kind: "bank" as const, fileName: "b.pdf", data: PDF }],
    };
    // Documents must be real PDF/JPEG/PNG bytes, and can't be kept from someone else's application.
    expect(await err(applyAsHost(u, { ...app, documents: [{ kind: "pan" as const, fileName: "x.pdf", data: "data:application/pdf;base64," + Buffer.from("<html>").toString("base64") }] }))).toMatchObject({ status: 400 });
    expect(await err(applyAsHost(u, { ...app, documents: [{ kind: "pan" as const, fileName: "x.pdf", mediaId: "someoneelses" }] }))).toMatchObject({ status: 400 });
    const h = (await applyAsHost(u, app))!;
    expect(h).toMatchObject({ status: "pending", kycStatus: "pending", contactPhone: u.phone, gstin: "27ABCDE1234F1Z5", email: null });
    const docs = (await repo.hosts.byId(h.id))!.documents;
    expect(docs.map((d) => d.kind)).toEqual(["pan", "bank"]);
    // Stored privately: the bytes are there, flagged private, and not usable as a public image.
    const stored = await repo.media.get(docs[0].mediaId!);
    expect(stored).toMatchObject({ private: true, contentType: "application/pdf", ownerId: u.id });
    expect(stored!.data.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await repo.media.exists(docs[0].mediaId!)).toBe(false);
    const ctx = (await resolveHostContext(u))!;
    expect(ctx).toMatchObject({ isOwner: true, host: { id: h.id } });
    expect(await err(applyAsHost(u, app))).toMatchObject({ status: 409 });
    expect(await err(hostDashboard(ctx))).toMatchObject({ status: 403, code: "not_approved" });
  });
});

const PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");

describe("views", () => {
  it("dashboard counts detail-page views for the last 7 days", async () => {
    const ctx = await ctxFor("u_venue");
    const before = (await hostDashboard(ctx)).week.views;
    await repo.views.record("v_mumbai_01", todayIST());
    await repo.views.record("v_mumbai_01", todayIST());
    await repo.views.record("v_mumbai_01", addDays(todayIST(), -30)); // outside the window
    expect((await hostDashboard(ctx)).week.views).toBe(before + 2);
  });
});

describe("review regressions", () => {
  it("sold counts include seeded sales (no '0 / N' for demo events)", async () => {
    const ctx = await ctxFor("u_host");
    const rows = await listHostListings(ctx);
    const row = rows.find((r) => r.id === "l_mumbai_05")!;
    const bookings = await repo.bookings.listForTargets(["l_mumbai_05"], []);
    const active = bookings.filter((b) => ["confirmed", "checked_in", "requested", "held", "pending_payment"].includes(b.status));
    expect(active.length).toBeGreaterThan(0);
    expect(row.sold).toBeGreaterThan(0);
  });

  it("journey templates keep their curated order", async () => {
    const ids = (await repo.templates.list()).map((t) => t.id);
    expect(ids.indexOf("tpl_ticket_single")).toBeLessThan(ids.indexOf("tpl_ticket_multi"));
    expect(ids.indexOf("tpl_ticket_single")).toBeLessThan(ids.indexOf("tpl_recurring"));
  });
});

describe("edits to live listings", () => {
  const LIVE = "l_mumbai_05"; // Tidewater Collective, live
  const decide = decideListing;
  const moderation = (t: "review") => listModeration(t);
  const load = async () => (await import("./host")).listingInputFor(LIVE, (await repo.listings.byId(LIVE))!.hostId);

  it("material edits wait for review while the live version stays up; approval applies them", async () => {
    const ctx = await ctxFor("u_host");
    const before = (await load()).input as EventListingInput;
    const r = await saveListing(ctx, { ...before, title: "Totally Different Show" }, false, LIVE);
    expect(r).toMatchObject({ id: LIVE, status: "live", pendingReview: true });
    expect((await repo.listings.byId(LIVE))!.title).toBe(before.title); // guests still see the live version
    expect((await getListingInput(ctx, LIVE))).toMatchObject({ pendingReview: true, input: { title: "Totally Different Show" } });
    expect((await listHostListings(ctx)).find((x) => x.id === LIVE)!.pendingReview).toBe(true);

    const queue = await moderation("review");
    const row = queue.items.find((x) => x.id === LIVE)!;
    expect(row.revision!.changes).toContainEqual(["Title", before.title, "Totally Different Show"]);

    await decide(LIVE, "approve", undefined, { revision: true });
    expect((await repo.listings.byId(LIVE))!).toMatchObject({ title: "Totally Different Show", status: "live" });
    expect(await repo.revisions.pendingFor(LIVE)).toBeNull();
  });

  it("operational edits (dates, capacity, notes) apply straight away", async () => {
    const ctx = await ctxFor("u_host");
    const cur = (await load()).input as EventListingInput;
    const r = await saveListing(ctx, { ...cur, thingsToKnow: [...cur.thingsToKnow, "Doors open 30 minutes early"], sessions: cur.sessions.map((s) => ({ ...s, capacity: s.capacity + 5 })) }, false, LIVE);
    expect(r.pendingReview).toBe(false);
    expect((await repo.listings.byId(LIVE))!.thingsToKnow).toContain("Doors open 30 minutes early");
  });

  it("a declined edit leaves the listing unchanged and tells the host why", async () => {
    const ctx = await ctxFor("u_host");
    const cur = (await load()).input as EventListingInput;
    await saveListing(ctx, { ...cur, tickets: cur.tickets.map((t) => ({ ...t, price: t.price * 3 })) }, false, LIVE);
    expect(await err(decide(LIVE, "reject", undefined, { revision: true }))).toMatchObject({ status: 400 });
    await decide(LIVE, "reject", "Price hikes need a reason", { revision: true });
    expect((await repo.listings.ticketTypes([LIVE])).map((t) => t.price)).toEqual(cur.tickets.map((t) => t.price));
    expect(await getListingInput(ctx, LIVE)).toMatchObject({ pendingReview: false, revisionNote: "Price hikes need a reason" });
  });

  it("approval keeps operational changes made after the edit was submitted", async () => {
    const ctx = await ctxFor("u_host");
    const cur = (await load()).input as EventListingInput;
    await saveListing(ctx, { ...cur, summary: "A brand new one-line summary here" }, false, LIVE);
    // Then a direct operational edit against the live version.
    const live = (await load()).input as EventListingInput;
    await saveListing(ctx, { ...live, thingsToKnow: ["Bring ID"] }, false, LIVE);
    await decide(LIVE, "approve", undefined, { revision: true });
    expect((await repo.listings.byId(LIVE))!).toMatchObject({ summary: "A brand new one-line summary here", thingsToKnow: ["Bring ID"] });
  });

  it("an invalid edit is rejected when submitted, not when approved", async () => {
    const ctx = await ctxFor("u_host");
    const cur = (await load()).input as EventListingInput;
    expect(await err(saveListing(ctx, { ...cur, areaId: "a_pune_does_not_exist" }, false, LIVE))).toMatchObject({ status: 400 });
    expect(await repo.revisions.pendingFor(LIVE)).toBeNull();
  });
});
