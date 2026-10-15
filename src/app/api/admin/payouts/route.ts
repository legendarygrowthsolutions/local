import { PayoutInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { recordPayout } from "@/services/payouts";

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  return { payout: await recordPayout(admin, await body(req, PayoutInputSchema)) };
});
