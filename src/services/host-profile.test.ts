import { describe, expect, it } from "vitest";
import type { User } from "@/contracts";
import { HostProfilePatchSchema } from "@/contracts";
import { repo } from "@/repositories";
import { makeUser, setupTestDb } from "@/test/db";
import { makeListing } from "@/test/fixtures";
import { allIndexablePaths, getHostProfile } from "./discover";
import { ServiceError } from "./errors";
import { applyAsHost, resolveHostContext, updateHostProfile } from "./host";
import { hostSlugFrom, uniqueSlug } from "@/lib/slug";

setupTestDb();

async function err(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return { status: e.status, code: e.code, message: e.message };
    throw e;
  }
  return null;
}

describe("host slugs", () => {
  it("default handles come from the brand name and are unique", async () => {
    expect(hostSlugFrom("Tidewater Collective")).toBe("tidewater-collective");
    expect(hostSlugFrom("A&B")).toBe("aandb");
    expect(hostSlugFrom("Ü")).toBe("host");
    expect(await uniqueSlug("x", (s) => s === "x" || s === "x-2")).toBe("x-3");
    // Every seeded host has a valid, unique handle.
    const hosts = await repo.hosts.list();
    expect(new Set(hosts.map((h) => h.slug)).size).toBe(hosts.length);
    expect(hosts.every((h) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(h.slug))).toBe(true);
    expect((await repo.hosts.bySlug("tidewater-collective"))?.id).toBe("h_mumbai_1");
  });

  it("new applications get a free handle", async () => {
    const u = await makeUser({ name: "Applicant" });
    const h = await applyAsHost(u, {
      type: "community",
      brandName: "Tidewater Collective",
      cityId: "c_mumbai",
      bio: "A brand new community that happens to share a name with an existing host.",
      instagram: "",
      contactName: "Applicant",
      email: "",
      website: "",
      gstin: "",
      expectedPerMonth: "1–2",
      wantsPaid: false,
      documents: [],
    });
    expect(h?.slug).toBe("tidewater-collective-2");
  });

  it("owners can change the handle; taken or malformed ones are refused", async () => {
    const ctx = (await resolveHostContext((await repo.users.byId("u_venue")) as User))!;
    expect(ctx.host.slug).toBe(hostSlugFrom(ctx.host.brandName));
    expect(await err(updateHostProfile(ctx, { slug: "tidewater-collective" }))).toMatchObject({ status: 409 });
    const upd = await updateHostProfile(ctx, { slug: "smash-courts" });
    expect(upd?.slug).toBe("smash-courts");
    // Same slug again is a no-op, not a conflict.
    expect((await updateHostProfile({ ...ctx, host: upd! }, { slug: "smash-courts" }))?.slug).toBe("smash-courts");
    expect(HostProfilePatchSchema.safeParse({ slug: "Smash Courts" }).success).toBe(false);
    expect(HostProfilePatchSchema.safeParse({ slug: "-abc" }).success).toBe(false);
    expect(HostProfilePatchSchema.safeParse({ slug: "ab" }).success).toBe(false);
    expect(HostProfilePatchSchema.safeParse({ slug: " Abc-123 " })).toMatchObject({ success: true, data: { slug: "abc-123" } });
  });
});

describe("getHostProfile", () => {
  it("lists everything live by the host, across kinds, bookable", async () => {
    const p = await getHostProfile("tidewater-collective");
    expect(p.host.id).toBe("h_mumbai_1");
    expect(p.events.length).toBeGreaterThan(0);
    const mine = new Set((await repo.listings.listByHost("h_mumbai_1")).map((l) => l.id));
    expect(p.events.every((c) => mine.has(c.id) && c.kind === "event")).toBe(true);
    // Soonest first.
    const starts = p.events.map((c) => c.startsAt!);
    expect(starts).toEqual([...starts].sort());
    expect(p.cities.map((c) => c.slug)).toEqual(["mumbai"]);
    expect(p.followers).toBeGreaterThanOrEqual(0);
  });

  it("a venue host shows its courts", async () => {
    const owner = (await repo.hosts.byId("h_mumbai_5"))!;
    const p = await getHostProfile(owner.slug);
    const venues = (await repo.venues.listByHost(owner.id)).filter((v) => v.status === "live");
    expect(p.venues.map((c) => c.id).sort()).toEqual(venues.map((v) => v.id).sort());
    expect(p.venues.every((c) => c.kind === "venue" && c.href.startsWith("/mumbai/v/"))).toBe(true);
  });

  it("hides drafts, ended and unapproved; unknown or pending hosts are 404", async () => {
    const { listing } = await makeListing({ listing: { hostId: "h_mumbai_1", status: "review" } });
    const ended = await makeListing({ listing: { hostId: "h_mumbai_1" }, sessionDays: [-3] });
    const p = await getHostProfile("tidewater-collective");
    expect(p.events.some((c) => c.id === listing.id || c.id === ended.listing.id)).toBe(false);
    expect(await err(getHostProfile("nobody-here"))).toMatchObject({ status: 404 });
    const pending = (await repo.hosts.list()).find((h) => h.status === "pending")!;
    expect(await err(getHostProfile(pending.slug))).toMatchObject({ status: 404 });
  });

  it("counts followers and appears in the sitemap", async () => {
    const u = await makeUser();
    await repo.users.update(u.id, { following: ["h_mumbai_1"] });
    const before = (await getHostProfile("tidewater-collective")).followers;
    expect(before).toBeGreaterThanOrEqual(1);
    expect((await allIndexablePaths()).some((p) => p.path === "/h/tidewater-collective")).toBe(true);
  });
});
