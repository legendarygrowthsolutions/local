import type { Booking, Listing, Session, TicketType } from "@/contracts";
import { newId } from "@/lib/crypto";
import { addDays, toISO, todayIST } from "@/lib/time";
import { repo } from "@/repositories";

/** IST wall-clock timestamp `days` from today at `mins` past midnight (e.g. 19 * 60). */
export const at = (days: number, mins = 19 * 60, now = new Date()) => toISO(addDays(todayIST(now), days), mins);

export function listingRow(patch: Partial<Listing> = {}): Listing {
  const id = patch.id ?? newId("l_t");
  return {
    id,
    hostId: "h_mumbai_1",
    cityId: "c_mumbai",
    areaId: "a_mumbai_bandra-west",
    categoryId: "cat_events",
    subcategoryId: null,
    templateId: "tpl_ticket_single",
    slug: `test-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: "Integration Test Gig",
    summary: "A test listing",
    description: "Created by the integration suite",
    media: ["a.jpg", "b.jpg"],
    venueName: "Test Hall",
    address: "1 Test Road, Mumbai",
    lat: 19.0596,
    lng: 72.8295,
    ageLimit: "All ages",
    languages: ["English", "Hindi"],
    tags: ["test"],
    thingsToKnow: ["Bring ID"],
    externalUrl: null,
    status: "live",
    featuredRank: null,
    formFields: [],
    createdAt: new Date().toISOString(),
    reviewNote: null,
    ...patch,
  };
}

/**
 * A live listing with explicit inventory. `sessions` are day offsets from today (19:00–22:00 IST);
 * tickets default to one ticket type valid for any session.
 */
export async function makeListing(opts: {
  listing?: Partial<Listing>;
  sessionDays?: number[];
  sessionCapacity?: number;
  tickets?: (Partial<TicketType> & { sessionIndex?: number | null })[];
} = {}) {
  const l = await repo.listings.insert(listingRow(opts.listing));
  const sessions: Session[] = (opts.sessionDays ?? [3]).map((d, i) => ({
    id: `${l.id}_s${i}`,
    listingId: l.id,
    startsAt: at(d, 19 * 60),
    endsAt: at(d, 22 * 60),
    capacity: opts.sessionCapacity ?? 100,
    sold: 0,
    label: `Day ${i + 1}`,
  }));
  await repo.listings.replaceSessions(l.id, sessions);
  const tickets: TicketType[] = (opts.tickets ?? [{}]).map(({ sessionIndex, ...t }, i) => ({
    id: `${l.id}_t${i}`,
    listingId: l.id,
    sessionId: sessionIndex == null ? null : sessions[sessionIndex].id,
    name: `Ticket ${i + 1}`,
    description: "",
    price: 500,
    qty: 100,
    sold: 0,
    perOrderMax: 6,
    isPass: false,
    ...t,
  }));
  await repo.listings.replaceTicketTypes(l.id, tickets);
  return { listing: l, sessions, tickets };
}

export const attendee = (name = "Test Person") => ({ name, phone: "9876500000", answers: {} as Record<string, string> });

/** A booking row inserted directly (bypasses the service), e.g. to simulate an expired hold. */
export function bookingRow(patch: Partial<Booking> & Pick<Booking, "userId">): Booking {
  const code = "TST" + Math.random().toString(36).slice(2, 8).toUpperCase();
  return {
    id: "bk_" + code,
    code,
    kind: "listing",
    listingId: null,
    venueId: null,
    cityId: "c_mumbai",
    title: "Test booking",
    venueName: "Test Hall",
    status: "confirmed",
    items: [],
    price: { subtotal: 0, discount: 0, convenienceFee: 0, gstOnFee: 0, total: 0 },
    couponCode: null,
    attendee: null,
    startsAt: at(3),
    endsAt: at(3, 22 * 60),
    holdExpiresAt: null,
    createdAt: new Date().toISOString(),
    paymentRef: null,
    seeded: false,
    checkedInAt: null,
    ...patch,
  };
}

/** A private, live court venue (one 60-min court, ₹600/h, no peak) so slot tests don't depend on seeded occupancy. */
export async function makeVenue(suffix: string) {
  const id = `v_bt_${suffix}`;
  await repo.venues.insert({
    id, hostId: "h_mumbai_5", cityId: "c_mumbai", areaId: "a_mumbai_bandra-west", templateId: "tpl_court_60", slug: `bt-${suffix}`, name: `BT ${suffix}`,
    summary: "s", description: "d", media: [], address: "a", lat: 19, lng: 72.8, amenities: [], hoursLabel: "6–23", sports: ["pickleball"], thingsToKnow: [],
    featuredRank: null, status: "live", reviewNote: null,
  });
  const rid = `r_bt_${suffix}`;
  await repo.venues.replaceResources(id, [{ id: rid, venueId: id, name: "Court A", sport: "pickleball", indoor: true, surface: "Acrylic", slotLengthMins: 60, capacity: 4 }], [
    { id: `sr_${rid}`, resourceId: rid, openMins: 360, closeMins: 1380, minMins: 60, maxMins: 120, bufferMins: 0, advanceDays: 7, priceBase: 600, pricePeak: 600, peak: [] },
  ]);
  return { venueId: id, resourceId: rid };
}
