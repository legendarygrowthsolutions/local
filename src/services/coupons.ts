import "server-only";
import type { CouponInput } from "@/contracts";
import type { Coupon } from "@/lib/pricing";
import { newId } from "@/lib/crypto";
import { repo } from "@/repositories";
import { formatINR } from "@/lib/pricing";
import { badRequest, conflict, notFound } from "./errors";

/**
 * Check a coupon for this user and order. Runs when it's applied and again at payment, so several
 * parallel holds can't each redeem a one-per-account code.
 */
export async function assertCouponUsable(userId: string, coupon: Coupon, subtotal: number, opts: { bookingId?: string; now?: Date; cityId: string }) {
  const now = opts.now ?? new Date();
  if (coupon.validFrom && new Date(coupon.validFrom).getTime() > now.getTime()) throw badRequest("That coupon isn't active yet", "coupon_not_started");
  if (coupon.validUntil && new Date(coupon.validUntil).getTime() < now.getTime()) throw badRequest("That coupon has expired", "coupon_expired");
  if (coupon.cityId && coupon.cityId !== opts.cityId) throw badRequest(`${coupon.code} isn't valid in this city`, "coupon_city");
  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) throw badRequest(`${coupon.code} needs a minimum order of ${formatINR(coupon.minSubtotal)}`, "coupon_min");
  if (coupon.firstBookingOnly && (await repo.bookings.hasSettledBooking(userId, opts.bookingId)))
    throw conflict(`${coupon.code} is only for your first booking`, "coupon_first_only");
  if (coupon.perUserLimit != null && (await repo.bookings.countCouponUses(userId, coupon.code, opts.bookingId)) >= coupon.perUserLimit)
    throw conflict(`You've already used ${coupon.code}`, "coupon_used");
  if (coupon.totalLimit != null && (await repo.bookings.countCouponUses(null, coupon.code, opts.bookingId)) >= coupon.totalLimit)
    throw conflict(`${coupon.code} has been fully redeemed`, "coupon_exhausted");
}

// ---------------------------------------------------------------------------
// Superadmin: coupon management
// ---------------------------------------------------------------------------

/** Admin dates are IST calendar days; a coupon runs from the start of the first to the end of the last. */
const dayStart = (ymd: string) => `${ymd}T00:00:00+05:30`;
const dayEnd = (ymd: string) => `${ymd}T23:59:59+05:30`;
const ymdOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

export type CouponState = "live" | "scheduled" | "expired" | "paused" | "used_up";

export async function listCouponsAdmin(now = new Date()) {
  const [coupons, usage, cities] = await Promise.all([repo.coupons.list(), repo.coupons.usage(), repo.cities.listAll()]);
  return coupons.map((c) => {
    const u = usage.get(c.code) ?? { uses: 0, discount: 0 };
    const t = now.getTime();
    const state: CouponState = !c.active
      ? "paused"
      : c.validUntil && new Date(c.validUntil).getTime() < t
        ? "expired"
        : c.validFrom && new Date(c.validFrom).getTime() > t
          ? "scheduled"
          : c.totalLimit != null && u.uses >= c.totalLimit
            ? "used_up"
            : "live";
    return {
      id: c.id,
      code: c.code,
      description: c.description,
      type: c.type,
      value: c.value,
      maxDiscount: c.maxDiscount,
      minSubtotal: c.minSubtotal ?? 0,
      perUserLimit: c.perUserLimit ?? null,
      totalLimit: c.totalLimit ?? null,
      firstBookingOnly: !!c.firstBookingOnly,
      cityId: c.cityId ?? null,
      cityName: c.cityId ? cities.find((x) => x.id === c.cityId)?.name ?? "Unknown city" : null,
      validFrom: ymdOf(c.validFrom),
      validUntil: ymdOf(c.validUntil),
      active: c.active,
      state,
      uses: u.uses,
      discountGiven: u.discount,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  });
}
export type AdminCouponRow = Awaited<ReturnType<typeof listCouponsAdmin>>[number];

export async function saveCoupon(input: CouponInput, id?: string, now = new Date()) {
  if (input.cityId && !(await repo.cities.listAll()).some((c) => c.id === input.cityId)) throw badRequest("Pick a valid city");
  const sameCode = (await repo.coupons.list()).find((c) => c.code === input.code);
  if (sameCode && sameCode.id !== id) throw conflict(`There's already a coupon called ${input.code}`, "coupon_code_taken");
  const existing = id ? await repo.coupons.byId(id) : null;
  if (id && !existing) throw notFound("Coupon not found");
  if (existing && existing.code !== input.code && ((await repo.coupons.usage()).get(existing.code)?.uses ?? 0) > 0)
    throw conflict("This coupon has been used, so its code can't change. Create a new coupon instead.", "coupon_code_locked");
  const at = now.toISOString();
  const record = {
    id: existing?.id ?? newId("cpn"),
    code: input.code,
    description: input.description,
    type: input.type,
    value: input.value,
    maxDiscount: input.type === "flat" ? input.value : input.maxDiscount,
    minSubtotal: input.minSubtotal,
    perUserLimit: input.perUserLimit,
    totalLimit: input.totalLimit,
    firstBookingOnly: input.firstBookingOnly,
    cityId: input.cityId,
    validFrom: input.validFrom ? dayStart(input.validFrom) : null,
    validUntil: input.validUntil ? dayEnd(input.validUntil) : null,
    active: input.active,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  };
  return existing ? repo.coupons.update(existing.id, record) : repo.coupons.insert(record);
}

/** Only coupons nobody has used can be deleted; used ones are paused instead, so booking records stay explainable. */
export async function deleteCoupon(id: string) {
  const c = await repo.coupons.byId(id);
  if (!c) throw notFound("Coupon not found");
  if ((await repo.bookings.countCouponUses(null, c.code)) > 0 || ((await repo.coupons.usage()).get(c.code)?.uses ?? 0) > 0)
    throw conflict("This coupon has been used. Pause it instead of deleting it.", "coupon_in_use");
  await repo.coupons.remove(id);
}
