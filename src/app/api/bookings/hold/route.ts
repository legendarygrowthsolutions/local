import { HoldRequestSchema } from "@/contracts";
import { body, requireUser, route } from "@/lib/api/handler";
import { holdBooking } from "@/services/bookings";

export const POST = route(async (req) => {
  const u = await requireUser();
  return { booking: await holdBooking(u.id, await body(req, HoldRequestSchema)) };
});
