import "server-only";
import { storeDocument, storeImages } from "./media";
import { newId } from "@/lib/crypto";
import type {
  Booking, EventListingInput, Host, HostApplicationInput, HostMember, JourneyTemplate, Listing, ListingInput, Resource,
  Session, SlotRule, TicketType, User, Venue, VenueInput,
} from "@/contracts";
import { repo } from "@/repositories";
import { generateSlots } from "@/lib/slots/engine";
import { addDays, formatDate, formatMins, formatWhen, fromISO, istParts, toISO, todayIST } from "@/lib/time";
import { hostPayouts } from "./payouts";
import { ServiceError, badRequest, conflict, notFound } from "./errors";

// ---------------------------------------------------------------------------
// Context & roles (PLAN §11.1). Money is stripped here, server-side, for managers.
// ---------------------------------------------------------------------------

export interface HostContext {
  user: User;
  host: Host;
  member: HostMember;
  isOwner: boolean;
  memberships: { host: Host; member: HostMember }[];
}

export const forbidden = (what = "Only the owner can see this") => new ServiceError(403, "forbidden", what);

export async function memberships(userId: string) {
  const ms = await repo.members.listByUser(userId);
  const out: { host: Host; member: HostMember }[] = [];
  for (const m of ms) {
    const h = await repo.hosts.byId(m.hostId);
    if (h) out.push({ host: h, member: m });
  }
  return out;
}

/** Resolve the active host for a user (cookie-preferred), or null if they have none. */
export async function resolveHostContext(user: User, preferredHostId?: string | null): Promise<HostContext | null> {
  const all = await memberships(user.id);
  if (!all.length) return null;
  const pick = all.find((x) => x.host.id === preferredHostId) ?? all[0];
  return { user, host: pick.host, member: pick.member, isOwner: pick.member.role === "owner", memberships: all };
}

export function assertApproved(ctx: HostContext) {
  if (ctx.host.status !== "approved") throw new ServiceError(403, "not_approved", "Your host account isn't approved yet");
}
export function assertOwner(ctx: HostContext) {
  if (!ctx.isOwner) throw forbidden();
}
const money = (ctx: HostContext, v: number) => (ctx.isOwner ? Math.round(v * 100) / 100 : null);

const rid = newId;
const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const COUNTED: Booking["status"][] = ["confirmed", "checked_in", "requested"];

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

export async function applyAsHost(user: User, input: HostApplicationInput) {
  const existing = await memberships(user.id);
  const mine = existing.find((x) => x.member.role === "owner");
  // Each document is a new private upload, or a file kept from this host's previous submission.
  const previous = mine?.host.documents ?? [];
  const docs = [];
  for (const d of input.documents) {
    if (d.data) {
      docs.push({ id: rid("doc"), kind: d.kind, fileName: d.fileName, mediaId: await storeDocument(user.id, d.data), status: "uploaded" as const });
      continue;
    }
    const kept = d.mediaId ? previous.find((p) => p.mediaId === d.mediaId) : undefined;
    if (!kept) throw badRequest(`Please upload your ${d.fileName ? "document" : d.kind} again`);
    docs.push({ ...kept, kind: d.kind });
  }
  const fields = {
    type: input.type,
    brandName: input.brandName,
    cityId: input.cityId,
    bio: input.bio,
    instagram: input.instagram || null,
    contactName: input.contactName,
    contactPhone: user.phone,
    email: input.email || null,
    website: input.website || null,
    gstin: input.gstin ? input.gstin.toUpperCase() : null,
    expectedPerMonth: input.expectedPerMonth,
    wantsPaid: input.wantsPaid,
    documents: docs,
    kycStatus: (input.wantsPaid ? "pending" : "none") as Host["kycStatus"],
    status: "pending" as const,
    reviewNote: null,
    submittedAt: new Date().toISOString(),
  };
  if (mine) {
    if (mine.host.status === "approved") throw conflict("You're already an approved host");
    if (mine.host.status === "pending") throw conflict("Your application is already in review");
    return repo.hosts.update(mine.host.id, fields);
  }
  const host = await repo.hosts.insert({ id: rid("h"), userId: user.id, since: todayIST().slice(0, 7) + "-01", ...fields });
  await repo.members.insert({ id: rid("hm"), hostId: host.id, userId: user.id, phone: user.phone, name: user.name, role: "owner", status: "active", invitedBy: null, createdAt: new Date().toISOString() });
  return host;
}

// ---------------------------------------------------------------------------
// Dashboard & listings
// ---------------------------------------------------------------------------

export interface HostListingRow {
  id: string;
  kind: "event" | "venue";
  title: string;
  status: Listing["status"];
  whenLabel: string;
  templateName: string;
  sold: number;
  capacity: number;
  soldLabel: string;
  revenue: number | null;
  publicHref: string | null;
  editHref: string;
  reviewNote: string | null;
  /** A material edit to this live item is waiting for review. */
  pendingReview: boolean;
}

export interface HostBookingRow {
  id: string;
  code: string;
  kind: "listing" | "venue";
  title: string;
  label: string;
  customer: string;
  phone: string;
  qty: number;
  startsAt: string;
  endsAt: string;
  whenLabel: string;
  status: Booking["status"];
  amount: number | null;
  checkedInAt: string | null;
}

async function targets(ctx: HostContext) {
  const [listings, venues] = await Promise.all([repo.listings.listByHost(ctx.host.id), repo.venues.listByHost(ctx.host.id)]);
  return { listings, venues };
}

function bookingRow(ctx: HostContext, b: Booking, now: Date): HostBookingRow {
  return {
    id: b.id,
    code: b.code,
    kind: b.kind,
    title: b.title,
    label: b.items.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ""}${i.label}`).join(", "),
    customer: b.attendee?.name ?? "Guest",
    phone: b.attendee?.phone ?? "",
    qty: b.items.reduce((s, i) => s + i.qty, 0),
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    whenLabel: formatWhen(b.startsAt, now),
    status: b.status,
    amount: money(ctx, b.price.subtotal - b.price.discount),
    checkedInAt: b.checkedInAt ?? null,
  };
}

export async function listHostListings(ctx: HostContext, now = new Date()): Promise<HostListingRow[]> {
  const { listings, venues } = await targets(ctx);
  const pending = new Set((await repo.revisions.listPending()).filter((r) => r.hostId === ctx.host.id).map((r) => r.targetId));
  const [templates, cities, sessions, tickets, bookings, resources] = await Promise.all([
    repo.templates.list(),
    repo.cities.list(),
    repo.listings.sessions(listings.map((l) => l.id)),
    repo.listings.ticketTypes(listings.map((l) => l.id)),
    repo.bookings.listForTargets(listings.map((l) => l.id), venues.map((v) => v.id)),
    repo.venues.resources(venues.map((v) => v.id)),
  ]);
  const citySlug = (id: string) => cities.find((c) => c.id === id)?.slug ?? "";
  const rows: HostListingRow[] = [];
  for (const l of listings) {
    const tpl = templates.find((t) => t.id === l.templateId)!;
    const ls = sessions.filter((s) => s.listingId === l.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const lt = tickets.filter((t) => t.listingId === l.id);
    const lb = bookings.filter((b) => b.listingId === l.id && COUNTED.includes(b.status));
    const finite = lt.filter((t) => t.qty < 9999);
    const capacity = tpl.bookingMode === "none" ? 0 : finite.length ? finite.reduce((s, t) => s + t.qty, 0) : ls.reduce((s, x) => s + x.capacity, 0);
    const soldSeeded = finite.reduce((s, t) => s + t.sold, 0);
    const soldReal = lb.reduce((s, b) => s + b.items.reduce((a, i) => a + i.qty, 0), 0);
    const soldUnlimited = lb.reduce((s, b) => s + b.items.reduce((a, i) => a + i.qty, 0), 0);
    const sold = finite.length ? soldSeeded + soldReal : soldUnlimited;
    const next = ls.find((s) => new Date(s.endsAt) > now) ?? ls[ls.length - 1];
    const ended = l.status === "live" && ls.length > 0 && ls.every((s) => new Date(s.endsAt) <= now);
    rows.push({
      id: l.id,
      kind: "event",
      title: l.title,
      status: ended ? "ended" : l.status,
      whenLabel: next ? (ls.length > 1 ? `${formatWhen(next.startsAt, now)} · ${ls.length} dates` : formatWhen(next.startsAt, now)) : "No dates",
      templateName: tpl.name,
      sold,
      capacity,
      soldLabel: tpl.bookingMode === "none" ? "Free listing" : capacity ? `${sold} / ${capacity}` : `${sold}`,
      revenue: money(ctx, lb.reduce((s, b) => s + b.price.subtotal - b.price.discount, 0)),
      publicHref: l.status === "live" ? `/${citySlug(l.cityId)}/e/${l.slug}` : null,
      editHref: `/host/listings/${l.id}/edit`,
      reviewNote: l.reviewNote ?? null,
      pendingReview: pending.has(l.id),
    });
  }
  const today = istParts(now).ymd;
  const rules = await repo.venues.slotRules(resources.map((r) => r.id));
  for (const v of venues) {
    const vr = resources.filter((r) => r.venueId === v.id);
    const week = new Set(Array.from({ length: 7 }, (_, i) => addDays(today, i)));
    const vb = bookings.filter((b) => b.venueId === v.id && COUNTED.includes(b.status));
    const weekB = vb.filter((b) => week.has(fromISO(b.startsAt).ymd));
    // Bookable court-hours in the coming week, from each court's own opening hours.
    const weeklyHours = vr.reduce((sum, r) => {
      const rule = rules.find((x) => x.resourceId === r.id);
      return sum + (rule ? Math.max(0, rule.closeMins - rule.openMins) / 60 : 0) * 7;
    }, 0);
    rows.push({
      id: v.id,
      kind: "venue",
      title: v.name,
      status: v.status,
      whenLabel: `${vr.length} ${vr.length === 1 ? "court" : "courts"} · ${v.hoursLabel}`,
      templateName: templates.find((t) => t.id === v.templateId)?.name ?? "Court slots",
      sold: weekB.length,
      capacity: Math.round(weeklyHours),
      soldLabel: `${weekB.length} this week`,
      revenue: money(ctx, vb.reduce((s, b) => s + b.price.subtotal - b.price.discount, 0)),
      publicHref: v.status === "live" ? `/${citySlug(v.cityId)}/v/${v.slug}` : null,
      editHref: `/host/listings/${v.id}/edit`,
      reviewNote: v.reviewNote ?? null,
      pendingReview: pending.has(v.id),
    });
  }
  const order: Record<string, number> = { review: 0, draft: 1, live: 2, rejected: 3, ended: 4 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title));
}

export async function hostDashboard(ctx: HostContext, now = new Date()) {
  assertApproved(ctx);
  const { listings, venues } = await targets(ctx);
  const bookings = await repo.bookings.listForTargets(listings.map((l) => l.id), venues.map((v) => v.id));
  const counted = bookings.filter((b) => COUNTED.includes(b.status));
  const t = now.getTime();
  const today = istParts(now).ymd;
  const in7 = t + 7 * 86_400_000;
  const ago30 = t - 30 * 86_400_000;
  const upcoming = counted.filter((b) => new Date(b.startsAt).getTime() > t && new Date(b.startsAt).getTime() < in7);
  const todays = counted.filter((b) => fromISO(b.startsAt).ymd === today);
  const recent30 = counted.filter((b) => new Date(b.createdAt).getTime() > ago30);
  const gross = recent30.reduce((s, b) => s + b.price.subtotal - b.price.discount, 0);
  const payouts = ctx.isOwner ? await hostPayouts(ctx, now) : null;
  const rows = await listHostListings(ctx, now);
  const recent = [...bookings]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
    .map((b) => bookingRow(ctx, b, now));
  // Week-over-week (wireframe 19): bookings made, gross sales, listing views.
  const ago7 = t - 7 * 86_400_000;
  const ago14 = t - 14 * 86_400_000;
  const made = (from: number, to: number) => counted.filter((b) => new Date(b.createdAt).getTime() > from && new Date(b.createdAt).getTime() <= to);
  const thisWeek = made(ago7, t);
  const lastWeek = made(ago14, ago7);
  const sales = (list: typeof counted) => list.reduce((s, b) => s + b.price.subtotal - b.price.discount, 0);
  // Detail-page views, counted per listing per IST day.
  const viewed = [...listings.map((l) => l.id), ...venues.map((v) => v.id)];
  const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
  const [views, viewsPrev] = await Promise.all([
    repo.views.totals(viewed, addDays(today, -6), today),
    repo.views.totals(viewed, addDays(today, -13), addDays(today, -7)),
  ]);
  return {
    week: {
      bookings: thisWeek.length,
      bookingsTrend: pct(thisWeek.length, lastWeek.length),
      gross: money(ctx, sales(thisWeek)),
      grossTrend: ctx.isOwner ? pct(sales(thisWeek), sales(lastWeek)) : null,
      views,
      viewsTrend: pct(views, viewsPrev),
    },
    kpis: {
      upcomingBookings: upcoming.length,
      ticketsSold30d: recent30.reduce((s, b) => s + b.items.reduce((a, i) => a + i.qty, 0), 0),
      todayExpected: todays.length,
      todayCheckedIn: todays.filter((b) => b.status === "checked_in").length,
      grossSales30d: money(ctx, gross),
      nextPayout: payouts ? payouts.next : null,
    },
    listings: rows.slice(0, 8),
    pendingReview: rows.filter((r) => r.status === "review").length,
    recent,
  };
}

// ---------------------------------------------------------------------------
// Create / edit listings
// ---------------------------------------------------------------------------

const TEAM_FIELDS = [
  { id: "f_team", label: "Team name", type: "text" as const, required: true },
  { id: "f_members", label: "Team size", type: "select" as const, options: ["2", "3", "4", "5", "6"], required: true },
];

async function validateEvent(ctx: HostContext, input: EventListingInput, tpl: JourneyTemplate) {
  const cats = await repo.categories.list();
  const cat = cats.find((c) => c.id === input.categoryId && c.parentId === null);
  if (!cat) throw badRequest("Choose a category");
  if (input.subcategoryId && !cats.some((c) => c.id === input.subcategoryId && c.parentId === cat.id)) throw badRequest("Sub-category doesn't match the category");
  if (cat.slug === "sports") throw badRequest("Courts and turfs are listed as a venue, not an event");
  if (!tpl.allowedCategories.includes(cat.slug)) throw badRequest(`“${tpl.name}” isn't available for ${cat.name.toLowerCase()}`);
  if (tpl.bookingMode === "slot") throw badRequest("Pick an event booking type");
  const area = await repo.areas.byId(input.areaId);
  if (!area || area.cityId !== ctx.host.cityId) throw badRequest("Choose an area in your city");
  const n = input.sessions.length;
  if (["single"].includes(tpl.schedule) && n !== 1) throw badRequest("This booking type has exactly one date");
  if (["multi_day", "recurring"].includes(tpl.schedule) && n < 2) throw badRequest("Add at least two dates");
  const paidTickets = input.tickets.some((t) => t.price > 0);
  if (["ticketed", "registration"].includes(tpl.bookingMode) && input.tickets.length === 0) throw badRequest(tpl.bookingMode === "registration" ? "Add at least one division" : "Add at least one ticket type");
  if (paidTickets && tpl.pricing === "free") throw badRequest("This booking type is free. Remove the ticket prices.");
  if (paidTickets && ctx.host.kycStatus !== "verified") throw new ServiceError(403, "kyc_required", "You can sell paid tickets once your PAN and bank details are verified. You can publish free listings meanwhile.");
  for (const t of input.tickets) if (t.sessionIndex !== null && (t.sessionIndex < 0 || t.sessionIndex >= n)) throw badRequest(`“${t.name}” points at a date that doesn't exist`);
  return { cat, area };
}

function buildSessionsAndTickets(input: EventListingInput, tpl: JourneyTemplate, listingId: string, existing: { sessions: Session[]; tickets: TicketType[] }) {
  const sessions: Session[] = input.sessions.map((s, i) => ({
    id: s.id && existing.sessions.some((x) => x.id === s.id) ? s.id : rid("s"),
    listingId,
    startsAt: toISO(s.date, s.startMins),
    endsAt: toISO(s.date, s.endMins),
    capacity: s.capacity,
    label: s.label || (tpl.schedule === "multi_day" ? `Day ${i + 1}` : tpl.schedule === "recurring" ? `Batch ${i + 1}` : tpl.schedule === "date_range" ? `${formatMins(s.startMins, { compact: true })} – ${formatMins(s.endMins, { compact: true })}` : "Show"),
  }));
  let tickets: TicketType[] = [];
  if (tpl.bookingMode === "rsvp") {
    const cap = sessions[0].capacity || 50;
    const prev = existing.tickets[0];
    tickets = [{ id: prev?.id ?? rid("t"), listingId, sessionId: null, name: "Free RSVP", description: "", price: 0, qty: cap, sold: prev?.sold ?? 0, perOrderMax: 2, isPass: false }];
  } else if (tpl.bookingMode !== "none") {
    const unlimited = tpl.schedule === "recurring" || tpl.schedule === "date_range";
    tickets = input.tickets.map((t) => {
      const prev = t.id ? existing.tickets.find((x) => x.id === t.id) : undefined;
      return {
        id: prev?.id ?? rid("t"),
        listingId,
        sessionId: t.sessionIndex !== null ? sessions[t.sessionIndex].id : null,
        name: t.name,
        description: t.description,
        price: t.price,
        qty: unlimited ? 9999 : t.qty,
        sold: prev?.sold ?? 0,
        perOrderMax: tpl.bookingMode === "registration" ? 1 : Math.min(t.perOrderMax, tpl.rules.maxPerOrder),
        isPass: t.isPass,
      };
    });
    if (!unlimited) {
      // Session capacity follows the tickets on sale for it.
      for (const s of sessions) s.capacity = tickets.filter((t) => !t.isPass && (t.sessionId === null || t.sessionId === s.id)).reduce((a, t) => a + t.qty, 0);
    }
  }
  return { sessions, tickets };
}

async function assertNoOrphans(listingId: string, keepSessions: string[], keepTickets: string[]) {
  const active = (await repo.bookings.listForTargets([listingId], [])).filter((b) => ["held", "pending_payment", "confirmed", "requested"].includes(b.status));
  for (const b of active)
    for (const it of b.items) {
      if (it.sessionId && !keepSessions.includes(it.sessionId)) throw conflict("A date you removed already has bookings. Cancel those bookings first.", "has_bookings");
      if (it.ticketTypeId && !keepTickets.includes(it.ticketTypeId)) throw conflict("A ticket type you removed has already been sold.", "has_bookings");
    }
}

function nextStatus<T extends string>(current: T | null, submit: boolean): "draft" | "review" | "live" {
  // rejected → review on resubmit; the admin's note is cleared below
  if (current === "live") return "live"; // material edits to live listings are routed through revisions first
  return submit ? "review" : "draft";
}

class DryRun extends Error {}

/**
 * Save a listing or venue. Drafts and items in review are written directly. For a *live* item,
 * operational edits (dates, capacity, opening hours, things to know) apply straight away, while
 * material edits (what it is, where, photos, prices, ticket types, courts) are validated and stored
 * as a pending revision. The live version stays bookable until a superadmin approves the change.
 */
export async function saveListing(ctx: HostContext, input: ListingInput, submit: boolean, id?: string) {
  assertApproved(ctx);
  const live = id ? ((await repo.listings.byId(id)) ?? (await repo.venues.byId(id))) : null;
  if (id && live && live.hostId === ctx.host.id && live.status === "live") {
    input = { ...input, media: await storeImages(ctx.user.id, input.media) } as ListingInput;
    const current = (await listingInputFor(id, ctx.host.id)).input;
    if (materialFingerprint(current) !== materialFingerprint(input)) {
      // Validate exactly as a real save would, then roll it back.
      try {
        await repo.transaction(async () => {
          await applyListing(ctx, input, false, id);
          throw new DryRun();
        });
      } catch (e) {
        if (!(e instanceof DryRun)) throw e;
      }
      await repo.revisions.submit({
        id: rid("rev"),
        targetId: id,
        kind: input.kind,
        hostId: ctx.host.id,
        submittedBy: ctx.user.id,
        input,
        status: "pending",
        note: null,
        createdAt: new Date().toISOString(),
        decidedAt: null,
      });
      return { id, status: "live" as const, pendingReview: true };
    }
  }
  return { ...(await applyListing(ctx, input, submit, id)), pendingReview: false };
}

/** Write a listing/venue as given (no revision routing). Also used when a revision is approved. */
export function applyListing(ctx: HostContext, input: ListingInput, submit: boolean, id?: string) {
  return input.kind === "event" ? saveEvent(ctx, input, submit, id) : saveVenue(ctx, input, submit, id);
}

/** Everything about a listing that guests rely on when they book; operational fields are left out. */
function materialFingerprint(i: ListingInput) {
  if (i.kind === "event") {
    const { sessions: _s, thingsToKnow: _t, tickets, ...rest } = i;
    void _s;
    void _t;
    return JSON.stringify({ ...rest, tickets: tickets.map((t) => ({ id: t.id ?? null, name: t.name, description: t.description, price: t.price, isPass: t.isPass })) });
  }
  const { openMins: _o, closeMins: _c, advanceDays: _a, maxMins: _m, bufferMins: _b, thingsToKnow: _t, ...rest } = i;
  void [_o, _c, _a, _m, _b, _t];
  return JSON.stringify({ ...rest, courts: i.courts.map((c) => ({ ...c, id: c.id ?? null })) });
}

/** The host's pending edit for a live item, if any (shown in the editor and listings table). */
export async function pendingRevision(ctx: HostContext, id: string) {
  const r = await repo.revisions.pendingFor(id);
  return r && r.hostId === ctx.host.id ? r : null;
}

async function saveEvent(ctx: HostContext, input: EventListingInput, submit: boolean, id?: string) {
  const tpl = await repo.templates.byId(input.templateId);
  if (!tpl) throw badRequest("Unknown booking type");
  const { area } = await validateEvent(ctx, input, tpl);
  const existing = id ? await repo.listings.byId(id) : null;
  if (id && (!existing || existing.hostId !== ctx.host.id)) throw notFound("Listing not found");
  const listingId = existing?.id ?? rid("l");
  const [oldSessions, oldTickets] = existing ? await Promise.all([repo.listings.sessions([listingId]), repo.listings.ticketTypes([listingId])]) : [[], []];
  const { sessions, tickets } = buildSessionsAndTickets(input, tpl, listingId, { sessions: oldSessions, tickets: oldTickets });
  if (existing) await assertNoOrphans(listingId, sessions.map((s) => s.id), tickets.map((t) => t.id));
  const formFields = tpl.bookingMode === "registration" && !input.formFields.some((f) => f.id === "f_team") ? [...TEAM_FIELDS, ...input.formFields] : input.formFields;
  const base: Omit<Listing, "id" | "createdAt" | "featuredRank" | "slug"> = {
    hostId: ctx.host.id,
    cityId: ctx.host.cityId,
    areaId: input.areaId,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    templateId: tpl.id,
    title: input.title,
    summary: input.summary,
    description: input.description,
    media: await storeImages(ctx.user.id, input.media),
    venueName: input.venueName,
    address: input.address,
    lat: existing?.lat ?? area.lat + (Math.random() - 0.5) * 0.01,
    lng: existing?.lng ?? area.lng + (Math.random() - 0.5) * 0.01,
    ageLimit: input.ageLimit,
    languages: input.languages,
    tags: [],
    thingsToKnow: input.thingsToKnow,
    externalUrl: input.externalUrl || null,
    status: nextStatus(existing?.status ?? null, submit),
    formFields,
    reviewNote: submit ? null : existing?.reviewNote ?? null,
  };
  if (existing) await repo.listings.update(listingId, base);
  else
    await repo.listings.insert({
      ...base,
      id: listingId,
      slug: `${slugify(input.title)}-${Math.random().toString(36).slice(2, 6)}`,
      featuredRank: null,
      createdAt: new Date().toISOString(),
    });
  await repo.listings.replaceSessions(listingId, sessions);
  await repo.listings.replaceTicketTypes(listingId, tickets);
  return { id: listingId, status: base.status };
}

async function saveVenue(ctx: HostContext, input: VenueInput, submit: boolean, id?: string) {
  if (ctx.host.type !== "venue") throw badRequest("Only venue hosts can list courts");
  if (input.closeMins <= input.openMins) throw badRequest("Closing time must be after opening time");
  const paid = input.courts.some((c) => c.priceBase > 0 || c.pricePeak > 0);
  if (paid && ctx.host.kycStatus !== "verified") throw new ServiceError(403, "kyc_required", "You can take paid court bookings once your PAN and bank details are verified.");
  const area = await repo.areas.byId(input.areaId);
  if (!area || area.cityId !== ctx.host.cityId) throw badRequest("Choose an area in your city");
  const sportCats = (await repo.categories.list()).filter((c) => c.parentId === "cat_sports");
  for (const c of input.courts) if (!sportCats.some((s) => s.slug === c.sport)) throw badRequest(`Unknown sport for ${c.name}`);
  const existing = id ? await repo.venues.byId(id) : null;
  if (id && (!existing || existing.hostId !== ctx.host.id)) throw notFound("Venue not found");
  const venueId = existing?.id ?? rid("v");
  const oldRes = existing ? await repo.venues.resources([venueId]) : [];
  const resources: Resource[] = input.courts.map((c) => ({
    id: c.id && oldRes.some((r) => r.id === c.id) ? c.id : rid("r"),
    venueId,
    name: c.name,
    sport: c.sport,
    indoor: c.indoor,
    surface: c.surface,
    slotLengthMins: c.slotLengthMins,
    capacity: c.sport === "football" ? 14 : c.sport === "box-cricket" ? 12 : 4,
  }));
  if (existing) {
    const removed = oldRes.filter((r) => !resources.some((x) => x.id === r.id)).map((r) => r.id);
    const future = (await repo.bookings.listForTargets([], [venueId])).filter((b) => ["confirmed", "requested", "checked_in", "held", "pending_payment"].includes(b.status) && new Date(b.endsAt) > new Date());
    if (future.some((b) => b.items.some((i) => i.resourceId && removed.includes(i.resourceId)))) throw conflict("A court you removed has upcoming bookings.", "has_bookings");
  }
  const peak = [
    ...(input.peakWeekdayEvenings ? [{ days: [1, 2, 3, 4, 5], fromMins: 18 * 60, toMins: 22 * 60 }] : []),
    ...(input.peakWeekends ? [{ days: [0, 6], fromMins: 7 * 60, toMins: 22 * 60 }] : []),
  ];
  const rules: SlotRule[] = resources.map((r, i) => ({
    id: `sr_${r.id}`,
    resourceId: r.id,
    openMins: input.openMins,
    closeMins: input.closeMins,
    minMins: r.slotLengthMins,
    maxMins: Math.max(input.maxMins, r.slotLengthMins),
    bufferMins: input.bufferMins,
    advanceDays: input.advanceDays,
    priceBase: input.courts[i].priceBase,
    pricePeak: Math.max(input.courts[i].pricePeak, input.courts[i].priceBase),
    peak,
  }));
  const sports = [...new Set(input.courts.map((c) => c.sport))];
  const base: Omit<Venue, "id" | "slug" | "featuredRank"> = {
    hostId: ctx.host.id,
    cityId: ctx.host.cityId,
    areaId: input.areaId,
    templateId: input.templateId,
    name: input.name,
    summary: input.summary,
    description: input.description,
    media: await storeImages(ctx.user.id, input.media),
    address: input.address,
    lat: existing?.lat ?? area.lat,
    lng: existing?.lng ?? area.lng,
    amenities: input.amenities,
    hoursLabel: `${formatMins(input.openMins, { compact: true })} – ${formatMins(input.closeMins, { compact: true })}`,
    sports,
    thingsToKnow: input.thingsToKnow,
    status: nextStatus(existing?.status ?? null, submit) as Venue["status"],
    reviewNote: submit ? null : existing?.reviewNote ?? null,
  };
  if (existing) await repo.venues.update(venueId, base);
  else await repo.venues.insert({ ...base, id: venueId, slug: `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`, featuredRank: null });
  await repo.venues.replaceResources(venueId, resources, rules);
  return { id: venueId, status: base.status };
}

/** A listing or venue in the wizard's input shape, as it is live now. */
export async function listingInputFor(id: string, hostId: string): Promise<{ input: ListingInput; status: string }> {
  const l = await repo.listings.byId(id);
  if (l) {
    if (l.hostId !== hostId) throw notFound("Listing not found");
    const [sessions, tickets] = await Promise.all([repo.listings.sessions([id]), repo.listings.ticketTypes([id])]);
    const ss = sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const tpl = (await repo.templates.byId(l.templateId))!;
    return {
      status: l.status,
      input: {
        kind: "event",
        title: l.title,
        categoryId: l.categoryId,
        subcategoryId: l.subcategoryId,
        summary: l.summary,
        description: l.description,
        ageLimit: l.ageLimit,
        languages: l.languages,
        areaId: l.areaId,
        venueName: l.venueName,
        address: l.address,
        media: l.media,
        templateId: l.templateId,
        sessions: ss.map((s) => {
          const a = fromISO(s.startsAt);
          const b = fromISO(s.endsAt);
          return { id: s.id, date: a.ymd, startMins: a.mins, endMins: b.ymd === a.ymd ? b.mins : b.mins + 1440, capacity: s.capacity, label: s.label };
        }),
        tickets:
          tpl.bookingMode === "rsvp"
            ? []
            : tickets.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
                price: t.price,
                qty: t.qty >= 9999 ? 9999 : t.qty,
                perOrderMax: t.perOrderMax,
                isPass: t.isPass,
                sessionIndex: t.sessionId ? ss.findIndex((s) => s.id === t.sessionId) : null,
              })),
        thingsToKnow: l.thingsToKnow,
        formFields: l.formFields.filter((f) => !(tpl.bookingMode === "registration" && TEAM_FIELDS.some((x) => x.id === f.id))),
        externalUrl: l.externalUrl,
      },
    };
  }
  const v = await repo.venues.byId(id);
  if (!v || v.hostId !== hostId) throw notFound("Listing not found");
  const resources = await repo.venues.resources([id]);
  const rules = await repo.venues.slotRules(resources.map((r) => r.id));
  const r0 = rules[0];
  return {
    status: v.status,
    input: {
      kind: "venue",
      name: v.name,
      summary: v.summary,
      description: v.description,
      areaId: v.areaId,
      address: v.address,
      media: v.media,
      amenities: v.amenities,
      templateId: v.templateId as VenueInput["templateId"],
      courts: resources.map((r) => {
        const rule = rules.find((x) => x.resourceId === r.id)!;
        return { id: r.id, name: r.name, sport: r.sport, indoor: r.indoor, surface: r.surface, slotLengthMins: r.slotLengthMins as 30 | 60 | 90, priceBase: rule.priceBase, pricePeak: rule.pricePeak };
      }),
      openMins: r0?.openMins ?? 360,
      closeMins: r0?.closeMins ?? 1380,
      advanceDays: r0?.advanceDays ?? 14,
      maxMins: r0?.maxMins ?? 180,
      bufferMins: r0?.bufferMins ?? 0,
      peakWeekdayEvenings: !!r0?.peak.some((p) => p.days.includes(1)),
      peakWeekends: !!r0?.peak.some((p) => p.days.includes(0)),
      thingsToKnow: v.thingsToKnow,
    },
  };
}

/** Load a listing back into the wizard. A pending edit to a live listing is what the host keeps editing. */
export async function getListingInput(ctx: HostContext, id: string): Promise<{ input: ListingInput; status: string; pendingReview: boolean; revisionNote: string | null }> {
  const cur = await listingInputFor(id, ctx.host.id);
  const pending = await pendingRevision(ctx, id);
  const last = pending ? null : await repo.revisions.lastDecided(id);
  return { ...cur, input: pending?.input ?? cur.input, pendingReview: !!pending, revisionNote: last?.status === "rejected" ? last.note : null };
}

// ---------------------------------------------------------------------------
// Bookings & check-in
// ---------------------------------------------------------------------------

export async function hostBookings(
  ctx: HostContext,
  opts: { when?: "today" | "upcoming" | "past"; target?: string; q?: string; limit?: number },
  now = new Date(),
) {
  assertApproved(ctx);
  const { listings, venues } = await targets(ctx);
  const all = await repo.bookings.listForTargets(listings.map((l) => l.id), venues.map((v) => v.id));
  const t = now.getTime();
  const today = istParts(now).ymd;
  const when = opts.when ?? "upcoming";
  const q = opts.q?.trim().toLowerCase();
  const rows = all
    .filter((b) => !["held", "pending_payment", "expired", "failed"].includes(b.status))
    .filter((b) => !opts.target || b.listingId === opts.target || b.venueId === opts.target)
    .filter((b) => {
      const ymd = fromISO(b.startsAt).ymd;
      if (when === "today") return ymd === today || (fromISO(b.endsAt).ymd >= today && ymd <= today);
      if (when === "upcoming") return new Date(b.endsAt).getTime() > t;
      return new Date(b.endsAt).getTime() <= t;
    })
    .filter((b) => !q || b.code.toLowerCase().includes(q) || (b.attendee?.name ?? "").toLowerCase().includes(q) || (b.attendee?.phone ?? "").includes(q))
    .sort((a, b) => (when === "past" ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)));
  return {
    total: rows.length,
    items: rows.slice(0, opts.limit ?? 80).map((b) => bookingRow(ctx, b, now)),
    targets: [
      ...listings.filter((l) => l.status !== "draft").map((l) => ({ id: l.id, title: l.title })),
      ...venues.map((v) => ({ id: v.id, title: v.name })),
    ],
  };
}

export async function checkIn(ctx: HostContext, code: string, now = new Date()) {
  assertApproved(ctx);
  const b = await repo.bookings.byCode(code.trim().replace(/^LOCAL:/i, ""));
  const { listings, venues } = await targets(ctx);
  if (!b || !(listings.some((l) => l.id === b.listingId) || venues.some((v) => v.id === b.venueId))) throw notFound("No booking with that code for your listings");
  const row = () => bookingRow(ctx, b, now);
  if (b.status === "checked_in") return { result: "already" as const, booking: row(), message: `Already checked in${b.checkedInAt ? ` at ${formatMins(fromISO(b.checkedInAt).mins)}` : ""}` };
  if (b.status === "cancelled" || b.status === "refunded") return { result: "invalid" as const, booking: row(), message: "This booking was cancelled" };
  if (b.status !== "confirmed" && b.status !== "requested") return { result: "invalid" as const, booking: row(), message: "This booking isn't confirmed" };
  const start = new Date(b.startsAt).getTime();
  const end = new Date(b.endsAt).getTime();
  if (now.getTime() < start - 3 * 3_600_000) return { result: "early" as const, booking: row(), message: `This booking is for ${formatDate(fromISO(b.startsAt).ymd)}, ${formatMins(fromISO(b.startsAt).mins, { compact: true })}` };
  if (now.getTime() > end) return { result: "invalid" as const, booking: row(), message: "This booking has already ended" };
  await repo.bookings.update(b.id, { status: "checked_in", checkedInAt: now.toISOString() });
  return { result: "ok" as const, booking: { ...row(), status: "checked_in" as const }, message: `${b.items.reduce((s, i) => s + i.qty, 0)} admitted` };
}

// ---------------------------------------------------------------------------
// Court schedule & blocks
// ---------------------------------------------------------------------------

export async function venueSchedule(ctx: HostContext, venueId: string | undefined, date: string | undefined, now = new Date()) {
  assertApproved(ctx);
  const venues = await repo.venues.listByHost(ctx.host.id);
  if (!venues.length) return null;
  const venue = venues.find((v) => v.id === venueId) ?? venues[0];
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : istParts(now).ymd;
  const resources = await repo.venues.resources([venue.id]);
  const rules = await repo.venues.slotRules(resources.map((r) => r.id));
  const [taken, blocks, bookings] = await Promise.all([
    repo.venues.taken(resources.map((r) => r.id), day),
    repo.venues.blocks(resources.map((r) => r.id)),
    repo.bookings.listForTargets([], [venue.id]),
  ]);
  const dayBookings = bookings.filter((b) => fromISO(b.startsAt).ymd === day && COUNTED.concat(["held", "pending_payment"]).includes(b.status));
  return {
    venues: venues.map((v) => ({ id: v.id, name: v.name })),
    venueId: venue.id,
    date: day,
    dates: Array.from({ length: 14 }, (_, i) => addDays(istParts(now).ymd, i - 1)),
    resources: resources.map((r) => {
      const rule = rules.find((x) => x.resourceId === r.id)!;
      // Hosts see every slot of the day, including past ones and beyond the public window.
      const slots = generateSlots({ resourceId: r.id, slotLengthMins: r.slotLengthMins, rule: { ...rule, advanceDays: 60 }, date: day, taken, blocks, now: new Date(day + "T00:00:00+05:30") });
      return {
        resource: r,
        slots: slots.map((s) => {
          const b = dayBookings.find((x) => x.items.some((i) => i.resourceId === r.id && i.startsAt && fromISO(i.startsAt).mins <= s.startMins && fromISO(i.endsAt!).mins >= s.endMins));
          const blk = blocks.find((x) => x.resourceId === r.id && fromISO(x.startsAt).ymd === day && fromISO(x.startsAt).mins <= s.startMins && fromISO(x.endsAt).mins >= s.endMins);
          const isPast = new Date(s.startsAt).getTime() < now.getTime();
          return {
            startMins: s.startMins,
            endMins: s.endMins,
            price: money(ctx, s.price),
            peak: s.peak,
            status: s.status === "past" ? "available" : s.status,
            isPast,
            booking: b ? { code: b.code, customer: b.attendee?.name ?? "Guest", status: b.status } : null,
            block: blk ? { id: blk.id, reason: blk.reason } : null,
          };
        }),
      };
    }),
  };
}

export async function addBlock(ctx: HostContext, input: { resourceId: string; date: string; startMins: number; endMins: number; reason: string }) {
  assertApproved(ctx);
  const venues = await repo.venues.listByHost(ctx.host.id);
  const res = (await repo.venues.resources(venues.map((v) => v.id))).find((r) => r.id === input.resourceId);
  if (!res) throw notFound("Court not found");
  const sched = await venueSchedule(ctx, res.venueId, input.date);
  const slots = sched!.resources.find((r) => r.resource.id === res.id)!.slots.filter((s) => s.startMins >= input.startMins && s.endMins <= input.endMins);
  if (!slots.length) throw badRequest("Pick a time range");
  if (slots.some((s) => s.booking || s.status === "booked" || s.status === "held")) throw conflict("That time already has a booking");
  return repo.venues.insertBlock({ id: rid("b"), resourceId: res.id, startsAt: toISO(input.date, input.startMins), endsAt: toISO(input.date, input.endMins), reason: input.reason });
}

export async function removeBlock(ctx: HostContext, id: string) {
  assertApproved(ctx);
  const venues = await repo.venues.listByHost(ctx.host.id);
  const resources = await repo.venues.resources(venues.map((v) => v.id));
  const blocks = await repo.venues.blocks(resources.map((r) => r.id));
  if (!blocks.some((b) => b.id === id)) throw notFound("Block not found");
  await repo.venues.removeBlock(id);
}

// ---------------------------------------------------------------------------
// Payouts (owner only)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Team & settings (owner only)
// ---------------------------------------------------------------------------

export async function listTeam(ctx: HostContext) {
  assertOwner(ctx);
  return repo.members.listByHost(ctx.host.id);
}

export async function inviteMember(ctx: HostContext, phone: string, name?: string) {
  assertApproved(ctx);
  assertOwner(ctx);
  const team = await repo.members.listByHost(ctx.host.id);
  if (team.some((m) => m.phone === phone)) throw conflict("That number is already on your team");
  const user = await repo.users.byPhone(phone);
  return repo.members.insert({
    id: rid("hm"),
    hostId: ctx.host.id,
    userId: user?.id ?? null,
    phone,
    name: user?.name ?? name ?? null,
    role: "manager",
    status: user ? "active" : "invited",
    invitedBy: ctx.user.id,
    createdAt: new Date().toISOString(),
  });
}

export async function removeMember(ctx: HostContext, memberId: string) {
  assertOwner(ctx);
  const team = await repo.members.listByHost(ctx.host.id);
  const m = team.find((x) => x.id === memberId);
  if (!m) throw notFound("Member not found");
  if (m.role === "owner") throw badRequest("The owner can't be removed");
  await repo.members.remove(memberId);
}

export async function updateHostProfile(ctx: HostContext, patch: Partial<Pick<Host, "brandName" | "bio" | "instagram" | "email">>) {
  assertApproved(ctx);
  assertOwner(ctx);
  return repo.hosts.update(ctx.host.id, { ...patch, email: patch.email === "" ? null : patch.email ?? ctx.host.email });
}

/** Called after OTP login: turn pending invites for this phone into active memberships. */
export async function activateInvites(user: User) {
  for (const m of await repo.members.invitesForPhone(user.phone)) await repo.members.update(m.id, { userId: user.id, status: "active", name: user.name ?? m.name });
}
