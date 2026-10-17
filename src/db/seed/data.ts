import type {
  Area, Block, Booking, Category, City, Host, HostMember, JourneyTemplate, Listing, Resource, Session, SlotRule, TicketType, User, Venue,
} from "@/contracts";
import type { Coupon } from "@/lib/pricing";
import { daysBetween, todayIST } from "@/lib/time";
import { hostSlugFrom } from "@/lib/slug";

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
import nagpur from "./real/nagpur.json";

/** Real listings crawled from District, BookMyShow and KheloMore (scripts/crawl). */
export interface ImportedData {
  areas: Area[];
  categories: Category[];
  templates: JourneyTemplate[];
  hosts: Host[];
  listings: Listing[];
  sessions: Session[];
  ticketTypes: TicketType[];
  venues: Venue[];
  resources: Resource[];
  slotRules: SlotRule[];
}

/** Cities whose generated demo listings, venues and hosts are replaced by imported, real ones. */
const IMPORTED_CITIES = new Set(["c_nagpur"]);

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

/** Fixtures re-anchored to `now` (the generator writes them relative to an anchor day), minus demo content for imported cities. */
export function loadSeedData(now = new Date()): SeedData {
  const shift = daysBetween(meta.anchor, todayIST(now));
  const c = <T,>(v: unknown): T => shiftDates(structuredClone(v), shift) as T;

  const demoListings = c<Listing[]>(listings).filter((l) => !IMPORTED_CITIES.has(l.cityId));
  const demoVenues = c<Venue[]>(venues).filter((v) => !IMPORTED_CITIES.has(v.cityId));
  const listingIds = new Set(demoListings.map((l) => l.id));
  const venueIds = new Set(demoVenues.map((v) => v.id));
  const demoResources = c<Resource[]>(resources).filter((r) => venueIds.has(r.venueId));
  const resourceIds = new Set(demoResources.map((r) => r.id));
  // Approved demo hosts there go too; pending applications stay so the admin queue has something in it.
  const demoHosts = withSlugs(c<Host[]>(hosts).filter((h) => !IMPORTED_CITIES.has(h.cityId) || h.status !== "approved"));
  const hostIds = new Set(demoHosts.map((h) => h.id));

  return {
    cities: c(cities),
    areas: c(areas),
    categories: c(categories),
    templates: c(templates),
    hosts: demoHosts,
    hostMembers: c<HostMember[]>(hostMembers).filter((m) => hostIds.has(m.hostId)),
    listings: demoListings,
    sessions: c<Session[]>(sessions).filter((s) => listingIds.has(s.listingId)),
    ticketTypes: c<TicketType[]>(ticketTypes).filter((t) => listingIds.has(t.listingId)),
    venues: demoVenues,
    resources: demoResources,
    slotRules: c<SlotRule[]>(slotRules).filter((r) => resourceIds.has(r.resourceId)),
    blocks: c<Block[]>(blocks).filter((b) => resourceIds.has(b.resourceId)),
    users: c(users),
    bookings: c<Booking[]>(bookings).filter((b) => (!b.listingId || listingIds.has(b.listingId)) && (!b.venueId || venueIds.has(b.venueId))),
    coupons: c(coupons),
  };
}

/** Imported listings keep their real, absolute dates (never re-anchored). */
export function loadImportedData(): ImportedData {
  const im = structuredClone(nagpur) as unknown as ImportedData;
  // Imported hosts are numbered after the generated demo hosts so the two sets never collide.
  im.hosts = withSlugs(im.hosts, new Set(loadSeedData().hosts.map((h) => h.slug)));
  return im;
}

/** Public handles for fixture hosts that predate the slug column (generated from the brand name, de-duplicated). */
function withSlugs(hosts: Host[], used = new Set<string>()): Host[] {
  return hosts.map((h) => {
    const base = h.slug || hostSlugFrom(h.brandName);
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base.slice(0, 40 - String(i).length - 1)}-${i}`;
    used.add(slug);
    return { ...h, slug };
  });
}
