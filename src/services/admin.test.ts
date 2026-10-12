import { describe, expect, it } from "vitest";
import { repo } from "@/repositories";
import { makeUser, setupTestDb } from "@/test/db";
import { bookingRow, makeListing } from "@/test/fixtures";
import { adminRefund, assertAdmin, decideDocument, decideHost, decideListing, saveCity, setFeatured, setUserRole } from "./admin";
import { ServiceError } from "./errors";
import { getHome, searchListings } from "./discover";

setupTestDb();

async function err(p: Promise<unknown> | (() => unknown)) {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    if (e instanceof ServiceError) return { status: e.status, code: e.code, message: e.message };
    throw e;
  }
  return null;
}

describe("assertAdmin", () => {
  it("only lets admins through", async () => {
    expect(await err(() => assertAdmin(null))).toMatchObject({ status: 403 });
    expect(await err(async () => assertAdmin(await repo.users.byId("u_demo")))).toMatchObject({ status: 403 });
    expect(await err(async () => assertAdmin(await repo.users.byId("u_admin")))).toBeNull();
  });
});

describe("host applications", () => {
  it("changes/rejected need a note; approval derives KYC from documents", async () => {
    expect(await err(decideHost("h_app_1", "changes"))).toMatchObject({ status: 400 });
    expect(await decideHost("h_app_1", "changes", "Upload a clearer PAN")).toMatchObject({ status: "changes", reviewNote: "Upload a clearer PAN" });

    // Documents are uploaded but not verified → approved with KYC pending.
    expect(await decideHost("h_app_1", "approved")).toMatchObject({ status: "approved", reviewNote: null, kycStatus: "pending" });
    const h = (await repo.hosts.byId("h_app_1"))!;
    for (const d of h.documents) await decideDocument(h.id, d.id, "verified");
    const after = (await repo.hosts.byId("h_app_1"))!;
    expect(after.kycStatus).toBe("verified");
    expect(after.documents.every((d) => d.status === "verified")).toBe(true);
    expect(after.documents.map((d) => d.id)).toEqual(h.documents.map((d) => d.id));

    expect(await err(decideDocument(h.id, "doc_nope", "verified"))).toMatchObject({ status: 404 });
    expect(await err(decideHost("h_nope", "approved"))).toMatchObject({ status: 404 });
  });

  it("listings from unapproved hosts can't go live; paid listings need verified KYC", async () => {
    const pending = await makeListing({ listing: { hostId: "h_app_2", cityId: "c_pune", status: "review" } });
    expect(await err(decideListing(pending.listing.id, "approve"))).toMatchObject({ status: 409 });
    // Bandra Bookworms is approved but has no KYC.
    const paid = await makeListing({ listing: { hostId: "h_mumbai_4", status: "review" }, tickets: [{ price: 200 }] });
    expect(await err(decideListing(paid.listing.id, "approve"))).toMatchObject({ status: 409 });
    const free = await makeListing({ listing: { hostId: "h_mumbai_4", status: "review", templateId: "tpl_rsvp", categoryId: "cat_meetups" }, tickets: [{ price: 0 }] });
    expect(await decideListing(free.listing.id, "approve")).toMatchObject({ status: "live", reviewNote: null });
    expect(await decideListing(free.listing.id, "reject", "Wrong area")).toMatchObject({ status: "rejected", reviewNote: "Wrong area" });
  });

  it("featuring ranks live listings and surfaces them on the home page", async () => {
    const { listing } = await makeListing({ listing: { title: "Featured Probe Show" } });
    const f = (await setFeatured(listing.id, true))!;
    expect(f.featuredRank).toBeGreaterThan(0);
    const home = await getHome("mumbai", null);
    expect(home.featured.map((c) => c.id)).toContain(listing.id);
    expect((await setFeatured(listing.id, false))!.featuredRank).toBeNull();
    const draft = await makeListing({ listing: { status: "draft" } });
    expect(await err(setFeatured(draft.listing.id, true))).toMatchObject({ status: 409 });
  });

  it("suspending a host hides its listings from discovery", async () => {
    const before = await searchListings({ city: "mumbai", q: "kiln", pageSize: 100 });
    const kiln = (await repo.listings.listByHost("h_mumbai_3")).filter((l) => l.status === "live").map((l) => l.id);
    expect(kiln.length).toBeGreaterThan(0);
    await decideHost("h_mumbai_3", "rejected", "Suspended for testing");
    const after = await searchListings({ city: "mumbai", pageSize: 1000 });
    expect(after.items.some((c) => kiln.includes(c.id))).toBe(false);
    await decideHost("h_mumbai_3", "approved");
    expect((await searchListings({ city: "mumbai", q: "kiln", pageSize: 100 })).total).toBe(before.total);
  });
});

describe("users & roles", () => {
  it("admins can't remove their own admin access, but can manage others", async () => {
    const admin = (await repo.users.byId("u_admin"))!;
    expect(await err(setUserRole(admin, admin.id, "user"))).toMatchObject({ status: 409 });
    expect((await repo.users.byId(admin.id))!.role).toBe("admin");
    await expect(setUserRole(admin, admin.id, "admin")).resolves.toMatchObject({ role: "admin" });

    const u = await makeUser();
    expect(await setUserRole(admin, u.id, "admin")).toMatchObject({ role: "admin" });
    expect(await setUserRole(admin, u.id, "user")).toMatchObject({ role: "user", name: u.name, phone: u.phone });
    expect(await err(setUserRole(admin, "u_nope", "admin"))).toMatchObject({ status: 404 });
  });
});

describe("refunds & cities", () => {
  it("adminRefund refunds a share of the ticket value only for confirmed bookings", async () => {
    const u = await makeUser();
    const b = bookingRow({ userId: u.id, status: "confirmed", price: { subtotal: 1000, discount: 100, convenienceFee: 33.75, gstOnFee: 6.08, total: 939.83 } });
    await repo.bookings.insert(b);
    expect(await adminRefund(b.id, 50)).toEqual({ refundAmount: 450 });
    expect((await repo.bookings.byId(b.id))!.status).toBe("refunded");
    expect(await err(adminRefund(b.id, 100))).toMatchObject({ status: 409 });

    const c = bookingRow({ userId: u.id, status: "confirmed" });
    await repo.bookings.insert(c);
    expect(await adminRefund(c.id, 0)).toEqual({ refundAmount: 0 });
    expect((await repo.bookings.byId(c.id))!.status).toBe("cancelled");
  });

  it("deactivating a city hides it immediately (cache invalidated); the last active city can't be hidden", async () => {
    const nagpur = (await repo.cities.byId("c_nagpur"))!;
    await getHome("nagpur", null); // warm the reference cache
    const { id: _id, ...input } = nagpur;
    void _id;
    await saveCity({ ...input, active: false }, "c_nagpur");
    expect(await err(getHome("nagpur", null))).toMatchObject({ status: 404 });
    await saveCity({ ...input, active: true }, "c_nagpur");
    await expect(getHome("nagpur", null)).resolves.toMatchObject({ city: { id: "c_nagpur" } });
    expect(await err(saveCity({ ...input, slug: "admin" }))).toMatchObject({ status: 400 });
    expect(await err(saveCity({ ...input, slug: "mumbai" }, "c_nagpur"))).toMatchObject({ status: 409 });
  });
});
