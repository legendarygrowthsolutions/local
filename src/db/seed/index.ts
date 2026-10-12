import type { Booking } from "@/contracts";
import { hash01 } from "@/lib/hash";
import { addDays, todayIST } from "@/lib/time";
import type { Db } from "../client";
import * as M from "../mappers";
import { loadSeedData } from "./data";
import { seedBookings } from "./host-bookings";

/** Insert in chunks to stay under every dialect's bound-parameter limit. */
async function insertAll<R extends object>(db: Db, table: string, rows: R[], chunk = 100) {
  for (let i = 0; i < rows.length; i += chunk) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).insertInto(table).values(rows.slice(i, i + chunk)).execute();
  }
}

/**
 * Seed a freshly-migrated database with the demo dataset, anchored to `now`:
 * 3 cities, ~108 listings, 30 venues / 112 courts, demo hosts with sales history,
 * other players' court bookings across the bookable window, and 2 weeks of listing views.
 */
export async function seedDatabase(db: Db, now = new Date()) {
  const d = loadSeedData(now);
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

  await db.transaction().execute(async (trx) => {
    await insertAll(trx, "cities", d.cities.map(M.cityToRow));
    await insertAll(trx, "areas", d.areas.map(M.areaToRow));
    await insertAll(trx, "categories", d.categories.map(M.categoryToRow));
    await insertAll(trx, "journeyTemplates", d.templates.map((t, i) => M.templateToRow(t, i)));
    await insertAll(trx, "users", d.users.map(M.userToRow));
    await insertAll(trx, "userSaved", d.users.flatMap((u) => u.saved.map((itemId) => ({ userId: u.id, itemId, createdAt: u.createdAt }))));
    await insertAll(trx, "userFollowing", d.users.flatMap((u) => (u.following ?? []).map((hostId) => ({ userId: u.id, hostId, createdAt: u.createdAt }))));
    await insertAll(trx, "hosts", d.hosts.map(M.hostToRow));
    await insertAll(trx, "hostDocuments", d.hosts.flatMap((h) => h.documents.map((doc, i) => M.hostDocToRow(h.id, doc, i))));
    await insertAll(trx, "hostMembers", d.hostMembers.map(M.memberToRow));
    await insertAll(trx, "listings", d.listings.map(M.listingToRow));
    await insertAll(trx, "listingSessions", d.sessions.map((s) => M.sessionToRow({ ...s, sold: sessionSold.get(s.id) ?? 0 })));
    await insertAll(trx, "ticketTypes", d.ticketTypes.map((t, i) => M.ticketToRow({ ...t, sold: ticketSold.get(t.id) ?? 0 }, i)));
    await insertAll(trx, "venues", d.venues.map(M.venueToRow));
    await insertAll(trx, "resources", d.resources.map((r, i) => M.resourceToRow(r, i)));
    await insertAll(trx, "slotRules", d.slotRules.map(M.ruleToRow));
    await insertAll(trx, "blocks", d.blocks.map(M.blockToRow));
    await insertAll(trx, "coupons", d.coupons.map(M.couponToRow));
    await insertAll(trx, "bookings", bookings.map(M.bookingToRow));
    await insertAll(trx, "bookingItems", bookings.flatMap((bk) => bk.items.map((it, i) => M.itemToRow(bk.id, it, i))));
    await insertAll(trx, "listingViews", views);
  });

  return { bookings: bookings.length, listings: d.listings.length, venues: d.venues.length, views: views.length };
}
