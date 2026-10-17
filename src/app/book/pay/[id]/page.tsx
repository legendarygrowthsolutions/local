import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getMyBooking } from "@/services/bookings";
import { or404 } from "@/lib/or404";
import { DummyGateway } from "@/features/booking/dummy-gateway";
import { RazorpayCheckout } from "@/features/booking/razorpay-checkout";
import { config } from "@/lib/config";
import { checkoutScriptUrl } from "@/lib/providers/razorpay";
import { EmptyState } from "@/components/ui/states";
import { PayAtVenueOption } from "@/features/booking/pay-at-venue";

export const metadata: Metadata = { title: "Payment" };

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/book/pay/${id}`);
  const booking = await or404(getMyBooking(user.id, id));
  if (booking.status === "confirmed" || booking.status === "requested") redirect(`/book/done/${id}`);
  const provider = config.paymentProvider();
  if (provider === "razorpay") return <RazorpayCheckout initial={booking} scriptSrc={checkoutScriptUrl()} />;
  if (provider === "test") return <DummyGateway initial={booking} />;
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-5 pt-16">
      <EmptyState title="Online payments are unavailable" body={booking.payAtVenue.allowed ? "We can't take payments online right now, but this host accepts cash at the venue." : "We can't take payments right now. Your spot is held for a few minutes; please try again shortly."} />
      <PayAtVenueOption booking={booking} />
    </main>
  );
}
