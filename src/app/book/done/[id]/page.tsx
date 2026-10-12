import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getMyBooking } from "@/services/bookings";
import { or404 } from "@/lib/or404";
import { BookingSuccess } from "@/features/booking/booking-success";

export const metadata: Metadata = { title: "You're in!" };

export default async function DonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/book/done/${id}`);
  const booking = await or404(getMyBooking(user.id, id));
  if (booking.status === "held" || booking.status === "pending_payment") redirect(`/book/pay/${id}`);
  return <BookingSuccess booking={booking} />;
}
