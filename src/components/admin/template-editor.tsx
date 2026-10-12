"use client";

import { Reorder, useDragControls } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, GripVertical, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { JourneyTemplate, StepConfig, StepType, TemplateInput } from "@/contracts";
import { templateErrors } from "@/lib/journey-rules";
import { buildScreens } from "@/features/booking/screens";
import { api, ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEP_INFO: Record<StepType, { label: string; hint: string }> = {
  pick_session: { label: "Pick date", hint: "Day, batch or entry window" },
  pick_pass: { label: "Season pass", hint: "Day tickets or a pass" },
  pick_tickets: { label: "Tickets", hint: "Tiers + quantity / divisions" },
  pick_sport: { label: "Pick sport", hint: "For multi-sport venues" },
  pick_resource: { label: "Pick court", hint: "Court chips + any court" },
  pick_slots: { label: "Pick slots", hint: "Tap-to-extend grid" },
  team_details: { label: "Team details", hint: "Captain + team questions" },
  attendee_form: { label: "Attendee form", hint: "Name, phone, host questions" },
  review: { label: "Review", hint: "Hold timer, fees, coupon" },
  payment: { label: "Payment", hint: "Payment gateway" },
  confirmation: { label: "Confirmation", hint: "Ticket with QR" },
};
const ALL_STEPS = Object.keys(STEP_INFO) as StepType[];

const BLANK: TemplateInput = {
  name: "",
  description: "",
  allowedCategories: ["events"],
  bookingMode: "ticketed",
  schedule: "single",
  pricing: "paid",
  ticketScope: null,
  steps: (["pick_tickets", "review", "payment", "confirmation"] as StepType[]).map((type) => ({ type, required: true, config: {} })),
  rules: { seatHoldMins: 10, waitlist: false, hostApprovalPerBooking: false, transferable: false, maxPerOrder: 6, minPerOrder: 1 },
  fees: { convenienceFeePct: 3.75, convenienceFeeFlat: 0, gstOnFeePct: 18, absorbFeeAllowed: true },
  cancellation: { policy: "full_until", hoursBefore: 48, refundPct: 100 },
  ctaLabel: "Book tickets",
  active: true,
};

const input = "h-10 w-full rounded-[10px] border-[1.5px] border-[#dcdcd6] bg-surface px-3 text-sm outline-none focus:border-brand";

type Item = StepConfig & { key: string };

export function TemplateEditor({
  id,
  initial,
  usage,
  categories,
}: {
  id?: string;
  initial?: JourneyTemplate;
  usage: { total: number; live: number };
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const start: TemplateInput = initial ? (({ id: _i, ...rest }) => rest)(initial) : BLANK;
  const [t, setT] = useState<TemplateInput>(start);
  const [steps, setSteps] = useState<Item[]>(start.steps.map((s, i) => ({ ...s, key: `${s.type}-${i}` })));
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<TemplateInput>) => setT((x) => ({ ...x, ...p }));
  const full: TemplateInput = { ...t, steps: steps.map(({ key: _k, ...s }) => s) };
  const errors = useMemo(() => templateErrors(full), [full]); // eslint-disable-line react-hooks/exhaustive-deps
  const screens = useMemo(() => (t.bookingMode === "none" ? [] : buildScreens({ ...full, id: "preview" }, { formFields: [] })), [full, t.bookingMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(full) !== JSON.stringify(start);
  const unused = ALL_STEPS.filter((s) => !steps.some((x) => x.type === s));

  const save = async () => {
    setSaving(true);
    try {
      const r = await api<{ template: JourneyTemplate }>(id ? `/api/admin/templates/${id}` : "/api/admin/templates", { method: id ? "PUT" : "POST", body: full });
      toast.success(id ? "Template saved — journeys update straight away" : "Template created");
      router.push(`/admin/templates?id=${r.template.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-2xl border border-[#e6e6e1] bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <input value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="Template name" className="w-full bg-transparent font-display text-xl font-bold outline-none placeholder:text-subtle" aria-label="Template name" />
            <input value={t.description} onChange={(e) => set({ description: e.target.value })} placeholder="When should hosts use this?" className="mt-0.5 w-full bg-transparent text-[13px] text-muted outline-none" aria-label="Description" />
          </div>
          <span className="text-[13px] text-muted">{id ? `Used by ${usage.total} listings` : "New template"}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Seg className="md:col-span-3 md:max-w-xl" label="Booking mode" value={t.bookingMode} disabled={!!id && usage.total > 0} onChange={(v) => set({ bookingMode: v as TemplateInput["bookingMode"] })} options={[["none", "Info only"], ["rsvp", "Free RSVP"], ["ticketed", "Ticketed"], ["slot", "Slot booking"], ["registration", "Registration"]]} />
          <Seg label="Schedule" value={t.schedule} onChange={(v) => set({ schedule: v as TemplateInput["schedule"] })} options={[["single", "Single"], ["multi_day", "Multi-day"], ["recurring", "Recurring"], ["date_range", "Range"], ...(t.bookingMode === "slot" ? ([["open_hours", "Hours"]] as [string, string][]) : [])]} />
          <Seg label="Pricing" value={t.pricing} onChange={(v) => set({ pricing: v as TemplateInput["pricing"] })} options={[["free", "Free"], ["paid", "Paid"], ["both", "Both"]]} />
          <Seg label="Ticket scope" value={t.ticketScope ?? ""} onChange={(v) => set({ ticketScope: (v || null) as TemplateInput["ticketScope"] })} options={[["per_session", "Per day"], ["pass", "Pass"], ["both", "Both"], ["", "—"]]} />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-[#e6e6e1] bg-surface p-5">
        <span className="text-[13px] font-semibold">User journey (drag to reorder · dashed = optional)</span>
        <Reorder.Group axis="x" values={steps} onReorder={setSteps} className="no-scrollbar flex items-stretch gap-2 overflow-x-auto pb-1">
          {steps.map((s, i) => (
            <StepCard
              key={s.key}
              item={s}
              index={i}
              count={steps.length}
              onMove={(d) => {
                const next = [...steps];
                const j = i + d;
                [next[i], next[j]] = [next[j], next[i]];
                setSteps(next);
              }}
              onToggle={() => setSteps(steps.map((x) => (x.key === s.key ? { ...x, required: !x.required } : x)))}
              onRemove={() => setSteps(steps.filter((x) => x.key !== s.key))}
            />
          ))}
        </Reorder.Group>
        {steps.length === 0 && <p className="rounded-xl bg-field p-3 text-sm text-muted">No booking steps: people see details, directions and a calendar button.</p>}
        {unused.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted">Add:</span>
            {unused.map((s) => (
              <button key={s} type="button" onClick={() => setSteps([...steps, { type: s, required: true, config: {}, key: `${s}-${Date.now()}` }])} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-xs font-semibold text-brand hover:border-brand">
                <Plus className="size-3" /> {STEP_INFO[s].label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 rounded-xl bg-field/60 p-3">
          <p className="text-xs font-semibold text-muted">What users see</p>
          {t.bookingMode === "none" ? (
            <p className="text-sm">Listing page → “{t.ctaLabel}” (directions)</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="rounded-lg bg-surface px-2.5 py-1 font-semibold">Detail · “{t.ctaLabel}”</span>
              {screens.map((sc) => (
                <span key={sc.id} className="flex items-center gap-1.5">
                  <ArrowRight className="size-3.5 text-subtle" />
                  <span className="rounded-lg bg-surface px-2.5 py-1 font-semibold">{sc.title}</span>
                </span>
              ))}
              {steps.some((s) => s.type === "payment") && (
                <>
                  <ArrowRight className="size-3.5 text-subtle" />
                  <span className="rounded-lg bg-surface px-2.5 py-1 font-semibold">Payment</span>
                </>
              )}
              <ArrowRight className="size-3.5 text-subtle" />
              <span className="rounded-lg bg-surface px-2.5 py-1 font-semibold">Ticket</span>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col rounded-2xl border border-[#e6e6e1] bg-surface p-5">
          <span className="mb-1.5 text-[13px] font-semibold">Rules</span>
          <Switch label={`Hold seats during checkout (${t.rules.seatHoldMins || 10} min)`} on={t.rules.seatHoldMins > 0} set={(v) => set({ rules: { ...t.rules, seatHoldMins: v ? 10 : 0 } })} />
          <Switch label="Waitlist when sold out" on={t.rules.waitlist} set={(v) => set({ rules: { ...t.rules, waitlist: v } })} />
          <Switch label="Host approval for each booking" on={t.rules.hostApprovalPerBooking} set={(v) => set({ rules: { ...t.rules, hostApprovalPerBooking: v } })} />
          <Switch label="Transferable tickets" on={t.rules.transferable} set={(v) => set({ rules: { ...t.rules, transferable: v } })} />
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-xs text-ink-2">Button label</span>
            <input className={input} value={t.ctaLabel} onChange={(e) => set({ ctaLabel: e.target.value })} />
          </label>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border border-[#e6e6e1] bg-surface p-5">
          <span className="text-[13px] font-semibold">Limits &amp; fees</span>
          <div className="grid grid-cols-2 gap-3">
            <Num label="Max tickets / order" value={t.rules.maxPerOrder} set={(n) => set({ rules: { ...t.rules, maxPerOrder: n } })} min={1} max={20} />
            <Num label="Min / order" value={t.rules.minPerOrder} set={(n) => set({ rules: { ...t.rules, minPerOrder: n } })} min={1} max={20} />
            <Num label="Convenience fee %" value={t.fees.convenienceFeePct} step={0.25} set={(n) => set({ fees: { ...t.fees, convenienceFeePct: n } })} max={15} />
            <div className="grid grid-cols-2 gap-2">
              <Num label="+ flat ₹" value={t.fees.convenienceFeeFlat} set={(n) => set({ fees: { ...t.fees, convenienceFeeFlat: n } })} max={200} />
              <Num label="GST %" value={t.fees.gstOnFeePct} set={(n) => set({ fees: { ...t.fees, gstOnFeePct: n } })} max={28} />
            </div>
            <Select
              label="Default cancellation"
              value={t.cancellation.policy}
              onChange={(v) => set({ cancellation: { ...t.cancellation, policy: v as TemplateInput["cancellation"]["policy"], refundPct: v === "full_until" ? 100 : v === "none" ? 0 : 50 } })}
              options={[["none", "Non-refundable"], ["full_until", `Refund till ${t.cancellation.hoursBefore} h`], ["partial", `${t.cancellation.refundPct}% till ${t.cancellation.hoursBefore} h`]]}
            />
            {t.cancellation.policy !== "none" ? (
              <div className="grid grid-cols-2 gap-2">
                <Num label="Hours before" value={t.cancellation.hoursBefore} set={(n) => set({ cancellation: { ...t.cancellation, hoursBefore: n } })} max={336} />
                {t.cancellation.policy === "partial" && <Num label="Refund %" value={t.cancellation.refundPct} set={(n) => set({ cancellation: { ...t.cancellation, refundPct: n } })} max={99} />}
              </div>
            ) : (
              <span />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-2">Allowed categories</span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const on = t.allowedCategories.includes(c.slug);
                return (
                  <button key={c.slug} type="button" aria-pressed={on} onClick={() => set({ allowedCategories: on ? t.allowedCategories.filter((x) => x !== c.slug) : [...t.allowedCategories, c.slug] })} className={cn("h-8 rounded-full border px-3 text-xs font-semibold", on ? "border-brand bg-brand text-white" : "border-line-strong")}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-muted">
            Paid by the user. On a ₹1,000 order: ₹{((1000 * t.fees.convenienceFeePct) / 100 + t.fees.convenienceFeeFlat).toFixed(2)} fee + ₹{((((1000 * t.fees.convenienceFeePct) / 100 + t.fees.convenienceFeeFlat) * t.fees.gstOnFeePct) / 100).toFixed(2)} GST.
          </p>
        </section>
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e6e6e1] bg-surface/95 p-4 backdrop-blur">
        <Switch label="Available to hosts" on={t.active} set={(v) => set({ active: v })} compact />
        <div className="min-w-0 flex-1">
          {errors.length ? (
            <p className="flex items-start gap-1.5 text-sm text-warn">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {errors[0]}
              {errors.length > 1 && <span className="text-muted"> (+{errors.length - 1} more)</span>}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-free">
              <CircleCheck className="size-4" /> Valid journey{id && usage.live ? ` · changes apply to ${usage.live} live listings` : ""}
            </p>
          )}
        </div>
        <Button onClick={save} loading={saving} disabled={!dirty || errors.length > 0}>
          {id ? "Save template" : "Create template"}
        </Button>
      </div>
    </div>
  );
}

/** Horizontal journey step (wireframe 22): number · label, hint; dashed when optional. */
function StepCard({ item, index, count, onMove, onToggle, onRemove }: { item: Item; index: number; count: number; onMove: (d: -1 | 1) => void; onToggle: () => void; onRemove: () => void }) {
  const controls = useDragControls();
  const info = STEP_INFO[item.type];
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls} className="flex flex-none select-none items-stretch gap-2">
      {index > 0 && (
        <span className="self-center text-lg text-[#8e8e94]" aria-hidden>
          →
        </span>
      )}
      <div className={cn("flex min-w-[132px] flex-col gap-1 rounded-[14px] border-[1.5px] bg-surface p-3", item.required ? "border-line" : "border-dashed border-line-strong")}>
        <div className="flex items-start gap-1">
          <button type="button" onPointerDown={(e) => controls.start(e)} className="-ml-1 grid size-6 cursor-grab touch-none place-items-center rounded text-subtle hover:bg-field active:cursor-grabbing" aria-label={`Drag ${info.label}`}>
            <GripVertical className="size-3.5" />
          </button>
          <b className="flex-1 text-[13px]">
            {index + 1} · {info.label}
          </b>
          <button type="button" onClick={onRemove} className="-mr-1 grid size-6 place-items-center rounded text-muted hover:bg-danger-tint hover:text-danger" aria-label={`Remove ${info.label}`}>
            <X className="size-3.5" />
          </button>
        </div>
        <small className="text-[11px] text-muted">
          {item.required ? "" : "Optional · "}
          {info.hint}
        </small>
        <div className="mt-1 flex items-center gap-0.5">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="grid size-6 place-items-center rounded text-muted hover:bg-field disabled:opacity-25" aria-label={`Move ${info.label} earlier`}>
            <ChevronLeft className="size-3.5" />
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="grid size-6 place-items-center rounded text-muted hover:bg-field disabled:opacity-25" aria-label={`Move ${info.label} later`}>
            <ChevronRight className="size-3.5" />
          </button>
          <button type="button" onClick={onToggle} className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-tint">
            {item.required ? "Make optional" : "Make required"}
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}

function Seg({ label, value, onChange, options, disabled, className }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; disabled?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span className="text-[13px] font-semibold">{label}</span>
      <div className={cn("flex gap-[3px] rounded-[10px] bg-[#efefea] p-[3px]", disabled && "opacity-60")} role="radiogroup" aria-label={label} title={disabled ? "Can't change while listings use this template" : undefined}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn("h-[34px] min-w-0 flex-1 truncate whitespace-nowrap rounded-lg px-2 text-[13px] font-semibold transition-colors", value === v ? "bg-brand text-white" : "text-muted hover:text-ink")}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; disabled?: boolean }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-ink-2">{label}</span>
      <select className={cn(input, disabled && "bg-field text-muted")} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} title={disabled ? "Can't change while listings use this template" : undefined}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Num({ label, value, set, min = 0, max, step = 1 }: { label: string; value: number; set: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-ink-2">{label}</span>
      <input type="number" className={input} value={value} min={min} max={max} step={step} onChange={(e) => set(Math.max(min, Math.min(max ?? Infinity, Number(e.target.value) || 0)))} />
    </label>
  );
}

function Switch({ label, on, set, compact }: { label: string; on: boolean; set: (v: boolean) => void; compact?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className={cn("flex items-center justify-between gap-3 text-left text-sm", compact ? "" : "min-h-11 w-full border-b border-[#eeeee9] last:border-0")}>
      <span>{label}</span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-[#cfd8d6]")}>
        <span className={cn("absolute top-1 size-4 rounded-full bg-white transition-[left]", on ? "left-5" : "left-1")} />
      </span>
    </button>
  );
}
