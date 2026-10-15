import { describe, expect, it } from "vitest";
import { repo } from "@/repositories";
import { setupTestDb } from "@/test/db";
import { makeListing } from "@/test/fixtures";
import { ServiceError } from "./errors";
import { getHome, getListingDetail, getSavedCards, getVenueDetail, searchListings } from "./discover";

setupTestDb();

async function err(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return { status: e.status, code: e.code };
    throw e;
  }
  return null;
}

// Only categories with something on show; Nagpur carries the imported (real) listings.
const HOME_CATEGORIES: Record<string, string[]> = {
  mumbai: ["events", "sports", "workshops", "meetups", "exhibitions", "competitions"],
  pune: ["events", "sports", "workshops", "meetups", "exhibitions", "competitions"],
  nagpur: ["events", "sports", "meetups", "competitions", "activities"],
};

describe("getHome", () => {
  it.each(["mumbai", "pune", "nagpur"])("%s has rails, categories and quick filters", async (city) => {
    const home = await getHome(city, null);
    expect(home.city.slug).toBe(city);
    expect(home.categories.map((c) => c.slug)).toEqual(HOME_CATEGORIES[city]);
    expect(home.rails.length).toBeGreaterThanOrEqual(3);
    expect(home.rails.map((r) => r.id)).toContain("play");
    for (const r of home.rails) {
      expect(r.items.length).toBeGreaterThanOrEqual(2);
      expect(r.items.length).toBeLessThanOrEqual(10);
      for (const c of r.items) expect(c.href.startsWith(`/${city}/`)).toBe(true);
    }
    expect(home.quickFilters.length).toBeGreaterThan(0);
  });

  it("personalises with the user's first interest", async () => {
    const u = (await repo.users.byId("u_demo"))!; // interests: comedy, …
    const home = await getHome("mumbai", u);
    expect(home.rails.find((r) => r.id === "because")?.title).toMatch(/comedy/i);
  });

  it("unknown city is 404", async () => {
    expect(await err(getHome("atlantis", null))).toMatchObject({ status: 404 });
  });
});

describe("detail pages", () => {
  it("listing detail by slug with inventory and similar items", async () => {
    const l = (await repo.listings.listLive("c_mumbai")).find((x) => x.templateId === "tpl_ticket_single")!;
    const d = await getListingDetail("mumbai", l.slug);
    expect(d.listing.id).toBe(l.id);
    expect(d).toMatchObject({ city: { slug: "mumbai" }, host: { id: l.hostId }, template: { id: "tpl_ticket_single" } });
    expect(d.sessions.length).toBeGreaterThan(0);
    expect(d.ticketTypes.every((t) => t.remaining >= 0)).toBe(true);
    expect(d.similar.some((s) => s.id === l.id)).toBe(false);
    // Wrong city / unknown slug
    expect(await err(getListingDetail("pune", l.slug))).toMatchObject({ status: 404 });
    expect(await err(getListingDetail("mumbai", "nope"))).toMatchObject({ status: 404 });
  });

  it("non-live listings aren't served", async () => {
    const { listing } = await makeListing({ listing: { status: "review" } });
    expect(await err(getListingDetail("mumbai", listing.slug))).toMatchObject({ status: 404 });
  });

  it("venue detail lists courts per sport", async () => {
    const d = await getVenueDetail("mumbai", "smash-arena-worli");
    expect(d.venue.id).toBe("v_mumbai_01");
    expect(d.sportSummaries.map((s) => s.slug).sort()).toEqual(["badminton", "pickleball"]);
    expect(d.sportSummaries.every((s) => s.courts > 0 && s.priceFrom > 0)).toBe(true);
    expect(d.resources.every((r) => r.venueId === "v_mumbai_01")).toBe(true);
  });
});

describe("searchListings", () => {
  it("text search, kind facets and pagination", async () => {
    const all = await searchListings({ city: "mumbai", pageSize: 1000 });
    expect(all.facets.event + all.facets.venue).toBe(all.total);
    expect(all.facets.venue).toBeGreaterThan(0);

    const courts = await searchListings({ city: "mumbai", kind: "venue", pageSize: 1000 });
    expect(courts.items.every((c) => c.kind === "venue")).toBe(true);
    expect(courts.total).toBe(all.facets.venue);
    expect(courts.facets).toEqual(all.facets);

    const p1 = await searchListings({ city: "mumbai", pageSize: 5, page: 1 });
    const p2 = await searchListings({ city: "mumbai", pageSize: 5, page: 2 });
    expect(p1.items).toHaveLength(5);
    expect(p1.hasMore).toBe(true);
    expect(p1.items.map((c) => c.id)).not.toEqual(expect.arrayContaining(p2.items.map((c) => c.id)));

    const smash = await searchListings({ city: "mumbai", q: "smash arena" });
    expect(smash.items.map((c) => c.id)).toContain("v_mumbai_01");
  });

  it("category, price and sort filters", async () => {
    const free = await searchListings({ city: "mumbai", price: "free", pageSize: 1000 });
    expect(free.items.every((c) => c.priceFrom === null)).toBe(true);
    const workshops = await searchListings({ city: "mumbai", category: "workshops", pageSize: 1000 });
    expect(workshops.total).toBeGreaterThan(0);
    expect(workshops.items.every((c) => c.categorySlug === "workshops")).toBe(true);
    const cheap = await searchListings({ city: "mumbai", sort: "price-low", kind: "event", pageSize: 1000 });
    const prices = cheap.items.map((c) => c.priceFrom ?? 0);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("saved cards resolve across cities in the saved order", async () => {
    const [m] = (await searchListings({ city: "mumbai", kind: "event" })).items;
    const [p] = (await searchListings({ city: "pune", kind: "venue" })).items;
    const cards = await getSavedCards([p.id, "gone", m.id]);
    expect(cards.map((c) => c.id)).toEqual([p.id, m.id]);
  });
});
