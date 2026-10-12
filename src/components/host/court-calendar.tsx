"use client";

import { useState } from "react";
import { Ban, Lock, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAddBlock, useRemoveBlock, useSchedule, type ScheduleSlot } from "@/lib/api/host-hooks";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { dateStripParts, formatDate, formatMins, todayIST } from "@/lib/time";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const REASONS = ["Maintenance", "Walk-in", "Coaching", "Private event"];

export function CourtCalendar({ isOwner }: { isOwner: boolean }) {
  const [venue, setVenue] = useState<string | undefined>();
  const [date, setDate] = useState<string | undefined>();
  const { data, error, isPending, isFetching, refetch } = useSchedule(venue, date);
  const add = useAddBlock();
  const remove = useRemoveBlock();
  const [sel, setSel] = useState<{ resourceId: string; resourceName: string; slot: ScheduleSlot; hours: number } | null>(null);
  const [reason, setReason] = useState(REASONS[0]);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending) return <Skeleton className="h-[480px] rounded-[20px]" />;
  if (!data) return <EmptyState title="No venues yet" body="Create a courts listing to manage slots here." />;

  const allStarts = [...new Set(data.resources.flatMap((r) => r.slots.map((s) => s.startMins)))].sort((a, b) => a - b);
  const today = todayIST();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {data.venues.length > 1 && (
          <select value={data.venueId} onChange={(e) => setVenue(e.target.value)} className="h-10 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold outline-none" aria-label="Venue">
            {data.venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto" role="radiogroup" aria-label="Date">
          {data.dates.map((d) => {
            const p = dateStripParts(d);
            const on = d === data.date;
            return (
              <button key={d} role="radio" aria-checked={on} onClick={() => setDate(d)} className={cn("flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-center", on ? "border-brand bg-brand text-white" : "border-line bg-surface")}>
                <span className={cn("text-[10px] font-semibold uppercase", on ? "text-white/90" : "text-muted")}>{d === today ? "Today" : p.weekday}</span>
                <span className="text-sm font-bold">{p.day}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <Legend cls="border border-line-strong bg-surface" label="Free" />
        <Legend cls="bg-tint" label="Booked" />
        <Legend cls="bg-free-tint" label="Checked in" />
        <Legend cls="bg-[repeating-linear-gradient(45deg,#ECF0EF,#ECF0EF_4px,#DDE3E1_4px,#DDE3E1_8px)]" label="Blocked" />
        <span className="inline-flex items-center gap-1">
          <Zap className="size-3" /> Peak
        </span>
        {isFetching && <span>Updating…</span>}
      </div>
      <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-20 bg-surface px-3 py-3 text-left text-xs font-semibold text-muted">{formatDate(data.date).split(", ")[1]}</th>
              {data.resources.map((r) => (
                <th key={r.resource.id} className="px-2 py-3 text-left">
                  <span className="block font-semibold">{r.resource.name}</span>
                  <span className="block text-xs font-normal text-muted">
                    {r.resource.sport.replace("-", " ")} · {r.resource.slotLengthMins}m
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allStarts.map((start) => (
              <tr key={start} className="border-t border-line">
                <td className="sticky left-0 z-10 bg-surface px-3 py-1 text-xs font-semibold tabular-nums text-muted">{formatMins(start, { compact: true })}</td>
                {data.resources.map((r) => {
                  const s = r.slots.find((x) => x.startMins === start);
                  if (!s) return <td key={r.resource.id} className="px-1 py-1" />;
                  const booked = s.booking || s.status === "booked" || s.status === "held";
                  const blocked = !!s.block;
                  return (
                    <td key={r.resource.id} className="px-1 py-1">
                      <button
                        type="button"
                        disabled={booked && !s.booking}
                        onClick={() => {
                          if (blocked)
                            return remove.mutate(s.block!.id, { onSuccess: () => toast.success("Slot unblocked"), onError: (e) => toast.error(e.message) });
                          if (booked) return toast(`${s.booking?.customer ?? "Booked"} · ${s.booking?.code ?? "other channel"}`);
                          if (s.isPast) return toast("That slot is in the past");
                          setSel({ resourceId: r.resource.id, resourceName: r.resource.name, slot: s, hours: 1 });
                        }}
                        className={cn(
                          "flex h-11 w-full min-w-24 items-center justify-between gap-1 rounded-lg px-2 text-left text-xs transition-colors",
                          blocked
                            ? "bg-[repeating-linear-gradient(45deg,#ECF0EF,#ECF0EF_4px,#DDE3E1_4px,#DDE3E1_8px)] text-muted"
                            : booked
                              ? s.booking?.status === "checked_in"
                                ? "bg-free-tint text-free"
                                : "bg-tint text-brand-ink"
                              : s.isPast
                                ? "bg-field/60 text-subtle"
                                : "border border-line-strong hover:border-brand",
                        )}
                      >
                        <span className="truncate font-semibold">{blocked ? s.block!.reason : booked ? (s.booking?.customer ?? "Booked") : s.isPast ? "—" : "Free"}</span>
                        <span className="flex shrink-0 items-center gap-0.5 text-muted">
                          {s.peak && !booked && !blocked && !s.isPast && <Zap className="size-3" />}
                          {isOwner && !booked && !blocked && !s.isPast && s.price !== null && formatINR(s.price)}
                          {blocked && <Ban className="size-3" />}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isOwner && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5" /> Slot prices are visible to the owner only.
        </p>
      )}

      <Sheet
        open={!!sel}
        onOpenChange={(o) => !o && setSel(null)}
        title={`Block ${sel?.resourceName ?? ""}`}
        description={sel ? `${formatDate(data.date)} from ${formatMins(sel.slot.startMins)}` : undefined}
        footer={
          <Button
            size="lg"
            block
            loading={add.isPending}
            onClick={() =>
              sel &&
              add.mutate(
                { resourceId: sel.resourceId, date: data.date, startMins: sel.slot.startMins, endMins: sel.slot.startMins + sel.hours * (sel.slot.endMins - sel.slot.startMins), reason },
                {
                  onSuccess: () => {
                    toast.success("Blocked — players can't book it");
                    setSel(null);
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            Block slot{sel && sel.hours > 1 ? "s" : ""}
          </Button>
        }
      >
        {sel && (
          <div className="flex flex-col gap-5 pb-2">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Reason</span>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => setReason(r)} className={cn("h-10 rounded-full border px-4 text-sm font-semibold", reason === r ? "border-brand bg-brand text-white" : "border-line-strong")}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">How many slots?</span>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((h) => (
                  <button key={h} type="button" onClick={() => setSel({ ...sel, hours: h })} className={cn("h-11 flex-1 rounded-xl border text-sm font-semibold", sel.hours === h ? "border-brand bg-tint text-brand-ink" : "border-line-strong")}>
                    {h}
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted">
                {formatMins(sel.slot.startMins)} – {formatMins(sel.slot.startMins + sel.hours * (sel.slot.endMins - sel.slot.startMins))}
              </p>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3.5 rounded", cls)} /> {label}
    </span>
  );
}
