import type { Metadata } from "next";
import { getSessionUser } from "@/lib/session";
import { getMyBooking } from "@/services/bookings";
import { or404 } from "@/lib/or404";
import { BookingDetail } from "@/components/booking/booking-detail";

export const metadata: Metadata = { title: "Booking" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getSessionUser())!;
  return <BookingDetail initial={await or404(getMyBooking(user.id, id))} />;
}
