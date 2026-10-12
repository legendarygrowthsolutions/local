"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useMemo } from "react";
import { CalendarDays, Check, Clock, MapPin } from "lucide-react";
import type { ListingDetail } from "@/contracts";
import type { Draft } from "@/stores/booking-draft";
import { Stepper } from "@/components/ui/stepper";
import { formatDate, formatMins, formatRange, fromISO } from "@/lib/time";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { hasStep } from "./screens";

type S = ListingDetail["sessions"][number];
type T = ListingDetail["ticketTypes"][number];

export function selectionSummary(d: ListingDetail, draft: Draft) {
  const lines = Object.entries(draft.tickets)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ t: d.ticketTypes.find((x) => x.id === id)!, qty }))
    .filter((l) => l.t);
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.t.price, 0);
  const session = d.sessions.find((s) => s.id === draft.sessionId) ?? null;
  return { lines, qty, subtotal, session };
}

export function TicketSelect({ d, draft, patch, policy }: { d: ListingDetail; draft: Draft; patch: (p: Partial<Draft>) => void; policy?: string }) {
  const tpl = d.template;
  const hasPass = hasStep(tpl, "pick_pass") && d.ticketTypes.some((t) => t.isPass);
  const passMode = hasPass && !!draft.passMode;
  const pickSession = hasStep(tpl, "pick_session") && d.sessions.length > 1;
  const firstOpen = d.sessions.find((s) => s.remaining > 0) ?? d.sessions[0];
  const session = d.sessions.find((s) => s.id === draft.sessionId) ?? null;

  // Default to the first session with seats.
  useEffect(() => {
    if (!draft.sessionId && firstOpen) patch({ sessionId: firstOpen.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = d.ticketTypes.filter((t) => (passMode ? t.isPass : !t.isPass && (t.sessionId === null || t.sessionId === session?.id)));
  const { qty: totalQty } = selectionSummary(d, draft);
  const nonPassQty = Object.entries(draft.tickets).reduce((s, [id, q]) => s + (d.ticketTypes.find((t) => t.id === id)?.isPass ? 0 : q), 0);

  const setSession = (s: S) => {
    const keep: Record<string, number> = {};
    for (const [id, q] of Object.entries(draft.tickets)) {
      const t = d.ticketTypes.find((x) => x.id === id);
      if (t && (t.sessionId === null || t.sessionId === s.id) && !t.isPass) keep[id] = Math.min(q, s.remaining);
    }
    patch({ sessionId: s.id, tickets: keep });
  };
  const setQty = (t: T, q: number) => patch({ tickets: { ...draft.tickets, [t.id]: q } });
  const maxFor = (t: T) => {
    const current = draft.tickets[t.id] ?? 0;
    const byOrder = tpl.rules.maxPerOrder - (totalQty - current);
    const bySession = !t.isPass && session ? session.remaining - (nonPassQty - current) : Infinity;
    return Math.max(0, Math.min(t.perOrderMax, t.remaining, byOrder, bySession));
  };

  const dayRow = tpl.schedule === "multi_day" && pickSession && d.sessions.length <= 5;
  const heading = passMode ? "Passes" : tpl.schedule === "multi_day" && session ? `Tickets · ${formatDate(fromISO(session.startsAt).ymd)}` : "Tickets";

  return (
    <div className="flex flex-col gap-[18px]">
      {dayRow ? (
        <section className="flex flex-col gap-2.5" aria-labelledby="day-h">
          <h2 id="day-h" className="font-display text-[19px] font-extrabold">
            Choose a day
          </h2>
          <div className="flex gap-2" role="radiogroup" aria-labelledby="day-h">
            {d.sessions.map((s) => {
              const p = fromISO(s.startsAt);
              const parts = formatDate(p.ymd).split(", ");
              const on = !passMode && s.id === session?.id;
              return (
                <DayCard key={s.id} on={on} disabled={s.remaining === 0} onClick={() => (passMode && patch({ passMode: false, tickets: {} }), setSession(s))} top={parts[0]} bottom={parts[1].split(" ")[0]} />
              );
            })}
            {hasPass && (
              <DayCard on={passMode} onClick={() => patch({ passMode: true, tickets: {} })} top={`All ${d.sessions.length} days`} bottom="Season pass" wide />
            )}
          </div>
        </section>
      ) : (
        <>
          {hasPass && (
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-field p-1" role="tablist" aria-label="Ticket type">
              {[
                { id: false, label: "Day tickets" },
                { id: true, label: "Season pass" },
              ].map((o) => (
                <button key={String(o.id)} role="tab" aria-selected={passMode === o.id} onClick={() => patch({ passMode: o.id, tickets: {} })} className="relative h-11 rounded-xl text-[15px] font-semibold">
                  {passMode === o.id && <m.span layoutId="pass-tab" className="absolute inset-0 rounded-xl bg-surface shadow-[0_1px_2px_rgba(20,18,31,.08)]" />}
                  <span className={cn("relative", passMode === o.id ? "text-ink" : "text-muted")}>{o.label}</span>
                </button>
              ))}
            </div>
          )}
          {pickSession && !passMode && <SessionPicker d={d} selected={session} onPick={setSession} />}
        </>
      )}
      {!pickSession && session && <SessionCard d={d} s={session} />}

      {tpl.bookingMode === "rsvp" ? (
        <RsvpQty d={d} draft={draft} patch={patch} />
      ) : tpl.bookingMode === "registration" ? (
        <Divisions tickets={visible} draft={draft} patch={patch} />
      ) : (
        <section className="flex flex-col gap-2.5" aria-labelledby="tiers">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="tiers" className="font-display text-[19px] font-extrabold">
              {heading}
            </h2>
            <span className="flex-none text-xs text-muted">Max {tpl.rules.maxPerOrder} / order</span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {visible.map((t) => {
              const max = maxFor(t);
              const q = draft.tickets[t.id] ?? 0;
              const soldOut = t.remaining === 0;
              const few = !soldOut && t.qty < 9999 && t.remaining <= 10;
              return (
                <m.li
                  layout
                  key={t.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[18px] border-[1.5px] p-4 transition-[border-color,box-shadow]",
                    soldOut ? "border-field bg-field" : q > 0 ? "border-brand bg-surface shadow-[0_0_0_3px_var(--color-tint)]" : "border-line bg-surface",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className={cn("font-bold", soldOut && "text-subtle line-through")}>
                      {t.name}
                      {few && <span className="ml-1.5 rounded-md bg-urgent-tint px-[7px] py-0.5 align-middle text-[11px] font-bold text-urgent no-underline">Only {t.remaining} left</span>}
                    </p>
                    {soldOut ? (
                      <p className="text-[13px] text-subtle">{formatINR(t.price, { free: "Free" })}</p>
                    ) : (
                      <>
                        {t.description && <p className="text-[13px] text-muted">{t.description}</p>}
                        <p className="font-display text-lg font-extrabold">{formatINR(t.price, { free: "Free" })}</p>
                      </>
                    )}
                  </div>
                  {soldOut ? <span className="text-xs font-bold text-muted">Sold out</span> : <Stepper value={q} max={max} onChange={(v) => setQty(t, v)} label={t.name} />}
                </m.li>
              );
            })}
          </ul>
        </section>
      )}

      {policy && (
        <details className="border-t border-line pt-3 text-[13px] text-ink-2">
          <summary className="min-h-8 cursor-pointer font-bold text-ink">Cancellation &amp; entry policy</summary>
          <p className="mt-1">{policy}</p>
          {d.listing.thingsToKnow.length > 0 && (
            <ul className="mt-2 list-disc pl-4">
              {d.listing.thingsToKnow.slice(0, 3).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  );
}

function DayCard({ on, disabled, onClick, top, bottom, wide }: { on: boolean; disabled?: boolean; onClick: () => void; top: string; bottom: string; wide?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col items-center gap-0.5 rounded-2xl border-[1.5px] px-2 py-2.5 transition-colors disabled:opacity-40",
        wide ? "flex-[1.6]" : "flex-1",
        on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface hover:border-ink/30",
      )}
    >
      <small className={cn("truncate text-[11px] font-semibold", on ? "text-white/90" : "text-muted")}>{top}</small>
      <b className={cn("truncate font-display", wide ? "text-sm" : "text-[19px]")}>{bottom}</b>
    </button>
  );
}

function SessionCard({ d, s }: { d: ListingDetail; s: S }) {
  const p = fromISO(s.startsAt);
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4 text-[15px]">
      <p className="flex items-center gap-2.5">
        <CalendarDays className="size-[18px] text-muted" /> <b>{formatDate(p.ymd)}</b>
      </p>
      <p className="flex items-center gap-2.5">
        <Clock className="size-[18px] text-muted" /> {formatRange(s.startsAt, s.endsAt)}
      </p>
      <p className="flex items-center gap-2.5">
        <MapPin className="size-[18px] text-muted" /> {d.listing.venueName}, {d.area.name}
      </p>
    </div>
  );
}

function SessionPicker({ d, selected, onPick }: { d: ListingDetail; selected: S | null; onPick: (s: S) => void }) {
  const tpl = d.template;
  const byDate = useMemo(() => {
    const m = new Map<string, S[]>();
    for (const s of d.sessions) {
      const k = fromISO(s.startsAt).ymd;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [d.sessions]);
  const selectedDate = selected ? fromISO(selected.startsAt).ymd : byDate[0]?.[0];

  if (tpl.schedule === "date_range") {
    const windows = byDate.find(([k]) => k === selectedDate)?.[1] ?? [];
    return (
      <section className="flex flex-col gap-4" aria-label="Choose a date and entry window">
        <h2 className="font-display text-xl font-bold">When are you visiting?</h2>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="radiogroup">
          {byDate.map(([ymd, list]) => {
            const active = ymd === selectedDate;
            const full = list.every((s) => s.remaining === 0);
            const [wd, rest] = formatDate(ymd).split(", ");
            return (
              <button
                key={ymd}
                role="radio"
                aria-checked={active}
                disabled={full}
                onClick={() => onPick(list.find((s) => s.remaining > 0) ?? list[0])}
                className={cn(
                  "flex h-[68px] w-16 shrink-0 flex-col items-center justify-center rounded-2xl border transition-colors",
                  active ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-line-strong",
                  full && "opacity-40",
                )}
              >
                <span className={cn("text-[11px] font-semibold uppercase", active ? "text-white/90" : "text-muted")}>{wd}</span>
                <span className="text-lg font-bold leading-tight">{rest.split(" ")[0]}</span>
                <span className={cn("text-[10px]", active ? "text-white/90" : "text-muted")}>{rest.split(" ")[1]}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Entry window">
          {windows.map((s) => {
            const active = s.id === selected?.id;
            return (
              <button
                key={s.id}
                role="radio"
                aria-checked={active}
                disabled={s.remaining === 0}
                onClick={() => onPick(s)}
                className={cn(
                  "flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active ? "border-brand bg-tint" : "border-line bg-surface hover:border-line-strong",
                  s.remaining === 0 && "opacity-40",
                )}
              >
                <span className={cn("text-sm font-semibold", active && "text-brand-ink")}>{s.label}</span>
                <span className={cn("text-xs", s.remaining <= 5 && s.remaining > 0 ? "font-semibold text-urgent" : "text-muted")}>
                  {s.remaining === 0 ? "Full" : s.remaining <= 5 ? `${s.remaining} left` : "Available"}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // multi_day + recurring: cards
  return (
    <section className="flex flex-col gap-3" aria-label="Choose a date">
      <h2 className="font-display text-xl font-bold">{tpl.schedule === "recurring" ? "Pick a batch" : "Pick a day"}</h2>
      <div className={cn("grid gap-2", tpl.schedule === "multi_day" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")} role="radiogroup">
        {d.sessions.slice(0, 8).map((s) => {
          const active = s.id === selected?.id;
          const p = fromISO(s.startsAt);
          return (
            <button
              key={s.id}
              role="radio"
              aria-checked={active}
              disabled={s.remaining === 0}
              onClick={() => onPick(s)}
              className={cn(
                "relative flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                active ? "border-brand bg-tint" : "border-line bg-surface hover:border-line-strong",
                s.remaining === 0 && "opacity-45",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className={cn("text-xs font-bold uppercase tracking-wide", active ? "text-brand" : "text-muted")}>{s.label}</p>
                <p className="font-semibold">{formatDate(p.ymd)}</p>
                <p className="text-sm text-muted">
                  {formatMins(p.mins, { compact: true })}
                  {tpl.schedule === "recurring" && (
                    <span className={cn(s.remaining > 0 && s.remaining <= 3 && "font-semibold text-urgent")}> · {s.remaining === 0 ? "Full" : `${s.remaining} seats left`}</span>
                  )}
                </p>
              </div>
              <AnimatePresence>
                {active && (
                  <m.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="grid size-6 place-items-center rounded-full bg-brand text-white">
                    <Check className="size-3.5" />
                  </m.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RsvpQty({ d, draft, patch }: { d: ListingDetail; draft: Draft; patch: (p: Partial<Draft>) => void }) {
  const t = d.ticketTypes[0];
  const q = t ? draft.tickets[t.id] ?? 0 : 0;
  useEffect(() => {
    if (t && !q && t.remaining > 0) patch({ tickets: { [t.id]: 1 } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!t) return null;
  const opts = Array.from({ length: Math.max(1, Math.min(t.perOrderMax, t.remaining)) }, (_, i) => i + 1);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-bold">How many people?</h2>
      {t.remaining === 0 ? (
        <p className="rounded-2xl bg-field p-4 text-sm text-muted">This one is full. Check back — spots open up when people cancel.</p>
      ) : (
        <div className="flex gap-2" role="radiogroup">
          {opts.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={q === n}
              onClick={() => patch({ tickets: { [t.id]: n } })}
              className={cn("h-12 flex-1 rounded-xl border text-[15px] font-semibold", q === n ? "border-brand bg-tint text-brand-ink" : "border-line-strong bg-surface")}
            >
              {n === 1 ? "Just me" : `Me + ${n - 1}`}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted">{t.remaining} of {t.qty} spots left · free entry</p>
    </section>
  );
}

function Divisions({ tickets, draft, patch }: { tickets: T[]; draft: Draft; patch: (p: Partial<Draft>) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-bold">Choose a division</h2>
      <div className="flex flex-col gap-2" role="radiogroup">
        {tickets.map((t) => {
          const active = (draft.tickets[t.id] ?? 0) > 0;
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={active}
              disabled={t.remaining === 0}
              onClick={() => patch({ tickets: { [t.id]: 1 } })}
              className={cn("flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors", active ? "border-brand bg-tint" : "border-line bg-surface hover:border-line-strong", t.remaining === 0 && "opacity-45")}
            >
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", active ? "border-brand" : "border-line-strong")}>
                {active && <m.span layoutId="division-dot" className="size-2.5 rounded-full bg-brand" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t.name}</span>
                <span className="block text-sm text-muted">
                  {t.description} · {t.remaining === 0 ? "Full" : `${t.remaining} team slots left`}
                </span>
              </span>
              <span className="font-bold">{formatINR(t.price, { free: "Free" })}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
