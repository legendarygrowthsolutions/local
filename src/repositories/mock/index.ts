import "server-only";
import type { Booking } from "@/contracts";
import { db } from "@/mocks/store";
import { seededTaken } from "@/mocks/occupancy";
import { fromISO } from "@/lib/time";
import type { TakenRange } from "@/lib/slots/engine";
import type { Repository } from "../types";

const ACTIVE: Booking["status"][] = ["held", "pending_payment", "requested", "confirmed", "checked_in"];

/** Lazily expire holds whose timer ran out. */
function sweepHolds() {
  const now = Date.now();
  for (const b of db().bookings) {
    if ((b.status === "held" || b.status === "pending_payment") && b.holdExpiresAt && new Date(b.holdExpiresAt).getTime() < now) {
      b.status = "expired";
    }
  }
}

const inSet = <T extends string>(ids: T[]) => {
  const s = new Set(ids);
  return (id: string | null | undefined) => !!id && s.has(id as T);
};

export const mockRepository: Repository = {
  cities: {
    list: async () => db().cities.filter((c) => c.active),
    listAll: async () => db().cities,
    insert: async (c) => {
      db().cities.push(c);
      return c;
    },
    update: async (id, patch) => {
      const x = db().cities.find((y) => y.id === id);
      if (!x) return null;
      Object.assign(x, patch);
      return x;
    },
    bySlug: async (slug) => db().cities.find((c) => c.slug === slug) ?? null,
    byId: async (id) => db().cities.find((c) => c.id === id) ?? null,
  },
  areas: {
    listByCity: async (cityId) => db().areas.filter((a) => a.cityId === cityId),
    byId: async (id) => db().areas.find((a) => a.id === id) ?? null,
    insert: async (a) => {
      db().areas.push(a);
      return a;
    },
    update: async (id, patch) => {
      const x = db().areas.find((y) => y.id === id);
      if (!x) return null;
      Object.assign(x, patch);
      return x;
    },
    remove: async (id) => {
      db().areas = db().areas.filter((a) => a.id !== id);
    },
  },
  categories: {
    list: async () => [...db().categories].sort((a, b) => a.sort - b.sort),
    insert: async (c) => {
      db().categories.push(c);
      return c;
    },
    update: async (id, patch) => {
      const x = db().categories.find((y) => y.id === id);
      if (!x) return null;
      Object.assign(x, patch);
      return x;
    },
    remove: async (id) => {
      db().categories = db().categories.filter((c) => c.id !== id);
    },
  },
  templates: {
    list: async () => db().templates,
    byId: async (id) => db().templates.find((t) => t.id === id) ?? null,
    insert: async (t) => {
      db().templates.push(t);
      return t;
    },
    update: async (id, patch) => {
      const x = db().templates.find((y) => y.id === id);
      if (!x) return null;
      Object.assign(x, patch);
      return x;
    },
  },
  hosts: {
    byId: async (id) => db().hosts.find((h) => h.id === id) ?? null,
    list: async () => db().hosts,
    insert: async (h) => {
      db().hosts.push(h);
      return h;
    },
    update: async (id, patch) => {
      const h = db().hosts.find((x) => x.id === id);
      if (!h) return null;
      Object.assign(h, patch);
      return h;
    },
  },
  members: {
    listByUser: async (userId) => db().hostMembers.filter((m) => m.userId === userId && m.status === "active"),
    listByHost: async (hostId) => db().hostMembers.filter((m) => m.hostId === hostId),
    invitesForPhone: async (phone) => db().hostMembers.filter((m) => m.phone === phone && m.status === "invited"),
    insert: async (m) => {
      db().hostMembers.push(m);
      return m;
    },
    update: async (id, patch) => {
      const m = db().hostMembers.find((x) => x.id === id);
      if (!m) return null;
      Object.assign(m, patch);
      return m;
    },
    remove: async (id) => {
      db().hostMembers = db().hostMembers.filter((m) => m.id !== id);
    },
  },
  listings: {
    listLive: async (cityId) => db().listings.filter((l) => l.cityId === cityId && l.status === "live"),
    listAll: async () => db().listings,
    bySlug: async (cityId, slug) => db().listings.find((l) => l.cityId === cityId && l.slug === slug) ?? null,
    byId: async (id) => db().listings.find((l) => l.id === id) ?? null,
    sessions: async (ids) => {
      const has = inSet(ids);
      return db().sessions.filter((s) => has(s.listingId));
    },
    ticketTypes: async (ids) => {
      const has = inSet(ids);
      return db().ticketTypes.filter((t) => has(t.listingId));
    },
    listByHost: async (hostId) => db().listings.filter((l) => l.hostId === hostId),
    insert: async (l) => {
      db().listings.push(l);
      return l;
    },
    update: async (id, patch) => {
      const l = db().listings.find((x) => x.id === id);
      if (!l) return null;
      Object.assign(l, patch);
      return l;
    },
    replaceSessions: async (listingId, sessions) => {
      db().sessions = [...db().sessions.filter((s) => s.listingId !== listingId), ...sessions];
    },
    replaceTicketTypes: async (listingId, tickets) => {
      db().ticketTypes = [...db().ticketTypes.filter((t) => t.listingId !== listingId), ...tickets];
    },
  },
  venues: {
    listLive: async (cityId) => db().venues.filter((v) => v.cityId === cityId && v.status === "live"),
    listAll: async () => db().venues,
    bySlug: async (cityId, slug) => db().venues.find((v) => v.cityId === cityId && v.slug === slug) ?? null,
    byId: async (id) => db().venues.find((v) => v.id === id) ?? null,
    resources: async (ids) => {
      const has = inSet(ids);
      return db().resources.filter((r) => has(r.venueId));
    },
    slotRules: async (ids) => {
      const has = inSet(ids);
      return db().slotRules.filter((r) => has(r.resourceId));
    },
    blocks: async (ids) => {
      const has = inSet(ids);
      return db().blocks.filter((b) => has(b.resourceId));
    },
    taken: async (resourceIds, date) => {
      sweepHolds();
      const has = inSet(resourceIds);
      const out: TakenRange[] = [];
      for (const b of db().bookings) {
        if (!ACTIVE.includes(b.status) || b.seeded) continue;
        for (const it of b.items) {
          if (!has(it.resourceId) || !it.startsAt || !it.endsAt) continue;
          const s = fromISO(it.startsAt);
          if (s.ymd !== date) continue;
          out.push({
            resourceId: it.resourceId!,
            date,
            startMins: s.mins,
            endMins: fromISO(it.endsAt).mins || 1440,
            kind: b.status === "held" || b.status === "pending_payment" ? "held" : "booked",
          });
        }
      }
      const rules = db().slotRules;
      for (const rid of resourceIds) {
        const rule = rules.find((r) => r.resourceId === rid);
        if (rule) out.push(...seededTaken(rid, date, rule.openMins, rule.closeMins));
      }
      return out;
    },
    listByHost: async (hostId) => db().venues.filter((v) => v.hostId === hostId),
    insert: async (v) => {
      db().venues.push(v);
      return v;
    },
    update: async (id, patch) => {
      const v = db().venues.find((x) => x.id === id);
      if (!v) return null;
      Object.assign(v, patch);
      return v;
    },
    replaceResources: async (venueId, resources, rules) => {
      const old = new Set(db().resources.filter((r) => r.venueId === venueId).map((r) => r.id));
      db().resources = [...db().resources.filter((r) => r.venueId !== venueId), ...resources];
      db().slotRules = [...db().slotRules.filter((r) => !old.has(r.resourceId)), ...rules];
    },
    insertBlock: async (b) => {
      db().blocks.push(b);
      return b;
    },
    removeBlock: async (id) => {
      db().blocks = db().blocks.filter((b) => b.id !== id);
    },
  },
  bookings: {
    byId: async (id) => {
      sweepHolds();
      return db().bookings.find((b) => b.id === id) ?? null;
    },
    listByUser: async (userId) => {
      sweepHolds();
      return db().bookings.filter((b) => b.userId === userId);
    },
    listForTargets: async (listingIds, venueIds) => {
      sweepHolds();
      const l = inSet(listingIds);
      const v = inSet(venueIds);
      return db().bookings.filter((b) => l(b.listingId) || v(b.venueId));
    },
    listAll: async () => {
      sweepHolds();
      return db().bookings;
    },
    byCode: async (code) => db().bookings.find((b) => b.code.toUpperCase() === code.toUpperCase()) ?? null,
    activeQuantities: async (listingIds) => {
      sweepHolds();
      const has = inSet(listingIds);
      const byTicket = new Map<string, number>();
      const bySession = new Map<string, number>();
      for (const b of db().bookings) {
        if (!has(b.listingId) || !ACTIVE.includes(b.status) || b.seeded) continue;
        for (const it of b.items) {
          if (it.ticketTypeId) byTicket.set(it.ticketTypeId, (byTicket.get(it.ticketTypeId) ?? 0) + it.qty);
          if (it.sessionId) bySession.set(it.sessionId, (bySession.get(it.sessionId) ?? 0) + it.qty);
        }
      }
      return { byTicket, bySession };
    },
    insert: async (b) => {
      db().bookings.push(b);
      return b;
    },
    update: async (id, patch) => {
      const b = db().bookings.find((x) => x.id === id);
      if (!b) return null;
      Object.assign(b, patch);
      return b;
    },
  },
  users: {
    list: async () => db().users,
    byId: async (id) => db().users.find((u) => u.id === id) ?? null,
    byPhone: async (phone) => db().users.find((u) => u.phone === phone) ?? null,
    insert: async (u) => {
      db().users.push(u);
      return u;
    },
    update: async (id, patch) => {
      const u = db().users.find((x) => x.id === id);
      if (!u) return null;
      Object.assign(u, patch);
      return u;
    },
  },
  otps: {
    put: async (phone, code, ttlMs) => {
      db().otps.set(phone, { code, expiresAt: Date.now() + ttlMs });
    },
    take: async (phone) => {
      const v = db().otps.get(phone) ?? null;
      db().otps.delete(phone);
      return v;
    },
  },
  coupons: {
    byCode: async (code) => db().coupons.find((c) => c.code.toUpperCase() === code.toUpperCase()) ?? null,
  },
};
