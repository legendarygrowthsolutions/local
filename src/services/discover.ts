import "server-only";
import { isPublic } from "./visibility";
import type { CardKind, City, HomePayload, HomeRail, ListingCard, ListingDetail, Paginated, User, VenueDetail } from "@/contracts";
import { repo } from "@/repositories";
import { addDays, fromISO, todayIST, weekdayOf } from "@/lib/time";
import { listingCard, venueCard, type CardContext } from "./cards";
import { loadInventory } from "./inventory";
import { notFound } from "./errors";

export type WhenFilter = "today" | "tomorrow" | "weekend" | "week" | (string & {});
export type PriceFilter = "free" | "under-500" | "500-1500" | "1500-plus";
export type SortKey = "relevance" | "soonest" | "price-low" | "price-high" | "newest";

export type SearchResult = Paginated<ListingCard> & { facets: { event: number; venue: number } };

export interface SearchParams {
  city: string;
  category?: string;
  sub?: string;
  when?: WhenFilter;
  price?: PriceFilter;
  area?: string;
  sort?: SortKey;
  q?: string;
  /** "event" | "venue": the search screen's All / Events / Courts tabs */
  kind?: CardKind;
  /** Price range in rupees (inclusive); free listings count as ₹0 */
  min?: number;
  max?: number;
  page?: number;
  pageSize?: number;
}

async function cityOr404(slug: string): Promise<City> {
  const c = await repo.cities.bySlug(slug);
  if (!c || !c.active) throw notFound("City not found");
  return c;
}

async function cardContext(city: City): Promise<CardContext> {
  const [categories, areas, templates] = await Promise.all([
    repo.categories.list(),
    repo.areas.listByCity(city.id),
    repo.templates.list(),
  ]);
  return { citySlug: city.slug, categories, areas, templates };
}

/** Every bookable thing in a city as cards, with the dates each one runs on. */
async function allCards(city: City, now = new Date()) {
  const ctx = await cardContext(city);
  const [allListings, allVenues, hosts] = await Promise.all([repo.listings.listLive(city.id), repo.venues.listLive(city.id), repo.hosts.list()]);
  // Suspended hosts' listings disappear from discovery.
  const approved = new Set(hosts.filter((h) => h.status === "approved").map((h) => h.id));
  const listings = allListings.filter((l) => approved.has(l.hostId));
  const venues = allVenues.filter((v) => approved.has(v.hostId));
  const inv = await loadInventory(listings, now);
  const resources = await repo.venues.resources(venues.map((v) => v.id));
  const rules = await repo.venues.slotRules(resources.map((r) => r.id));

  const entries: { card: ListingCard; dates: Set<string> | "always"; featuredRank: number | null; createdAt: string; text: string; areaSlug: string; subSlugs: string[] }[] = [];
  for (const l of listings) {
    const i = inv.get(l.id)!;
    const card = listingCard(l, i, ctx, now);
    if (!card) continue;
    const sub = ctx.categories.find((c) => c.id === l.subcategoryId);
    entries.push({
      card,
      dates: new Set(i.upcoming.map((s) => fromISO(s.startsAt).ymd)),
      featuredRank: l.featuredRank,
      createdAt: l.createdAt,
      text: [l.title, l.summary, l.venueName, card.areaName, card.categoryLabel, sub?.name ?? "", ...l.tags].join(" ").toLowerCase(),
      areaSlug: ctx.areas.find((a) => a.id === l.areaId)?.slug ?? "",
      subSlugs: sub ? [sub.slug] : [],
    });
  }
  for (const v of venues) {
    const card = venueCard(v, resources, rules, ctx, now);
    entries.push({
      card,
      dates: "always",
      featuredRank: v.featuredRank,
      createdAt: "2026-01-01",
      text: [v.name, v.summary, card.areaName, "sports", "court", "turf", ...v.sports].join(" ").toLowerCase(),
      areaSlug: ctx.areas.find((a) => a.id === v.areaId)?.slug ?? "",
      subSlugs: v.sports,
    });
  }
  return { entries, ctx };
}

function datesFor(when: WhenFilter | undefined, now = new Date()): Set<string> | null {
  if (!when) return null;
  const today = todayIST(now);
  if (when === "today") return new Set([today]);
  if (when === "tomorrow") return new Set([addDays(today, 1)]);
  if (when === "week") return new Set(Array.from({ length: 7 }, (_, i) => addDays(today, i)));
  if (when === "weekend") {
    const out = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      const wd = weekdayOf(d);
      if (wd === 6 || wd === 0 || (wd === 5 && i < 6)) out.add(d);
    }
    return out;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) return new Set([when]);
  return null;
}

function priceMatch(card: ListingCard, price?: PriceFilter) {
  if (!price) return true;
  const p = card.priceFrom;
  switch (price) {
    case "free":
      return p === null;
    case "under-500":
      return p === null || p < 500;
    case "500-1500":
      return p !== null && p >= 500 && p <= 1500;
    case "1500-plus":
      return p !== null && p > 1500;
  }
}

export async function searchListings(params: SearchParams, now = new Date()): Promise<SearchResult> {
  const city = await cityOr404(params.city);
  const { entries } = await allCards(city, now);
  const dates = datesFor(params.when, now);
  const q = params.q?.trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];

  let rows = entries.filter((e) => {
    if (params.category && e.card.categorySlug !== params.category) return false;
    if (params.sub && !e.subSlugs.includes(params.sub)) return false;
    if (params.area && e.areaSlug !== params.area) return false;
    if (dates && e.dates !== "always" && ![...e.dates].some((d) => dates.has(d))) return false;
    if (!priceMatch(e.card, params.price)) return false;
    const p = e.card.priceFrom ?? 0;
    if (params.min !== undefined && p < params.min) return false;
    if (params.max !== undefined && p > params.max) return false;
    if (terms.length && !terms.every((t) => e.text.includes(t))) return false;
    return true;
  });
  // Tab counts ignore the kind filter itself.
  const facets = { event: rows.filter((r) => r.card.kind === "event").length, venue: rows.filter((r) => r.card.kind === "venue").length };
  if (params.kind) rows = rows.filter((r) => r.card.kind === params.kind);

  const sort = params.sort ?? "relevance";
  const soon = (c: ListingCard) => c.startsAt ?? "9999";
  const price = (c: ListingCard) => c.priceFrom ?? 0;
  rows = rows.sort((a, b) => {
    switch (sort) {
      case "soonest":
        return soon(a.card).localeCompare(soon(b.card));
      case "price-low":
        return price(a.card) - price(b.card);
      case "price-high":
        return price(b.card) - price(a.card);
      case "newest":
        return b.createdAt.localeCompare(a.createdAt);
      default: {
        const fa = a.featuredRank ?? 99;
        const fb = b.featuredRank ?? 99;
        if (fa !== fb) return fa - fb;
        if (a.card.kind !== b.card.kind && !params.category) return a.card.kind === "event" ? -1 : 1;
        return soon(a.card).localeCompare(soon(b.card));
      }
    }
  });

  const pageSize = params.pageSize ?? 12;
  const page = Math.max(1, params.page ?? 1);
  const items = rows.slice((page - 1) * pageSize, page * pageSize).map((r) => r.card);
  return { items, page, pageSize, total: rows.length, hasMore: page * pageSize < rows.length, facets };
}

export async function getHome(citySlug: string, user: User | null, now = new Date()): Promise<HomePayload> {
  const city = await cityOr404(citySlug);
  const { entries, ctx } = await allCards(city, now);
  const events = entries.filter((e) => e.card.kind === "event");
  const venues = entries.filter((e) => e.card.kind === "venue");
  const bySoon = (a: (typeof entries)[number], b: (typeof entries)[number]) => (a.card.startsAt ?? "").localeCompare(b.card.startsAt ?? "");

  const featured = entries
    .filter((e) => e.featuredRank !== null && e.card.kind === "event")
    .sort((a, b) => a.featuredRank! - b.featuredRank!)
    .map((e) => e.card);

  const weekend = datesFor("weekend", now)!;
  const today = todayIST(now);
  const week = datesFor("week", now)!;
  const rails: HomeRail[] = [];

  const inWeekend = events.filter((e) => [...(e.dates as Set<string>)].some((d) => weekend.has(d))).sort(bySoon).map((e) => e.card);
  const push = (r: Omit<HomeRail, "items">, items: ListingCard[]) => {
    if (items.length >= 2) rails.push({ ...r, items: items.slice(0, 10) });
  };

  push(
    { id: "play", title: "Play near you", subtitle: "Courts and turfs you can book right now", href: `/${city.slug}/sports`, layout: "carousel" },
    venues.sort((a, b) => (a.featuredRank ?? 99) - (b.featuredRank ?? 99)).map((e) => e.card),
  );
  const interest = user?.interests?.[0];
  if (interest) {
    const cat = ctx.categories.find((c) => c.slug === interest);
    if (cat) {
      const parent = ctx.categories.find((c) => c.id === cat.parentId);
      push(
        { id: "because", title: `Because you like ${cat.name.toLowerCase()}`, href: parent ? `/${city.slug}/${parent.slug}/${cat.slug}` : undefined, layout: "carousel" },
        entries.filter((e) => e.subSlugs.includes(interest)).sort(bySoon).map((e) => e.card),
      );
    }
  }
  push(
    { id: "today", title: "Still on today", href: `/${city.slug}/search?when=today`, layout: "carousel" },
    events.filter((e) => (e.dates as Set<string>).has(today)).sort(bySoon).map((e) => e.card),
  );
  push(
    { id: "free", title: "Free this week", subtitle: "No tickets, no excuses", href: `/${city.slug}/search?price=free&when=week`, layout: "carousel" },
    events.filter((e) => e.card.priceFrom === null && [...(e.dates as Set<string>)].some((d) => week.has(d))).sort(bySoon).map((e) => e.card),
  );
  push(
    { id: "workshops", title: "Learn something new", subtitle: "Workshops worth a weekend morning", href: `/${city.slug}/workshops`, layout: "carousel" },
    events.filter((e) => e.card.categorySlug === "workshops").sort(bySoon).map((e) => e.card),
  );
  push(
    { id: "exhibitions", title: "Exhibitions on now", href: `/${city.slug}/exhibitions`, layout: "carousel" },
    events.filter((e) => e.card.categorySlug === "exhibitions").map((e) => e.card),
  );
  push(
    { id: "compete", title: "Compete", subtitle: "Quizzes, hackathons and tournaments", href: `/${city.slug}/competitions`, layout: "carousel" },
    events.filter((e) => e.card.categorySlug === "competitions").sort(bySoon).map((e) => e.card),
  );

  return {
    city,
    categories: ctx.categories.filter((c) => c.parentId === null),
    featured,
    quickFilters: [
      { id: "weekend", label: "This weekend", href: `/${city.slug}/search?when=weekend`, items: inWeekend },
      { id: "today", label: "Today", href: `/${city.slug}/search?when=today`, items: events.filter((e) => (e.dates as Set<string>).has(today)).sort(bySoon).map((e) => e.card) },
      { id: "free", label: "Free", href: `/${city.slug}/search?price=free`, items: events.filter((e) => e.card.priceFrom === null).sort(bySoon).map((e) => e.card) },
      {
        id: "under-500",
        label: "Under ₹500",
        href: `/${city.slug}/search?price=under-500`,
        items: events.filter((e) => e.card.priceFrom !== null && e.card.priceFrom <= 500).sort(bySoon).map((e) => e.card),
      },
    ]
      .map((f) => ({ ...f, items: f.items.slice(0, 10) }))
      .filter((f) => f.items.length > 0),
    rails,
  };
}

export async function getListingDetail(citySlug: string, slug: string, now = new Date()): Promise<ListingDetail> {
  const city = await cityOr404(citySlug);
  const listing = await repo.listings.bySlug(city.id, slug);
  if (!listing || listing.status !== "live" || (await repo.hosts.byId(listing.hostId))?.status !== "approved") throw notFound("Listing not found");
  return buildListingDetail(city, listing.id, now);
}

export async function getListingDetailById(id: string, now = new Date()): Promise<ListingDetail> {
  const listing = await repo.listings.byId(id);
  if (!listing || !(await isPublic(listing))) throw notFound("Listing not found");
  const city = (await repo.cities.byId(listing.cityId))!;
  return buildListingDetail(city, id, now);
}

async function buildListingDetail(city: City, id: string, now: Date): Promise<ListingDetail> {
  const listing = (await repo.listings.byId(id))!;
  const ctx = await cardContext(city);
  const inv = (await loadInventory([listing], now)).get(listing.id)!;
  const card = listingCard(listing, inv, ctx, now);
  if (!card) throw notFound("This listing has ended");
  const [host, template] = await Promise.all([repo.hosts.byId(listing.hostId), repo.templates.byId(listing.templateId)]);
  const category = ctx.categories.find((c) => c.id === listing.categoryId)!;
  const subcategory = listing.subcategoryId ? ctx.categories.find((c) => c.id === listing.subcategoryId) ?? null : null;
  const area = ctx.areas.find((a) => a.id === listing.areaId)!;

  const similar = (await searchListings({ city: city.slug, category: category.slug, pageSize: 7 }, now)).items
    .filter((c) => c.id !== listing.id)
    .slice(0, 6);

  return {
    listing,
    card,
    host: host!,
    category,
    subcategory,
    area,
    city,
    template: template!,
    sessions: inv.upcoming,
    ticketTypes: inv.tickets,
    similar,
  };
}

export async function getVenueDetail(citySlug: string, slug: string, now = new Date()): Promise<VenueDetail> {
  const city = await cityOr404(citySlug);
  const venue = await repo.venues.bySlug(city.id, slug);
  if (!venue || venue.status !== "live" || (await repo.hosts.byId(venue.hostId))?.status !== "approved") throw notFound("Venue not found");
  return buildVenueDetail(city, venue.id, now);
}

export async function getVenueDetailById(id: string, now = new Date()): Promise<VenueDetail> {
  const venue = await repo.venues.byId(id);
  if (!venue || !(await isPublic(venue))) throw notFound("Venue not found");
  const city = (await repo.cities.byId(venue.cityId))!;
  return buildVenueDetail(city, id, now);
}

async function buildVenueDetail(city: City, id: string, now: Date): Promise<VenueDetail> {
  const venue = (await repo.venues.byId(id))!;
  const ctx = await cardContext(city);
  const resources = await repo.venues.resources([venue.id]);
  const rules = await repo.venues.slotRules(resources.map((r) => r.id));
  const [host, template] = await Promise.all([repo.hosts.byId(venue.hostId), repo.templates.byId(venue.templateId)]);
  const card = venueCard(venue, resources, rules, ctx, now);
  const similar = (await searchListings({ city: city.slug, category: "sports", pageSize: 8 }, now)).items
    .filter((c) => c.id !== venue.id)
    .slice(0, 6);
  const sports = venue.sports.map((s) => ctx.categories.find((c) => c.slug === s && c.parentId === "cat_sports")!).filter(Boolean);
  const sportSummaries = sports.map((s) => {
    const courts = resources.filter((r) => r.sport === s.slug);
    const prices = rules.filter((r) => courts.some((c) => c.id === r.resourceId)).map((r) => r.priceBase);
    return { slug: s.slug, name: s.name, courts: courts.length, priceFrom: prices.length ? Math.min(...prices) : card.priceFrom ?? 0 };
  });
  return {
    venue,
    card,
    host: host!,
    area: ctx.areas.find((a) => a.id === venue.areaId)!,
    city,
    template: template!,
    resources,
    sports,
    sportSummaries,
    priceFrom: card.priceFrom ?? 0,
    similar,
  };
}

/** For sitemap.ts */
export async function allIndexablePaths() {
  const cities = await repo.cities.list();
  const cats = await repo.categories.list();
  const out: { path: string; priority: number }[] = [];
  for (const c of cities) {
    out.push({ path: `/${c.slug}`, priority: 1 });
    for (const cat of cats.filter((x) => x.parentId === null)) {
      out.push({ path: `/${c.slug}/${cat.slug}`, priority: 0.8 });
      for (const sub of cats.filter((x) => x.parentId === cat.id)) out.push({ path: `/${c.slug}/${cat.slug}/${sub.slug}`, priority: 0.6 });
    }
    for (const l of await repo.listings.listLive(c.id)) out.push({ path: `/${c.slug}/e/${l.slug}`, priority: 0.7 });
    for (const v of await repo.venues.listLive(c.id)) out.push({ path: `/${c.slug}/v/${v.slug}`, priority: 0.7 });
  }
  return out;
}

/** Resolve saved ids (listings or venues, any city) into cards. */
export async function getSavedCards(ids: string[], now = new Date()) {
  if (!ids.length) return [];
  const out: ListingCard[] = [];
  for (const city of await repo.cities.list()) {
    const { entries } = await allCards(city, now);
    for (const e of entries) if (ids.includes(e.card.id)) out.push(e.card);
  }
  return ids.map((id) => out.find((c) => c.id === id)).filter((c): c is ListingCard => !!c);
}
