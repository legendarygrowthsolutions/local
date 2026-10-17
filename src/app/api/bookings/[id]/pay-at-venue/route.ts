import { requireUser, route } from "@/lib/api/handler";
import { payAtVenue } from "@/services/bookings";

/** Confirm a hold without paying online: the guest pays in cash when they arrive (host must accept it). */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const u = await requireUser();
  return payAtVenue(u.id, (await params).id);
});
