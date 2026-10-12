import type {
  Area, Block, Booking, Category, City, Host, HostMember, JourneyTemplate, Listing, Resource, Session, SlotRule, TicketType, User, Venue,
} from "@/contracts";
import type { Coupon } from "@/lib/pricing";
import type { TakenRange } from "@/lib/slots/engine";

/**
 * Data access boundary. Phase 1: `mock/` (fixtures + in-memory store).
 * Phase 2: `db/` (Drizzle + Turso) implements the same interface; services and UI don't change.
 */
export interface Repository {
  cities: {
    /** Active cities only (public). */
    list(): Promise<City[]>;
    listAll(): Promise<City[]>;
    insert(c: City): Promise<City>;
    update(id: string, patch: Partial<City>): Promise<City | null>;
    bySlug(slug: string): Promise<City | null>;
    byId(id: string): Promise<City | null>;
  };
  areas: {
    listByCity(cityId: string): Promise<Area[]>;
    byId(id: string): Promise<Area | null>;
    insert(a: Area): Promise<Area>;
    update(id: string, patch: Partial<Area>): Promise<Area | null>;
    remove(id: string): Promise<void>;
  };
  categories: {
    list(): Promise<Category[]>;
    insert(c: Category): Promise<Category>;
    update(id: string, patch: Partial<Category>): Promise<Category | null>;
    remove(id: string): Promise<void>;
  };
  templates: {
    list(): Promise<JourneyTemplate[]>;
    byId(id: string): Promise<JourneyTemplate | null>;
    insert(t: JourneyTemplate): Promise<JourneyTemplate>;
    update(id: string, patch: Partial<JourneyTemplate>): Promise<JourneyTemplate | null>;
  };
  hosts: {
    byId(id: string): Promise<Host | null>;
    list(): Promise<Host[]>;
    insert(h: Host): Promise<Host>;
    update(id: string, patch: Partial<Host>): Promise<Host | null>;
  };
  members: {
    listByUser(userId: string): Promise<HostMember[]>;
    listByHost(hostId: string): Promise<HostMember[]>;
    /** Pending invites for a phone number (activated on login). */
    invitesForPhone(phone: string): Promise<HostMember[]>;
    insert(m: HostMember): Promise<HostMember>;
    update(id: string, patch: Partial<HostMember>): Promise<HostMember | null>;
    remove(id: string): Promise<void>;
  };
  listings: {
    listLive(cityId: string): Promise<Listing[]>;
    listAll(): Promise<Listing[]>;
    bySlug(cityId: string, slug: string): Promise<Listing | null>;
    byId(id: string): Promise<Listing | null>;
    sessions(listingIds: string[]): Promise<Session[]>;
    ticketTypes(listingIds: string[]): Promise<TicketType[]>;
    listByHost(hostId: string): Promise<Listing[]>;
    insert(l: Listing): Promise<Listing>;
    update(id: string, patch: Partial<Listing>): Promise<Listing | null>;
    replaceSessions(listingId: string, sessions: Session[]): Promise<void>;
    replaceTicketTypes(listingId: string, tickets: TicketType[]): Promise<void>;
  };
  venues: {
    listLive(cityId: string): Promise<Venue[]>;
    listAll(): Promise<Venue[]>;
    bySlug(cityId: string, slug: string): Promise<Venue | null>;
    byId(id: string): Promise<Venue | null>;
    resources(venueIds: string[]): Promise<Resource[]>;
    slotRules(resourceIds: string[]): Promise<SlotRule[]>;
    blocks(resourceIds: string[]): Promise<Block[]>;
    /** Booked + held ranges for these resources on a date (includes other users). */
    taken(resourceIds: string[], date: string): Promise<TakenRange[]>;
    listByHost(hostId: string): Promise<Venue[]>;
    insert(v: Venue): Promise<Venue>;
    update(id: string, patch: Partial<Venue>): Promise<Venue | null>;
    replaceResources(venueId: string, resources: Resource[], rules: SlotRule[]): Promise<void>;
    insertBlock(b: Block): Promise<Block>;
    removeBlock(id: string): Promise<void>;
  };
  bookings: {
    byId(id: string): Promise<Booking | null>;
    listByUser(userId: string): Promise<Booking[]>;
    listForTargets(listingIds: string[], venueIds: string[]): Promise<Booking[]>;
    byCode(code: string): Promise<Booking | null>;
    listAll(): Promise<Booking[]>;
    /** Active (held / pending / confirmed / checked-in) quantities, keyed by ticketTypeId and sessionId. */
    activeQuantities(listingIds: string[]): Promise<{ byTicket: Map<string, number>; bySession: Map<string, number> }>;
    insert(b: Booking): Promise<Booking>;
    update(id: string, patch: Partial<Booking>): Promise<Booking | null>;
  };
  users: {
    list(): Promise<User[]>;
    byId(id: string): Promise<User | null>;
    byPhone(phone: string): Promise<User | null>;
    insert(u: User): Promise<User>;
    update(id: string, patch: Partial<User>): Promise<User | null>;
  };
  otps: {
    put(phone: string, code: string, ttlMs: number): Promise<void>;
    take(phone: string): Promise<{ code: string; expiresAt: number } | null>;
  };
  coupons: {
    byCode(code: string): Promise<Coupon | null>;
  };
}
