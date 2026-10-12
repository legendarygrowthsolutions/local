import "server-only";
import type {
  Area, Block, Booking, Category, City, Host, HostMember, JourneyTemplate, Listing, Resource, Session, SlotRule, TicketType, User, Venue,
} from "@/contracts";
import type { Coupon } from "@/lib/pricing";
import { daysBetween, todayIST } from "@/lib/time";

import meta from "./fixtures/meta.json";
import cities from "./fixtures/cities.json";
import areas from "./fixtures/areas.json";
import categories from "./fixtures/categories.json";
import templates from "./fixtures/templates.json";
import hosts from "./fixtures/hosts.json";
import hostMembers from "./fixtures/hostMembers.json";
import { seedHostBookings } from "./seed-host-bookings";
import listings from "./fixtures/listings.json";
import sessions from "./fixtures/sessions.json";
import ticketTypes from "./fixtures/ticketTypes.json";
import venues from "./fixtures/venues.json";
import resources from "./fixtures/resources.json";
import slotRules from "./fixtures/slotRules.json";
import blocks from "./fixtures/blocks.json";
import users from "./fixtures/users.json";
import bookings from "./fixtures/bookings.json";
import coupons from "./fixtures/coupons.json";

export interface MockDb {
  cities: City[];
  areas: Area[];
  categories: Category[];
  templates: JourneyTemplate[];
  hosts: Host[];
  hostMembers: HostMember[];
  listings: Listing[];
  sessions: Session[];
  ticketTypes: TicketType[];
  venues: Venue[];
  resources: Resource[];
  slotRules: SlotRule[];
  blocks: Block[];
  users: User[];
  bookings: Booking[];
  coupons: Coupon[];
  otps: Map<string, { code: string; expiresAt: number }>;
}

const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})\+05:30$/;

/** Shift every "...At" ISO timestamp by whole days so fixtures always sit around today. */
function shiftDates<T>(value: T, days: number): T {
  if (days === 0) return value;
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, days)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && k.endsWith("At")) {
        const m = ISO_RE.exec(v);
        if (m) {
          const d = new Date(m[1] + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + days);
          out[k] = `${d.toISOString().slice(0, 10)}T${m[2]}+05:30`;
          continue;
        }
      }
      out[k] = shiftDates(v, days);
    }
    return out as T;
  }
  return value;
}

function seed(): MockDb {
  const shift = daysBetween(meta.anchor, todayIST());
  const clone = <T,>(v: T): T => shiftDates(structuredClone(v), shift);
  const store: MockDb = {
    cities: clone(cities) as City[],
    areas: clone(areas) as Area[],
    categories: clone(categories) as Category[],
    templates: clone(templates) as JourneyTemplate[],
    hosts: clone(hosts) as Host[],
    hostMembers: clone(hostMembers) as HostMember[],
    listings: clone(listings) as Listing[],
    sessions: clone(sessions) as Session[],
    ticketTypes: clone(ticketTypes) as TicketType[],
    venues: clone(venues) as Venue[],
    resources: clone(resources) as Resource[],
    slotRules: clone(slotRules) as SlotRule[],
    blocks: clone(blocks) as Block[],
    users: clone(users) as User[],
    bookings: clone(bookings) as Booking[],
    coupons: clone(coupons) as Coupon[],
    otps: new Map(),
  };
  store.bookings.push(...seedHostBookings(store));
  return store;
}

/** Bump when the store's shape changes so a running dev server re-seeds. */
const STORE_VERSION = 3;

const g = globalThis as unknown as { __localMockDb?: MockDb; __localMockKey?: string };

/**
 * In-memory store, seeded once per server process (re-seeded when the IST day changes, so
 * relative dates stay correct, or when fixtures are regenerated). Mutations — bookings, profile edits, approvals — live
 * until the dev server restarts.
 */
export function db(): MockDb {
  const key = `${STORE_VERSION}|${todayIST()}|${meta.generatedAt}`;
  if (!g.__localMockDb || g.__localMockKey !== key) {
    g.__localMockDb = seed();
    g.__localMockKey = key;
  }
  return g.__localMockDb;
}
