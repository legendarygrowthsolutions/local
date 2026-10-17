"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, CircleX, Lock, ShieldCheck } from "lucide-react";
import type { BookingView } from "@/services/bookings";
import { api, ApiError } from "@/lib/api/client";
import { useBooking, usePay } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/pricing";
import { useCountdown } from "./hold-timer";
import { PayAtVenueOption } from "./pay-at-venue";

interface CheckoutOrder {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { contact?: string; name?: string };
}
type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (o: Record<string, unknown>) => { open(): void; on(evt: string, cb: (r: { error?: { description?: string } }) => void): void };

let scriptPromise: Promise<void> | null = null;
/** Razorpay Checkout is loaded only when someone taps Pay. */
function loadCheckout(src: string) {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function RazorpayCheckout({ initial, scriptSrc }: { initial: BookingView; scriptSrc: string }) {
  const router = useRouter();
  const { data: booking = initial } = useBooking(initial.id, initial);
  const pay = usePay(initial.id);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = useCountdown(booking.holdExpiresAt);
  const expired = left === 0 || booking.status === "expired";
  const total = formatINR(booking.price.total);

  const start = async () => {
    setError(null);
    setOpening(true);
    try {
      const [order] = await Promise.all([api<CheckoutOrder>(`/api/bookings/${initial.id}/checkout`, { method: "POST" }), loadCheckout(scriptSrc)]);
      const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
      const rz = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        theme: { color: "#0B6E79" },
        modal: { ondismiss: () => setOpening(false) },
        handler: (r: RazorpayResult) =>
          pay.mutate(
            { razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature },
            {
              onSuccess: (res) => {
                if (res.outcome === "success") router.replace(`/book/done/${initial.id}`);
                else if (res.outcome === "refunded") setError("Your hold expired before the payment came through, so we've refunded it in full.");
                else setError("Your bank declined the payment. Your spot is still held. Try again or use another method.");
              },
              onError: (e) => setError(e instanceof ApiError ? e.message : "We couldn't confirm the payment. If money was taken, it will be confirmed or refunded automatically."),
              onSettled: () => setOpening(false),
            },
          ),
      });
      rz.on("payment.failed", (r) => {
        setError(r.error?.description ?? "The payment failed. Your spot is still held.");
        // Let them try again whether or not the sheet stays open.
        setOpening(false);
      });
      rz.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the payment");
      setOpening(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-5 pb-7 pt-4">
      <div className="flex h-11 items-center gap-1.5">
        <button type="button" onClick={() => router.back()} className="-ml-2.5 grid size-11 flex-none place-items-center" aria-label="Back">
          <ChevronLeft className="size-[22px]" strokeWidth={1.8} />
        </button>
        <h1 className="flex-1 font-display text-2xl font-extrabold">Payment</h1>
      </div>

      <section className="flex flex-col items-start gap-1 rounded-[22px] bg-feature p-5 text-white" aria-label="Amount payable">
        <span className="text-[13px] text-feature-muted">Amount payable</span>
        <span className="font-display text-4xl font-extrabold">{total}</span>
        <span className="flex w-full justify-between gap-3 text-xs text-feature-muted">
          <span>Order #{booking.code}</span>
          {left !== null && left > 0 && (
            <span className="tabular-nums" suppressHydrationWarning>
              Held {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </span>
          )}
        </span>
      </section>

      {error && (
        <div className="flex gap-3 rounded-2xl border border-[#f1c6bc] bg-danger-tint p-4" role="alert">
          <CircleX className="size-5 shrink-0 text-danger" aria-hidden />
          <p className="text-sm text-ink-2">{error}</p>
        </div>
      )}

      <p className="flex items-start gap-2 rounded-2xl bg-field p-4 text-sm text-ink-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        Pay securely with UPI, cards, netbanking or wallets through Razorpay. Your card details never reach local.
      </p>

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        {expired ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-field p-4">
            <p className="text-sm">Your hold expired and the spots were released.</p>
            <Button variant="secondary" onClick={() => router.push(booking.href ?? "/")}>
              Start again
            </Button>
          </div>
        ) : (
          <>
            <Button size="lg" block className="font-bold" loading={opening || pay.isPending} disabled={opening || pay.isPending} onClick={start}>
              <Lock className="size-4" aria-hidden /> Pay {total}
            </Button>
            <PayAtVenueOption booking={booking} disabled={opening || pay.isPending} />
          </>
        )}
      </div>
    </main>
  );
}
