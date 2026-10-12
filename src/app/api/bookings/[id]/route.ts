import { requireUser, route } from "@/lib/api/handler";
import { getMyBooking } from "@/services/bookings";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  return { booking: await getMyBooking(u.id, (await params).id) };
});
