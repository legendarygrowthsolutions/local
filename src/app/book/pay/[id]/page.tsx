import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getMyBooking } from "@/services/bookings";
import { or404 } from "@/lib/or404";
import { DummyGateway } from "@/features/booking/dummy-gateway";

export const metadata: Metadata = { title: "Payment" };

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/book/pay/${id}`);
  const booking = await or404(getMyBooking(user.id, id));
  if (booking.status === "confirmed" || booking.status === "requested") redirect(`/book/done/${id}`);
  return <DummyGateway initial={booking} />;
}
