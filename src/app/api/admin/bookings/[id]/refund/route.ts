import { RefundSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { adminRefund } from "@/services/admin";

export const POST = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { refundPct } = await body(req, RefundSchema);
  return adminRefund((await params).id, refundPct);
});
