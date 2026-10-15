import { csvResponse, requireAdmin, route } from "@/lib/api/handler";
import { badRequest } from "@/services/errors";
import { cycleBookingsCsv } from "@/services/payouts";

/** The bookings behind one host's weekly payout. */
export const GET = route(async (req) => {
  await requireAdmin();
  const hostId = req.nextUrl.searchParams.get("hostId");
  const cycle = req.nextUrl.searchParams.get("cycle");
  if (!hostId || !cycle || !/^\d{4}-\d{2}-\d{2}$/.test(cycle)) throw badRequest("hostId and cycle are required");
  return csvResponse(await cycleBookingsCsv(hostId, cycle), `statement-${cycle}.csv`);
});
