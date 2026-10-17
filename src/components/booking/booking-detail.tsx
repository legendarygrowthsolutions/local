"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { BookingView } from "@/services/bookings";
import { useBooking, useCancelBooking } from "@/lib/api/hooks";
import { BackBar } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { TicketActions, TicketCard } from "@/features/booking/ticket";
import { PriceBreakdown } from "@/features/booking/price-breakdown";
import { PAY_AT_VENUE_TERMS } from "@/features/booking/pay-at-venue";
import { RescheduleSheet } from "./reschedule-sheet";
import { formatINR } from "@/lib/pricing";
import { formatWhen } from "@/lib/time";

export function BookingDetail({ initial }: { initial: BookingView }) {
  const { data = initial } = useBooking(initial.id, initial);
  const b = data;
  const cancel = useCancelBooking(initial.id);
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const active = b.status === "confirmed" || b.status === "requested";
  return (
    <>
      <BackBar title="Booking" fallback="/me/bookings" className="md:hidden" />
      <main className="mx-auto flex max-w-lg flex-col gap-5 px-4 pt-5 md:pt-10 lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:px-0 lg:pt-0">
        <Link href="/me/bookings" className="hidden items-center gap-1 text-sm font-semibold text-muted hover:text-ink md:inline-flex lg:col-span-2">
          <ChevronLeft className="size-4" /> Bookings
        </Link>
        <div className="flex flex-col gap-5">
          <TicketCard booking={b} />
          {active && <TicketActions booking={b} />}
          {b.href && (
            <Button asChild variant="secondary" block>
              <Link href={b.href}>View {b.kind === "venue" ? "venue" : "event"} page</Link>
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-5 lg:sticky lg:top-24">
          <section className="rounded-[24px] border border-line bg-surface p-5">
            <h2 className="mb-4 font-display text-lg font-bold">Payment</h2>
            <PriceBreakdown price={b.price} coupon={b.couponCode} />
            {b.paymentRef && <p className="mt-3 text-xs text-subtle">Ref {b.paymentRef}</p>}
            {b.dueAtVenue ? (
              (b.amountDue ?? 0) > 0 && active ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="rounded-xl bg-urgent-tint px-3 py-2.5 text-sm font-semibold text-urgent">Pay {formatINR(b.amountDue!)} in cash at the venue. Entry only after payment.</p>
                  <p className="text-xs text-muted">{PAY_AT_VENUE_TERMS[2]} {PAY_AT_VENUE_TERMS[3]}</p>
                </div>
              ) : b.status === "no_show" ? (
                <p className="mt-3 rounded-xl bg-danger-tint px-3 py-2 text-sm font-semibold text-danger">The host marked this booking as a no-show. Nothing was paid.</p>
              ) : (b.amountDue ?? 0) === 0 && (b.status === "confirmed" || b.status === "checked_in") ? (
                <p className="mt-3 rounded-xl bg-free-tint px-3 py-2 text-sm font-semibold text-free">Paid at the venue</p>
              ) : null
            ) : (
              (b.amountDue ?? 0) > 0 && <p className="mt-3 rounded-xl bg-warn-tint px-3 py-2 text-sm font-semibold text-warn">{formatINR(b.amountDue!)} to pay at the venue</p>
            )}
          </section>
          {active && (b.reschedule.allowed || (b.rescheduledCount ?? 0) > 0) && (
            <section className="flex flex-col gap-3 rounded-[24px] border border-line bg-surface p-5">
              <h2 className="font-display text-lg font-bold">Change the time</h2>
              {b.rescheduledFrom && <p className="text-sm text-muted">Moved from {formatWhen(b.rescheduledFrom)}.</p>}
              <p className="text-sm text-muted">{b.reschedule.reason}</p>
              {b.reschedule.allowed && (
                <Button variant="secondary" onClick={() => setMoving(true)}>
                  Move booking
                </Button>
              )}
            </section>
          )}
          {active && (
            <section className="flex flex-col gap-3 rounded-[24px] border border-line bg-surface p-5">
              <h2 className="font-display text-lg font-bold">Cancellation</h2>
              <p className="text-sm text-muted">{b.cancel.reason}</p>
              {b.cancel.allowed && (
                <Button variant="danger" onClick={() => setOpen(true)}>
                  Cancel booking
                </Button>
              )}
            </section>
          )}
        </div>
      </main>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Cancel this booking?"
        description={b.cancel.refundAmount > 0 ? `You'll get ${formatINR(b.cancel.refundAmount)} back to your original payment method in 5–7 days.` : "Your spot will be released for someone else."}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" block onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              size="lg"
              block
              className="bg-danger hover:bg-[#9a1d14]"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(undefined, {
                  onSuccess: (r) => {
                    setOpen(false);
                    toast.success(r.refundAmount > 0 ? `Cancelled · ${formatINR(r.refundAmount)} refund on its way` : "Booking cancelled");
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Yes, cancel
            </Button>
          </div>
        }
      >
        <p className="pb-2 text-sm text-muted">{b.cancel.reason}</p>
      </Sheet>
      <RescheduleSheet booking={b} open={moving} onOpenChange={setMoving} />
    </>
  );
}
