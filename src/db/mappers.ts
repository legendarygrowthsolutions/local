import type {
  Area, Block, Booking, BookingItem, Category, City, Host, HostDocument, HostMember, JourneyTemplate, Listing, Resource, Session, SlotRule, TicketType, User, Venue,
} from "@/contracts";
import type { Coupon } from "@/lib/pricing";
import type * as T from "./tables";

/** Money is stored as integer paise; the domain speaks rupees (2 dp). */
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const fromPaise = (paise: number) => Number(paise) / 100;
const b = (v: boolean | undefined | null) => (v ? 1 : 0);
const isTrue = (v: unknown) => v === 1 || v === true || v === "1";
const j = (v: unknown) => JSON.stringify(v);
function pj<V>(v: string | null | undefined, fallback: V): V {
  if (v == null || v === "") return fallback;
  try {
    return JSON.parse(v) as V;
  } catch {
    return fallback;
  }
}
const num = (v: unknown) => Number(v);
/** Instants are stored in UTC so they sort and compare correctly as strings. */
const utc = (v: string) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? v : new Date(t).toISOString();
};

/** Only keep keys that are present, so partial patches map to partial row updates. */
function pick<R>(full: R, patch: object): Partial<R> {
  const out: Partial<R> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && k in (full as object)) (out as Record<string, unknown>)[k] = (full as Record<string, unknown>)[k];
  return out;
}

// ---------- cities / areas / categories ----------
export const cityToRow = (c: City): T.CitiesTable => ({ ...c, active: b(c.active) });
export const cityFromRow = (r: T.CitiesTable): City => ({ ...r, lat: num(r.lat), lng: num(r.lng), active: isTrue(r.active) });
export const cityPatch = (p: Partial<City>) => pick(cityToRow({ ...EMPTY_CITY, ...p }), p);
const EMPTY_CITY: City = { id: "", slug: "", name: "", state: "", lat: 0, lng: 0, active: false, tagline: "" };

export const areaToRow = (a: Area): T.AreasTable => ({ ...a });
export const areaFromRow = (r: T.AreasTable): Area => ({ ...r, lat: num(r.lat), lng: num(r.lng) });

export const categoryToRow = (c: Category): T.CategoriesTable => ({ ...c, blurb: c.blurb ?? null });
export const categoryFromRow = (r: T.CategoriesTable): Category => {
  const { blurb, ...rest } = r;
  return { ...rest, sort: num(r.sort), ...(blurb != null ? { blurb } : {}) };
};

// ---------- journey templates ----------
export const templateToRow = (t: JourneyTemplate, sort = 0): T.JourneyTemplatesTable => ({
  id: t.id,
  name: t.name,
  description: t.description,
  allowedCategories: j(t.allowedCategories),
  bookingMode: t.bookingMode,
  schedule: t.schedule,
  pricing: t.pricing,
  ticketScope: t.ticketScope,
  steps: j(t.steps),
  rules: j(t.rules),
  fees: j(t.fees),
  cancellation: j(t.cancellation),
  ctaLabel: t.ctaLabel,
  sort,
  active: b(t.active),
});
export const templateFromRow = (r: T.JourneyTemplatesTable): JourneyTemplate => ({
  id: r.id,
  name: r.name,
  description: r.description,
  allowedCategories: pj(r.allowedCategories, []),
  bookingMode: r.bookingMode as JourneyTemplate["bookingMode"],
  schedule: r.schedule as JourneyTemplate["schedule"],
  pricing: r.pricing as JourneyTemplate["pricing"],
  ticketScope: r.ticketScope as JourneyTemplate["ticketScope"],
  steps: pj(r.steps, []),
  rules: pj(r.rules, {} as JourneyTemplate["rules"]),
  fees: pj(r.fees, {} as JourneyTemplate["fees"]),
  cancellation: pj(r.cancellation, {} as JourneyTemplate["cancellation"]),
  ctaLabel: r.ctaLabel,
  active: isTrue(r.active),
});
export const templatePatch = (p: Partial<JourneyTemplate>) => {
  const row = pick(templateToRow({ ...EMPTY_TEMPLATE, ...p }), p);
  delete (row as { sort?: number }).sort;
  return row;
};
const EMPTY_TEMPLATE = {
  id: "", name: "", description: "", allowedCategories: [], bookingMode: "none", schedule: "single", pricing: "free", ticketScope: null, steps: [],
  rules: {}, fees: {}, cancellation: {}, ctaLabel: "", active: false,
} as unknown as JourneyTemplate;

// ---------- users ----------
export type UserCore = Omit<User, "saved" | "following">;
export const userToRow = (u: UserCore): T.UsersTable => ({
  id: u.id,
  phone: u.phone,
  name: u.name,
  gender: u.gender,
  dob: u.dob,
  cityId: u.cityId,
  interests: j(u.interests ?? []),
  role: u.role,
  avatar: u.avatar ?? null,
  notifications: u.notifications ? j(u.notifications) : null,
  createdAt: utc(u.createdAt),
});
export const userFromRow = (r: T.UsersTable, saved: string[], following: string[]): User => ({
  id: r.id,
  phone: r.phone,
  name: r.name,
  gender: r.gender as User["gender"],
  dob: r.dob,
  cityId: r.cityId,
  interests: pj(r.interests, []),
  role: r.role as User["role"],
  saved,
  following,
  ...(r.notifications ? { notifications: pj(r.notifications, undefined as unknown as NonNullable<User["notifications"]>) } : {}),
  avatar: r.avatar,
  createdAt: r.createdAt,
});
export const userPatch = (p: Partial<User>) => {
  const { saved: _s, following: _f, ...rest } = p;
  void _s;
  void _f;
  return pick(userToRow({ ...EMPTY_USER, ...rest }), rest);
};
const EMPTY_USER: UserCore = { id: "", phone: "", name: null, gender: null, dob: null, cityId: null, interests: [], role: "user", createdAt: "" };

// ---------- hosts ----------
export const hostToRow = (h: Host): T.HostsTable => {
  const { documents: _d, ...rest } = h;
  void _d;
  return { ...rest, wantsPaid: b(h.wantsPaid), submittedAt: utc(rest.submittedAt) };
};
export const hostDocToRow = (hostId: string, d: HostDocument, sort: number): T.HostDocumentsTable => ({
  id: d.id,
  kind: d.kind,
  fileName: d.fileName,
  mediaId: d.mediaId ?? null,
  status: d.status,
  hostId,
  sort,
});
export const hostFromRow = (r: T.HostsTable, docs: T.HostDocumentsTable[]): Host => ({
  ...r,
  type: r.type as Host["type"],
  kycStatus: r.kycStatus as Host["kycStatus"],
  status: r.status as Host["status"],
  wantsPaid: isTrue(r.wantsPaid),
  documents: docs
    .sort((a, b) => num(a.sort) - num(b.sort))
    .map((d) => ({ id: d.id, kind: d.kind as HostDocument["kind"], fileName: d.fileName, ...(d.mediaId ? { mediaId: d.mediaId } : {}), status: d.status as HostDocument["status"] })),
});
export const hostPatch = (p: Partial<Host>) => {
  const { documents: _d, ...rest } = p;
  void _d;
  return pick(hostToRow({ ...EMPTY_HOST, ...rest }), rest);
};
const EMPTY_HOST = {
  id: "", userId: null, type: "organiser", brandName: "", cityId: "", bio: "", instagram: null, kycStatus: "none", status: "pending", since: "",
  contactName: "", contactPhone: "", email: null, website: null, gstin: null, expectedPerMonth: "", wantsPaid: false, documents: [], reviewNote: null, submittedAt: "",
} as Host;

export const memberToRow = (m: HostMember): T.HostMembersTable => ({ ...m, createdAt: utc(m.createdAt) });
export const memberFromRow = (r: T.HostMembersTable): HostMember => ({ ...r, role: r.role as HostMember["role"], status: r.status as HostMember["status"] });

// ---------- listings ----------
export const listingToRow = (l: Listing): T.ListingsTable => ({
  id: l.id,
  hostId: l.hostId,
  cityId: l.cityId,
  areaId: l.areaId,
  categoryId: l.categoryId,
  subcategoryId: l.subcategoryId,
  templateId: l.templateId,
  slug: l.slug,
  title: l.title,
  summary: l.summary,
  description: l.description,
  media: j(l.media),
  venueName: l.venueName,
  address: l.address,
  lat: l.lat,
  lng: l.lng,
  ageLimit: l.ageLimit,
  languages: j(l.languages),
  tags: j(l.tags),
  thingsToKnow: j(l.thingsToKnow),
  externalUrl: l.externalUrl,
  status: l.status,
  featuredRank: l.featuredRank,
  formFields: j(l.formFields),
  createdAt: utc(l.createdAt),
  reviewNote: l.reviewNote ?? null,
});
export const listingFromRow = (r: T.ListingsTable): Listing => ({
  ...r,
  media: pj(r.media, []),
  lat: num(r.lat),
  lng: num(r.lng),
  languages: pj(r.languages, []),
  tags: pj(r.tags, []),
  thingsToKnow: pj(r.thingsToKnow, []),
  status: r.status as Listing["status"],
  featuredRank: r.featuredRank == null ? null : num(r.featuredRank),
  formFields: pj(r.formFields, []),
});
export const listingPatch = (p: Partial<Listing>) => pick(listingToRow({ ...EMPTY_LISTING, ...p }), p);
const EMPTY_LISTING = {
  id: "", hostId: "", cityId: "", areaId: "", categoryId: "", subcategoryId: null, templateId: "", slug: "", title: "", summary: "", description: "",
  media: [], venueName: "", address: "", lat: 0, lng: 0, ageLimit: "", languages: [], tags: [], thingsToKnow: [], externalUrl: null, status: "draft",
  featuredRank: null, formFields: [], createdAt: "", reviewNote: null,
} as Listing;

export const sessionToRow = (s: Session & { sold?: number }): T.ListingSessionsTable => ({
  id: s.id,
  listingId: s.listingId,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  capacity: s.capacity,
  sold: s.sold ?? 0,
  label: s.label,
});
export const sessionFromRow = (r: T.ListingSessionsTable): Session => ({
  id: r.id,
  listingId: r.listingId,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  capacity: num(r.capacity),
  sold: num(r.sold),
  label: r.label,
});

export const ticketToRow = (t: TicketType, sort: number): T.TicketTypesTable => ({ ...t, price: toPaise(t.price), isPass: b(t.isPass), sort });
export const ticketFromRow = (r: T.TicketTypesTable): TicketType => ({
  id: r.id,
  listingId: r.listingId,
  sessionId: r.sessionId,
  name: r.name,
  description: r.description,
  price: fromPaise(r.price),
  qty: num(r.qty),
  sold: num(r.sold),
  perOrderMax: num(r.perOrderMax),
  isPass: isTrue(r.isPass),
});

// ---------- venues ----------
export const venueToRow = (v: Venue): T.VenuesTable => ({
  id: v.id,
  hostId: v.hostId,
  cityId: v.cityId,
  areaId: v.areaId,
  templateId: v.templateId,
  slug: v.slug,
  name: v.name,
  summary: v.summary,
  description: v.description,
  media: j(v.media),
  address: v.address,
  lat: v.lat,
  lng: v.lng,
  amenities: j(v.amenities),
  hoursLabel: v.hoursLabel,
  sports: j(v.sports),
  thingsToKnow: j(v.thingsToKnow),
  featuredRank: v.featuredRank,
  status: v.status,
  reviewNote: v.reviewNote ?? null,
});
export const venueFromRow = (r: T.VenuesTable): Venue => ({
  ...r,
  media: pj(r.media, []),
  lat: num(r.lat),
  lng: num(r.lng),
  amenities: pj(r.amenities, []),
  sports: pj(r.sports, []),
  thingsToKnow: pj(r.thingsToKnow, []),
  featuredRank: r.featuredRank == null ? null : num(r.featuredRank),
  status: r.status as Venue["status"],
});
export const venuePatch = (p: Partial<Venue>) => pick(venueToRow({ ...EMPTY_VENUE, ...p }), p);
const EMPTY_VENUE = {
  id: "", hostId: "", cityId: "", areaId: "", templateId: "", slug: "", name: "", summary: "", description: "", media: [], address: "", lat: 0, lng: 0,
  amenities: [], hoursLabel: "", sports: [], thingsToKnow: [], featuredRank: null, status: "draft", reviewNote: null,
} as Venue;

export const resourceToRow = (r: Resource, sort: number): T.ResourcesTable => ({ ...r, indoor: b(r.indoor), sort });
export const resourceFromRow = (r: T.ResourcesTable): Resource => ({
  id: r.id,
  venueId: r.venueId,
  name: r.name,
  sport: r.sport,
  indoor: isTrue(r.indoor),
  surface: r.surface,
  slotLengthMins: num(r.slotLengthMins),
  capacity: num(r.capacity),
});

export const ruleToRow = (r: SlotRule): T.SlotRulesTable => ({ ...r, priceBase: toPaise(r.priceBase), pricePeak: toPaise(r.pricePeak), peak: j(r.peak) });
export const ruleFromRow = (r: T.SlotRulesTable): SlotRule => ({
  id: r.id,
  resourceId: r.resourceId,
  openMins: num(r.openMins),
  closeMins: num(r.closeMins),
  minMins: num(r.minMins),
  maxMins: num(r.maxMins),
  bufferMins: num(r.bufferMins),
  advanceDays: num(r.advanceDays),
  priceBase: fromPaise(r.priceBase),
  pricePeak: fromPaise(r.pricePeak),
  peak: pj(r.peak, []),
});

export const blockToRow = (x: Block): T.BlocksTable => ({ ...x });
export const blockFromRow = (r: T.BlocksTable): Block => ({ ...r });

export const couponToRow = (c: Coupon & { id: string }): T.CouponsTable => ({
  id: c.id,
  code: c.code.toUpperCase(),
  type: c.type,
  value: c.value,
  maxDiscount: c.maxDiscount,
  description: c.description,
  perUserLimit: c.perUserLimit ?? null,
  firstBookingOnly: b(c.firstBookingOnly),
  minSubtotal: toPaise(c.minSubtotal ?? 0),
  validUntil: c.validUntil ?? null,
  active: 1,
});
export const couponFromRow = (r: T.CouponsTable): Coupon => ({
  code: r.code,
  type: r.type as Coupon["type"],
  value: num(r.value),
  maxDiscount: num(r.maxDiscount),
  description: r.description,
  perUserLimit: r.perUserLimit == null ? null : num(r.perUserLimit),
  firstBookingOnly: isTrue(r.firstBookingOnly),
  minSubtotal: fromPaise(r.minSubtotal),
  validUntil: r.validUntil,
});

// ---------- bookings ----------
export const bookingToRow = (x: Booking): T.BookingsTable => ({
  id: x.id,
  code: x.code,
  userId: x.userId,
  kind: x.kind,
  listingId: x.listingId,
  venueId: x.venueId,
  cityId: x.cityId,
  title: x.title,
  venueName: x.venueName,
  status: x.status,
  subtotal: toPaise(x.price.subtotal),
  discount: toPaise(x.price.discount),
  convenienceFee: toPaise(x.price.convenienceFee),
  gstOnFee: toPaise(x.price.gstOnFee),
  total: toPaise(x.price.total),
  couponCode: x.couponCode,
  attendee: x.attendee ? j(x.attendee) : null,
  startsAt: x.startsAt,
  endsAt: x.endsAt,
  // Always UTC so SQL can compare it as a string against now().
  holdExpiresAt: x.holdExpiresAt ? utc(x.holdExpiresAt) : null,
  createdAt: utc(x.createdAt),
  paymentRef: x.paymentRef,
  seeded: b(x.seeded),
  checkedInAt: x.checkedInAt ?? null,
});
export const itemToRow = (bookingId: string, it: BookingItem, line: number): T.BookingItemsTable => ({
  id: `${bookingId}_${line}`,
  bookingId,
  line,
  ticketTypeId: it.ticketTypeId,
  sessionId: it.sessionId,
  resourceId: it.resourceId,
  startsAt: it.startsAt,
  endsAt: it.endsAt,
  label: it.label,
  qty: it.qty,
  unitPrice: toPaise(it.unitPrice),
});
export const itemFromRow = (r: T.BookingItemsTable): BookingItem => ({
  ticketTypeId: r.ticketTypeId,
  sessionId: r.sessionId,
  resourceId: r.resourceId,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  label: r.label,
  qty: num(r.qty),
  unitPrice: fromPaise(r.unitPrice),
});
export const bookingFromRow = (r: T.BookingsTable, items: T.BookingItemsTable[]): Booking => ({
  id: r.id,
  code: r.code,
  userId: r.userId,
  kind: r.kind as Booking["kind"],
  listingId: r.listingId,
  venueId: r.venueId,
  cityId: r.cityId,
  title: r.title,
  venueName: r.venueName,
  status: r.status as Booking["status"],
  items: items.sort((a, b) => num(a.line) - num(b.line)).map(itemFromRow),
  price: {
    subtotal: fromPaise(r.subtotal),
    discount: fromPaise(r.discount),
    convenienceFee: fromPaise(r.convenienceFee),
    gstOnFee: fromPaise(r.gstOnFee),
    total: fromPaise(r.total),
  },
  couponCode: r.couponCode,
  attendee: r.attendee ? pj(r.attendee, null) : null,
  startsAt: r.startsAt,
  endsAt: r.endsAt,
  holdExpiresAt: r.holdExpiresAt,
  createdAt: r.createdAt,
  paymentRef: r.paymentRef,
  seeded: isTrue(r.seeded),
  checkedInAt: r.checkedInAt,
});
export const bookingPatch = (p: Partial<Booking>) => {
  const { items: _i, price, ...rest } = p;
  void _i;
  const full = bookingToRow({ ...EMPTY_BOOKING, ...rest, price: price ?? EMPTY_BOOKING.price });
  const out = pick(full, rest);
  if (price) Object.assign(out, { subtotal: full.subtotal, discount: full.discount, convenienceFee: full.convenienceFee, gstOnFee: full.gstOnFee, total: full.total });
  return out;
};
const EMPTY_BOOKING = {
  id: "", code: "", userId: "", kind: "listing", listingId: null, venueId: null, cityId: "", title: "", venueName: "", status: "held", items: [],
  price: { subtotal: 0, discount: 0, convenienceFee: 0, gstOnFee: 0, total: 0 }, couponCode: null, attendee: null, startsAt: "", endsAt: "",
  holdExpiresAt: null, createdAt: "", paymentRef: null, seeded: false, checkedInAt: null,
} as Booking;
