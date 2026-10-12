import { requireUser, route } from "@/lib/api/handler";
import { listMyBookings } from "@/services/bookings";

export const GET = route(async () => {
  const u = await requireUser();
  return listMyBookings(u.id);
});
