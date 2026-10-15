import { CouponInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { saveCoupon } from "@/services/coupons";

export const POST = route(async (req) => {
  await requireAdmin();
  return { coupon: await saveCoupon(await body(req, CouponInputSchema)) };
});
