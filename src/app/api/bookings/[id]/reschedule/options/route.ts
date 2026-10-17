import { requireUser, route } from "@/lib/api/handler";
import { rescheduleOptions } from "@/services/bookings";

/** What I can move this booking to: court slots for a date, or the listing's other dates. */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  return rescheduleOptions(u.id, (await params).id, req.nextUrl.searchParams.get("date") ?? undefined);
});
