import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { createDb } from "../client";
import { migrateToLatest } from "../migrate";
import { reference, seedReference } from "./reference";

const dir = mkdtempSync(join(tmpdir(), "local-ref-"));
const db = createDb("file:" + join(dir, "ref.db"));
afterAll(async () => {
  await db.destroy();
  rmSync(dir, { recursive: true, force: true });
});

const count = async (t: "cities" | "areas" | "categories" | "journeyTemplates" | "users" | "hosts" | "listings" | "venues" | "bookings" | "coupons" | "listingViews") =>
  Number((await db.selectFrom(t).select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow()).n);

describe("production reference seed", () => {
  it("loads the launch city, areas, categories and templates — and nothing made up", async () => {
    await migrateToLatest(db);
    const added = await seedReference(db);
    expect(added).toBe(reference.cities.length + reference.areas.length + reference.categories.length + reference.templates.length);
    const cities = await db.selectFrom("cities").select(["slug", "active"]).execute();
    expect(cities).toEqual([{ slug: "nagpur", active: 1 }]);
    expect(await count("areas")).toBeGreaterThan(0);
    expect(await count("categories")).toBeGreaterThan(0);
    expect(await count("journeyTemplates")).toBeGreaterThan(0);
    for (const t of ["users", "hosts", "listings", "venues", "bookings", "coupons", "listingViews"] as const) expect(await count(t)).toBe(0);
    // Every area belongs to a seeded city, every subcategory to a seeded parent.
    const cityIds = new Set(reference.cities.map((c) => c.id));
    expect(reference.areas.every((a) => cityIds.has(a.cityId))).toBe(true);
    const catIds = new Set(reference.categories.map((c) => c.id));
    expect(reference.categories.every((c) => c.parentId === null || catIds.has(c.parentId))).toBe(true);
  });

  it("is a no-op once the database has data (never restores what an admin deleted)", async () => {
    const area = reference.areas[0].id;
    await db.deleteFrom("areas").where("id", "=", area).execute();
    expect(await seedReference(db)).toBe(0);
    expect(await db.selectFrom("areas").select("id").where("id", "=", area).executeTakeFirst()).toBeUndefined();
  });
});
