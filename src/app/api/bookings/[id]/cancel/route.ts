import { requireUser, route } from "@/lib/api/handler";
import { cancelBooking } from "@/services/bookings";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  return cancelBooking(u.id, (await params).id);
});
