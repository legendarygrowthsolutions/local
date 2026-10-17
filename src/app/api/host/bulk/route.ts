import { BulkScheduleInputSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { bulkSchedule } from "@/services/host-ops";

/** Book or block many slots at once (a date range, chosen weekdays, one or more courts). */
export const POST = route(async (req) => {
  const ctx = await requireHostApi();
  return bulkSchedule(ctx, await body(req, BulkScheduleInputSchema));
});
