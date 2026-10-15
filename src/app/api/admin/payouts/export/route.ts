import { csvResponse, requireAdmin, route } from "@/lib/api/handler";
import { payoutsCsv } from "@/services/payouts";

/** Every payout record (paid and voided), for the accounts team. */
export const GET = route(async (req) => {
  await requireAdmin();
  const hostId = req.nextUrl.searchParams.get("hostId") ?? undefined;
  return csvResponse(await payoutsCsv(hostId), "payouts.csv");
});
