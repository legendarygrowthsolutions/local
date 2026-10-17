import { BookingNotesSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { setBookingNotes } from "@/services/host-ops";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireHostApi();
  return setBookingNotes(ctx, (await params).id, (await body(req, BookingNotesSchema)).notes);
});
