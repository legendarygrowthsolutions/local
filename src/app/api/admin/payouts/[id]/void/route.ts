import { PayoutVoidSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { voidPayout } from "@/services/payouts";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const admin = await requireAdmin();
  const { reason } = await body(req, PayoutVoidSchema);
  return { payout: await voidPayout(admin, (await params).id, reason) };
});
