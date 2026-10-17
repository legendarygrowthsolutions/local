/** View models returned by the API. Phase 2 must keep these shapes. */
import type { Area, Category, City, Host } from "./catalog";
import type { JourneyTemplate } from "./journey";
import type { Block, Listing, Resource, Session, SlotRule, TicketType, Venue } from "./listing";

export type CardKind = "event" | "venue";

export interface ListingCard {
  kind: CardKind;
  id: string;
  slug: string;
  href: string;
  title: string;
  categorySlug: string;
  categoryLabel: string;
  subcategoryLabel: string | null;
  areaName: string;
  venueName: string;
  /** Short date/time label, e.g. "Sat, 18 Oct · 8 PM" or "Open · 6 AM – 11 PM" */
  whenLabel: string;
  startsAt: string | null;
  priceFrom: number | null; // null = free
  priceLabel: string;
  media: string[];
  tone: number; // fallback art tone index 0..3
  icon: string;
  urgency: string | null; // "Few left", "Selling fast"
  ctaLabel: string;
  /** Poster date chip: { top: "SAT", bottom: "18" } or { top: "17–26", bottom: "OCT" }. Null for venues. */
  badge: { top: string; bottom: string } | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface HomeRail {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  layout: "carousel" | "grid";
  items: ListingCard[];
}

export interface HomePayload {
  city: City;
  categories: Category[];
  featured: ListingCard[];
  /** Chips over the first home rail (wireframes 05/18); each carries its own items and "See all" link. */
  quickFilters: { id: string; label: string; href: string; items: ListingCard[] }[];
  rails: HomeRail[];
}

export interface ListingDetail {
  listing: Listing;
  card: ListingCard;
  host: Host;
  category: Category;
  subcategory: Category | null;
  area: Area;
  city: City;
  template: JourneyTemplate;
  sessions: (Session & { remaining: number })[];
  ticketTypes: (TicketType & { remaining: number })[];
  similar: ListingCard[];
}

export interface VenueDetail {
  venue: Venue;
  card: ListingCard;
  host: Host;
  area: Area;
  city: City;
  template: JourneyTemplate;
  resources: Resource[];
  sports: Category[];
  /** Per-sport picker cards (wireframe 10) */
  sportSummaries: { slug: string; name: string; courts: number; priceFrom: number }[];
  priceFrom: number;
  similar: ListingCard[];
}

/** A host's public page (/h/<slug>): everything they have on sale, across cities. */
export interface HostProfile {
  host: Host;
  /** Cities the host currently has something live in (home city first). */
  cities: City[];
  /** Upcoming events, soonest first. */
  events: ListingCard[];
  /** Bookable courts and venues. */
  venues: ListingCard[];
  followers: number;
}

export type SlotStatus = "available" | "booked" | "held" | "blocked" | "past";

export interface Slot {
  startMins: number;
  endMins: number;
  startsAt: string;
  price: number;
  peak: boolean;
  status: SlotStatus;
}

export interface ResourceAvailability {
  resource: Resource;
  rule: SlotRule;
  slots: Slot[];
}

export interface AvailabilityPayload {
  venueId: string;
  date: string;
  sport: string;
  dates: { date: string; label: string; weekday: string; day: string }[];
  resources: ResourceAvailability[];
}

export type { Block };
