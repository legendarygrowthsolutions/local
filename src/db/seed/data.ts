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

export interface SeedData {
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
  coupons: (Coupon & { id: string })[];
}

const ISO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})\+05:30$/;

/** Shift every "...At" ISO timestamp by whole days so seeded events sit around the seed date. */
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

/** Fixtures re-anchored to `now` (the generator writes them relative to an anchor day). */
export function loadSeedData(now = new Date()): SeedData {
  const shift = daysBetween(meta.anchor, todayIST(now));
  const c = <T,>(v: unknown): T => shiftDates(structuredClone(v), shift) as T;
  return {
    cities: c(cities),
    areas: c(areas),
    categories: c(categories),
    templates: c(templates),
    hosts: c(hosts),
    hostMembers: c(hostMembers),
    listings: c(listings),
    sessions: c(sessions),
    ticketTypes: c(ticketTypes),
    venues: c(venues),
    resources: c(resources),
    slotRules: c(slotRules),
    blocks: c(blocks),
    users: c(users),
    bookings: c(bookings),
    coupons: c(coupons),
  };
}
