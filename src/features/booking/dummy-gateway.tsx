"use client";

import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, CircleX, CreditCard, Landmark, Lock, Smartphone, Wallet } from "lucide-react";
import type { PayRequest } from "@/contracts";
import type { BookingView } from "@/services/bookings";
import { useBooking, usePay } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useCountdown } from "./hold-timer";

const METHODS = [
  { id: "upi", label: "UPI", icon: Smartphone, hint: "Pay with any UPI app or ID" },
  { id: "card", label: "Credit / debit card", icon: CreditCard, hint: "Visa, Mastercard, RuPay" },
  { id: "netbanking", label: "Netbanking", icon: Landmark, hint: "All major banks" },
  { id: "wallet", label: "Wallets", icon: Wallet, hint: "Popular wallets" },
] as const;

const OPTIONS: Partial<Record<PayRequest["method"], string[]>> = {
  netbanking: ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "Kotak"],
  wallet: ["Paytm", "Amazon Pay", "MobiKwik"],
};

/**
 * Dummy payment gateway (wireframe 13). Nothing is charged and nothing typed here leaves the page:
 * "Pay" and "Simulate success" succeed, "Simulate failure" exercises the failure branch.
 */
export function DummyGateway({ initial }: { initial: BookingView }) {
  const router = useRouter();
  const { data: booking = initial } = useBooking(initial.id, initial);
  const pay = usePay(initial.id);
  const [method, setMethod] = useState<PayRequest["method"]>("upi");
  const [option, setOption] = useState<string | null>(null);
  const [upiId, setUpiId] = useState("");
  const [failed, setFailed] = useState(false);
  const left = useCountdown(booking.holdExpiresAt);
  const expired = left === 0 || booking.status === "expired";

  const run = (outcome: PayRequest["outcome"]) => {
    setFailed(false);
    pay.mutate(
      { method, outcome },
      {
        onSuccess: (r) => {
          if (r.outcome === "success") router.replace(`/book/done/${initial.id}`);
          else setFailed(true);
        },
      },
    );
  };
  const total = formatINR(booking.price.total);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-5 pb-7 pt-4">
      <div className="flex h-11 items-center gap-1.5">
        <button type="button" onClick={() => router.back()} className="-ml-2.5 grid size-11 flex-none place-items-center" aria-label="Back">
          <ChevronLeft className="size-[22px]" strokeWidth={1.8} />
        </button>
        <h1 className="flex-1 font-display text-2xl font-extrabold">Payment</h1>
        <span className="rounded-lg bg-warn-tint px-2.5 py-1.5 text-[11px] font-bold tracking-[0.06em] text-warn">TEST MODE</span>
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

      <AnimatePresence>
        {failed && (
          <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden" role="alert">
            <div className="flex gap-3 rounded-2xl border border-[#f1c6bc] bg-danger-tint p-4">
              <CircleX className="size-5 shrink-0 text-danger" aria-hidden />
              <div className="text-sm">
                <p className="font-semibold text-danger">Payment failed</p>
                <p className="text-ink-2">Your bank declined the payment. Your spot is still held — try again or use another method.</p>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Payment method">
        {METHODS.map((mt) => {
          const Icon = mt.icon;
          const on = method === mt.id;
          const opts = OPTIONS[mt.id];
          return (
            <div key={mt.id} className={cn("rounded-2xl border-[1.5px] bg-surface transition-[border-color,box-shadow]", on ? "border-brand shadow-[0_0_0_3px_var(--color-tint)]" : "border-line")}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setMethod(mt.id);
                  setOption(null);
                }}
                className="flex min-h-[62px] w-full items-center gap-3 px-3.5 text-left"
              >
                <span className={cn("grid size-[38px] flex-none place-items-center rounded-xl", on ? "bg-tint text-brand" : "bg-field text-ink-2")}>
                  <Icon className="size-5" strokeWidth={1.8} aria-hidden />
                </span>
                <span className="flex-1 text-[15px] font-bold">
                  {mt.label}
                  <small className="block text-xs font-medium text-muted">{mt.hint}</small>
                </span>
                <span className={cn("size-[22px] flex-none rounded-full border-2", on ? "border-[7px] border-brand" : "border-line-strong")} aria-hidden />
              </button>
              {on && mt.id === "upi" && (
                <div className="px-3.5 pb-3.5">
                  <label htmlFor="upi-id" className="sr-only">
                    UPI ID (optional in test mode)
                  </label>
                  <input
                    id="upi-id"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="yourname@okbank"
                    autoComplete="off"
                    className="h-[46px] w-full rounded-xl border-[1.5px] border-line-strong px-3 text-[15px] font-medium outline-none focus:border-brand"
                  />
                </div>
              )}
              {on && mt.id === "card" && <p className="mx-3.5 mb-3.5 rounded-xl bg-field p-3 text-[13px] text-ink-2">Test card ending 4242 is used in test mode. No card details are asked for.</p>}
              {on && opts && (
                <div className="flex flex-wrap gap-2 px-3.5 pb-3.5">
                  {opts.map((o) => (
                    <button key={o} type="button" aria-pressed={option === o} onClick={() => setOption(o)} className={cn("h-10 rounded-xl border px-3 text-sm font-semibold", option === o ? "border-brand bg-tint text-brand-ink" : "border-line-strong")}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
            <Button size="lg" block className="font-bold" loading={pay.isPending && pay.variables?.outcome === "success"} disabled={pay.isPending} onClick={() => run("success")}>
              <Lock className="size-4" aria-hidden /> Pay {total}
            </Button>
            <div className="flex gap-2">
              <button type="button" disabled={pay.isPending} onClick={() => run("success")} className="h-11 flex-1 rounded-xl border border-dashed border-[#a3aeac] text-[13px] font-bold text-free disabled:opacity-50">
                Simulate success
              </button>
              <button type="button" disabled={pay.isPending} onClick={() => run("failure")} className="h-11 flex-1 rounded-xl border border-dashed border-[#a3aeac] text-[13px] font-bold text-danger disabled:opacity-50">
                Simulate failure
              </button>
            </div>
            {pay.error && <p className="text-center text-sm text-danger">{pay.error.message}</p>}
          </>
        )}
        <p className="text-center text-xs text-muted">Test mode — no money moves.</p>
      </div>
    </main>
  );
}
