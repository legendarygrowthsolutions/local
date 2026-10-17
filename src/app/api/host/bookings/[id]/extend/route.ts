import { ExtendBookingSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { extendBooking } from "@/services/host-ops";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireHostApi();
  return extendBooking(ctx, (await params).id, await body(req, ExtendBookingSchema));
});
