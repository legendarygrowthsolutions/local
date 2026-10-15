import { describe, expect, it } from "vitest";
import type { CouponInput, HoldRequest } from "@/contracts";
import { CouponInputSchema } from "@/contracts";
import { repo } from "@/repositories";
import { makeUser, setupTestDb } from "@/test/db";
import { attendee, bookingRow, makeListing } from "@/test/fixtures";
import { addDays, todayIST } from "@/lib/time";
import { applyCoupon, holdBooking } from "./bookings";
import { deleteCoupon, listCouponsAdmin, saveCoupon } from "./coupons";
import { ServiceError } from "./errors";

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

let n = 0;
const input = (patch: Partial<CouponInput> = {}): CouponInput =>
  CouponInputSchema.parse({
    code: `TEST${++n}X`,
    description: "Test coupon",
    type: "flat",
    value: 50,
    maxDiscount: 0,
    minSubtotal: 0,
    perUserLimit: null,
    totalLimit: null,
    firstBookingOnly: false,
    cityId: null,
    validFrom: null,
    validUntil: null,
    active: true,
    ...patch,
  });
const hold = (targetId: string, ticketTypeId: string): HoldRequest => ({ kind: "listing", targetId, tickets: [{ ticketTypeId, qty: 1 }], attendee: attendee() });

describe("coupon management", () => {
  it("creates, lists with state and usage, and refuses duplicate codes", async () => {
    const c = await saveCoupon(input({ code: "LAUNCH50" }));
    expect(c).toMatchObject({ code: "LAUNCH50", active: true, maxDiscount: 50 });
    const row = (await listCouponsAdmin()).find((x) => x.code === "LAUNCH50")!;
    expect(row).toMatchObject({ state: "live", uses: 0, cityName: null });
    expect(await err(saveCoupon(input({ code: "LAUNCH50" })))).toMatchObject({ status: 409, code: "coupon_code_taken" });
  });

  it("validates input: percent above 100, missing cap, dates in the wrong order, bad codes", () => {
    expect(CouponInputSchema.safeParse({ ...input(), type: "pct", value: 120, maxDiscount: 100 }).success).toBe(false);
    expect(CouponInputSchema.safeParse({ ...input(), type: "pct", value: 10, maxDiscount: 0 }).success).toBe(false);
    expect(CouponInputSchema.safeParse({ ...input(), validFrom: "2026-12-10", validUntil: "2026-12-01" }).success).toBe(false);
    expect(CouponInputSchema.safeParse({ ...input(), code: "no spaces" }).success).toBe(false);
  });

  it("shows scheduled, expired and paused states", async () => {
    const today = todayIST();
    await saveCoupon(input({ code: "SOONER", validFrom: addDays(today, 3) }));
    await saveCoupon(input({ code: "BYGONE", validFrom: addDays(today, -10), validUntil: addDays(today, -1) }));
    await saveCoupon(input({ code: "RESTING", active: false }));
    const rows = await listCouponsAdmin();
    expect(rows.find((r) => r.code === "SOONER")!.state).toBe("scheduled");
    expect(rows.find((r) => r.code === "BYGONE")!.state).toBe("expired");
    expect(rows.find((r) => r.code === "RESTING")!.state).toBe("paused");
  });

  it("checkout enforces start date, city and the overall cap", async () => {
    const today = todayIST();
    const { listing, tickets } = await makeListing({ tickets: [{ price: 500 }] }); // Mumbai
    const u = await makeUser();
    const held = await holdBooking(u.id, hold(listing.id, tickets[0].id));

    await saveCoupon(input({ code: "LATER10", validFrom: addDays(today, 2) }));
    expect(await err(applyCoupon(u.id, held.id, "LATER10"))).toMatchObject({ code: "coupon_not_started" });

    await saveCoupon(input({ code: "NAGPURONLY", cityId: "c_nagpur" }));
    expect(await err(applyCoupon(u.id, held.id, "NAGPURONLY"))).toMatchObject({ code: "coupon_city" });
    await saveCoupon(input({ code: "MUMBAIONLY", cityId: "c_mumbai" }));
    expect(await applyCoupon(u.id, held.id, "MUMBAIONLY")).toMatchObject({ couponCode: "MUMBAIONLY", price: { discount: 50 } });

    await saveCoupon(input({ code: "ONLYTWO", totalLimit: 2 }));
    for (let i = 0; i < 2; i++) {
      const other = await makeUser();
      await repo.bookings.insert(bookingRow({ userId: other.id, couponCode: "ONLYTWO", paymentRef: `pay_${i}`, price: { subtotal: 500, discount: 50, convenienceFee: 0, gstOnFee: 0, total: 450 } }));
    }
    expect(await err(applyCoupon(u.id, held.id, "ONLYTWO"))).toMatchObject({ status: 409, code: "coupon_exhausted" });
    expect((await listCouponsAdmin()).find((r) => r.code === "ONLYTWO")).toMatchObject({ state: "used_up", uses: 2, discountGiven: 100 });
  });

  it("a used coupon can't be renamed or deleted, only paused; an unused one can be deleted", async () => {
    const used = await saveCoupon(input({ code: "USEDONCE" }));
    const u = await makeUser();
    await repo.bookings.insert(bookingRow({ userId: u.id, couponCode: "USEDONCE", paymentRef: "pay_x", price: { subtotal: 500, discount: 50, convenienceFee: 0, gstOnFee: 0, total: 450 } }));
    expect(await err(saveCoupon(input({ code: "RENAMED" }), used!.id))).toMatchObject({ code: "coupon_code_locked" });
    expect(await err(deleteCoupon(used!.id))).toMatchObject({ code: "coupon_in_use" });
    expect(await saveCoupon(input({ code: "USEDONCE", active: false }), used!.id)).toMatchObject({ active: false });
    expect(await repo.coupons.byCode("USEDONCE")).toBeNull(); // paused codes don't apply at checkout

    const unused = await saveCoupon(input({ code: "NEVERUSED" }));
    await deleteCoupon(unused!.id);
    expect(await repo.coupons.byId(unused!.id)).toBeNull();
  });
});
