"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import type { BookingView } from "@/services/bookings";
import { useRescheduleBooking, useRescheduleOptions } from "@/lib/api/hooks";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/pricing";
import { formatMins, formatWhen } from "@/lib/time";
import { groupByDaypart } from "@/lib/slots/engine";
import { cn } from "@/lib/utils";

/** Move a booking: a slot of the same length (courts) or another date (events), within the policy that applies. */
export function RescheduleSheet({ booking, open, onOpenChange }: { booking: BookingView; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [date, setDate] = useState<string | undefined>();
  const [pick, setPick] = useState<{ startMins: number } | { sessionId: string } | null>(null);
  const { data, isPending, isPlaceholderData } = useRescheduleOptions(booking.id, date, open);
  const move = useRescheduleBooking(booking.id);
  const slotMode = booking.reschedule.mode === "slot";
  const ready = !!pick && !isPlaceholderData;
  const submit = () =>
    move.mutate("startMins" in pick! ? { date: data!.date!, startMins: pick.startMins } : { sessionId: pick!.sessionId }, {
      onSuccess: (r) => {
        toast.success(`Moved to ${formatWhen(r.booking.startsAt)}`);
        onOpenChange(false);
        setPick(null);
      },
      onError: (e) => toast.error(e.message),
    });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Move this booking"
      description={booking.reschedule.reason}
      footer={
        <Button size="lg" block loading={move.isPending} disabled={!ready} onClick={submit}>
          {pick ? "Confirm move" : slotMode ? "Pick a slot" : "Pick a date"}
        </Button>
      }
    >
      {isPending || !data ? (
        <Skeleton className="mb-4 h-72 rounded-2xl" />
      ) : slotMode ? (
        <div className={cn("flex flex-col gap-4 pb-2", isPlaceholderData && "opacity-60")}>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="radiogroup" aria-label="Date">
            {data.dates.map((d) => {
              const on = d.date === data.date;
              return (
                <button key={d.date} role="radio" aria-checked={on} onClick={() => (setDate(d.date), setPick(null))} className={cn("flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center", on ? "border-brand bg-brand text-white" : "border-line bg-surface")}>
                  <span className={cn("text-[10px] font-semibold uppercase", on ? "text-white/90" : "text-muted")}>{d.weekday}</span>
                  <span className="text-sm font-bold">{d.day}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            {data.durationMins / 60} h · up to {formatINR(data.maxPrice)} · {data.quote.movesLeft} {data.quote.movesLeft === 1 ? "move" : "moves"} left
          </p>
          {groupByDaypart(data.slots.map((s) => ({ ...s, startsAt: "", status: s.ok ? "available" : "booked" }))).map((g) => (
            <div key={g.id} className="flex flex-col gap-2">
              <span className="text-sm font-semibold">{g.label}</span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {g.slots.map((s) => {
                  const o = data.slots.find((x) => x.startMins === s.startMins)!;
                  const on = pick && "startMins" in pick && pick.startMins === s.startMins;
                  return (
                    <button key={s.startMins} type="button" disabled={!o.ok} title={o.why ?? undefined} aria-pressed={!!on} onClick={() => setPick({ startMins: s.startMins })} className={cn("flex h-12 flex-col items-center justify-center rounded-xl border text-sm font-semibold disabled:opacity-35", on ? "border-brand bg-brand text-white" : o.current ? "border-brand border-dashed" : "border-line-strong")}>
                      <span className="flex items-center gap-1">
                        {formatMins(s.startMins, { compact: true })}
                        {o.peak && <Zap className="size-3" />}
                      </span>
                      <span className={cn("text-[11px]", on ? "text-white/80" : "text-muted")}>{o.current ? "Current" : o.ok ? formatINR(o.price) : o.why}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2 pb-2">
          {data.sessions.map((s) => {
            const on = pick && "sessionId" in pick && pick.sessionId === s.id;
            return (
              <li key={s.id}>
                <button type="button" disabled={!s.ok} aria-pressed={!!on} onClick={() => setPick({ sessionId: s.id })} className={cn("flex h-14 w-full items-center justify-between rounded-xl border px-4 text-left text-sm disabled:opacity-40", on ? "border-brand bg-tint" : s.current ? "border-brand border-dashed" : "border-line-strong")}>
                  <span>
                    <b>{formatWhen(s.startsAt)}</b>
                    {s.label && <span className="ml-1.5 text-muted">{s.label}</span>}
                  </span>
                  <span className="text-xs text-muted">{s.current ? "Current" : s.ok ? `${s.remaining} left` : "Full"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
