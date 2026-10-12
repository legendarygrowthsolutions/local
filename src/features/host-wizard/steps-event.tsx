"use client";

import { m } from "motion/react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { EventListingInput, SessionInput, TicketInput } from "@/contracts";
import { CategoryIcon } from "@/components/ui/icon";
import { addDays, formatDate } from "@/lib/time";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { dateRangeSessions, sessionsForSchedule, weekly } from "./defaults";
import { Card, Counter, Field, inputCls, NumberInput, TimeInput } from "./fields";
import { ChipSelect, LinesEditor, MediaPicker, QuestionsEditor } from "./steps-shared";
import type { WizardCatalog, WizardHost } from "./types";

type P = { v: EventListingInput; set: (p: Partial<EventListingInput>) => void; errors: Record<string, string>; catalog: WizardCatalog; host: WizardHost };

const LANGS = ["English", "Hindi", "Marathi", "Gujarati", "Tamil", "Bengali"];
const AGES = ["All ages", "12+", "16+", "18+", "21+"];

export function EventBasics({ v, set, errors, catalog }: P) {
  const cats = catalog.categories.filter((c) => c.slug !== "sports");
  const cat = cats.find((c) => c.id === v.categoryId);
  return (
    <>
      <Card title="What is it?">
        <Field label="Title" error={errors.title} hint="Short and specific: “Jazz on the Terrace”, not “Music event”.">
          <input className={inputCls} value={v.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Sunday Stand-up Showcase" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Category</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={v.categoryId === c.id}
                onClick={() => set({ categoryId: c.id, subcategoryId: null, templateId: "" })}
                className={cn("flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-sm font-semibold transition-colors", v.categoryId === c.id ? "border-brand bg-tint text-brand-ink" : "border-line hover:border-line-strong")}
              >
                <CategoryIcon name={c.icon} className="size-5 text-brand" />
                {c.name}
              </button>
            ))}
          </div>
          {errors.categoryId && <span className="text-sm text-danger">{errors.categoryId}</span>}
        </div>
        {cat && cat.children.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">
              Type <span className="font-normal text-muted">(optional)</span>
            </span>
            <ChipSelect options={cat.children.map((s) => ({ id: s.id, label: s.name }))} value={v.subcategoryId ? [v.subcategoryId] : []} onChange={(x) => set({ subcategoryId: x[0] === v.subcategoryId ? null : x[0] })} />
          </div>
        )}
      </Card>
      <Card title="Describe it">
        <Field label="One-line summary" error={errors.summary} hint={`${v.summary.length}/140 · shown on cards and in search`}>
          <input className={inputCls} value={v.summary} maxLength={140} onChange={(e) => set({ summary: e.target.value })} />
        </Field>
        <Field label="Description" error={errors.description} hint="What to expect, who it's for, what's included. Blank lines make paragraphs.">
          <textarea className={cn(inputCls, "h-40 resize-y py-3")} value={v.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Age</span>
            <ChipSelect options={AGES.map((a) => ({ id: a, label: a }))} value={[v.ageLimit]} onChange={(x) => set({ ageLimit: x[0] })} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Languages</span>
            <ChipSelect multi options={LANGS.map((a) => ({ id: a, label: a }))} value={v.languages} onChange={(x) => set({ languages: x })} />
            {errors.languages && <span className="text-sm text-danger">{errors.languages}</span>}
          </div>
        </div>
      </Card>
    </>
  );
}

export function EventLocation({ v, set, errors, catalog, host }: P) {
  return (
    <>
      <Card title="Where is it?" sub={`Listings go live in ${host.cityName}.`}>
        <Field label="Venue name" error={errors.venueName}>
          <input className={inputCls} value={v.venueName} onChange={(e) => set({ venueName: e.target.value })} placeholder="e.g. The Courtyard Studio" />
        </Field>
        <Field label="Area" error={errors.areaId}>
          <select className={inputCls} value={v.areaId} onChange={(e) => set({ areaId: e.target.value })}>
            <option value="">Choose an area</option>
            {catalog.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Full address" error={errors.address}>
          <textarea className={cn(inputCls, "h-20 resize-none py-3")} value={v.address} onChange={(e) => set({ address: e.target.value })} placeholder="Building, street, landmark" />
        </Field>
      </Card>
      <MediaPicker media={v.media} onChange={(media) => set({ media })} />
    </>
  );
}

/** Event half of "Booking setup" (wireframe 20): variant of the chosen booking mode, then dates. */
export function EventSetup({ v, set, errors, catalog, host }: P) {
  const cat = catalog.categories.find((c) => c.id === v.categoryId);
  const tpl = catalog.templates.find((t) => t.id === v.templateId);
  const locked = host.kycStatus !== "verified";
  const variants = tpl ? catalog.templates.filter((t) => t.bookingMode === tpl.bookingMode && cat && t.allowedCategories.includes(cat.slug)) : [];
  return (
    <>
      {tpl && variants.length > 1 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-[#e6e6e1] bg-surface p-5">
          <h2 className="font-display text-lg font-bold">{tpl.bookingMode === "ticketed" ? "Ticket schedule" : "Schedule"}</h2>
          <div className="flex flex-wrap gap-[3px] rounded-[10px] bg-[#efefea] p-[3px]" role="radiogroup" aria-label="Schedule">
            {variants.map((t) => {
              const disabled = t.pricing === "paid" && locked;
              const on = t.id === v.templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => set(applyTemplate(v, t, locked))}
                  className={cn("inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors disabled:opacity-50", on ? "bg-surface text-ink shadow-[0_1px_2px_rgba(20,18,31,.08)]" : "text-muted")}
                >
                  {t.name.replace(/^Ticketed — /, "")}
                  {disabled && <Lock className="size-3" aria-hidden />}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted">{tpl.description}</p>
        </section>
      )}
      {errors.templateId && <p className="text-sm text-danger">{errors.templateId}</p>}
      {tpl && <SessionsEditor v={v} set={set} schedule={tpl.schedule} mode={tpl.bookingMode} error={errors.sessions} />}
    </>
  );
}

/** Fields that change when a template is picked (dates shape, default tickets, questions). */
export function applyTemplate(v: EventListingInput, t: WizardCatalog["templates"][number], locked: boolean): Partial<EventListingInput> {
  return {
    templateId: t.id,
    sessions: t.schedule === "date_range" ? [] : sessionsForSchedule(t.schedule, v.sessions),
    tickets: t.bookingMode === "rsvp" || t.bookingMode === "none" ? [] : v.tickets.length ? v.tickets : defaultTickets(t.bookingMode, t.schedule, locked),
    formFields: t.bookingMode === "none" ? [] : v.formFields,
  };
}

function defaultTickets(mode: string, schedule: string, locked: boolean): TicketInput[] {
  const price = locked ? 0 : mode === "registration" ? 800 : 499;
  if (mode === "registration") return [{ name: "Open division", description: "Anyone can enter", price, qty: 32, perOrderMax: 1, isPass: false, sessionIndex: null }];
  if (schedule === "date_range") return [
    { name: "Adult", description: "", price: locked ? 0 : 200, qty: 9999, perOrderMax: 8, isPass: false, sessionIndex: null },
    { name: "Student", description: "Valid student ID at entry", price: locked ? 0 : 100, qty: 9999, perOrderMax: 8, isPass: false, sessionIndex: null },
  ];
  if (schedule === "recurring") return [{ name: "One seat", description: "All materials included", price: locked ? 0 : 1200, qty: 9999, perOrderMax: 4, isPass: false, sessionIndex: null }];
  return [{ name: "General admission", description: "", price, qty: 100, perOrderMax: 6, isPass: false, sessionIndex: null }];
}

function SessionsEditor({ v, set, schedule, mode, error }: { v: EventListingInput; set: P["set"]; schedule: string; mode: string; error?: string }) {
  const setSession = (i: number, p: Partial<SessionInput>) => set({ sessions: v.sessions.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const first = v.sessions[0];

  if (schedule === "date_range") return <DateRangeEditor v={v} set={set} error={error} />;

  if (schedule === "recurring" && first) {
    const wd = formatDate(first.date).split(",")[0];
    return (
      <Card title="Batches" sub={`Every ${wd} · each batch is booked separately`}>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="First batch">
            <input type="date" className={inputCls} value={first.date} onChange={(e) => set({ sessions: weekly({ ...first, date: e.target.value }, v.sessions.length) })} />
          </Field>
          <TimeInput label="Starts" value={first.startMins} onChange={(m) => set({ sessions: v.sessions.map((s) => ({ ...s, startMins: m })) })} />
          <TimeInput label="Ends" value={first.endMins} onChange={(m) => set({ sessions: v.sessions.map((s) => ({ ...s, endMins: m })) })} />
          <Field label="Seats per batch">
            <NumberInput value={first.capacity} min={1} max={500} onChange={(n) => set({ sessions: v.sessions.map((s) => ({ ...s, capacity: n })) })} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Repeat for</span>
          <Counter value={v.sessions.length} min={2} max={16} onChange={(n) => set({ sessions: weekly(first, n) })} />
          <span className="text-sm text-muted">weeks</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {v.sessions.map((s, i) => (
            <span key={i} className="rounded-lg bg-field px-2.5 py-1 text-xs font-semibold">
              {formatDate(s.date).split(", ")[1]}
            </span>
          ))}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </Card>
    );
  }

  const multi = schedule === "multi_day";
  return (
    <Card title={multi ? "Days" : "Date & time"} sub={multi ? "Sell day tickets, a season pass, or both." : undefined}>
      {v.sessions.map((s, i) => (
        <m.div layout key={i} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
          <Field label={multi ? `Day ${i + 1}` : "Date"} className="col-span-2 sm:col-span-1">
            <input type="date" className={inputCls} value={s.date} onChange={(e) => setSession(i, { date: e.target.value })} />
          </Field>
          <TimeInput label="Starts" value={s.startMins} onChange={(m) => setSession(i, { startMins: m })} />
          <TimeInput label="Ends" value={s.endMins} onChange={(m) => setSession(i, { endMins: m < s.startMins ? m + 1440 : m })} />
          {multi && v.sessions.length > 2 ? (
            <button type="button" onClick={() => set({ sessions: v.sessions.filter((_, j) => j !== i), tickets: v.tickets.filter((t) => t.sessionIndex !== i).map((t) => ({ ...t, sessionIndex: t.sessionIndex !== null && t.sessionIndex > i ? t.sessionIndex - 1 : t.sessionIndex })) })} className="grid size-12 place-items-center rounded-xl hover:bg-field" aria-label={`Remove day ${i + 1}`}>
              <Trash2 className="size-4" />
            </button>
          ) : (
            <span className="hidden sm:block sm:w-12" />
          )}
        </m.div>
      ))}
      {multi && v.sessions.length < 7 && (
        <button type="button" onClick={() => set({ sessions: [...v.sessions, { ...v.sessions[v.sessions.length - 1], id: undefined, date: addDays(v.sessions[v.sessions.length - 1].date, 1) }] })} className="inline-flex h-11 w-fit items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 text-sm font-semibold text-brand">
          <Plus className="size-4" /> Add a day
        </button>
      )}
      {mode === "rsvp" && (
        <Field label="How many people can come?" hint="RSVPs close automatically when it's full.">
          <NumberInput value={v.sessions[0]?.capacity ?? 50} min={1} max={5000} onChange={(n) => setSession(0, { capacity: n })} className="max-w-40" />
        </Field>
      )}
      {mode === "none" && <p className="text-sm text-muted">No bookings: people see the details, directions and an add-to-calendar button.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
  );
}

function DateRangeEditor({ v, set, error }: { v: EventListingInput; set: P["set"]; error?: string }) {
  const existingFrom = v.sessions[0]?.date ?? addDays(new Date().toISOString().slice(0, 10), 3);
  const existingTo = v.sessions[v.sessions.length - 1]?.date ?? addDays(existingFrom, 20);
  const [o, setO] = useState(() => ({
    from: existingFrom,
    to: existingTo,
    closed: [1] as number[],
    windows: v.sessions.length
      ? [...new Map(v.sessions.map((s) => [`${s.startMins}-${s.endMins}`, { startMins: s.startMins, endMins: s.endMins }])).values()]
      : [
          { startMins: 11 * 60, endMins: 13 * 60 },
          { startMins: 13 * 60, endMins: 15 * 60 },
          { startMins: 15 * 60, endMins: 17 * 60 },
          { startMins: 17 * 60, endMins: 19 * 60 },
        ],
    capacity: v.sessions[0]?.capacity ?? 60,
  }));
  const apply = (next: typeof o) => {
    setO(next);
    set({ sessions: dateRangeSessions(next) });
  };
  const count = useMemo(() => dateRangeSessions(o).length, [o]);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <Card title="Dates & entry windows" sub="Visitors pick a day and a window; each window has its own capacity.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Opens">
          <input type="date" className={inputCls} value={o.from} onChange={(e) => apply({ ...o, from: e.target.value })} />
        </Field>
        <Field label="Closes">
          <input type="date" className={inputCls} value={o.to} min={o.from} onChange={(e) => apply({ ...o, to: e.target.value })} />
        </Field>
        <Field label="Visitors per window">
          <NumberInput value={o.capacity} min={1} max={2000} onChange={(n) => apply({ ...o, capacity: n })} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Closed on</span>
        <ChipSelect multi options={days.map((d, i) => ({ id: String(i), label: d }))} value={o.closed.map(String)} onChange={(x) => apply({ ...o, closed: x.map(Number) })} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Entry windows</span>
        {o.windows.map((w, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <TimeInput label="From" value={w.startMins} onChange={(m) => apply({ ...o, windows: o.windows.map((x, j) => (j === i ? { ...x, startMins: m } : x)) })} />
            <TimeInput label="To" value={w.endMins} onChange={(m) => apply({ ...o, windows: o.windows.map((x, j) => (j === i ? { ...x, endMins: m } : x)) })} />
            <button type="button" disabled={o.windows.length < 2} onClick={() => apply({ ...o, windows: o.windows.filter((_, j) => j !== i) })} className="grid size-12 place-items-center rounded-xl hover:bg-field disabled:opacity-30" aria-label="Remove window">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => { const last = o.windows[o.windows.length - 1]; apply({ ...o, windows: [...o.windows, { startMins: last.endMins, endMins: last.endMins + 120 }] }); }} className="inline-flex h-11 w-fit items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 text-sm font-semibold text-brand">
          <Plus className="size-4" /> Add a window
        </button>
      </div>
      <p className="text-sm text-muted">
        {count} entry windows from {formatDate(o.from)} to {formatDate(o.to)}
        {o.closed.length ? `, closed ${o.closed.map((d) => days[d]).join(", ")}` : ""}.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
  );
}

export function EventTickets({ v, set, errors, catalog, host }: P) {
  const tpl = catalog.templates.find((t) => t.id === v.templateId);
  const locked = host.kycStatus !== "verified";
  if (!tpl) return <Card><p className="text-sm text-danger">Pick a booking type first.</p></Card>;
  const reg = tpl.bookingMode === "registration";
  const unlimited = tpl.schedule === "recurring" || tpl.schedule === "date_range";
  const multi = tpl.schedule === "multi_day";
  const update = (i: number, p: Partial<TicketInput>) => set({ tickets: v.tickets.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  const add = () =>
    set({ tickets: [...v.tickets, { name: reg ? "New division" : multi ? "Season pass" : "New ticket", description: "", price: 0, qty: unlimited ? 9999 : reg ? 16 : 50, perOrderMax: reg ? 1 : Math.min(6, tpl.rules.maxPerOrder), isPass: multi, sessionIndex: null }] });
  return (
    <Card title={reg ? "Divisions & entry fee" : "Tickets"} sub={reg ? "Each team registers for one division. The fee is per team." : unlimited ? "Prices per person. Capacity is set per batch or window." : "Add tiers like Early bird, General, Front row."}>
      {locked && (
        <p className="flex items-center gap-2 rounded-xl bg-warn-tint px-3 py-2 text-sm text-warn">
          <Lock className="size-4" /> Prices are locked at free until your verification is complete.
        </p>
      )}
      {v.tickets.map((t, i) => (
        <m.div layout key={i} className="flex flex-col gap-3 rounded-2xl border border-line p-3 md:p-4">
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
            <Field label="Name">
              <input className={inputCls} value={t.name} maxLength={40} onChange={(e) => update(i, { name: e.target.value })} />
            </Field>
            <Field label={reg ? "Fee per team" : "Price"} hint={t.price === 0 ? "Free" : undefined}>
              <NumberInput prefix="₹" value={t.price} disabled={locked} max={100000} onChange={(n) => update(i, { price: n })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {!unlimited && (
              <Field label={reg ? "Team slots" : "Quantity"}>
                <NumberInput value={t.qty} min={1} max={99999} onChange={(n) => update(i, { qty: n })} />
              </Field>
            )}
            {!reg && (
              <Field label="Max per order">
                <NumberInput value={t.perOrderMax} min={1} max={tpl.rules.maxPerOrder} onChange={(n) => update(i, { perOrderMax: n })} />
              </Field>
            )}
            {multi && (
              <Field label="Valid for">
                <select
                  className={inputCls}
                  value={t.isPass ? "pass" : t.sessionIndex === null ? "any" : String(t.sessionIndex)}
                  onChange={(e) => update(i, e.target.value === "pass" ? { isPass: true, sessionIndex: null } : e.target.value === "any" ? { isPass: false, sessionIndex: null } : { isPass: false, sessionIndex: Number(e.target.value) })}
                >
                  {v.sessions.map((s, j) => (
                    <option key={j} value={j}>
                      Day {j + 1} · {formatDate(s.date).split(", ")[1]}
                    </option>
                  ))}
                  <option value="any">Any one day</option>
                  <option value="pass">Season pass (all days)</option>
                </select>
              </Field>
            )}
          </div>
          <Field label="Description (optional)">
            <input className={inputCls} value={t.description} maxLength={80} onChange={(e) => update(i, { description: e.target.value })} placeholder={reg ? "e.g. For first-timers" : "e.g. Reserved seat in the first two rows"} />
          </Field>
          {v.tickets.length > 1 && (
            <button type="button" onClick={() => set({ tickets: v.tickets.filter((_, j) => j !== i) })} className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-danger">
              <Trash2 className="size-4" /> Remove
            </button>
          )}
        </m.div>
      ))}
      <button type="button" onClick={add} className="inline-flex h-11 w-fit items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 text-sm font-semibold text-brand hover:border-brand">
        <Plus className="size-4" /> {reg ? "Add a division" : "Add a ticket type"}
      </button>
      {errors.tickets && <p className="text-sm text-danger">{errors.tickets}</p>}
      {v.tickets.some((t) => t.price > 0) && (
        <p className="text-xs text-muted">
          Attendees pay a {tpl.id === "tpl_ticket_single" || tpl.id === "tpl_ticket_multi" ? "3.75%" : "2.5%"} convenience fee + GST on top. You receive the full ticket price, e.g. {formatINR(v.tickets.find((t) => t.price > 0)!.price)} per ticket.
        </p>
      )}
    </Card>
  );
}

export function EventPolicies({ v, set, catalog }: P) {
  const tpl = catalog.templates.find((t) => t.id === v.templateId);
  const c = tpl?.cancellation;
  return (
    <>
      <Card title="Things to know" sub="Short, practical points shown on the listing.">
        <LinesEditor lines={v.thingsToKnow} onChange={(thingsToKnow) => set({ thingsToKnow })} placeholder="e.g. Entry from 30 minutes before start" />
      </Card>
      {tpl && tpl.bookingMode !== "none" && (
        <Card title="Questions for attendees" sub={tpl.bookingMode === "registration" ? "Team name and size are always asked. Add anything else you need." : "Asked at checkout. Keep it short."}>
          <QuestionsEditor fields={v.formFields} onChange={(formFields) => set({ formFields })} />
        </Card>
      )}
      {tpl?.bookingMode === "none" && (
        <Card title="External link (optional)" sub="e.g. your website or a registration page">
          <input className={inputCls} value={v.externalUrl ?? ""} onChange={(e) => set({ externalUrl: e.target.value || null })} placeholder="https://" />
        </Card>
      )}
      {c && (
        <Card title="Cancellation policy">
          <p className="text-[15px]">
            {c.policy === "none" ? "Non-refundable." : c.policy === "full_until" ? `Full refund up to ${c.hoursBefore} hours before the start.` : `${c.refundPct}% refund up to ${c.hoursBefore} hours before the start.`}
          </p>
          <p className="text-sm text-muted">Set by the local. team for “{tpl?.name}”. Contact support if you need a different policy.</p>
        </Card>
      )}
    </>
  );
}
