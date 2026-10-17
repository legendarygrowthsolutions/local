"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banknote, CircleAlert } from "lucide-react";
import type { BookingView } from "@/services/bookings";
import { usePayAtVenue } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatINR } from "@/lib/pricing";

/** What the guest agrees to when paying at the venue. Shown on the pay screen, the ticket and the booking page. */
export const PAY_AT_VENUE_TERMS = [
  "Pay the host in cash when you arrive. Entry is only after you've paid.",
  "No convenience fee and no coupon: you pay the ticket value, nothing more.",
  "local. doesn't collect this money and isn't responsible for the booking or the payment: that's between you and the host.",
  "If you don't turn up, the host can mark you as a no-show. After 2 no-shows, pay at venue is switched off for your account.",
];

/**
 * "Pay at the venue" on the payment screen (only when the host accepts cash). Confirms the hold
 * without the gateway, after the guest reads what that means. When the guest has used up their
 * no-shows, says so instead of hiding the option.
 */
export function PayAtVenueOption({ booking, disabled }: { booking: BookingView; disabled?: boolean }) {
  const router = useRouter();
  const q = booking.payAtVenue;
  const pay = usePayAtVenue(booking.id);
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const lockedOut = !q.allowed && q.noShows >= q.limit;
  if (!q.allowed && !lockedOut) return null;
  const amount = formatINR(q.amount);

  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-line bg-surface p-4" aria-label="Pay at the venue">
        <div className="flex items-start gap-3">
          <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-field text-ink-2">
            <Banknote className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">Pay at the venue</p>
            {lockedOut ? (
              <p className="text-[13px] text-muted">{q.reason}</p>
            ) : (
              <p className="text-[13px] text-muted">
                Pay {amount} in cash when you arrive. No convenience fee. <b className="text-ink">Entry only after payment.</b>
              </p>
            )}
          </div>
        </div>
        {!lockedOut && (
          <Button variant="secondary" block disabled={disabled} onClick={() => setOpen(true)}>
            Book and pay {amount} at the venue
          </Button>
        )}
      </section>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setAgreed(false);
        }}
        title="Pay at the venue"
        description={`${amount} due in cash when you arrive at ${booking.venueName}.`}
        footer={
          <Button
            size="lg"
            block
            disabled={!agreed}
            loading={pay.isPending}
            onClick={() =>
              pay.mutate(undefined, {
                onSuccess: () => router.replace(`/book/done/${booking.id}`),
              })
            }
          >
            Confirm booking
          </Button>
        }
      >
        <div className="flex flex-col gap-3 pb-2">
          {q.couponDropped && (
            <p className="flex gap-2 rounded-xl bg-warn-tint px-3 py-2.5 text-sm text-warn">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              Coupon {q.couponDropped} won&apos;t apply. Coupons need an online payment.
            </p>
          )}
          <ul className="flex flex-col gap-2 text-sm text-ink-2">
            {PAY_AT_VENUE_TERMS.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-[7px] size-1.5 flex-none rounded-full bg-ink-2" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          {q.noShows > 0 && (
            <p className="text-sm font-semibold text-urgent">
              You have {q.noShows} no-show{q.noShows === 1 ? "" : "s"} on record. One more and this option closes for you.
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong p-3 text-sm">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
            <span>
              I understand I must pay <b>{amount}</b> at the venue to get in, and that local. isn&apos;t responsible for this payment.
            </span>
          </label>
          {pay.error && (
            <p className="text-sm text-danger" role="alert">
              {pay.error.message}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
