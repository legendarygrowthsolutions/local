import { CouponInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { deleteCoupon, saveCoupon } from "@/services/coupons";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  return { coupon: await saveCoupon(await body(req, CouponInputSchema), (await params).id) };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  await deleteCoupon((await params).id);
  return { ok: true };
});
