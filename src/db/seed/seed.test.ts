import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/test/db";
import { repo } from "@/repositories";
import { getHome, getListingDetail, getListingDetailById } from "@/services/discover";
import nagpur from "./real/nagpur.json";

setupTestDb(new Date(), { launchCities: true });

describe("launch seed", () => {
  it("only Nagpur is live; Mumbai and Pune are hidden", async () => {
    expect((await repo.cities.list()).map((c) => c.slug)).toEqual(["nagpur"]);
    expect(await getHome("nagpur", null)).toBeTruthy();
    await expect(getHome("mumbai", null)).rejects.toMatchObject({ status: 404 });
    // Direct booking links to a hidden city's listings 404 as well.
    const hidden = (await repo.listings.listAll()).find((l) => l.cityId === "c_mumbai" && l.status === "live")!;
    await expect(getListingDetailById(hidden.id)).rejects.toMatchObject({ status: 404 });
  });

  it("Nagpur shows only imported listings and venues, with their real dates", async () => {
    const listings = (await repo.listings.listAll()).filter((l) => l.cityId === "c_nagpur");
    const venues = (await repo.venues.listAll()).filter((v) => v.cityId === "c_nagpur");
    expect(listings.length).toBe(nagpur.listings.length);
    expect(listings.every((l) => l.id.startsWith("l_ngp_") && l.externalUrl)).toBe(true);
    expect(venues.length).toBe(nagpur.venues.length);
    // Never re-anchored like the demo fixtures.
    const s = nagpur.sessions[0];
    expect((await repo.listings.sessions([s.listingId])).find((x) => x.id === s.id)?.startsAt).toBe(s.startsAt);
  });

  it("imported listings get no simulated bookings", async () => {
    const q = await repo.bookings.activeQuantities(nagpur.listings.map((l) => l.id));
    expect(q.byTicket.size + q.bySession.size).toBe(0);
  });

  it("an imported event renders as a detail page", async () => {
    const future = nagpur.sessions.find((s) => new Date(s.startsAt) > new Date())!;
    const l = nagpur.listings.find((x) => x.id === future.listingId)!;
    const d = await getListingDetail("nagpur", l.slug);
    expect(d.listing.title).toBe(l.title);
    expect(d.ticketTypes.length).toBeGreaterThan(0);
  });
});
