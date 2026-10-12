import "server-only";
import type { Booking } from "@/contracts";
import { sql } from "kysely";
import { db, withTransaction } from "@/db/client";
import * as M from "@/db/mappers";
import type { BookingItemsTable, BookingsTable } from "@/db/tables";
import { fromISO } from "@/lib/time";
import type { TakenRange } from "@/lib/slots/engine";
import type { PaymentRecord, Repository } from "../types";

type PaymentRecordStatus = PaymentRecord["status"];

/* eslint-disable @typescript-eslint/no-explicit-any */

const HOLDING = ["held", "pending_payment"] as const;
const SETTLED = ["requested", "confirmed", "checked_in"] as const;
const nowIso = () => new Date().toISOString();

// ---------- reference-data cache ----------
// Cities, areas, categories and templates are read on nearly every request and change rarely
// (superadmin edits). Cached per process; local writes invalidate, the TTL bounds staleness
// when several app instances share one database.
const REF_TTL_MS = 30_000;
const refCache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = refCache.get(key);
  if (hit && Date.now() - hit.at < REF_TTL_MS) return structuredClone(hit.value) as T;
  const value = await load();
  refCache.set(key, { at: Date.now(), value });
  return structuredClone(value);
}
const invalidate = (prefix: string) => {
  for (const k of refCache.keys()) if (k.startsWith(prefix)) refCache.delete(k);
};

// ---------- holds ----------
/** A hold whose timer ran out reads as expired immediately; the row is updated by the sweep. */
function effective(r: BookingsTable): BookingsTable {
  if ((r.status === "held" || r.status === "pending_payment") && r.holdExpiresAt && r.holdExpiresAt < nowIso()) return { ...r, status: "expired" };
  return r;
}
let lastSweep = 0;
async function sweepHolds() {
  const now = Date.now();
  if (now - lastSweep < 15_000) return;
  lastSweep = now;
  const iso = new Date(now).toISOString();
  await db().updateTable("bookings").set({ status: "expired" }).where("status", "in", [...HOLDING]).where("holdExpiresAt", "<", iso).execute();
  if (now - lastPrune > 3_600_000) {
    lastPrune = now;
    // Housekeeping: drop dead sessions, codes and rate-limit windows.
    await db().deleteFrom("authSessions").where("expiresAt", "<", iso).execute();
    await db().deleteFrom("otpCodes").where("expiresAt", "<", iso).execute();
    await db().deleteFrom("rateLimits").where("resetAt", "<", iso).execute();
  }
}
let lastPrune = 0;

/** Bookings that hold inventory right now: settled ones plus unexpired holds. */
const holdsInventory = (eb: any, now: string) =>
  eb.or([eb("b.status", "in", [...SETTLED]), eb.and([eb("b.status", "in", [...HOLDING]), eb("b.holdExpiresAt", ">", now)])]);

type BookingFilter = (qb: any) => any;
async function loadBookings(filter: BookingFilter, order: "createdAt" | null = null): Promise<Booking[]> {
  let q = filter(db().selectFrom("bookings").selectAll());
  if (order) q = q.orderBy(order, "desc");
  const rows: BookingsTable[] = await q.execute();
  if (!rows.length) return [];
  // Small result sets fetch items by id; large ones by the same filter as a subquery (no LIMIT
  // inside IN, which MySQL doesn't support).
  const items: BookingItemsTable[] =
    rows.length <= 500
      ? await db().selectFrom("bookingItems").selectAll().where("bookingId", "in", rows.map((r) => r.id)).execute()
      : await db().selectFrom("bookingItems").selectAll().where("bookingId", "in", filter(db().selectFrom("bookings").select("id"))).execute();
  const byBooking = new Map<string, BookingItemsTable[]>();
  for (const it of items) {
    const list = byBooking.get(it.bookingId);
    if (list) list.push(it);
    else byBooking.set(it.bookingId, [it]);
  }
  return rows.map((r) => M.bookingFromRow(effective(r), byBooking.get(r.id) ?? []));
}

async function loadUsers(filter: (qb: any) => any) {
  const rows = await filter(db().selectFrom("users").selectAll()).execute();
  if (!rows.length) return [];
  const ids = rows.map((r: { id: string }) => r.id);
  const one = ids.length === 1;
  const [saved, following] = await Promise.all([
    db().selectFrom("userSaved").select(["userId", "itemId"]).where("userId", one ? "=" : "in", one ? ids[0] : ids).orderBy("createdAt").execute(),
    db().selectFrom("userFollowing").select(["userId", "hostId"]).where("userId", one ? "=" : "in", one ? ids[0] : ids).orderBy("createdAt").execute(),
  ]);
  return rows.map((r: any) =>
    M.userFromRow(
      r,
      saved.filter((s) => s.userId === r.id).map((s) => s.itemId),
      following.filter((f) => f.userId === r.id).map((f) => f.hostId),
    ),
  );
}

async function loadHosts(filter: (qb: any) => any) {
  const rows = await filter(db().selectFrom("hosts").selectAll()).execute();
  if (!rows.length) return [];
  const ids = rows.map((r: { id: string }) => r.id);
  const docs = await db().selectFrom("hostDocuments").selectAll().where("hostId", "in", ids).execute();
  return rows.map((r: any) => M.hostFromRow(r, docs.filter((d) => d.hostId === r.id)));
}

const first = <T,>(xs: T[]) => xs[0] ?? null;

export const sqlRepository: Repository = {
  transaction: withTransaction,

  cities: {
    list: async () => (await sqlRepository.cities.listAll()).filter((c) => c.active),
    listAll: () => cached("cities", async () => (await db().selectFrom("cities").selectAll().orderBy("name").execute()).map(M.cityFromRow)),
    insert: async (c) => {
      await db().insertInto("cities").values(M.cityToRow(c)).execute();
      invalidate("cities");
      return c;
    },
    update: async (id, patch) => {
      const row = M.cityPatch(patch);
      if (Object.keys(row).length) await db().updateTable("cities").set(row).where("id", "=", id).execute();
      invalidate("cities");
      return sqlRepository.cities.byId(id);
    },
    bySlug: async (slug) => (await sqlRepository.cities.listAll()).find((c) => c.slug === slug) ?? null,
    byId: async (id) => (await sqlRepository.cities.listAll()).find((c) => c.id === id) ?? null,
  },

  areas: {
    listByCity: async (cityId) => (await allAreas()).filter((a) => a.cityId === cityId),
    byId: async (id) => (await allAreas()).find((a) => a.id === id) ?? null,
    insert: async (a) => {
      await db().insertInto("areas").values(M.areaToRow(a)).execute();
      invalidate("areas");
      return a;
    },
    update: async (id, patch) => {
      const { id: _id, ...rest } = patch;
      void _id;
      if (Object.keys(rest).length) await db().updateTable("areas").set(rest).where("id", "=", id).execute();
      invalidate("areas");
      return sqlRepository.areas.byId(id);
    },
    remove: async (id) => {
      await db().deleteFrom("areas").where("id", "=", id).execute();
      invalidate("areas");
    },
  },

  categories: {
    list: () => cached("categories", async () => (await db().selectFrom("categories").selectAll().orderBy("sort").orderBy("id").execute()).map(M.categoryFromRow)),
    insert: async (c) => {
      await db().insertInto("categories").values(M.categoryToRow(c)).execute();
      invalidate("categories");
      return c;
    },
    update: async (id, patch) => {
      const { id: _id, ...rest } = patch;
      void _id;
      if (Object.keys(rest).length) await db().updateTable("categories").set({ ...rest, ...("blurb" in rest ? { blurb: rest.blurb ?? null } : {}) }).where("id", "=", id).execute();
      invalidate("categories");
      return (await sqlRepository.categories.list()).find((c) => c.id === id) ?? null;
    },
    remove: async (id) => {
      await db().deleteFrom("categories").where("id", "=", id).execute();
      invalidate("categories");
    },
  },

  templates: {
    list: () => cached("templates", async () => (await db().selectFrom("journeyTemplates").selectAll().orderBy("sort").orderBy("id").execute()).map(M.templateFromRow)),
    byId: async (id) => (await sqlRepository.templates.list()).find((t) => t.id === id) ?? null,
    insert: async (t) => {
      // New templates go to the end of the list.
      const last = await db().selectFrom("journeyTemplates").select((eb) => eb.fn.max("sort").as("m")).executeTakeFirst();
      await db().insertInto("journeyTemplates").values(M.templateToRow(t, Number(last?.m ?? -1) + 1)).execute();
      invalidate("templates");
      return t;
    },
    update: async (id, patch) => {
      const row = M.templatePatch(patch);
      delete (row as { id?: string }).id;
      if (Object.keys(row).length) await db().updateTable("journeyTemplates").set(row).where("id", "=", id).execute();
      invalidate("templates");
      return sqlRepository.templates.byId(id);
    },
  },

  hosts: {
    byId: async (id) => first(await loadHosts((q) => q.where("id", "=", id))),
    hostIdForDocumentMedia: async (mediaId) =>
      (await db().selectFrom("hostDocuments").select("hostId").where("mediaId", "=", mediaId).executeTakeFirst())?.hostId ?? null,
    list: () => loadHosts((q) => q.orderBy("submittedAt", "desc")),
    insert: async (h) => {
      await withTransaction(async () => {
        await db().insertInto("hosts").values(M.hostToRow(h)).execute();
        if (h.documents.length) await db().insertInto("hostDocuments").values(h.documents.map((d, i) => M.hostDocToRow(h.id, d, i))).execute();
      });
      return h;
    },
    update: async (id, patch) => {
      await withTransaction(async () => {
        const row = M.hostPatch(patch);
        delete (row as { id?: string }).id;
        if (Object.keys(row).length) await db().updateTable("hosts").set(row).where("id", "=", id).execute();
        if (patch.documents) {
          await db().deleteFrom("hostDocuments").where("hostId", "=", id).execute();
          if (patch.documents.length) await db().insertInto("hostDocuments").values(patch.documents.map((d, i) => M.hostDocToRow(id, d, i))).execute();
        }
      });
      return sqlRepository.hosts.byId(id);
    },
  },

  members: {
    listByUser: async (userId) =>
      (await db().selectFrom("hostMembers").selectAll().where("userId", "=", userId).where("status", "=", "active").orderBy("createdAt").execute()).map(M.memberFromRow),
    listByHost: async (hostId) => (await db().selectFrom("hostMembers").selectAll().where("hostId", "=", hostId).orderBy("createdAt").execute()).map(M.memberFromRow),
    invitesForPhone: async (phone) =>
      (await db().selectFrom("hostMembers").selectAll().where("phone", "=", phone).where("status", "=", "invited").execute()).map(M.memberFromRow),
    insert: async (m) => {
      await db().insertInto("hostMembers").values(M.memberToRow(m)).execute();
      return m;
    },
    update: async (id, patch) => {
      const { id: _id, ...rest } = patch;
      void _id;
      if (Object.keys(rest).length) await db().updateTable("hostMembers").set(rest).where("id", "=", id).execute();
      const row = await db().selectFrom("hostMembers").selectAll().where("id", "=", id).executeTakeFirst();
      return row ? M.memberFromRow(row) : null;
    },
    remove: async (id) => {
      await db().deleteFrom("hostMembers").where("id", "=", id).execute();
    },
  },

  listings: {
    listLive: async (cityId) =>
      (await db().selectFrom("listings").selectAll().where("cityId", "=", cityId).where("status", "=", "live").orderBy("createdAt").execute()).map(M.listingFromRow),
    listAll: async () => (await db().selectFrom("listings").selectAll().orderBy("createdAt").execute()).map(M.listingFromRow),
    bySlug: async (cityId, slug) => {
      const r = await db().selectFrom("listings").selectAll().where("cityId", "=", cityId).where("slug", "=", slug).executeTakeFirst();
      return r ? M.listingFromRow(r) : null;
    },
    byId: async (id) => {
      const r = await db().selectFrom("listings").selectAll().where("id", "=", id).executeTakeFirst();
      return r ? M.listingFromRow(r) : null;
    },
    sessions: async (ids) =>
      ids.length ? (await db().selectFrom("listingSessions").selectAll().where("listingId", "in", ids).orderBy("startsAt").execute()).map(M.sessionFromRow) : [],
    ticketTypes: async (ids) =>
      ids.length ? (await db().selectFrom("ticketTypes").selectAll().where("listingId", "in", ids).orderBy("sort").execute()).map(M.ticketFromRow) : [],
    listByHost: async (hostId) => (await db().selectFrom("listings").selectAll().where("hostId", "=", hostId).orderBy("createdAt").execute()).map(M.listingFromRow),
    insert: async (l) => {
      await db().insertInto("listings").values(M.listingToRow(l)).execute();
      return l;
    },
    update: async (id, patch) => {
      const row = M.listingPatch(patch);
      delete (row as { id?: string }).id;
      if (Object.keys(row).length) await db().updateTable("listings").set(row).where("id", "=", id).execute();
      return sqlRepository.listings.byId(id);
    },
    replaceSessions: async (listingId, sessions) => {
      await withTransaction(async () => {
        // Keep externally-sold counts for sessions that survive the edit.
        const prev = new Map((await db().selectFrom("listingSessions").select(["id", "sold"]).where("listingId", "=", listingId).execute()).map((s) => [s.id, Number(s.sold)]));
        await db().deleteFrom("listingSessions").where("listingId", "=", listingId).execute();
        if (sessions.length)
          await db()
            .insertInto("listingSessions")
            .values(sessions.map((s) => M.sessionToRow({ ...s, sold: s.sold ?? prev.get(s.id) ?? 0 })))
            .execute();
      });
    },
    replaceTicketTypes: async (listingId, tickets) => {
      await withTransaction(async () => {
        await db().deleteFrom("ticketTypes").where("listingId", "=", listingId).execute();
        if (tickets.length) await db().insertInto("ticketTypes").values(tickets.map((t, i) => M.ticketToRow(t, i))).execute();
      });
    },
  },

  venues: {
    listLive: async (cityId) => (await db().selectFrom("venues").selectAll().where("cityId", "=", cityId).where("status", "=", "live").orderBy("id").execute()).map(M.venueFromRow),
    listAll: async () => (await db().selectFrom("venues").selectAll().orderBy("id").execute()).map(M.venueFromRow),
    bySlug: async (cityId, slug) => {
      const r = await db().selectFrom("venues").selectAll().where("cityId", "=", cityId).where("slug", "=", slug).executeTakeFirst();
      return r ? M.venueFromRow(r) : null;
    },
    byId: async (id) => {
      const r = await db().selectFrom("venues").selectAll().where("id", "=", id).executeTakeFirst();
      return r ? M.venueFromRow(r) : null;
    },
    resources: async (ids) =>
      ids.length ? (await db().selectFrom("resources").selectAll().where("venueId", "in", ids).orderBy("sort").execute()).map(M.resourceFromRow) : [],
    slotRules: async (ids) => (ids.length ? (await db().selectFrom("slotRules").selectAll().where("resourceId", "in", ids).execute()).map(M.ruleFromRow) : []),
    blocks: async (ids) =>
      ids.length ? (await db().selectFrom("blocks").selectAll().where("resourceId", "in", ids).orderBy("startsAt").execute()).map(M.blockFromRow) : [],
    taken: async (resourceIds, date) => {
      if (!resourceIds.length) return [];
      const now = nowIso();
      // Event times are stored as "YYYY-MM-DDTHH:MM:SS+05:30", so a day is a string range.
      const rows = await db()
        .selectFrom("bookingItems as i")
        .innerJoin("bookings as b", "b.id", "i.bookingId")
        .select(["i.resourceId", "i.startsAt", "i.endsAt", "b.status"])
        .where("i.resourceId", "in", resourceIds)
        .where("i.startsAt", ">=", `${date}T00:00:00`)
        .where("i.startsAt", "<", `${date}T99`)
        .where((eb) => holdsInventory(eb, now))
        .execute();
      const out: TakenRange[] = [];
      for (const r of rows) {
        if (!r.resourceId || !r.startsAt || !r.endsAt) continue;
        const s = fromISO(r.startsAt);
        if (s.ymd !== date) continue;
        out.push({
          resourceId: r.resourceId,
          date,
          startMins: s.mins,
          endMins: fromISO(r.endsAt).mins || 1440,
          kind: r.status === "held" || r.status === "pending_payment" ? "held" : "booked",
        });
      }
      return out;
    },
    listByHost: async (hostId) => (await db().selectFrom("venues").selectAll().where("hostId", "=", hostId).orderBy("id").execute()).map(M.venueFromRow),
    insert: async (v) => {
      await db().insertInto("venues").values(M.venueToRow(v)).execute();
      return v;
    },
    update: async (id, patch) => {
      const row = M.venuePatch(patch);
      delete (row as { id?: string }).id;
      if (Object.keys(row).length) await db().updateTable("venues").set(row).where("id", "=", id).execute();
      return sqlRepository.venues.byId(id);
    },
    replaceResources: async (venueId, resources, rules) => {
      await withTransaction(async () => {
        // Blocks and booking history reference courts by id, so update in place and only delete removed ones.
        const existing = new Set((await db().selectFrom("resources").select("id").where("venueId", "=", venueId).execute()).map((r) => r.id));
        const keep = new Set(resources.map((r) => r.id));
        const removed = [...existing].filter((id) => !keep.has(id));
        if (removed.length) await db().deleteFrom("resources").where("id", "in", removed).execute();
        for (const [i, r] of resources.entries()) {
          const row = M.resourceToRow(r, i);
          if (existing.has(r.id)) {
            const { id: _id, ...rest } = row;
            void _id;
            await db().updateTable("resources").set(rest).where("id", "=", r.id).execute();
          } else await db().insertInto("resources").values(row).execute();
        }
        const ids = resources.map((r) => r.id);
        if (ids.length) await db().deleteFrom("slotRules").where("resourceId", "in", ids).execute();
        if (rules.length) await db().insertInto("slotRules").values(rules.map(M.ruleToRow)).execute();
      });
    },
    insertBlock: async (bl) => {
      await db().insertInto("blocks").values(M.blockToRow(bl)).execute();
      return bl;
    },
    removeBlock: async (id) => {
      await db().deleteFrom("blocks").where("id", "=", id).execute();
    },
  },

  bookings: {
    byId: async (id) => first(await loadBookings((q) => q.where("id", "=", id))),
    listByUser: async (userId) => {
      await sweepHolds();
      return loadBookings((q) => q.where("userId", "=", userId), "createdAt");
    },
    listForTargets: async (listingIds, venueIds) => {
      if (!listingIds.length && !venueIds.length) return [];
      await sweepHolds();
      return loadBookings((q) =>
        q.where((eb: any) => {
          const ors = [];
          if (listingIds.length) ors.push(eb("listingId", "in", listingIds));
          if (venueIds.length) ors.push(eb("venueId", "in", venueIds));
          return eb.or(ors);
        }),
      );
    },
    byCode: async (code) => first(await loadBookings((q) => q.where("code", "=", code.trim().toUpperCase()))),
    listAll: async () => {
      await sweepHolds();
      return loadBookings((q) => q, "createdAt");
    },
    listCreatedSince: async (sinceIso) => {
      await sweepHolds();
      return loadBookings((q) => q.where("createdAt", ">=", sinceIso), "createdAt");
    },
    countStartingOn: async (ymd, statuses) => {
      const r = await db()
        .selectFrom("bookings")
        .select((eb) => eb.fn.countAll<number>().as("n"))
        .where("startsAt", ">=", `${ymd}T00:00:00`)
        .where("startsAt", "<", `${ymd}T99`)
        .where("status", "in", statuses)
        .executeTakeFirst();
      return Number(r?.n ?? 0);
    },
    countByUser: async (exclude) => {
      const rows = await db()
        .selectFrom("bookings")
        .select(["userId", (eb) => eb.fn.countAll<number>().as("n")])
        .where("status", "not in", exclude)
        .groupBy("userId")
        .execute();
      return new Map(rows.map((r) => [r.userId, Number(r.n)]));
    },
    search: async ({ q, statuses, excludeStatuses, cityId, offset, limit }) => {
      await sweepHolds();
      const needle = q?.trim().toLowerCase();
      // "!" as the LIKE escape character behaves the same on every dialect (backslash doesn't).
      const like = needle ? `%${needle.replace(/[!%_]/g, (c) => "!" + c)}%` : null;
      const filter = (qb: any) => {
        let x = qb;
        if (statuses?.length) x = x.where("status", "in", statuses);
        if (excludeStatuses?.length) x = x.where("status", "not in", excludeStatuses);
        if (cityId) x = x.where("cityId", "=", cityId);
        if (like) {
          const m = (col: string) => sql<boolean>`lower(${sql.ref(col)}) like ${like} escape '!'`;
          x = x.where((eb: any) =>
            eb.or([
              m("code"),
              m("title"),
              m("venueName"),
              m("attendee"),
              eb("userId", "in", eb.selectFrom("users").select("id").where((u: any) => u.or([m("name"), m("phone")]))),
            ]),
          );
        }
        return x;
      };
      const totalRow = await filter(db().selectFrom("bookings").select((eb: any) => eb.fn.countAll().as("n"))).executeTakeFirst();
      const items = await loadBookings((qb) => filter(qb).orderBy("createdAt", "desc").orderBy("id").limit(limit).offset(offset));
      return { total: Number(totalRow?.n ?? 0), items };
    },
    countCouponUses: async (userId, couponCode, exceptId) => {
      const now = nowIso();
      let q = db()
        .selectFrom("bookings as b")
        .select((eb) => eb.fn.countAll<number>().as("n"))
        .where("b.userId", "=", userId)
        .where("b.couponCode", "=", couponCode)
        .where((eb) => holdsInventory(eb, now));
      if (exceptId) q = q.where("b.id", "!=", exceptId);
      return Number((await q.executeTakeFirst())?.n ?? 0);
    },
    hasSettledBooking: async (userId, exceptId) => {
      let q = db().selectFrom("bookings").select("id").where("userId", "=", userId).where("status", "in", [...SETTLED, "refunded"]);
      if (exceptId) q = q.where("id", "!=", exceptId);
      return !!(await q.limit(1).executeTakeFirst());
    },
    releaseHolds: async (userId, targetId) => {
      await db()
        .updateTable("bookings")
        .set({ status: "expired" })
        .where("userId", "=", userId)
        .where("status", "in", [...HOLDING])
        .where((eb) => eb.or([eb("listingId", "=", targetId), eb("venueId", "=", targetId)]))
        .execute();
    },
    countLiveHolds: async (userId) => {
      const r = await db()
        .selectFrom("bookings")
        .select((eb) => eb.fn.countAll<number>().as("n"))
        .where("userId", "=", userId)
        .where("status", "in", [...HOLDING])
        .where("holdExpiresAt", ">", nowIso())
        .executeTakeFirst();
      return Number(r?.n ?? 0);
    },
    activeQuantities: async (listingIds) => {
      const byTicket = new Map<string, number>();
      const bySession = new Map<string, number>();
      if (!listingIds.length) return { byTicket, bySession };
      const now = nowIso();
      const rows = await db()
        .selectFrom("bookingItems as i")
        .innerJoin("bookings as b", "b.id", "i.bookingId")
        .select(["i.ticketTypeId", "i.sessionId", (eb) => eb.fn.sum<number>("i.qty").as("qty")])
        .where("b.listingId", "in", listingIds)
        .where((eb) => holdsInventory(eb, now))
        .groupBy(["i.ticketTypeId", "i.sessionId"])
        .execute();
      for (const r of rows) {
        const q = Number(r.qty);
        if (r.ticketTypeId) byTicket.set(r.ticketTypeId, (byTicket.get(r.ticketTypeId) ?? 0) + q);
        if (r.sessionId) bySession.set(r.sessionId, (bySession.get(r.sessionId) ?? 0) + q);
      }
      return { byTicket, bySession };
    },
    insert: async (bk) => {
      await withTransaction(async () => {
        await db().insertInto("bookings").values(M.bookingToRow(bk)).execute();
        if (bk.items.length) await db().insertInto("bookingItems").values(bk.items.map((it, i) => M.itemToRow(bk.id, it, i))).execute();
      });
      return bk;
    },
    update: async (id, patch) => {
      await withTransaction(async () => {
        const row = M.bookingPatch(patch);
        delete (row as { id?: string }).id;
        if (Object.keys(row).length) await db().updateTable("bookings").set(row).where("id", "=", id).execute();
        if (patch.items) {
          await db().deleteFrom("bookingItems").where("bookingId", "=", id).execute();
          if (patch.items.length) await db().insertInto("bookingItems").values(patch.items.map((it, i) => M.itemToRow(id, it, i))).execute();
        }
      });
      return sqlRepository.bookings.byId(id);
    },
  },

  users: {
    list: () => loadUsers((q) => q.orderBy("createdAt", "desc")),
    count: async () => Number((await db().selectFrom("users").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirst())?.n ?? 0),
    byId: async (id) => first(await loadUsers((q) => q.where("id", "=", id))),
    byPhone: async (phone) => first(await loadUsers((q) => q.where("phone", "=", phone))),
    insert: async (u) => {
      await withTransaction(async () => {
        await db().insertInto("users").values(M.userToRow(u)).execute();
        await replaceSaved(u.id, u.saved ?? [], u.createdAt);
        await replaceFollowing(u.id, u.following ?? [], u.createdAt);
      });
      return u;
    },
    update: async (id, patch) => {
      await withTransaction(async () => {
        const row = M.userPatch(patch);
        delete (row as { id?: string }).id;
        if (Object.keys(row).length) await db().updateTable("users").set(row).where("id", "=", id).execute();
        if (patch.saved) await replaceSaved(id, patch.saved, nowIso());
        if (patch.following) await replaceFollowing(id, patch.following, nowIso());
      });
      return sqlRepository.users.byId(id);
    },
  },

  otps: {
    get: async (phone) => {
      const r = await db().selectFrom("otpCodes").selectAll().where("phone", "=", phone).executeTakeFirst();
      return r ? { codeHash: r.codeHash, expiresAt: r.expiresAt, attempts: Number(r.attempts), sentAt: r.sentAt } : null;
    },
    put: async (phone, rec) => {
      await withTransaction(async () => {
        await db().deleteFrom("otpCodes").where("phone", "=", phone).execute();
        await db().insertInto("otpCodes").values({ phone, ...rec }).execute();
      });
    },
    reserveAttempt: async (phone, max) => {
      const r = await db()
        .updateTable("otpCodes")
        .set((eb) => ({ attempts: eb("attempts", "+", 1) }))
        .where("phone", "=", phone)
        .where("attempts", "<", max)
        .executeTakeFirst();
      return Number(r.numUpdatedRows) > 0;
    },
    remove: async (phone) => {
      await db().deleteFrom("otpCodes").where("phone", "=", phone).execute();
    },
  },

  authSessions: {
    create: async (s) => {
      await db().insertInto("authSessions").values(s).execute();
    },
    get: async (id, now) => {
      const r = await db().selectFrom("authSessions").select(["userId", "expiresAt"]).where("id", "=", id).where("expiresAt", ">", now).executeTakeFirst();
      return r ?? null;
    },
    touch: async (id, expiresAt) => {
      await db().updateTable("authSessions").set({ expiresAt }).where("id", "=", id).execute();
    },
    remove: async (id) => {
      await db().deleteFrom("authSessions").where("id", "=", id).execute();
    },
    removeForUser: async (userId) => {
      await db().deleteFrom("authSessions").where("userId", "=", userId).execute();
    },
  },

  rateLimits: {
    hit: (key, windowMs, now) =>
      withTransaction(async () => {
        const iso = now.toISOString();
        const r = await db().selectFrom("rateLimits").selectAll().where("key", "=", key).executeTakeFirst();
        if (!r || r.resetAt <= iso) {
          const resetAt = new Date(now.getTime() + windowMs).toISOString();
          if (r) await db().updateTable("rateLimits").set({ count: 1, resetAt }).where("key", "=", key).execute();
          else await db().insertInto("rateLimits").values({ key, count: 1, resetAt }).execute();
          return { count: 1, resetAt };
        }
        await db().updateTable("rateLimits").set((eb) => ({ count: eb("count", "+", 1) })).where("key", "=", key).execute();
        return { count: Number(r.count) + 1, resetAt: r.resetAt };
      }),
  },

  payments: {
    insert: async (p) => {
      await db().insertInto("payments").values({ ...p, orderId: p.orderId ?? null, amount: M.toPaise(p.amount) }).execute();
    },
    byOrderId: async (orderId) => {
      const p = await db().selectFrom("payments").selectAll().where("orderId", "=", orderId).orderBy("createdAt").executeTakeFirst();
      return p ? { ...p, status: p.status as PaymentRecordStatus, amount: M.fromPaise(p.amount), orderId: p.orderId } : null;
    },
    update: async (id, patch) => {
      await db().updateTable("payments").set(patch).where("id", "=", id).execute();
    },
    listByBooking: async (bookingId) =>
      (await db().selectFrom("payments").selectAll().where("bookingId", "=", bookingId).orderBy("createdAt").execute()).map(({ orderId, ...p }) => ({
        ...p,
        ...(orderId ? { orderId } : {}),
        status: p.status as PaymentRecordStatus,
        amount: M.fromPaise(p.amount),
      })),
  },

  views: {
    record: async (targetId, day) => {
      // Portable upsert: update, and insert when there was nothing to update.
      const res = await db().updateTable("listingViews").set((eb) => ({ count: eb("count", "+", 1) })).where("targetId", "=", targetId).where("day", "=", day).executeTakeFirst();
      if (Number(res.numUpdatedRows) > 0) return;
      try {
        await db().insertInto("listingViews").values({ targetId, day, count: 1 }).execute();
      } catch {
        // Lost a race with a concurrent first view of the day; count it on the row that won.
        await db().updateTable("listingViews").set((eb) => ({ count: eb("count", "+", 1) })).where("targetId", "=", targetId).where("day", "=", day).execute();
      }
    },
    totals: async (targetIds, fromDay, toDay) => {
      if (!targetIds.length) return 0;
      const r = await db()
        .selectFrom("listingViews")
        .select((eb) => eb.fn.sum<number>("count").as("n"))
        .where("targetId", "in", targetIds)
        .where("day", ">=", fromDay)
        .where("day", "<=", toDay)
        .executeTakeFirst();
      return Number(r?.n ?? 0);
    },
  },

  revisions: {
    pendingFor: async (targetId) => {
      const r = await db().selectFrom("listingRevisions").selectAll().where("targetId", "=", targetId).where("status", "=", "pending").executeTakeFirst();
      return r ? revisionFromRow(r) : null;
    },
    listPending: async () =>
      (await db().selectFrom("listingRevisions").selectAll().where("status", "=", "pending").orderBy("createdAt", "desc").execute()).map(revisionFromRow),
    submit: async (r) => {
      await withTransaction(async () => {
        await db().deleteFrom("listingRevisions").where("targetId", "=", r.targetId).where("status", "=", "pending").execute();
        await db()
          .insertInto("listingRevisions")
          .values({ ...r, input: JSON.stringify(r.input) })
          .execute();
      });
    },
    lastDecided: async (targetId) => {
      const r = await db()
        .selectFrom("listingRevisions")
        .selectAll()
        .where("targetId", "=", targetId)
        .where("status", "!=", "pending")
        .orderBy("decidedAt", "desc")
        .limit(1)
        .executeTakeFirst();
      return r ? revisionFromRow(r) : null;
    },
    decide: async (id, status, note, at) => {
      await db().updateTable("listingRevisions").set({ status, note, decidedAt: at }).where("id", "=", id).execute();
    },
  },

  media: {
    insert: async (m) => {
      await db()
        .insertInto("media")
        .values({ id: m.id, ownerId: m.ownerId, contentType: m.contentType, private: m.private ? 1 : 0, bytes: m.data.length, data: m.data.toString("base64"), createdAt: m.createdAt })
        .execute();
    },
    get: async (id) => {
      const r = await db().selectFrom("media").select(["contentType", "data", "private", "ownerId"]).where("id", "=", id).executeTakeFirst();
      return r ? { contentType: r.contentType, data: Buffer.from(r.data, "base64"), private: Number(r.private) === 1, ownerId: r.ownerId } : null;
    },
    exists: async (id) => !!(await db().selectFrom("media").select("id").where("id", "=", id).where("private", "=", 0).executeTakeFirst()),
  },

  coupons: {
    byCode: async (code) => {
      const r = await db().selectFrom("coupons").selectAll().where("code", "=", code.trim().toUpperCase()).where("active", "=", 1).executeTakeFirst();
      return r ? M.couponFromRow(r) : null;
    },
  },
};

function revisionFromRow(r: import("@/db/tables").ListingRevisionsTable): import("../types").ListingRevision {
  return { ...r, kind: r.kind as "event" | "venue", status: r.status as "pending" | "approved" | "rejected", input: JSON.parse(r.input) };
}

function allAreas() {
  return cached("areas", async () => (await db().selectFrom("areas").selectAll().orderBy("name").execute()).map(M.areaFromRow));
}

/** Diff-update a user's saved items / followed hosts so existing rows keep their timestamps (and order). */
async function syncLinks(table: "userSaved" | "userFollowing", col: "itemId" | "hostId", userId: string, wanted: string[], at: string) {
  const rows: { v: string; createdAt: string }[] = await (db() as any).selectFrom(table).select([`${col} as v`, "createdAt"]).where("userId", "=", userId).execute();
  const have = new Set(rows.map((r) => r.v));
  const want = new Set(wanted);
  const drop = [...have].filter((x) => !want.has(x));
  const add = [...want].filter((x) => !have.has(x));
  if (drop.length) await (db() as any).deleteFrom(table).where("userId", "=", userId).where(col, "in", drop).execute();
  // Links are read back ordered by createdAt, so each new one gets its own timestamp after every
  // existing link; equal timestamps would come back in primary-key (alphabetical) order instead.
  const base = Math.max(Date.parse(at) || Date.now(), ...rows.map((r) => (Date.parse(r.createdAt) || 0) + 1));
  if (add.length) await (db() as any).insertInto(table).values(add.map((v, i) => ({ userId, [col]: v, createdAt: new Date(base + i).toISOString() }))).execute();
}
const replaceSaved = (userId: string, items: string[], at: string) => syncLinks("userSaved", "itemId", userId, items, at);
const replaceFollowing = (userId: string, hosts: string[], at: string) => syncLinks("userFollowing", "hostId", userId, hosts, at);
