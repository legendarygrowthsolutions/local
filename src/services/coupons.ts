import "server-only";
import type { Coupon } from "@/lib/pricing";
import { repo } from "@/repositories";
import { formatINR } from "@/lib/pricing";
import { badRequest, conflict } from "./errors";

/**
 * Check a coupon for this user and order. Runs when it's applied and again at payment, so several
 * parallel holds can't each redeem a one-per-account code.
 */
export async function assertCouponUsable(userId: string, coupon: Coupon, subtotal: number, opts: { bookingId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  if (coupon.validUntil && new Date(coupon.validUntil).getTime() < now.getTime()) throw badRequest("That coupon has expired", "coupon_expired");
  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) throw badRequest(`${coupon.code} needs a minimum order of ${formatINR(coupon.minSubtotal)}`, "coupon_min");
  if (coupon.firstBookingOnly && (await repo.bookings.hasSettledBooking(userId, opts.bookingId)))
    throw conflict(`${coupon.code} is only for your first booking`, "coupon_first_only");
  if (coupon.perUserLimit != null && (await repo.bookings.countCouponUses(userId, coupon.code, opts.bookingId)) >= coupon.perUserLimit)
    throw conflict(`You've already used ${coupon.code}`, "coupon_used");
}
