/**
 * Row types as Kysely sees them (camelCase; CamelCasePlugin maps to snake_case columns).
 * Booleans are 0/1 integers, money is integer paise, JSON columns are strings.
 */
type Bool = number;
type Json = string;

export interface CitiesTable { id: string; slug: string; name: string; state: string; lat: number; lng: number; active: Bool; tagline: string }
export interface AreasTable { id: string; cityId: string; slug: string; name: string; lat: number; lng: number }
export interface CategoriesTable { id: string; slug: string; name: string; singular: string; parentId: string | null; icon: string; sort: number; blurb: string | null }
export interface JourneyTemplatesTable {
  id: string; name: string; description: string; allowedCategories: Json; bookingMode: string; schedule: string; pricing: string;
  ticketScope: string | null; steps: Json; rules: Json; fees: Json; cancellation: Json; ctaLabel: string; sort: number; active: Bool;
}
export interface UsersTable {
  id: string; phone: string; name: string | null; gender: string | null; dob: string | null; cityId: string | null; interests: Json;
  role: string; avatar: string | null; notifications: Json | null; createdAt: string;
}
export interface UserSavedTable { userId: string; itemId: string; createdAt: string }
export interface UserFollowingTable { userId: string; hostId: string; createdAt: string }
export interface HostsTable {
  id: string; userId: string | null; type: string; brandName: string; cityId: string; bio: string; instagram: string | null;
  kycStatus: string; status: string; since: string; contactName: string; contactPhone: string; email: string | null;
  website: string | null; gstin: string | null; expectedPerMonth: string; wantsPaid: Bool; reviewNote: string | null; submittedAt: string;
}
export interface HostDocumentsTable { id: string; hostId: string; kind: string; fileName: string; mediaId: string | null; status: string; sort: number }
export interface HostMembersTable {
  id: string; hostId: string; userId: string | null; phone: string; name: string | null; role: string; status: string;
  invitedBy: string | null; createdAt: string;
}
export interface ListingsTable {
  id: string; hostId: string; cityId: string; areaId: string; categoryId: string; subcategoryId: string | null; templateId: string;
  slug: string; title: string; summary: string; description: string; media: Json; venueName: string; address: string; lat: number;
  lng: number; ageLimit: string; languages: Json; tags: Json; thingsToKnow: Json; externalUrl: string | null; status: string;
  featuredRank: number | null; formFields: Json; createdAt: string; reviewNote: string | null;
}
export interface ListingSessionsTable { id: string; listingId: string; startsAt: string; endsAt: string; capacity: number; sold: number; label: string }
export interface TicketTypesTable {
  id: string; listingId: string; sessionId: string | null; name: string; description: string; price: number; qty: number; sold: number;
  perOrderMax: number; isPass: Bool; sort: number;
}
export interface VenuesTable {
  id: string; hostId: string; cityId: string; areaId: string; templateId: string; slug: string; name: string; summary: string;
  description: string; media: Json; address: string; lat: number; lng: number; amenities: Json; hoursLabel: string; sports: Json;
  thingsToKnow: Json; featuredRank: number | null; status: string; reviewNote: string | null;
}
export interface ResourcesTable {
  id: string; venueId: string; name: string; sport: string; indoor: Bool; surface: string; slotLengthMins: number; capacity: number; sort: number;
}
export interface SlotRulesTable {
  id: string; resourceId: string; openMins: number; closeMins: number; minMins: number; maxMins: number; bufferMins: number;
  advanceDays: number; priceBase: number; pricePeak: number; peak: Json;
}
export interface BlocksTable { id: string; resourceId: string; startsAt: string; endsAt: string; reason: string }
export interface CouponsTable {
  id: string; code: string; type: string; value: number; maxDiscount: number; description: string; perUserLimit: number | null;
  firstBookingOnly: Bool; minSubtotal: number; validUntil: string | null; active: Bool;
  validFrom: string | null; totalLimit: number | null; cityId: string | null; createdAt: string | null; updatedAt: string | null;
}
export interface HostPayoutAccountsTable {
  hostId: string; method: string; holderName: string; accountNumber: string | null; ifsc: string | null; bankName: string | null;
  upiId: string | null; updatedAt: string; updatedBy: string | null;
}
export interface PayoutsTable {
  id: string; hostId: string; cycleFrom: string; cycleTo: string; bookings: number; gross: number; refunds: number; deductions: number;
  adjustment: number; amount: number; method: string; reference: string; paidOn: string; paidTo: string; notes: string | null;
  recordedBy: string; createdAt: string; voidedAt: string | null; voidedBy: string | null; voidReason: string | null;
}
export interface BookingsTable {
  id: string; code: string; userId: string; kind: string; listingId: string | null; venueId: string | null; cityId: string; title: string;
  venueName: string; status: string; subtotal: number; discount: number; convenienceFee: number; gstOnFee: number; total: number;
  couponCode: string | null; attendee: Json | null; startsAt: string; endsAt: string; holdExpiresAt: string | null; createdAt: string;
  paymentRef: string | null; seeded: Bool; checkedInAt: string | null;
}
export interface BookingItemsTable {
  id: string; bookingId: string; line: number; ticketTypeId: string | null; sessionId: string | null; resourceId: string | null;
  startsAt: string | null; endsAt: string | null; label: string; qty: number; unitPrice: number;
}
export interface PaymentsTable { id: string; bookingId: string; provider: string; method: string; status: string; amount: number; ref: string; orderId: string | null; createdAt: string }
export interface OtpCodesTable { phone: string; codeHash: string; expiresAt: string; attempts: number; sentAt: string }
export interface AuthSessionsTable { id: string; userId: string; createdAt: string; expiresAt: string }
export interface RateLimitsTable { key: string; count: number; resetAt: string }
export interface MediaTable { id: string; ownerId: string; contentType: string; private: number; bytes: number; data: string; createdAt: string }
export interface ListingRevisionsTable {
  id: string; targetId: string; kind: string; hostId: string; submittedBy: string; input: string; status: string; note: string | null;
  createdAt: string; decidedAt: string | null;
}
export interface ListingViewsTable { targetId: string; day: string; count: number }

export interface Database {
  cities: CitiesTable;
  areas: AreasTable;
  categories: CategoriesTable;
  journeyTemplates: JourneyTemplatesTable;
  users: UsersTable;
  userSaved: UserSavedTable;
  userFollowing: UserFollowingTable;
  hosts: HostsTable;
  hostDocuments: HostDocumentsTable;
  hostMembers: HostMembersTable;
  listings: ListingsTable;
  listingSessions: ListingSessionsTable;
  ticketTypes: TicketTypesTable;
  venues: VenuesTable;
  resources: ResourcesTable;
  slotRules: SlotRulesTable;
  blocks: BlocksTable;
  coupons: CouponsTable;
  hostPayoutAccounts: HostPayoutAccountsTable;
  payouts: PayoutsTable;
  bookings: BookingsTable;
  bookingItems: BookingItemsTable;
  payments: PaymentsTable;
  otpCodes: OtpCodesTable;
  authSessions: AuthSessionsTable;
  rateLimits: RateLimitsTable;
  listingViews: ListingViewsTable;
  media: MediaTable;
  listingRevisions: ListingRevisionsTable;
}
