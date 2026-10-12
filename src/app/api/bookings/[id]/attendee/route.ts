import { AttendeeSchema } from "@/contracts";
import { body, requireUser, route } from "@/lib/api/handler";
import { updateAttendee } from "@/services/bookings";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const attendee = await body(req, AttendeeSchema);
  return { booking: await updateAttendee(u.id, (await params).id, attendee) };
});
