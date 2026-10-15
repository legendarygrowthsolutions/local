import type { ListingInput, PayoutAccount } from "@/contracts";
import type {
  Area, Block, Booking, Category, City, Host, HostMember, JourneyTemplate, Listing, Resource, Session, SlotRule, TicketType, User, Venue,
} from "@/contracts";
import type { Coupon } from "@/lib/pricing";
import type { TakenRange } from "@/lib/slots/engine";

export interface OtpRecord {
  codeHash: string;
  expiresAt: string;
  attempts: number;
  sentAt: string;
}

export interface ListingRevision {
  id: string;
  targetId: string;
  kind: "event" | "venue";
  hostId: string;
  submittedBy: string;
  input: ListingInput;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface CouponRecord extends Coupon {
  id: string;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

/** A payout made to a host by hand (bank transfer, UPI, cheque), kept as a permanent record. Money in rupees. */
export interface PayoutRecord {
  id: string;
  hostId: string;
  cycleFrom: string;
  cycleTo: string;
  bookings: number;
  gross: number;
  refunds: number;
  deductions: number;
  adjustment: number;
  amount: number;
  method: "bank_transfer" | "upi" | "cheque" | "other";
  reference: string;
  paidOn: string;
  paidTo: string;
  notes: string | null;
  recordedBy: string;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  provider: string;
  method: string;
  /** created = checkout opened; success = paid; failed = declined; refund = money returned (amount refunded). */
  status: "created" | "success" | "failed" | "refund";
  amount: number; // rupees
  ref: string;
  orderId?: string | null;
  createdAt: string;
}

/**
 * Data access boundary, implemented by `sql/` (Kysely; SQLite locally, any SQL database in
 * production). Services depend only on this interface.
 */
export interface Repository {
  /** Run `fn` atomically; repository calls made inside join the transaction. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
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
    /** The host whose verification documents include this upload. */
    hostIdForDocumentMedia(mediaId: string): Promise<string | null>;
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
    /** Bookings created at or after `sinceIso`, newest first. */
    listCreatedSince(sinceIso: string): Promise<Booking[]>;
    /** Count of bookings by start day (YYYY-MM-DD, IST) in the given statuses. */
    countStartingOn(ymd: string, statuses: Booking["status"][]): Promise<number>;
    /** Booking count per user, excluding the given statuses. */
    countByUser(excludeStatuses: Booking["status"][]): Promise<Map<string, number>>;
    /** Filtered, paged search (newest first). `q` matches code, title, venue, attendee and customer name/phone. */
    search(opts: { q?: string; statuses?: Booking["status"][]; excludeStatuses?: Booking["status"][]; cityId?: string; offset: number; limit: number }): Promise<{ total: number; items: Booking[] }>;
    /** This user's bookings that used `couponCode` and count as redemptions (held, paid or attended), excluding `exceptId`. */
    /** Bookings holding or settled with this coupon: one account's (userId) or everyone's (null). */
    countCouponUses(userId: string | null, couponCode: string, exceptId?: string): Promise<number>;
    /** Whether the user has any settled booking (requested / confirmed / checked in / refunded), excluding `exceptId`. */
    hasSettledBooking(userId: string, exceptId?: string): Promise<boolean>;
    /** Expire this user's unpaid holds on a listing or venue (they're starting over). */
    releaseHolds(userId: string, targetId: string): Promise<void>;
    /** Unpaid holds that are still running for this user (abuse guard). */
    countLiveHolds(userId: string): Promise<number>;
    /** Active (held / pending / confirmed / checked-in) quantities, keyed by ticketTypeId and sessionId. */
    activeQuantities(listingIds: string[]): Promise<{ byTicket: Map<string, number>; bySession: Map<string, number> }>;
    insert(b: Booking): Promise<Booking>;
    update(id: string, patch: Partial<Booking>): Promise<Booking | null>;
  };
  users: {
    list(): Promise<User[]>;
    count(): Promise<number>;
    byId(id: string): Promise<User | null>;
    byPhone(phone: string): Promise<User | null>;
    insert(u: User): Promise<User>;
    update(id: string, patch: Partial<User>): Promise<User | null>;
  };
  otps: {
    get(phone: string): Promise<OtpRecord | null>;
    put(phone: string, rec: OtpRecord): Promise<void>;
    /** Atomically use up one attempt if fewer than `max` were used; false when none are left. */
    reserveAttempt(phone: string, max: number): Promise<boolean>;
    remove(phone: string): Promise<void>;
  };
  authSessions: {
    create(s: { id: string; userId: string; createdAt: string; expiresAt: string }): Promise<void>;
    /** Session row if it exists and hasn't expired. */
    get(id: string, nowIso: string): Promise<{ userId: string; expiresAt: string } | null>;
    touch(id: string, expiresAt: string): Promise<void>;
    remove(id: string): Promise<void>;
    removeForUser(userId: string): Promise<void>;
  };
  rateLimits: {
    /** Count one hit against `key` in a fixed window; returns the count so far and when the window resets. */
    hit(key: string, windowMs: number, now: Date): Promise<{ count: number; resetAt: string }>;
  };
  payments: {
    insert(p: PaymentRecord): Promise<void>;
    listByBooking(bookingId: string): Promise<PaymentRecord[]>;
    byOrderId(orderId: string): Promise<PaymentRecord | null>;
    /** Total refunded per booking (rupees), for bookings that had any refund. */
    refundTotals(bookingIds: string[]): Promise<Map<string, number>>;
    update(id: string, patch: Partial<Pick<PaymentRecord, "status" | "ref" | "method">>): Promise<void>;
  };
  views: {
    record(targetId: string, day: string): Promise<void>;
    /** Total views per target for days in [fromDay, toDay] (YYYY-MM-DD, inclusive). */
    totals(targetIds: string[], fromDay: string, toDay: string): Promise<number>;
  };
  coupons: {
    /** An active coupon by code (what checkout uses). */
    byCode(code: string): Promise<Coupon | null>;
    byId(id: string): Promise<CouponRecord | null>;
    list(): Promise<CouponRecord[]>;
    insert(c: CouponRecord): Promise<CouponRecord>;
    update(id: string, c: CouponRecord): Promise<CouponRecord | null>;
    remove(id: string): Promise<void>;
    /** Redemptions per code: paid or free bookings that kept the coupon (not holds, not expired). */
    usage(): Promise<Map<string, { uses: number; discount: number }>>;
  };
  payoutAccounts: {
    get(hostId: string): Promise<PayoutAccount | null>;
    list(hostIds: string[]): Promise<Map<string, PayoutAccount>>;
    upsert(hostId: string, a: PayoutAccount, by: string): Promise<void>;
  };
  payouts: {
    list(filter?: { hostId?: string }): Promise<PayoutRecord[]>;
    byId(id: string): Promise<PayoutRecord | null>;
    insert(p: PayoutRecord): Promise<void>;
    void(id: string, by: string, reason: string, at: string): Promise<void>;
  };
  revisions: {
    /** The pending revision for a listing/venue, if any. */
    pendingFor(targetId: string): Promise<ListingRevision | null>;
    /** Pending revisions for these targets (moderation queue). */
    listPending(): Promise<ListingRevision[]>;
    /** Replace any pending revision for the target with this one. */
    submit(r: ListingRevision): Promise<void>;
    decide(id: string, status: "approved" | "rejected", note: string | null, at: string): Promise<void>;
    /** Most recent approved/rejected revision for the target (so hosts see why an edit was declined). */
    lastDecided(targetId: string): Promise<ListingRevision | null>;
  };
  media: {
    insert(m: { id: string; ownerId: string; contentType: string; data: Buffer; createdAt: string; private?: boolean }): Promise<void>;
    get(id: string): Promise<{ contentType: string; data: Buffer; private: boolean; ownerId: string } | null>;
    exists(id: string): Promise<boolean>;
  };
}
