import "server-only";
import { BookingStatusSchema } from "@/contracts";
import type {
  Booking, Category, CategoryInput, City, CityInput, Host, JourneyTemplate, Listing, TemplateInput, User, Venue,
} from "@/contracts";
import { repo } from "@/repositories";
import { addDays, formatDate, formatWhen, istParts } from "@/lib/time";
import { ServiceError, badRequest, conflict, notFound } from "./errors";

export const forbidden = () => new ServiceError(403, "forbidden", "Superadmins only");
export function assertAdmin(u: User | null): asserts u is User {
  if (!u || u.role !== "admin") throw forbidden();
}

const COUNTED: Booking["status"][] = ["confirmed", "checked_in", "requested"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** SQL narrows by created date with a day of margin (stored offsets vary); exact filtering happens here. */
const createdSince = (now: Date, days: number) => repo.bookings.listCreatedSince(new Date(now.getTime() - (days + 1) * 86_400_000).toISOString());

export async function adminOverview(now = new Date()) {
  const t = now.getTime();
  const ago30 = t - 30 * 86_400_000;
  const today = istParts(now).ymd;
  const [hosts, listings, venues, bookings, users, cities, bookingsToday] = await Promise.all([
    repo.hosts.list(),
    repo.listings.listAll(),
    repo.venues.listAll(),
    createdSince(now, 30),
    repo.users.count(),
    repo.cities.listAll(),
    repo.bookings.countStartingOn(today, COUNTED),
  ]);
  const counted = bookings.filter((b) => COUNTED.includes(b.status));
  const last30 = counted.filter((b) => new Date(b.createdAt).getTime() > ago30);
  const byCity = cities.map((c) => {
    const cb = last30.filter((b) => b.cityId === c.id);
    return { city: c.name, active: c.active, bookings: cb.length, gmv: r2(cb.reduce((s, b) => s + b.price.subtotal - b.price.discount, 0)) };
  });
  return {
    kpis: {
      gmv30: r2(last30.reduce((s, b) => s + b.price.subtotal - b.price.discount, 0)),
      fees30: r2(last30.reduce((s, b) => s + b.price.convenienceFee, 0)),
      bookings30: last30.length,
      bookingsToday,
      liveListings: listings.filter((l) => l.status === "live").length + venues.filter((v) => v.status === "live").length,
      approvedHosts: hosts.filter((h) => h.status === "approved").length,
      users,
    },
    queues: {
      applications: hosts.filter((h) => h.status === "pending").length,
      changes: hosts.filter((h) => h.status === "changes").length,
      listings: listings.filter((l) => l.status === "review").length + venues.filter((v) => v.status === "review").length,
      kyc: hosts.filter((h) => h.status === "approved" && h.kycStatus === "pending").length,
    },
    byCity,
    recentApplications: hosts
      .filter((h) => h.status === "pending")
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 5)
      .map((h) => ({ id: h.id, brandName: h.brandName, type: h.type, city: cities.find((c) => c.id === h.cityId)?.name ?? "", submittedAt: h.submittedAt })),
  };
}

export async function adminBadges() {
  const [hosts, listings, venues] = await Promise.all([repo.hosts.list(), repo.listings.listAll(), repo.venues.listAll()]);
  return {
    hosts: hosts.filter((h) => h.status === "pending" || (h.status === "approved" && h.kycStatus === "pending")).length,
    listings: listings.filter((l) => l.status === "review").length + venues.filter((v) => v.status === "review").length,
  };
}

// ---------------------------------------------------------------------------
// Host applications
// ---------------------------------------------------------------------------

export type HostTab = "pending" | "changes" | "approved" | "rejected" | "kyc";

export async function listApplications(tab: HostTab) {
  const [hosts, cities, members, listings, venues] = await Promise.all([
    repo.hosts.list(),
    repo.cities.listAll(),
    Promise.all((await repo.hosts.list()).map((h) => repo.members.listByHost(h.id))),
    repo.listings.listAll(),
    repo.venues.listAll(),
  ]);
  const rows = hosts
    .map((h, i) => ({ h, members: members[i] }))
    .filter(({ h }) => (tab === "kyc" ? h.status === "approved" && h.kycStatus === "pending" : h.status === tab))
    .sort((a, b) => b.h.submittedAt.localeCompare(a.h.submittedAt));
  const counts = {
    pending: hosts.filter((h) => h.status === "pending").length,
    changes: hosts.filter((h) => h.status === "changes").length,
    approved: hosts.filter((h) => h.status === "approved").length,
    rejected: hosts.filter((h) => h.status === "rejected").length,
    kyc: hosts.filter((h) => h.status === "approved" && h.kycStatus === "pending").length,
  };
  return {
    counts,
    items: rows.map(({ h, members }) => ({
      ...h,
      cityName: cities.find((c) => c.id === h.cityId)?.name ?? "",
      owner: members.find((m) => m.role === "owner") ?? null,
      teamSize: members.length,
      listingCount: listings.filter((l) => l.hostId === h.id).length + venues.filter((v) => v.hostId === h.id).length,
    })),
  };
}

function kycFrom(h: Host): Host["kycStatus"] {
  if (!h.wantsPaid && !h.documents.length) return "none";
  const ok = (k: string) => h.documents.some((d) => d.kind === k && d.status === "verified");
  return ok("pan") && ok("bank") ? "verified" : "pending";
}

export async function decideHost(hostId: string, decision: "approved" | "changes" | "rejected", note?: string) {
  const h = await repo.hosts.byId(hostId);
  if (!h) throw notFound("Host not found");
  if ((decision === "changes" || decision === "rejected") && !note) throw badRequest("Add a note so the applicant knows what to do");
  const patch: Partial<Host> = { status: decision, reviewNote: decision === "approved" ? null : note ?? null };
  if (decision === "approved") patch.kycStatus = kycFrom(h);
  return repo.hosts.update(hostId, patch);
}

export async function decideDocument(hostId: string, docId: string, status: "verified" | "rejected" | "uploaded") {
  const h = await repo.hosts.byId(hostId);
  if (!h) throw notFound("Host not found");
  if (!h.documents.some((d) => d.id === docId)) throw notFound("Document not found");
  const documents = h.documents.map((d) => (d.id === docId ? { ...d, status } : d));
  const next = { ...h, documents };
  return repo.hosts.update(hostId, { documents, kycStatus: h.status === "approved" || h.kycStatus !== "none" ? kycFrom(next) : h.kycStatus });
}

// ---------------------------------------------------------------------------
// Listing moderation & curation
// ---------------------------------------------------------------------------

export type ModerationTab = "review" | "live" | "rejected";

export interface ModerationRow {
  id: string;
  kind: "event" | "venue";
  title: string;
  hostName: string;
  hostKyc: string;
  cityName: string;
  citySlug: string;
  areaName: string;
  categoryLabel: string;
  templateName: string;
  summary: string;
  description: string;
  whenLabel: string;
  priceLabel: string;
  media: string[];
  status: string;
  featured: boolean;
  reviewNote: string | null;
  createdAt: string;
  publicHref: string | null;
  checks: { label: string; ok: boolean }[];
  details: [string, string][];
}

export async function listModeration(tab: ModerationTab, cityId?: string, now = new Date()) {
  const [listings, venues, hosts, cities, areas, cats, templates] = await Promise.all([
    repo.listings.listAll(),
    repo.venues.listAll(),
    repo.hosts.list(),
    repo.cities.listAll(),
    Promise.all((await repo.cities.listAll()).map((c) => repo.areas.listByCity(c.id))).then((x) => x.flat()),
    repo.categories.list(),
    repo.templates.list(),
  ]);
  const sessions = await repo.listings.sessions(listings.map((l) => l.id));
  const tickets = await repo.listings.ticketTypes(listings.map((l) => l.id));
  const resources = await repo.venues.resources(venues.map((v) => v.id));
  const rules = await repo.venues.slotRules(resources.map((r) => r.id));
  const city = (id: string) => cities.find((c) => c.id === id);
  const rows: ModerationRow[] = [];
  const match = (s: string) => (tab === "live" ? s === "live" : s === tab);

  for (const l of listings.filter((x) => match(x.status) && (!cityId || x.cityId === cityId))) {
    const host = hosts.find((h) => h.id === l.hostId)!;
    const tpl = templates.find((t) => t.id === l.templateId)!;
    const ls = sessions.filter((s) => s.listingId === l.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const lt = tickets.filter((t) => t.listingId === l.id);
    const prices = lt.map((t) => t.price);
    const paid = prices.some((p) => p > 0);
    const cat = cats.find((c) => c.id === l.categoryId);
    const upcoming = ls.filter((s) => new Date(s.endsAt) > now);
    rows.push({
      id: l.id,
      kind: "event",
      title: l.title,
      hostName: host?.brandName ?? "—",
      hostKyc: host?.kycStatus ?? "none",
      cityName: city(l.cityId)?.name ?? "",
      citySlug: city(l.cityId)?.slug ?? "",
      areaName: areas.find((a) => a.id === l.areaId)?.name ?? "",
      categoryLabel: [cat?.name, cats.find((c) => c.id === l.subcategoryId)?.name].filter(Boolean).join(" · "),
      templateName: tpl?.name ?? l.templateId,
      summary: l.summary,
      description: l.description,
      whenLabel: upcoming[0] ? `${formatWhen(upcoming[0].startsAt, now)}${ls.length > 1 ? ` · ${ls.length} dates` : ""}` : "No upcoming dates",
      priceLabel: !prices.length || !paid ? "Free" : `₹${Math.min(...prices)}–₹${Math.max(...prices)}`,
      media: l.media,
      status: l.status,
      featured: l.featuredRank !== null,
      reviewNote: l.reviewNote ?? null,
      createdAt: l.createdAt,
      publicHref: l.status === "live" ? `/${city(l.cityId)?.slug}/e/${l.slug}` : null,
      checks: [
        { label: "Host approved", ok: host?.status === "approved" },
        { label: paid ? "Paid tickets: host KYC verified" : "Free listing (no KYC needed)", ok: !paid || host?.kycStatus === "verified" },
        { label: "Has upcoming dates", ok: upcoming.length > 0 },
        { label: "Booking type allowed for category", ok: !!cat && !!tpl && tpl.allowedCategories.includes(cat.slug) },
        { label: "Description is detailed (100+ characters)", ok: l.description.length >= 100 },
        { label: "Has photos", ok: l.media.length > 0 },
      ],
      details: [
        ["Venue", `${l.venueName}, ${areas.find((a) => a.id === l.areaId)?.name ?? ""}`],
        ["Address", l.address],
        ["Tickets", lt.length ? lt.map((t) => `${t.name} ₹${t.price}${t.qty < 9999 ? ` × ${t.qty}` : ""}`).join(", ") : "—"],
        ["Age · language", `${l.ageLimit} · ${l.languages.join(", ")}`],
        ["Questions", l.formFields.map((f) => f.label).join(", ") || "—"],
      ],
    });
  }
  for (const v of venues.filter((x) => match(x.status) && (!cityId || x.cityId === cityId))) {
    const host = hosts.find((h) => h.id === v.hostId)!;
    const vr = resources.filter((r) => r.venueId === v.id);
    const vrules = rules.filter((r) => vr.some((x) => x.id === r.resourceId));
    const prices = vrules.map((r) => r.priceBase);
    const paid = vrules.some((r) => r.priceBase > 0);
    rows.push({
      id: v.id,
      kind: "venue",
      title: v.name,
      hostName: host?.brandName ?? "—",
      hostKyc: host?.kycStatus ?? "none",
      cityName: city(v.cityId)?.name ?? "",
      citySlug: city(v.cityId)?.slug ?? "",
      areaName: areas.find((a) => a.id === v.areaId)?.name ?? "",
      categoryLabel: `Sports · ${v.sports.join(", ")}`,
      templateName: v.templateId === "tpl_court_30" ? "Court slots — 30 min" : "Court slots — hourly",
      summary: v.summary,
      description: v.description,
      whenLabel: `${vr.length} courts · ${v.hoursLabel}`,
      priceLabel: prices.length ? `₹${Math.min(...prices)}+/hr` : "—",
      media: v.media,
      status: v.status,
      featured: v.featuredRank !== null,
      reviewNote: v.reviewNote ?? null,
      createdAt: "",
      publicHref: v.status === "live" ? `/${city(v.cityId)?.slug}/v/${v.slug}` : null,
      checks: [
        { label: "Host approved", ok: host?.status === "approved" },
        { label: paid ? "Paid slots: host KYC verified" : "Free courts", ok: !paid || host?.kycStatus === "verified" },
        { label: "At least one court", ok: vr.length > 0 },
        { label: "Description is detailed (100+ characters)", ok: v.description.length >= 100 },
        { label: "Has photos", ok: v.media.length > 0 },
      ],
      details: [
        ["Address", v.address],
        ["Courts", vr.map((r) => `${r.name} (${r.sport}, ${r.slotLengthMins}m)`).join(", ")],
        ["Amenities", v.amenities.join(", ") || "—"],
      ],
    });
  }
  const order = (r: ModerationRow) => (tab === "live" ? (r.featured ? 0 : 1) : 0);
  rows.sort((a, b) => order(a) - order(b) || b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title));
  const all = [...listings, ...venues];
  return {
    counts: { review: all.filter((x) => x.status === "review").length, live: all.filter((x) => x.status === "live").length, rejected: all.filter((x) => x.status === "rejected").length },
    cities: cities.map((c) => ({ id: c.id, name: c.name })),
    items: rows.slice(0, 120),
    total: rows.length,
  };
}

async function findTarget(id: string): Promise<{ kind: "event"; item: Listing } | { kind: "venue"; item: Venue }> {
  const l = await repo.listings.byId(id);
  if (l) return { kind: "event", item: l };
  const v = await repo.venues.byId(id);
  if (v) return { kind: "venue", item: v };
  throw notFound("Listing not found");
}

export async function decideListing(id: string, decision: "approve" | "reject", note?: string) {
  const t = await findTarget(id);
  if (decision === "reject" && !note) throw badRequest("Tell the host what to fix");
  if (decision === "approve") {
    const host = await repo.hosts.byId(t.item.hostId);
    if (host?.status !== "approved") throw conflict("The host isn't approved yet");
    const paid =
      t.kind === "event"
        ? (await repo.listings.ticketTypes([id])).some((x) => x.price > 0)
        : (await repo.venues.slotRules((await repo.venues.resources([id])).map((r) => r.id))).some((r) => r.priceBase > 0);
    if (paid && host.kycStatus !== "verified") throw conflict("This listing sells tickets but the host's KYC isn't verified");
  }
  const patch = { status: decision === "approve" ? ("live" as const) : ("rejected" as const), reviewNote: decision === "reject" ? note! : null };
  return t.kind === "event" ? repo.listings.update(id, patch) : repo.venues.update(id, patch);
}

/** Homepage curation: featured items get ranks in their city, newest feature last. */
export async function setFeatured(id: string, featured: boolean) {
  const t = await findTarget(id);
  if (t.item.status !== "live") throw conflict("Only live listings can be featured");
  if (!featured) return t.kind === "event" ? repo.listings.update(id, { featuredRank: null }) : repo.venues.update(id, { featuredRank: null });
  const peers = t.kind === "event" ? (await repo.listings.listAll()).filter((l) => l.cityId === t.item.cityId) : (await repo.venues.listAll()).filter((v) => v.cityId === t.item.cityId);
  const max = Math.max(0, ...peers.map((p) => p.featuredRank ?? 0));
  if (t.kind === "event" && peers.filter((p) => p.featuredRank !== null).length >= 8) throw conflict("A city can feature up to 8 events. Unfeature one first.");
  return t.kind === "event" ? repo.listings.update(id, { featuredRank: max + 1 }) : repo.venues.update(id, { featuredRank: max + 1 });
}

// ---------------------------------------------------------------------------
// Journey templates
// ---------------------------------------------------------------------------

import { templateErrors } from "@/lib/journey-rules";
export { templateErrors };

export async function listTemplates() {
  const [templates, listings, venues] = await Promise.all([repo.templates.list(), repo.listings.listAll(), repo.venues.listAll()]);
  return templates.map((t) => ({
    ...t,
    usage: listings.filter((l) => l.templateId === t.id).length + venues.filter((v) => v.templateId === t.id).length,
    liveUsage: listings.filter((l) => l.templateId === t.id && l.status === "live").length + venues.filter((v) => v.templateId === t.id && v.status === "live").length,
  }));
}

export async function saveTemplate(input: TemplateInput, id?: string) {
  const errs = templateErrors(input);
  if (errs.length) throw new ServiceError(422, "invalid_template", errs[0]);
  if (id) {
    const existing = await repo.templates.byId(id);
    if (!existing) throw notFound("Template not found");
    if (existing.bookingMode !== input.bookingMode) {
      const used = (await listTemplates()).find((t) => t.id === id)!.usage;
      if (used) throw conflict(`Booking mode can't change while ${used} listings use this template. Create a new template instead.`);
    }
    return repo.templates.update(id, input);
  }
  const t: JourneyTemplate = { ...input, id: `tpl_${slugify(input.name).slice(0, 24)}_${Math.random().toString(36).slice(2, 5)}` };
  return repo.templates.insert(t);
}

// ---------------------------------------------------------------------------
// Categories, cities, areas
// ---------------------------------------------------------------------------

export async function categoryTreeWithUsage() {
  const [cats, listings, venues] = await Promise.all([repo.categories.list(), repo.listings.listAll(), repo.venues.listAll()]);
  const usage = (c: Category) =>
    c.parentId === null
      ? listings.filter((l) => l.categoryId === c.id).length + (c.slug === "sports" ? venues.length : 0)
      : listings.filter((l) => l.subcategoryId === c.id).length + (c.parentId === "cat_sports" ? venues.filter((v) => v.sports.includes(c.slug)).length : 0);
  return cats.filter((c) => c.parentId === null).map((c) => ({ ...c, usage: usage(c), children: cats.filter((s) => s.parentId === c.id).map((s) => ({ ...s, usage: usage(s) })) }));
}

export async function saveCategory(input: CategoryInput, id?: string) {
  const cats = await repo.categories.list();
  const clash = cats.find((c) => c.slug === input.slug && c.parentId === input.parentId && c.id !== id);
  if (clash) throw conflict("That slug is already used at this level");
  if (input.parentId && !cats.some((c) => c.id === input.parentId && c.parentId === null)) throw badRequest("Parent must be a top-level category");
  if (id) {
    const c = cats.find((x) => x.id === id);
    if (!c) throw notFound("Category not found");
    if (c.slug !== input.slug && ["sports"].includes(c.slug)) throw conflict("The sports category slug is used by the slot engine and can't change");
    return repo.categories.update(id, { ...input, singular: input.singular || input.name });
  }
  const siblings = cats.filter((c) => c.parentId === input.parentId);
  return repo.categories.insert({
    id: input.parentId ? `${input.parentId}_${input.slug}` : `cat_${input.slug}`,
    slug: input.slug,
    name: input.name,
    singular: input.singular || input.name,
    parentId: input.parentId,
    icon: input.icon,
    sort: input.sort ?? siblings.length,
    blurb: input.blurb,
  });
}

export async function deleteCategory(id: string) {
  const tree = await categoryTreeWithUsage();
  const flat = tree.flatMap((c) => [c, ...c.children]);
  const c = flat.find((x) => x.id === id);
  if (!c) throw notFound("Category not found");
  if (c.usage > 0) throw conflict(`${c.usage} listings use “${c.name}”. Move them first.`);
  if (c.parentId === null && (c as (typeof tree)[number]).children?.length) throw conflict("Delete its sub-categories first");
  await repo.categories.remove(id);
}

export async function citiesWithStats() {
  const [cities, listings, venues, hosts] = await Promise.all([repo.cities.listAll(), repo.listings.listAll(), repo.venues.listAll(), repo.hosts.list()]);
  return Promise.all(
    cities.map(async (c) => {
      const areas = await repo.areas.listByCity(c.id);
      return {
        ...c,
        listings: listings.filter((l) => l.cityId === c.id && l.status === "live").length + venues.filter((v) => v.cityId === c.id && v.status === "live").length,
        hosts: hosts.filter((h) => h.cityId === c.id && h.status === "approved").length,
        areas: areas.map((a) => ({ ...a, usage: listings.filter((l) => l.areaId === a.id).length + venues.filter((v) => v.areaId === a.id).length })),
      };
    }),
  );
}

export async function saveCity(input: CityInput, id?: string): Promise<City | null> {
  const all = await repo.cities.listAll();
  if (all.some((c) => c.slug === input.slug && c.id !== id)) throw conflict("Another city uses that slug");
  const reserved = ["login", "onboarding", "city", "me", "book", "host", "admin", "api", "search"];
  if (reserved.includes(input.slug)) throw badRequest("That slug is reserved");
  if (id) {
    const c = all.find((x) => x.id === id);
    if (!c) throw notFound("City not found");
    if (c.slug !== input.slug && c.active) throw conflict("Deactivate the city before changing its URL slug");
    if (!input.active && all.filter((x) => x.active && x.id !== id).length === 0) throw conflict("At least one city must stay active");
    return repo.cities.update(id, input);
  }
  return repo.cities.insert({ ...input, id: `c_${input.slug}` });
}

export async function saveArea(input: { cityId: string; name: string; lat: number; lng: number }, id?: string) {
  const city = await repo.cities.byId(input.cityId);
  if (!city) throw notFound("City not found");
  const slug = slugify(input.name);
  const areas = await repo.areas.listByCity(input.cityId);
  if (areas.some((a) => a.slug === slug && a.id !== id)) throw conflict("That area already exists");
  if (id) return repo.areas.update(id, { name: input.name, slug, lat: input.lat, lng: input.lng });
  return repo.areas.insert({ id: `a_${city.slug}_${slug}`, cityId: city.id, slug, name: input.name, lat: input.lat, lng: input.lng });
}

export async function deleteArea(id: string) {
  const [listings, venues] = await Promise.all([repo.listings.listAll(), repo.venues.listAll()]);
  const used = listings.filter((l) => l.areaId === id).length + venues.filter((v) => v.areaId === id).length;
  if (used) throw conflict(`${used} listings are in this area`);
  await repo.areas.remove(id);
}

// ---------------------------------------------------------------------------
// Bookings & refunds
// ---------------------------------------------------------------------------

const UNPAID: Booking["status"][] = ["held", "pending_payment", "expired", "failed"];

export async function adminBookings(opts: { q?: string; status?: string; cityId?: string; page?: number }) {
  const size = 40;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const status = BookingStatusSchema.safeParse(opts.status);
  const [{ total, items }, cities] = await Promise.all([
    repo.bookings.search({
      q: opts.q?.slice(0, 80),
      statuses: status.success ? [status.data] : undefined,
      excludeStatuses: UNPAID,
      cityId: opts.cityId || undefined,
      offset: (page - 1) * size,
      limit: size,
    }),
    repo.cities.listAll(),
  ]);
  const users = new Map((await Promise.all([...new Set(items.map((b) => b.userId))].map((id) => repo.users.byId(id)))).filter((u) => !!u).map((u) => [u!.id, u!]));
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / size)),
    cities: cities.map((c) => ({ id: c.id, name: c.name })),
    items: items.map((b) => ({
      id: b.id,
      code: b.code,
      title: b.title,
      venueName: b.venueName,
      customer: b.attendee?.name ?? users.get(b.userId)?.name ?? "Guest",
      phone: b.attendee?.phone ?? users.get(b.userId)?.phone ?? "",
      city: cities.find((c) => c.id === b.cityId)?.name ?? "",
      startsAt: b.startsAt,
      createdAt: b.createdAt,
      status: b.status,
      qty: b.items.reduce((s, i) => s + i.qty, 0),
      total: b.price.total,
      ticketValue: r2(b.price.subtotal - b.price.discount),
      fees: r2(b.price.convenienceFee + b.price.gstOnFee),
      paymentRef: b.paymentRef,
      seeded: !!b.seeded,
    })),
  };
}

/** Support override: cancel any confirmed booking with a chosen refund of the ticket value. */
export async function adminRefund(id: string, refundPct: 0 | 50 | 100) {
  const b = await repo.bookings.byId(id);
  if (!b) throw notFound("Booking not found");
  if (!["confirmed", "requested", "checked_in"].includes(b.status)) throw conflict("Only confirmed bookings can be cancelled");
  const amount = r2(((b.price.subtotal - b.price.discount) * refundPct) / 100);
  await repo.bookings.update(id, { status: amount > 0 ? "refunded" : "cancelled" });
  return { refundAmount: amount };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function adminUsers(q?: string) {
  const [users, counts, cities] = await Promise.all([repo.users.list(), repo.bookings.countByUser(UNPAID), repo.cities.listAll()]);
  const needle = q?.trim().toLowerCase();
  const rows = await Promise.all(
    users
      .filter((u) => !needle || [u.name, u.phone].some((x) => x?.toLowerCase().includes(needle)))
      .map(async (u) => {
        const ms = await repo.members.listByUser(u.id);
        const hosts = await Promise.all(ms.map((m) => repo.hosts.byId(m.hostId)));
        return {
          id: u.id,
          name: u.name,
          phone: u.phone,
          role: u.role,
          city: cities.find((c) => c.id === u.cityId)?.name ?? "—",
          createdAt: u.createdAt,
          bookings: counts.get(u.id) ?? 0,
          hostRoles: ms.map((m, i) => `${hosts[i]?.brandName ?? "?"} (${m.role})`),
        };
      }),
  );
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function setUserRole(actor: User, id: string, role: "user" | "admin") {
  if (actor.id === id && role !== "admin") throw conflict("You can't remove your own admin access");
  const u = await repo.users.byId(id);
  if (!u) throw notFound("User not found");
  return repo.users.update(id, { role });
}

// ---------------------------------------------------------------------------
// Payouts & fees (platform view of the weekly host payout cycle, same rules as the host console)
// ---------------------------------------------------------------------------

const PAYOUT_COUNTED: Booking["status"][] = ["confirmed", "checked_in", "requested", "refunded", "cancelled"];

export async function adminPayouts(now = new Date()) {
  // Two weekly cycles back from this Monday, plus margin.
  const [hosts, listings, venues, bookings, templates, cities] = await Promise.all([
    repo.hosts.list(),
    repo.listings.listAll(),
    repo.venues.listAll(),
    createdSince(now, 15),
    repo.templates.list(),
    repo.cities.list(),
  ]);
  const today = istParts(now).ymd;
  const wd = new Date(today + "T00:00:00Z").getUTCDay();
  const monday = addDays(today, -((wd + 6) % 7));
  const cycle = (from: string) => ({ from, to: addDays(from, 6), payoutDate: addDays(from, 9) });
  const current = cycle(monday);
  const previous = cycle(addDays(monday, -7));
  const sum = (list: Booking[], from: string, to: string) => {
    const inCycle = list.filter((b) => {
      const d = istParts(new Date(b.createdAt)).ymd;
      return d >= from && d <= to && PAYOUT_COUNTED.includes(b.status);
    });
    const gross = inCycle.reduce((s, b) => s + b.price.subtotal - b.price.discount, 0);
    const refunds = inCycle.filter((b) => b.status === "refunded").reduce((s, b) => s + b.price.subtotal - b.price.discount, 0);
    const fees = inCycle.filter((b) => b.status !== "refunded").reduce((s, b) => s + b.price.convenienceFee + b.price.gstOnFee, 0);
    return { bookings: inCycle.length, gross: round2(gross), refunds: round2(refunds), net: round2(gross - refunds), fees: round2(fees) };
  };
  const rows = hosts
    .filter((h) => h.status === "approved")
    .map((h) => {
      const lids = new Set(listings.filter((l) => l.hostId === h.id).map((l) => l.id));
      const vids = new Set(venues.filter((v) => v.hostId === h.id).map((v) => v.id));
      const mine = bookings.filter((b) => (b.listingId && lids.has(b.listingId)) || (b.venueId && vids.has(b.venueId)));
      return {
        id: h.id,
        brandName: h.brandName,
        city: cities.find((c) => c.id === h.cityId)?.name ?? "",
        kycStatus: h.kycStatus,
        current: sum(mine, current.from, current.to),
        previous: sum(mine, previous.from, previous.to),
      };
    })
    .filter((r) => r.current.bookings + r.previous.bookings > 0)
    .sort((a, b) => b.current.net - a.current.net);
  const label = (c: { from: string; to: string }) => `${formatDate(c.from).split(", ")[1]} – ${formatDate(c.to).split(", ")[1]}`;
  return {
    current: { ...current, label: label(current), net: round2(rows.reduce((s, r) => s + r.current.net, 0)), fees: round2(rows.reduce((s, r) => s + r.current.fees, 0)) },
    previous: { ...previous, label: label(previous), net: round2(rows.reduce((s, r) => s + r.previous.net, 0)), paid: previous.payoutDate <= today },
    rows,
    fees: templates.map((t) => ({ id: t.id, name: t.name, pricing: t.pricing, ...t.fees })),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Homepage & banners: what each city's home leads with
// ---------------------------------------------------------------------------

export async function homepageCuration(cityId: string, now = new Date()) {
  const [listings, venues, cats] = await Promise.all([repo.listings.listAll(), repo.venues.listAll(), repo.categories.list()]);
  const live = listings.filter((l) => l.cityId === cityId && l.status === "live");
  const sessions = await repo.listings.sessions(live.map((l) => l.id));
  const upcoming = live.filter((l) => sessions.some((s) => s.listingId === l.id && new Date(s.endsAt) > now));
  const toRow = (l: Listing) => {
    const next = sessions.filter((s) => s.listingId === l.id && new Date(s.endsAt) > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    return { id: l.id, title: l.title, category: cats.find((c) => c.id === l.categoryId)?.name ?? "", when: next ? formatWhen(next.startsAt, now) : "", rank: l.featuredRank, media: l.media };
  };
  return {
    featured: upcoming.filter((l) => l.featuredRank !== null).sort((a, b) => a.featuredRank! - b.featuredRank!).map(toRow),
    candidates: upcoming.filter((l) => l.featuredRank === null).map(toRow),
    venues: venues.filter((v) => v.cityId === cityId && v.status === "live").map((v) => ({ id: v.id, name: v.name, rank: v.featuredRank })),
  };
}

/** Move a featured event up or down within its city. */
export async function moveFeatured(id: string, dir: -1 | 1) {
  const l = await repo.listings.byId(id);
  if (!l || l.featuredRank === null) throw notFound("Not featured");
  const peers = (await repo.listings.listAll()).filter((x) => x.cityId === l.cityId && x.featuredRank !== null).sort((a, b) => a.featuredRank! - b.featuredRank!);
  const i = peers.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= peers.length) return l;
  const order = [...peers];
  [order[i], order[j]] = [order[j], order[i]];
  await Promise.all(order.map((x, k) => repo.listings.update(x.id, { featuredRank: k + 1 })));
  return repo.listings.byId(id);
}
