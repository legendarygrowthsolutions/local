import { PayoutAccountInputSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { getPayoutAccount, savePayoutAccount } from "@/services/payouts";

export const GET = route(async () => ({ account: await getPayoutAccount(await requireHostApi()) }));

export const PUT = route(async (req) => {
  const ctx = await requireHostApi();
  return { account: await savePayoutAccount(ctx, await body(req, PayoutAccountInputSchema)) };
});
