import { csvResponse, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { badRequest } from "@/services/errors";
import { assertOwner } from "@/services/host";
import { cycleBookingsCsv } from "@/services/payouts";

/** The bookings behind one week's payout. */
export const GET = route(async (req) => {
  const ctx = await requireHostApi();
  assertOwner(ctx);
  const cycle = req.nextUrl.searchParams.get("cycle");
  if (!cycle || !/^\d{4}-\d{2}-\d{2}$/.test(cycle)) throw badRequest("cycle is required");
  return csvResponse(await cycleBookingsCsv(ctx.host.id, cycle), `statement-${cycle}.csv`);
});
