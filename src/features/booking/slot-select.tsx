"use client";

import { m } from "motion/react";
import { useEffect, useMemo } from "react";
import type { ResourceAvailability, Slot, VenueDetail } from "@/contracts";
import type { Draft } from "@/stores/booking-draft";
import { useAvailability } from "@/lib/api/hooks";
import { groupByDaypart, nextSelection } from "@/lib/slots/engine";
import { formatMins } from "@/lib/time";
import { formatINR } from "@/lib/pricing";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/utils";

type Sel = NonNullable<Draft["sel"]>;

/** "Any court": merge courts of the dominant slot length; a slot is free if any court has it. */
function mergeAny(resources: ResourceAvailability[]) {
  const counts = new Map<number, number>();
  for (const r of resources) counts.set(r.resource.slotLengthMins, (counts.get(r.resource.slotLengthMins) ?? 0) + 1);
  const len = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 60;
  const pool = resources.filter((r) => r.resource.slotLengthMins === len);
  const base = pool[0]?.slots ?? [];
  const slots: Slot[] = base.map((s, i) => {
    const free = pool.map((r) => r.slots[i]).filter((x) => x?.status === "available");
    if (free.length) return { ...s, status: "available", price: Math.min(...free.map((f) => f.price)) };
    const statuses = pool.map((r) => r.slots[i]?.status);
    return { ...s, status: statuses.includes("past") ? "past" : statuses.includes("held") ? "held" : "booked" };
  });
  return { pool, slots, rule: pool[0]?.rule };
}

function assignCourt(pool: ResourceAvailability[], range: { startMins: number; endMins: number }) {
  return pool.find((r) => r.slots.filter((s) => s.startMins >= range.startMins && s.endMins <= range.endMins).every((s) => s.status === "available"));
}

export function slotSummary(d: VenueDetail, draft: Draft, data?: { resources: ResourceAvailability[] }) {
  if (!draft.sel || !data) return null;
  const ra = data.resources.find((r) => r.resource.id === draft.sel!.resourceId);
  if (!ra) return null;
  const inside = ra.slots.filter((s) => s.startMins >= draft.sel!.startMins && s.endMins <= draft.sel!.endMins);
  if (!inside.length || inside.some((s) => s.status !== "available")) return null;
  return { resource: ra.resource, price: inside.reduce((s, x) => s + x.price, 0), mins: draft.sel.endMins - draft.sel.startMins };
}

export function SlotSelect({ d, draft, patch }: { d: VenueDetail; draft: Draft; patch: (p: Partial<Draft>) => void }) {
  const sport = draft.sport && d.venue.sports.includes(draft.sport) ? draft.sport : d.venue.sports[0];
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } = useAvailability(d.venue.id, sport, draft.date);
  // While another date/sport loads, the previous grid stays visible but must not be bookable.
  const stale = isPlaceholderData;
  const courtMode = draft.resourceId ?? "any";

  // Server may clamp an out-of-window date; keep the draft in sync.
  useEffect(() => {
    if (data && !stale && data.date !== draft.date && data.sport === sport) patch({ date: data.date });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.date, stale]);

  const view = useMemo(() => {
    if (!data || data.sport !== sport) return null;
    if (courtMode === "any") {
      const m = mergeAny(data.resources);
      return { slots: m.slots, rule: m.rule, pool: m.pool };
    }
    const r = data.resources.find((x) => x.resource.id === courtMode) ?? data.resources[0];
    return { slots: r.slots, rule: r.rule, pool: [r] };
  }, [data, sport, courtMode]);

  const selOnView: { startMins: number; endMins: number } | null =
    draft.sel && view && (courtMode === "any" || draft.sel.resourceId === courtMode) ? { startMins: draft.sel.startMins, endMins: draft.sel.endMins } : null;

  const tap = (slot: Slot) => {
    if (!view?.rule || stale) return;
    const next = nextSelection(view.slots, selOnView, slot, view.rule);
    if (!next) return patch({ sel: null });
    const court = assignCourt(view.pool, next) ?? assignCourt(view.pool, { startMins: slot.startMins, endMins: slot.endMins });
    if (!court) return;
    const range = assignCourt(view.pool, next) ? next : { startMins: slot.startMins, endMins: slot.endMins };
    if (courtMode === "any") {
      // Pin the auto-picked court so the grid shows exactly what can be extended.
      // The court chip switches to the picked court, which tells people which one they got.
      patch({ sel: { ...range, resourceId: court.resource.id } as Sel, resourceId: court.resource.id });
      return;
    }
    patch({ sel: { ...range, resourceId: court.resource.id } as Sel });
  };

  const visibleSlots = view?.slots.filter((s) => s.status !== "past") ?? [];
  const groups = groupByDaypart(visibleSlots);

  const selected = draft.date ?? data?.date;
  const rule = view?.rule;
  const hint = rule
    ? `Tap a start time, then tap another to extend. Min ${fmtDur(rule.minMins)} · max ${fmtDur(rule.maxMins)}.`
    : "Tap a start time, then tap another to extend.";

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0" role="radiogroup" aria-label="Date">
        {(data?.dates ?? Array.from({ length: 7 }, () => null)).map((dt, i) =>
          dt ? (
            <button
              key={dt.date}
              role="radio"
              aria-checked={dt.date === selected}
              onClick={() => patch({ date: dt.date, sel: null })}
              className={cn(
                "flex h-[62px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl border transition-colors",
                dt.date === selected ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <span className={cn("text-[11px] font-semibold", dt.date === selected ? "text-white/90" : "text-muted")}>{i === 0 ? "Today" : dt.weekday}</span>
              <span className="font-display text-[19px] font-bold leading-tight">{dt.day}</span>
            </button>
          ) : (
            <Skeleton key={i} className="h-[62px] w-[52px] shrink-0 rounded-2xl" />
          ),
        )}
      </div>

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0" role="radiogroup" aria-label="Court">
        <CourtChip on={courtMode === "any"} onClick={() => patch({ resourceId: "any", sel: null })}>
          Any available
        </CourtChip>
        {data?.resources.map((r) => (
          <CourtChip key={r.resource.id} on={courtMode === r.resource.id} onClick={() => patch({ resourceId: r.resource.id, sel: null })}>
            {r.resource.name} · {r.resource.slotLengthMins} min
          </CourtChip>
        ))}
      </div>

      <ul className="flex flex-wrap items-center gap-3.5 text-xs font-medium text-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-line-strong bg-surface" aria-hidden /> Open
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-brand" aria-hidden /> Selected
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-field ring-1 ring-line" aria-hidden /> Booked
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#e0401e]" aria-hidden /> Peak
        </li>
      </ul>

      <section aria-label="Time slots" className="flex flex-col gap-4">
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isPending || !view ? (
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-[54px] rounded-[14px]" />
            ))}
          </div>
        ) : visibleSlots.length === 0 ? (
          <p className="rounded-2xl bg-field p-4 text-sm text-muted">No more slots today. Pick another date.</p>
        ) : (
          <div className={cn("flex flex-col gap-4 transition-opacity", isFetching && "opacity-60")}>
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted">{g.label}</p>
                <div className="grid grid-cols-4 gap-2 lg:grid-cols-6">
                  {g.slots.map((s) => {
                    const inSel = !!selOnView && s.startMins >= selOnView.startMins && s.endMins <= selOnView.endMins;
                    const first = inSel && s.startMins === selOnView!.startMins;
                    const last = inSel && s.endMins === selOnView!.endMins;
                    const avail = s.status === "available";
                    return (
                      <m.button
                        key={s.startMins}
                        type="button"
                        whileTap={avail ? { scale: 0.95 } : undefined}
                        onClick={() => tap(s)}
                        disabled={!avail || stale}
                        aria-pressed={inSel}
                        aria-label={`${formatMins(s.startMins)} to ${formatMins(s.endMins)}, ${avail ? formatINR(s.price) : s.status}${s.peak ? ", peak" : ""}`}
                        className={cn(
                          "relative flex h-[54px] flex-col items-center justify-center gap-px border text-center transition-[background-color,border-color,border-radius] duration-150",
                          inSel ? cn("border-brand bg-brand text-white", first && last ? "rounded-[14px]" : first ? "rounded-l-[14px] rounded-r" : last ? "rounded-l rounded-r-[14px]" : "rounded") : "rounded-[14px]",
                          !inSel && (avail ? "border-line-strong bg-surface hover:border-brand/60" : "border-field bg-field text-[#a3aeac]"),
                        )}
                      >
                        <span className={cn("text-[13px] font-bold", !avail && "line-through")}>{formatMins(s.startMins, { compact: true })}</span>
                        {avail && <span className={cn("text-[11px] font-medium", inSel ? "text-white/90" : "text-muted")}>{formatINR(s.price)}</span>}
                        {avail && s.peak && !inSel && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#e0401e]" aria-hidden />}
                      </m.button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">{hint}</p>
      </section>
    </div>
  );
}

function fmtDur(mins: number) {
  return mins % 60 === 0 ? `${mins / 60} hr${mins > 60 ? "s" : ""}` : `${mins} min`;
}

function CourtChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn("h-[38px] shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors", on ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:border-ink/30")}
    >
      {children}
    </button>
  );
}
