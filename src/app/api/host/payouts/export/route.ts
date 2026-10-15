import { csvResponse, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { assertOwner } from "@/services/host";
import { payoutsCsv } from "@/services/payouts";

export const GET = route(async () => {
  const ctx = await requireHostApi();
  assertOwner(ctx);
  return csvResponse(await payoutsCsv(ctx.host.id), "payouts.csv");
});
