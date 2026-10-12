import { requireUser, route } from "@/lib/api/handler";
import { startCheckout } from "@/services/payments";

/** Opens a gateway order for this hold (Razorpay). */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  return startCheckout(u.id, (await params).id);
});
