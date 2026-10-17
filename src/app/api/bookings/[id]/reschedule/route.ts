import { RescheduleRequestSchema } from "@/contracts";
import { body, requireUser, route } from "@/lib/api/handler";
import { getMyBooking, rescheduleMyBooking } from "@/services/bookings";

/** Move my booking to another slot or date, within the policy that applies to it. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const { id } = await params;
  const r = await rescheduleMyBooking(u.id, id, await body(req, RescheduleRequestSchema));
  return { booking: await getMyBooking(u.id, id), from: r.from };
});
