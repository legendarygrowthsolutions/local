"use client";

import { m } from "motion/react";
import Link from "next/link";
import { useEffect } from "react";
import type { BookingView } from "@/services/bookings";
import { useDraftStore } from "@/stores/booking-draft";
import { formatINR } from "@/lib/pricing";
import { TicketActions, TicketCard } from "./ticket";

function Check() {
  return (
    <m.svg viewBox="0 0 64 64" className="size-[68px] rounded-full shadow-[0_0_0_8px_var(--color-tint)]" initial="hidden" animate="show" aria-hidden>
      <m.circle cx="32" cy="32" r="32" fill="var(--color-brand)" variants={{ hidden: { scale: 0 }, show: { scale: 1, transition: { type: "spring", stiffness: 260, damping: 18 } } }} />
      <m.path
        d="M20 33 l8 8 l16 -18"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { delay: 0.25, duration: 0.4, ease: "easeOut" } } }}
      />
    </m.svg>
  );
}

export function BookingSuccess({ booking }: { booking: BookingView }) {
  // The draft for this listing is done with.
  useEffect(() => {
    const key = booking.listingId ? `e:${booking.listingId}` : `v:${booking.venueId}`;
    useDraftStore.getState().clear(key);
  }, [booking.listingId, booking.venueId]);

  const requested = booking.status === "requested";
  const channels = booking.attendee?.email ? "SMS, WhatsApp & email" : "SMS & WhatsApp";
  const atVenue = booking.dueAtVenue && (booking.amountDue ?? 0) > 0;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-[18px] px-5 pb-7 pt-7">
      <div className="flex flex-col items-center gap-2 text-center">
        <Check />
        <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.35 } }}>
          <h1 className="font-display text-[30px] font-extrabold leading-tight">{requested ? "Request sent!" : "You\u2019re in!"}</h1>
          <p className="mt-1 text-sm text-muted">{requested ? "The host will confirm shortly. We'll text you." : `${booking.kind === "venue" ? "Booking" : "Tickets"} sent to ${channels}.`}</p>
          {atVenue && (
            <p className="mt-2 text-sm font-semibold text-urgent">
              Bring {formatINR(booking.amountDue!)} in cash. You&apos;ll be let in once you&apos;ve paid the host.
            </p>
          )}
        </m.div>
      </div>
      <m.div initial={{ opacity: 0, y: 40, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0, transition: { delay: 0.5, type: "spring", stiffness: 200, damping: 22 } }}>
        <TicketCard booking={booking} />
      </m.div>
      <m.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.8 } }} className="flex flex-1 flex-col gap-[18px]">
        <TicketActions booking={booking} />
        <Link href="/me/bookings" className="mt-auto flex h-14 items-center justify-center rounded-2xl border-[1.5px] border-ink text-base font-bold transition-colors hover:bg-ink hover:text-white print:hidden">
          View my bookings
        </Link>
      </m.div>
    </main>
  );
}
