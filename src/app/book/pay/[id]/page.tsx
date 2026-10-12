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
    <main className="mx-auto max-w-lg px-5 pt-16">
      <EmptyState title="Payments are unavailable" body="We can't take payments right now. Your spot is held for a few minutes; please try again shortly." />
    </main>
  );
}
