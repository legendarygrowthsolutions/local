"use client";

import { m } from "motion/react";
import { Check, Lock, Plus, Trash2, Zap } from "lucide-react";
import type { CourtInput, VenueInput } from "@/contracts";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Card, Field, inputCls, minsToTime, NumberInput, timeToMins } from "./fields";
import { ChipSelect, LinesEditor, MediaPicker } from "./steps-shared";
import type { WizardCatalog, WizardHost } from "./types";

type P = { v: VenueInput; set: (p: Partial<VenueInput>) => void; errors: Record<string, string>; catalog: WizardCatalog; host: WizardHost };

const AMENITIES = ["Parking", "Washrooms", "Drinking water", "Changing rooms", "Showers", "Lockers", "Floodlights", "Café", "Equipment on rent", "First aid", "Seating area"];
const SURFACES: Record<string, string[]> = {
  pickleball: ["Acrylic", "Cushioned acrylic"],
  badminton: ["Wooden", "Synthetic mat"],
  football: ["Artificial turf"],
  "box-cricket": ["Artificial turf"],
  tennis: ["Hard court", "Clay"],
  padel: ["Synthetic grass"],
};

export function VenueBasics({ v, set, errors }: P) {
  return (
    <Card title="Your venue">
      <Field label="Venue name" error={errors.name}>
        <input className={inputCls} value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Smash Arena Andheri" />
      </Field>
      <Field label="One-line summary" error={errors.summary} hint={`${v.summary.length}/140`}>
        <input className={inputCls} value={v.summary} maxLength={140} onChange={(e) => set({ summary: e.target.value })} placeholder="e.g. Four indoor pickleball courts, floodlit till 11 PM" />
      </Field>
      <Field label="Description" error={errors.description}>
        <textarea className={cn(inputCls, "h-36 resize-y py-3")} value={v.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
    </Card>
  );
}

export function VenueLocation({ v, set, errors, catalog, host }: P) {
  return (
    <>
      <Card title="Location" sub={`Venues go live in ${host.cityName}.`}>
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
          <textarea className={cn(inputCls, "h-20 resize-none py-3")} value={v.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
      </Card>
      <Card title="Amenities">
        <ChipSelect multi options={AMENITIES.map((a) => ({ id: a, label: a }))} value={v.amenities} onChange={(amenities) => set({ amenities })} />
      </Card>
      <MediaPicker media={v.media} onChange={(media) => set({ media })} />
    </>
  );
}

/** Venue half of "Booking setup" (wireframe 20): courts table and slot rules. */
export function VenueCourts({ v, set, errors, catalog }: P) {
  const update = (i: number, p: Partial<CourtInput>) => {
    const courts = v.courts.map((c, j) => (j === i ? { ...c, ...p } : c));
    set({ courts, templateId: courts.some((c) => c.slotLengthMins === 30) ? "tpl_court_30" : "tpl_court_60" });
  };
  const defaultLen = v.courts.every((c) => c.slotLengthMins === v.courts[0]?.slotLengthMins) ? v.courts[0]?.slotLengthMins : null;
  const setAllLen = (len: 30 | 60 | 90) => set({ courts: v.courts.map((c) => ({ ...c, slotLengthMins: len })), templateId: len === 30 ? "tpl_court_30" : "tpl_court_60" });
  const cell = "h-10 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-2.5 text-sm outline-none focus:border-brand";
  return (
    <>
      <section className="flex flex-col gap-4 rounded-2xl border border-[#e6e6e1] bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Courts</h2>
          <button
            type="button"
            onClick={() => {
              const last = v.courts[v.courts.length - 1];
              set({ courts: [...v.courts, { ...last, id: undefined, name: `${last.name.replace(/\d+$/, "").trim() || "Court"} ${v.courts.length + 1}` }] });
            }}
            className="inline-flex h-9 items-center gap-1 rounded-[10px] border border-ink bg-surface px-3.5 text-[13px] font-semibold hover:bg-field"
          >
            <Plus className="size-4" aria-hidden /> Add court
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted">
                {[
                  ["Name", "w-[18%]"],
                  ["Sport", "w-[16%]"],
                  ["Type", "w-[22%]"],
                  ["Slot length", "w-[13%]"],
                  ["Base / hr", "w-[13%]"],
                  ["Peak / hr", "w-[13%]"],
                  ["", "w-12"],
                ].map(([h, w]) => (
                  <th key={h} className={cn("border-b border-[#e6e6e1] px-2.5 py-2 font-semibold", w)}>
                    {h || <span className="sr-only">Remove</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.courts.map((c, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-1.5 py-2">
                    <input aria-label={`Court ${i + 1} name`} className={cn(cell, "font-semibold")} value={c.name} onChange={(e) => update(i, { name: e.target.value })} />
                  </td>
                  <td className="px-1.5 py-2">
                    <select aria-label={`${c.name} sport`} className={cell} value={c.sport} onChange={(e) => update(i, { sport: e.target.value, surface: SURFACES[e.target.value]?.[0] ?? "" })}>
                      {catalog.sports.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-2">
                    <select
                      aria-label={`${c.name} type`}
                      className={cell}
                      value={`${c.indoor ? "in" : "out"}|${c.surface}`}
                      onChange={(e) => {
                        const [io, surface] = e.target.value.split("|");
                        update(i, { indoor: io === "in", surface });
                      }}
                    >
                      {["in", "out"].flatMap((io) =>
                        (SURFACES[c.sport] ?? [c.surface]).map((sf) => (
                          <option key={`${io}|${sf}`} value={`${io}|${sf}`}>
                            {io === "in" ? "Indoor" : "Outdoor"} · {sf}
                          </option>
                        )),
                      )}
                    </select>
                  </td>
                  <td className="px-1.5 py-2">
                    <select aria-label={`${c.name} slot length`} className={cell} value={c.slotLengthMins} onChange={(e) => update(i, { slotLengthMins: Number(e.target.value) as 30 | 60 | 90 })}>
                      <option value={30}>30 min</option>
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                    </select>
                  </td>
                  <td className="px-1.5 py-2">
                    <PriceCell label={`${c.name} base price per hour`} value={c.priceBase} onChange={(n) => update(i, { priceBase: n })} cls={cell} />
                  </td>
                  <td className="px-1.5 py-2">
                    <PriceCell label={`${c.name} peak price per hour`} value={c.pricePeak} onChange={(n) => update(i, { pricePeak: n })} cls={cell} />
                  </td>
                  <td className="px-1 py-2">
                    <button type="button" disabled={v.courts.length < 2} onClick={() => set({ courts: v.courts.filter((_, j) => j !== i) })} className="grid size-10 place-items-center rounded-lg hover:bg-field disabled:opacity-30" aria-label={`Remove ${c.name}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errors.courts && <p className="text-sm text-danger">{errors.courts}</p>}
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-[#e6e6e1] bg-surface p-5">
        <h2 className="font-display text-lg font-bold">Slot rules</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Default slot length</span>
            <div className="flex gap-[3px] rounded-[10px] bg-[#efefea] p-[3px]" role="radiogroup" aria-label="Default slot length">
              {([30, 60, 90] as const).map((len) => (
                <button
                  key={len}
                  type="button"
                  role="radio"
                  aria-checked={defaultLen === len}
                  onClick={() => setAllLen(len)}
                  className={cn("h-9 flex-1 rounded-lg text-[13px] font-semibold", defaultLen === len ? "bg-surface text-ink shadow-[0_1px_2px_rgba(20,18,31,.08)]" : "text-muted")}
                >
                  {len === 90 ? "Custom" : `${len} min`}
                </button>
              ))}
            </div>
            {defaultLen === null && <span className="text-xs text-muted">Courts use different lengths</span>}
          </div>
          <Field label="Min / max per booking">
            <select className={inputCls} value={v.maxMins} onChange={(e) => set({ maxMins: Number(e.target.value) })}>
              {[60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  1 slot – {m / 60} hrs
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Operating hours</span>
            <div className="flex items-center gap-1.5">
              <input aria-label="Opens" type="time" step={900} className={inputCls} value={minsToTime(v.openMins)} onChange={(e) => set({ openMins: timeToMins(e.target.value) })} />
              <span className="text-muted">–</span>
              <input aria-label="Closes" type="time" step={900} className={inputCls} value={minsToTime(v.closeMins)} onChange={(e) => set({ closeMins: timeToMins(e.target.value) })} />
            </div>
            {errors.closeMins && <span className="text-sm text-danger">{errors.closeMins}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Peak hours</span>
            <div className="flex flex-wrap gap-1.5">
              <PeakChip on={v.peakWeekdayEvenings} onClick={() => set({ peakWeekdayEvenings: !v.peakWeekdayEvenings })}>
                Weekdays 6–10 PM
              </PeakChip>
              <PeakChip on={v.peakWeekends} onClick={() => set({ peakWeekends: !v.peakWeekends })}>
                Weekends all day
              </PeakChip>
            </div>
          </div>
          <Field label="Book up to" hint="days ahead">
            <NumberInput value={v.advanceDays} min={1} max={60} onChange={(n) => set({ advanceDays: n })} />
          </Field>
          <Field label="Buffer between slots">
            <select className={inputCls} value={v.bufferMins} onChange={(e) => set({ bufferMins: Number(e.target.value) })}>
              {[0, 5, 10, 15, 30].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="flex items-center gap-2.5 text-sm">
          <span className="grid size-[18px] place-items-center rounded bg-ink text-white" aria-hidden>
            <Check className="size-3" strokeWidth={3} />
          </span>
          Blocking slots for walk-ins and maintenance is always on — use Slots &amp; calendar once you&apos;re live.
        </p>
      </section>
    </>
  );
}

function PriceCell({ label, value, onChange, cls }: { label: string; value: number; onChange: (n: number) => void; cls: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">₹</span>
      <input aria-label={label} type="number" inputMode="numeric" min={0} max={20000} className={cn(cls, "pl-6")} value={value} onChange={(e) => onChange(Math.max(0, Math.min(20000, Number(e.target.value) || 0)))} />
    </div>
  );
}

function PeakChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("h-10 rounded-xl border px-3 text-[13px] font-semibold", on ? "border-brand bg-tint text-brand-ink" : "border-line-strong bg-surface text-muted")}>
      {children}
    </button>
  );
}

/** Venue "Pricing": prices are edited in the courts table; this shows what players will pay. */
export function VenuePricing({ v, host }: P) {
  const locked = host.kycStatus !== "verified";
  return (
    <Card title="What players pay" sub="Set base and peak prices per court in Booking setup. 30-minute slots are charged pro rata.">
      {locked && (
        <p className="flex items-center gap-2 rounded-xl bg-warn-tint px-3 py-2 text-sm text-warn">
          <Lock className="size-4" /> Paid court bookings unlock once your verification is complete.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-semibold">Court</th>
              <th className="pb-2 font-semibold">Off-peak / hr</th>
              <th className="pb-2 font-semibold">
                <span className="inline-flex items-center gap-1">
                  <Zap className="size-3" /> Peak / hr
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {v.courts.map((c, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-2.5 pr-3 font-semibold">
                  {c.name}
                  <span className="block text-xs font-normal text-muted">
                    {c.sport.replace("-", " ")} · {c.slotLengthMins} min
                  </span>
                </td>
                <td className="py-2.5 pr-3 tabular-nums">{formatINR(c.priceBase)}</td>
                <td className="py-2.5 tabular-nums">{formatINR(Math.max(c.pricePeak, c.priceBase))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Peak: {[v.peakWeekdayEvenings && "weekdays 6–10 PM", v.peakWeekends && "weekends all day"].filter(Boolean).join(", ") || "none"}. Players pay a convenience fee + GST on top; you receive the full court price.
      </p>
    </Card>
  );
}

export function VenuePolicies({ v, set }: P) {
  return (
    <>
      <Card title="Things to know">
        <LinesEditor lines={v.thingsToKnow} onChange={(thingsToKnow) => set({ thingsToKnow })} placeholder="e.g. Non-marking shoes are compulsory" />
      </Card>
      <Card title="Cancellation policy">
        <p className="text-[15px]">Free cancellation up to 6 hours before the slot.</p>
        <p className="text-sm text-muted">Set by the local. team for court bookings.</p>
      </Card>
    </>
  );
}
