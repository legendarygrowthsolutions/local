import type { Booking } from "@/contracts";
import { hash01 } from "@/lib/hash";
import { addDays, todayIST } from "@/lib/time";
import type { Db } from "../client";
import * as M from "../mappers";
import { loadImportedData, loadSeedData } from "./data";
import { seedBookings } from "./host-bookings";
import { reference, seedReference } from "./reference";

export { seedReference } from "./reference";

/** Insert in chunks to stay under every dialect's bound-parameter limit. */
async function insertAll<R extends object>(db: Db, table: string, rows: R[], chunk = 100) {
  for (let i = 0; i < rows.length; i += chunk) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).insertInto(table).values(rows.slice(i, i + chunk)).execute();
  }
}

/**
 * DEVELOPMENT AND TESTS ONLY — never run against a production database. Production gets just the
 * reference data (`seedReference`); everything else there comes from real users and hosts.
 *
 * Seed a freshly-migrated database with the reference data plus the generated demo dataset anchored to `now` (demo hosts with sales
 * history, other players' court bookings, 2 weeks of listing views) plus the real Nagpur listings and venues
 * imported by scripts/crawl, which keep their own dates and get no simulated bookings or views.
 */
export async function seedDemo(db: Db, now = new Date()) {
  const d = loadSeedData(now);
  const im = loadImportedData();
  const generated = seedBookings(d, now);

  // Seeded event sales are real rows now, so take them out of the fixtures' baseline counters
  // (tickets' "sold", and the simulated session occupancy) to avoid double counting.
  const ticketSold = new Map(d.ticketTypes.map((t) => [t.id, t.sold]));
  const sessionSold = new Map(d.sessions.map((s) => [s.id, Math.floor(hash01(s.id) * s.capacity * 0.9)]));
  for (const bk of generated) {
    for (const it of bk.items) {
      if (it.ticketTypeId && ticketSold.has(it.ticketTypeId)) ticketSold.set(it.ticketTypeId, Math.max(0, ticketSold.get(it.ticketTypeId)! - it.qty));
      if (it.sessionId && sessionSold.has(it.sessionId)) sessionSold.set(it.sessionId, Math.max(0, sessionSold.get(it.sessionId)! - it.qty));
    }
  }
  // Booking codes must be unique; the deterministic generator can (rarely) collide.
  const seen = new Set(d.bookings.map((b) => b.code));
  const bookings: Booking[] = [...d.bookings];
  for (const bk of generated) {
    if (seen.has(bk.code)) continue;
    seen.add(bk.code);
    bookings.push(bk);
  }

  const views: { targetId: string; day: string; count: number }[] = [];
  const today = todayIST(now);
  for (const id of [...d.listings.filter((l) => l.status === "live").map((l) => l.id), ...d.venues.filter((v) => v.status === "live").map((v) => v.id)]) {
    for (let i = 0; i < 14; i++) {
      const day = addDays(today, -i);
      views.push({ targetId: id, day, count: Math.floor(60 + hash01(`${id}:${day}`) * 220) });
    }
  }

  await seedReference(db);
  // Demo-only cities (Mumbai, Pune) and their areas; categories and templates all come from the reference set.
  const ref = new Set([...reference.cities, ...reference.areas].map((x) => x.id));
  const notRef = <T extends { id: string }>(rows: T[]) => rows.filter((r) => !ref.has(r.id));
  await db.transaction().execute(async (trx) => {
    await insertAll(trx, "cities", notRef(d.cities).map(M.cityToRow));
    await insertAll(trx, "areas", notRef([...d.areas, ...im.areas]).map(M.areaToRow));
    await insertAll(trx, "users", d.users.map(M.userToRow));
    await insertAll(trx, "userSaved", d.users.flatMap((u) => u.saved.map((itemId) => ({ userId: u.id, itemId, createdAt: u.createdAt }))));
    await insertAll(trx, "userFollowing", d.users.flatMap((u) => (u.following ?? []).map((hostId) => ({ userId: u.id, hostId, createdAt: u.createdAt }))));
    await insertAll(trx, "hosts", [...d.hosts, ...im.hosts].map(M.hostToRow));
    await insertAll(trx, "hostDocuments", d.hosts.flatMap((h) => h.documents.map((doc, i) => M.hostDocToRow(h.id, doc, i))));
    await insertAll(trx, "hostMembers", d.hostMembers.map(M.memberToRow));
    await insertAll(trx, "listings", [...d.listings, ...im.listings].map(M.listingToRow));
    await insertAll(trx, "listingSessions", [...d.sessions, ...im.sessions].map((s) => M.sessionToRow({ ...s, sold: sessionSold.get(s.id) ?? 0 })));
    // Imported tickets keep their own "sold" (ticket tiers already sold out at the source).
    await insertAll(trx, "ticketTypes", [...d.ticketTypes, ...im.ticketTypes].map((t, i) => M.ticketToRow({ ...t, sold: ticketSold.get(t.id) ?? t.sold }, i)));
    await insertAll(trx, "venues", [...d.venues, ...im.venues].map(M.venueToRow));
    await insertAll(trx, "resources", [...d.resources, ...im.resources].map((r, i) => M.resourceToRow(r, i)));
    await insertAll(trx, "slotRules", [...d.slotRules, ...im.slotRules].map(M.ruleToRow));
    await insertAll(trx, "blocks", d.blocks.map(M.blockToRow));
    await insertAll(trx, "coupons", d.coupons.map(M.couponToRow));
    await insertAll(trx, "bookings", bookings.map(M.bookingToRow));
    await insertAll(trx, "bookingItems", bookings.flatMap((bk) => bk.items.map((it, i) => M.itemToRow(bk.id, it, i))));
    await insertAll(trx, "listingViews", views);
  });

  return { bookings: bookings.length, listings: d.listings.length + im.listings.length, venues: d.venues.length + im.venues.length, views: views.length };
}
