import { PayRequestSchema } from "@/contracts";
import { body, requireUser, route } from "@/lib/api/handler";
import { payBooking } from "@/services/bookings";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  return payBooking(u.id, (await params).id, await body(req, PayRequestSchema));
});
