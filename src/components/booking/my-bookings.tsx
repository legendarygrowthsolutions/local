"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Ticket } from "lucide-react";
import { useMyBookings } from "@/lib/api/hooks";
import type { BookingView } from "@/services/bookings";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { dateStripParts, daysBetween, formatMins, formatRange, fromISO, todayIST } from "@/lib/time";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "cancelled", label: "Cancelled" },
] as const;

export function MyBookings({ city }: { city?: { slug: string; name: string } }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("upcoming");
  const { data, error, isPending, refetch } = useMyBookings();
  const list = data?.[tab] ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-field p-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="relative h-10 rounded-xl text-sm font-semibold">
            {tab === t.id && <m.span layoutId="bk-tab" className="absolute inset-0 rounded-xl bg-surface shadow-[0_1px_2px_rgba(20,18,31,.08)]" />}
            <span className={cn("relative", tab === t.id ? "text-ink" : "text-muted")}>{t.label}</span>
          </button>
        ))}
      </div>
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-[20px]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-5" />}
          title={tab === "upcoming" ? "No plans yet" : tab === "past" ? "Nothing here yet" : "No cancellations"}
          body={tab === "upcoming" ? "Your tickets will show up here once you book something." : undefined}
          action={
            tab === "upcoming" ? (
              <Button asChild size="sm">
                <Link href="/">Explore</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((b, i) => (
              <m.li key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }} exit={{ opacity: 0 }}>
                <BookingRow b={b} next={tab === "upcoming" && i === 0} />
              </m.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {tab === "upcoming" && list.length > 0 && city && (
        <div className="flex flex-col items-center gap-2 py-5 text-center text-sm">
          <span className="text-muted">Looking for more to do?</span>
          <Link href={`/${city.slug}`} className="font-bold text-brand">
            Explore {city.name} →
          </Link>
        </div>
      )}
    </div>
  );
}

/** Wireframe 15 row: date block (brand-filled for the next one), overline, heading, place · time. */
function BookingRow({ b, next }: { b: BookingView; next?: boolean }) {
  const d = dateStripParts(b.dateYmd);
  const days = daysBetween(todayIST(), b.dateYmd);
  const free = b.price.total === 0;
  const qty = b.items.reduce((s, i) => s + i.qty, 0);
  const when = b.status === "requested" ? "AWAITING HOST" : days === 0 ? "TODAY" : days === 1 ? "TOMORROW" : days > 1 && days <= 6 ? `IN ${days} DAYS` : null;
  const extra = b.kind === "venue" ? when : free ? null : `${qty} ${qty === 1 ? "TICKET" : "TICKETS"}`;
  const inactive = b.status === "cancelled" || b.status === "refunded";
  return (
    <Link
      href={`/me/bookings/${b.id}`}
      className={cn("flex gap-3.5 rounded-[20px] border bg-surface p-3 transition-colors", next ? "border-brand shadow-[0_0_0_3px_var(--color-tint)]" : "border-line hover:border-line-strong")}
    >
      <div className={cn("flex w-[58px] flex-none flex-col items-center justify-center rounded-[14px] py-2", next ? "bg-brand text-white" : "bg-field")}>
        <small className={cn("text-[11px] font-bold uppercase", next ? "text-white/90" : "text-muted")}>{d.weekday}</small>
        <b className="font-display text-[23px] leading-[1.1]">{d.day}</b>
        <small className={cn("text-[11px] font-bold uppercase", next ? "text-white/90" : "text-muted")}>{d.month}</small>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-brand">
          {b.kindLabel}
          {free && b.kind !== "venue" ? (
            <>
              {" "}
              · <span className="text-free">FREE RSVP</span>
            </>
          ) : extra ? (
            ` · ${extra}`
          ) : null}
          {inactive && <span className="text-muted"> · {b.status.toUpperCase()}</span>}
        </span>
        <span className="truncate text-[15px] font-bold">{b.heading}</span>
        <span className="truncate text-[13px] text-muted">
          {b.kind === "venue" ? b.venueName : b.venueName} · {b.kind === "venue" ? formatRange(b.startsAt, b.endsAt) : formatMins(fromISO(b.startsAt).mins)}
        </span>
      </div>
    </Link>
  );
}
