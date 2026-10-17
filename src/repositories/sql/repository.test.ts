import { describe, expect, it } from "vitest";
import type { Host, JourneyTemplate, Resource, SlotRule, Venue } from "@/contracts";
import { repo } from "@/repositories";
import { addDays, todayIST, toISO } from "@/lib/time";
import { setupTestDb, makeUser } from "@/test/db";
import { at, bookingRow, listingRow, makeListing } from "@/test/fixtures";

setupTestDb();

describe("reference data", () => {
  it("cities: insert/update round-trip, list() hides inactive, partial update keeps other fields", async () => {
    const c = { id: "c_testville", slug: "testville", name: "Testville", state: "MH", lat: 18.123456, lng: 73.654321, active: false, tagline: "Tests all day" };
    await repo.cities.insert(c);
    expect(await repo.cities.byId("c_testville")).toEqual(c);
    expect(await repo.cities.bySlug("testville")).toEqual(c);
    expect((await repo.cities.list()).some((x) => x.id === c.id)).toBe(false);
    expect((await repo.cities.listAll()).some((x) => x.id === c.id)).toBe(true);

    const upd = await repo.cities.update(c.id, { active: true });
    expect(upd).toEqual({ ...c, active: true });
    expect((await repo.cities.list()).some((x) => x.id === c.id)).toBe(true);
    expect(await repo.cities.update(c.id, { tagline: "New line" })).toEqual({ ...c, active: true, tagline: "New line" });
  });

  it("areas: insert/update/remove (cache invalidated on every write)", async () => {
    const a = { id: "a_test_1", cityId: "c_mumbai", slug: "test-nagar", name: "Test Nagar", lat: 19.1, lng: 72.9 };
    await repo.areas.insert(a);
    expect(await repo.areas.byId(a.id)).toEqual(a);
    expect((await repo.areas.listByCity("c_mumbai")).map((x) => x.id)).toContain(a.id);
    expect(await repo.areas.update(a.id, { name: "Test Nagar East" })).toEqual({ ...a, name: "Test Nagar East" });
    await repo.areas.remove(a.id);
    expect(await repo.areas.byId(a.id)).toBeNull();
  });

  it("categories: nullable blurb round-trips, update keeps sort, remove", async () => {
    const c = { id: "cat_test", slug: "test", name: "Test", singular: "Test", parentId: null, icon: "Star", sort: 42 };
    await repo.categories.insert(c);
    expect((await repo.categories.list()).find((x) => x.id === c.id)).toEqual(c); // no blurb key when null
    const upd = await repo.categories.update(c.id, { blurb: "Hello" });
    expect(upd).toEqual({ ...c, blurb: "Hello" });
    expect(await repo.categories.update(c.id, { blurb: undefined })).toEqual(c);
    await repo.categories.remove(c.id);
    expect((await repo.categories.list()).find((x) => x.id === c.id)).toBeUndefined();
  });

  it("templates: JSON + boolean fields round-trip, partial update", async () => {
    const base = (await repo.templates.byId("tpl_rsvp"))!;
    const t: JourneyTemplate = { ...base, id: "tpl_test_rt", name: "RT", allowedCategories: ["meetups", "events"], active: false, rules: { ...base.rules, hostApprovalPerBooking: true } };
    await repo.templates.insert(t);
    expect(await repo.templates.byId(t.id)).toEqual(t);
    const upd = await repo.templates.update(t.id, { ctaLabel: "Join" });
    expect(upd).toEqual({ ...t, ctaLabel: "Join" });
  });

  it("coupons: lookup is case- and whitespace-insensitive", async () => {
    expect(await repo.coupons.byCode(" local10 ")).toMatchObject({ code: "LOCAL10", type: "pct", value: 10, maxDiscount: 200, description: expect.any(String) });
    expect(await repo.coupons.byCode("NOPE")).toBeNull();
  });
});

describe("users", () => {
  it("insert/read preserves every field including nullable + JSON ones", async () => {
    const u = await makeUser({ name: null, gender: "female", dob: "1990-01-02", cityId: null, interests: ["comedy", "padel"], avatar: "av.png", notifications: { whatsapp: false, email: true, offers: true } });
    expect(await repo.users.byId(u.id)).toEqual(u);
    expect(await repo.users.byPhone(u.phone)).toEqual(u);
  });

  it("partial update doesn't clobber other fields", async () => {
    const u = await makeUser({ interests: ["comedy"], notifications: { whatsapp: true, email: false, offers: false }, saved: ["l_mumbai_05"] });
    const before = (await repo.users.byId(u.id))!;
    expect(before).toMatchObject({ ...u, avatar: null });
    const upd = await repo.users.update(u.id, { name: "Renamed" });
    expect(upd).toEqual({ ...before, name: "Renamed" });
  });

  it("saved / following keep insertion order and toggle cleanly", async () => {
    const u = await makeUser({ saved: ["l_z", "l_a", "l_m"], following: ["h_mumbai_2", "h_mumbai_1"] });
    let got = (await repo.users.byId(u.id))!;
    expect(got.saved).toEqual(["l_z", "l_a", "l_m"]);
    expect(got.following).toEqual(["h_mumbai_2", "h_mumbai_1"]);

    // Remove the middle one, append two more in one update, then one more.
    await repo.users.update(u.id, { saved: ["l_z", "l_m", "l_c", "l_b"] });
    await repo.users.update(u.id, { saved: ["l_z", "l_m", "l_c", "l_b", "l_0"] });
    got = (await repo.users.byId(u.id))!;
    expect(got.saved).toEqual(["l_z", "l_m", "l_c", "l_b", "l_0"]);
    expect(got.following).toEqual(["h_mumbai_2", "h_mumbai_1"]); // untouched

    await repo.users.update(u.id, { following: [] });
    expect((await repo.users.byId(u.id))!.following).toEqual([]);
  });

  it("list() returns everyone with their links", async () => {
    const u = await makeUser({ saved: ["l_1"] });
    const all = await repo.users.list();
    expect(all.find((x) => x.id === u.id)?.saved).toEqual(["l_1"]);
    expect(all.find((x) => x.id === "u_demo")).toBeTruthy();
  });
});

describe("hosts & members", () => {
  const host = (): Host => ({
    id: "h_test_rt",
    userId: null,
    type: "organiser",
    slug: "rt-host",
    brandName: "RT Host",
    cityId: "c_mumbai",
    bio: "bio",
    instagram: null,
    kycStatus: "pending",
    status: "pending",
    since: "2026-10-01",
    contactName: "C",
    contactPhone: "9000000099",
    email: null,
    website: "https://example.com",
    gstin: null,
    expectedPerMonth: "1–2",
    wantsPaid: true,
    documents: [
      { id: "d_rt_2", kind: "bank", fileName: "bank.pdf", status: "uploaded" },
      { id: "d_rt_1", kind: "pan", fileName: "pan.pdf", status: "verified" },
    ],
    reviewNote: null,
    submittedAt: new Date().toISOString(),
  });

  it("round-trips documents in order and replaces them on update", async () => {
    const h = host();
    await repo.hosts.insert(h);
    expect(await repo.hosts.byId(h.id)).toEqual(h);

    const upd = await repo.hosts.update(h.id, { reviewNote: "Fix GST" });
    expect(upd).toEqual({ ...h, reviewNote: "Fix GST" }); // documents untouched when not in patch

    const docs = [{ id: "d_rt_3", kind: "gst" as const, fileName: "gst.pdf", status: "uploaded" as const }];
    expect((await repo.hosts.update(h.id, { documents: docs }))!.documents).toEqual(docs);
    expect((await repo.hosts.update(h.id, { documents: [] }))!.documents).toEqual([]);
    expect((await repo.hosts.byId(h.id))!.wantsPaid).toBe(true);
  });

  it("members: listByUser only returns active memberships; invites resolve by phone", async () => {
    const m = await repo.members.insert({ id: "hm_rt", hostId: "h_mumbai_2", userId: null, phone: "9000000777", name: null, role: "manager", status: "invited", invitedBy: "u_host", createdAt: new Date().toISOString(), scope: null });
    expect(await repo.members.invitesForPhone("9000000777")).toEqual([m]);
    const u = await makeUser({ phone: "9000000777" });
    expect(await repo.members.listByUser(u.id)).toEqual([]);
    const upd = await repo.members.update(m.id, { userId: u.id, status: "active", scope: ["l_x", "v_y"] });
    expect(upd).toEqual({ ...m, userId: u.id, status: "active", scope: ["l_x", "v_y"] });
    expect((await repo.members.update(m.id, { scope: null }))?.scope).toBeNull();
    expect((await repo.members.update(m.id, { scope: ["l_x", "v_y"] }))?.scope).toEqual(["l_x", "v_y"]);
    expect(await repo.members.listByUser(u.id)).toEqual([upd]);
    await repo.members.remove(m.id);
    expect(await repo.members.listByHost("h_mumbai_2")).not.toContainEqual(expect.objectContaining({ id: m.id }));
  });
});

describe("listings", () => {
  it("insert/update preserves JSON arrays, nulls and numbers; partial update keeps the rest", async () => {
    const l = listingRow({ featuredRank: 3, externalUrl: "https://x.test", subcategoryId: "cat_events_comedy", formFields: [{ id: "f1", label: "Size", type: "select", options: ["S", "M"], required: true }], reviewNote: "note" });
    await repo.listings.insert(l);
    expect(await repo.listings.byId(l.id)).toEqual(l);
    expect(await repo.listings.bySlug("c_mumbai", l.slug)).toEqual(l);
    expect(await repo.listings.bySlug("c_pune", l.slug)).toBeNull();

    const upd = await repo.listings.update(l.id, { title: "Renamed", featuredRank: null, tags: [] });
    expect(upd).toEqual({ ...l, title: "Renamed", featuredRank: null, tags: [] });
    expect((await repo.listings.listByHost("h_mumbai_1")).map((x) => x.id)).toContain(l.id);
  });

  it("ticket prices keep paise (₹99.50) and booleans", async () => {
    const { listing, tickets } = await makeListing({ tickets: [{ price: 99.5, isPass: true, perOrderMax: 3 }, { price: 1234.25 }] });
    const got = await repo.listings.ticketTypes([listing.id]);
    expect(got).toEqual(tickets);
    expect(got[0].price).toBe(99.5);
  });

  it("replaceSessions keeps `sold` for surviving ids and drops removed sessions", async () => {
    const { listing, sessions } = await makeListing({ sessionDays: [3, 4] });
    await repo.listings.replaceSessions(listing.id, sessions.map((s, i) => ({ ...s, sold: i === 0 ? 7 : 2 })));
    // Edit without `sold` (as the host wizard does): survivor keeps 7, new one starts at 0.
    const { sold: _s, ...survivor } = sessions[0];
    void _s;
    const fresh = { ...survivor, id: `${listing.id}_new`, startsAt: at(5), endsAt: at(5, 22 * 60) };
    await repo.listings.replaceSessions(listing.id, [{ ...survivor, label: "Renamed" }, fresh]);
    const got = await repo.listings.sessions([listing.id]);
    expect(got.map((s) => [s.id, s.sold, s.label])).toEqual([
      [sessions[0].id, 7, "Renamed"],
      [fresh.id, 0, fresh.label],
    ]);
  });
});

describe("venues", () => {
  const venue = (): Venue => ({
    id: "v_test_rt",
    hostId: "h_mumbai_5",
    cityId: "c_mumbai",
    areaId: "a_mumbai_bandra-west",
    templateId: "tpl_court_60",
    slug: "test-arena",
    name: "Test Arena",
    summary: "s",
    description: "d",
    media: ["m.jpg"],
    address: "addr",
    lat: 19.05,
    lng: 72.83,
    amenities: ["Parking"],
    hoursLabel: "6 AM – 11 PM",
    sports: ["pickleball"],
    thingsToKnow: [],
    featuredRank: null,
    status: "draft",
    reviewNote: null,
  });
  const court = (id: string, name: string): Resource => ({ id, venueId: "v_test_rt", name, sport: "pickleball", indoor: true, surface: "Acrylic", slotLengthMins: 60, capacity: 4 });
  const rule = (resourceId: string, priceBase = 650.5): SlotRule => ({
    id: `sr_${resourceId}`,
    resourceId,
    openMins: 360,
    closeMins: 1380,
    minMins: 60,
    maxMins: 180,
    bufferMins: 0,
    advanceDays: 14,
    priceBase,
    pricePeak: 900,
    peak: [{ days: [0, 6], fromMins: 420, toMins: 1320 }],
  });

  it("venue insert/update round-trip", async () => {
    const v = venue();
    await repo.venues.insert(v);
    expect(await repo.venues.byId(v.id)).toEqual(v);
    expect(await repo.venues.update(v.id, { status: "live", featuredRank: 2 })).toEqual({ ...v, status: "live", featuredRank: 2 });
  });

  it("replaceResources keeps ids (and their blocks), updates in place, deletes removed courts", async () => {
    const c1 = court("r_test_1", "Court 1");
    const c2 = court("r_test_2", "Court 2");
    await repo.venues.replaceResources("v_test_rt", [c1, c2], [rule(c1.id), rule(c2.id)]);
    expect(await repo.venues.resources(["v_test_rt"])).toEqual([c1, c2]);
    expect(await repo.venues.slotRules([c1.id, c2.id])).toEqual(expect.arrayContaining([rule(c1.id), rule(c2.id)]));

    const blk = { id: "blk_test_1", resourceId: c1.id, startsAt: at(2, 600), endsAt: at(2, 660), reason: "Coaching" };
    await repo.venues.insertBlock(blk);

    // Rename court 1, drop court 2, add court 3; court 1 goes last (sort follows the array).
    const c1b = { ...c1, name: "Centre Court", indoor: false };
    const c3 = court("r_test_3", "Court 3");
    await repo.venues.replaceResources("v_test_rt", [c3, c1b], [rule(c3.id), rule(c1b.id, 700)]);
    expect(await repo.venues.resources(["v_test_rt"])).toEqual([c3, c1b]);
    expect(await repo.venues.blocks([c1.id])).toEqual([blk]); // block on the surviving court kept
    const rules = await repo.venues.slotRules([c1.id, c2.id, c3.id]);
    expect(rules.map((r) => r.resourceId).sort()).toEqual([c1.id, c3.id]);
    expect(rules.find((r) => r.resourceId === c1.id)!.priceBase).toBe(700);

    await repo.venues.removeBlock(blk.id);
    expect(await repo.venues.blocks([c1.id])).toEqual([]);
  });
});

describe("bookings", () => {
  it("round-trips items, money, attendee JSON and booleans", async () => {
    const u = await makeUser();
    const b = bookingRow({
      userId: u.id,
      listingId: "l_mumbai_05",
      items: [
        { ticketTypeId: "t_9", sessionId: "s_x", resourceId: null, startsAt: at(3), endsAt: at(3, 1320), label: "GA", qty: 2, unitPrice: 99.5 },
        { ticketTypeId: "t_10", sessionId: "s_x", resourceId: null, startsAt: at(3), endsAt: at(3, 1320), label: "VIP", qty: 1, unitPrice: 1249 },
      ],
      price: { subtotal: 1448, discount: 144.8, convenienceFee: 48.87, gstOnFee: 8.8, total: 1360.87 },
      couponCode: "LOCAL10",
      attendee: { name: "A", phone: "9876543210", email: "", answers: { f1: "x" } },
      seeded: true,
      checkedInAt: null,
    });
    await repo.bookings.insert(b);
    expect(await repo.bookings.byId(b.id)).toEqual(b);
    expect(await repo.bookings.byCode(b.code.toLowerCase())).toEqual(b);
    expect(await repo.bookings.byCode(`  ${b.code}  `)).toEqual(b);
    expect((await repo.bookings.listByUser(u.id)).map((x) => x.id)).toEqual([b.id]);

    // Partial update: only status changes; items and price stay.
    expect(await repo.bookings.update(b.id, { status: "checked_in", checkedInAt: "2026-10-12T10:00:00.000Z" })).toEqual({ ...b, status: "checked_in", checkedInAt: "2026-10-12T10:00:00.000Z" });
    // Price patch rewrites all money columns together.
    const price = { subtotal: 1448, discount: 0, convenienceFee: 54.3, gstOnFee: 9.77, total: 1512.07 };
    expect((await repo.bookings.update(b.id, { price, couponCode: null }))!.price).toEqual(price);
  });

  it("listByUser is newest-first; listForTargets filters by listing/venue", async () => {
    const u = await makeUser();
    const old = bookingRow({ userId: u.id, listingId: "l_mumbai_05", createdAt: "2026-01-01T00:00:00.000Z" });
    const neu = bookingRow({ userId: u.id, venueId: "v_mumbai_01", kind: "venue", createdAt: "2026-02-01T00:00:00.000Z" });
    await repo.bookings.insert(old);
    await repo.bookings.insert(neu);
    expect((await repo.bookings.listByUser(u.id)).map((x) => x.id)).toEqual([neu.id, old.id]);
    const forVenue = await repo.bookings.listForTargets([], ["v_mumbai_01"]);
    expect(forVenue.some((x) => x.id === neu.id)).toBe(true);
    expect(forVenue.some((x) => x.id === old.id)).toBe(false);
    expect(await repo.bookings.listForTargets([], [])).toEqual([]);
  });
});

describe("holds & inventory", () => {
  it("expired holds don't count in activeQuantities / taken and read back as expired", async () => {
    const u = await makeUser();
    const { listing, sessions, tickets } = await makeListing();
    const item = { ticketTypeId: tickets[0].id, sessionId: sessions[0].id, resourceId: null, startsAt: sessions[0].startsAt, endsAt: sessions[0].endsAt, label: "T", qty: 2, unitPrice: 500 };
    const live = bookingRow({ userId: u.id, listingId: listing.id, status: "held", holdExpiresAt: new Date(Date.now() + 600_000).toISOString(), items: [item] });
    const dead = bookingRow({ userId: u.id, listingId: listing.id, status: "pending_payment", holdExpiresAt: new Date(Date.now() - 1000).toISOString(), items: [{ ...item, qty: 5 }] });
    const settled = bookingRow({ userId: u.id, listingId: listing.id, status: "confirmed", items: [{ ...item, qty: 3 }] });
    const cancelled = bookingRow({ userId: u.id, listingId: listing.id, status: "cancelled", items: [{ ...item, qty: 11 }] });
    for (const b of [live, dead, settled, cancelled]) await repo.bookings.insert(b);

    const q = await repo.bookings.activeQuantities([listing.id]);
    expect(q.byTicket.get(tickets[0].id)).toBe(5); // 2 held + 3 confirmed
    expect(q.bySession.get(sessions[0].id)).toBe(5);
    expect((await repo.bookings.byId(dead.id))!.status).toBe("expired");
    expect((await repo.bookings.byId(live.id))!.status).toBe("held");
    expect(await repo.bookings.countLiveHolds(u.id)).toBe(1);
  });

  it("taken() returns booked + live held court ranges for the day only", async () => {
    const u = await makeUser();
    const day = addDays(todayIST(), 5);
    const res = "r_v_mumbai_01_2";
    const slot = (startMins: number, endMins: number) => ({ ticketTypeId: null, sessionId: null, resourceId: res, startsAt: toISO(day, startMins), endsAt: toISO(day, endMins), label: "c", qty: 1, unitPrice: 600 });
    // Use unusual minutes so we can pick our rows out from the seeded occupancy.
    const mk = (status: "held" | "confirmed" | "cancelled", s: number, e: number, exp: number | null) =>
      bookingRow({ userId: u.id, kind: "venue", venueId: "v_mumbai_01", status, items: [slot(s, e)], startsAt: toISO(day, s), endsAt: toISO(day, e), holdExpiresAt: exp === null ? null : new Date(Date.now() + exp).toISOString() });
    await repo.bookings.insert(mk("held", 7, 67, 600_000));
    await repo.bookings.insert(mk("held", 8, 68, -1000)); // expired
    await repo.bookings.insert(mk("confirmed", 9, 69, null));
    await repo.bookings.insert(mk("cancelled", 11, 71, null));
    const taken = (await repo.venues.taken([res], day)).filter((t) => [7, 8, 9, 11].includes(t.startMins));
    expect(taken.sort((a, b) => a.startMins - b.startMins)).toEqual([
      { resourceId: res, date: day, startMins: 7, endMins: 67, kind: "held" },
      { resourceId: res, date: day, startMins: 9, endMins: 69, kind: "booked" },
    ]);
    expect((await repo.venues.taken([res], addDays(day, 1))).some((t) => t.startMins === 9)).toBe(false);
  });
});

describe("auth tables", () => {
  it("otps: put replaces, reserveAttempt is atomic and capped, remove", async () => {
    const rec = { codeHash: "h1", expiresAt: "2030-01-01T00:00:00.000Z", attempts: 0, sentAt: "2026-01-01T00:00:00.000Z" };
    await repo.otps.put("9111111111", rec);
    await repo.otps.put("9111111111", { ...rec, codeHash: "h2" });
    expect(await repo.otps.get("9111111111")).toEqual({ ...rec, codeHash: "h2" });
    // Concurrent reservations never exceed the budget.
    const ok = await Promise.all([1, 2, 3, 4, 5].map(() => repo.otps.reserveAttempt("9111111111", 3)));
    expect(ok.filter(Boolean)).toHaveLength(3);
    expect((await repo.otps.get("9111111111"))!.attempts).toBe(3);
    expect(await repo.otps.reserveAttempt("9000009999", 3)).toBe(false); // no record
    await repo.otps.remove("9111111111");
    expect(await repo.otps.get("9111111111")).toBeNull();
  });

  it("authSessions: get respects expiry; touch extends; removeForUser", async () => {
    const u = await makeUser();
    await repo.authSessions.create({ id: "sess_1", userId: u.id, createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-02T00:00:00.000Z" });
    expect(await repo.authSessions.get("sess_1", "2026-01-01T12:00:00.000Z")).toEqual({ userId: u.id, expiresAt: "2026-01-02T00:00:00.000Z" });
    expect(await repo.authSessions.get("sess_1", "2026-01-03T00:00:00.000Z")).toBeNull();
    await repo.authSessions.touch("sess_1", "2026-01-05T00:00:00.000Z");
    expect(await repo.authSessions.get("sess_1", "2026-01-03T00:00:00.000Z")).not.toBeNull();
    await repo.authSessions.removeForUser(u.id);
    expect(await repo.authSessions.get("sess_1", "2026-01-01T00:00:00.000Z")).toBeNull();
  });

  it("rateLimits: fixed window counts then resets", async () => {
    const t0 = new Date("2026-05-01T00:00:00.000Z");
    expect(await repo.rateLimits.hit("k", 60_000, t0)).toEqual({ count: 1, resetAt: "2026-05-01T00:01:00.000Z" });
    expect((await repo.rateLimits.hit("k", 60_000, new Date(t0.getTime() + 30_000))).count).toBe(2);
    const after = await repo.rateLimits.hit("k", 60_000, new Date(t0.getTime() + 60_000));
    expect(after).toEqual({ count: 1, resetAt: "2026-05-01T00:02:00.000Z" });
  });
});

describe("payments & views", () => {
  it("payments keep paise and order", async () => {
    const u = await makeUser();
    const b = bookingRow({ userId: u.id });
    await repo.bookings.insert(b);
    const p = (id: string, createdAt: string, amount: number, status: "success" | "failed") => ({ id, bookingId: b.id, provider: "test", method: "upi", status, amount, ref: id, createdAt });
    await repo.payments.insert(p("pay_2", "2026-01-01T00:00:02.000Z", 1360.87, "success"));
    await repo.payments.insert(p("pay_1", "2026-01-01T00:00:01.000Z", 0.01, "failed"));
    expect(await repo.payments.listByBooking(b.id)).toEqual([p("pay_1", "2026-01-01T00:00:01.000Z", 0.01, "failed"), p("pay_2", "2026-01-01T00:00:02.000Z", 1360.87, "success")]);
  });

  it("views: record upserts per day, totals sum an inclusive day range", async () => {
    await Promise.all([1, 2, 3].map(() => repo.views.record("x_target", "2026-03-10")));
    await repo.views.record("x_target", "2026-03-11");
    await repo.views.record("y_target", "2026-03-11");
    expect(await repo.views.totals(["x_target"], "2026-03-10", "2026-03-10")).toBe(3);
    expect(await repo.views.totals(["x_target", "y_target"], "2026-03-10", "2026-03-11")).toBe(5);
    expect(await repo.views.totals(["x_target"], "2026-03-12", "2026-03-20")).toBe(0);
    expect(await repo.views.totals([], "2026-03-10", "2026-03-11")).toBe(0);
  });
});

describe("transactions", () => {
  it("roll back every write when the callback throws", async () => {
    const u = await makeUser();
    await expect(
      repo.transaction(async () => {
        await repo.users.update(u.id, { name: "Changed" });
        await repo.bookings.insert(bookingRow({ userId: u.id, id: "bk_rollback", code: "ROLLBK" }));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await repo.users.byId(u.id))!.name).toBe(u.name);
    expect(await repo.bookings.byId("bk_rollback")).toBeNull();
  });
});

describe("media", () => {
  it("stores uploads up to the 2 MB document limit byte-for-byte", async () => {
    const u = await makeUser();
    const data = Buffer.alloc(2 * 1024 * 1024, 0);
    for (let i = 0; i < data.length; i += 997) data[i] = i % 251;
    await repo.media.insert({ id: "m_test_big", ownerId: u.id, contentType: "application/pdf", private: true, data, createdAt: new Date().toISOString() });
    const got = await repo.media.get("m_test_big");
    expect(got?.data.equals(data)).toBe(true);
    expect(got?.private).toBe(true);
    expect(await repo.media.exists("m_test_big")).toBe(false); // private media is never public
  });
});
