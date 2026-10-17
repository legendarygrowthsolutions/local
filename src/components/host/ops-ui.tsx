"use client";

import { cn } from "@/lib/utils";

/** Small shared form bits for the operations sheets, matching the settings form look. */
export const inputCls = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] outline-none focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)] disabled:bg-field disabled:text-muted";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({ label, sub, on, set, disabled }: { label: string; sub?: string; on: boolean; set: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => set(!on)} className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-line py-2 text-left last:border-0 disabled:opacity-50">
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {sub && <span className="block text-[13px] text-muted">{sub}</span>}
      </span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-brand" : "bg-[#cfd8d6]")}>
        <span className={cn("absolute top-[3px] size-[18px] rounded-full bg-white transition-[left]", on ? "left-[19px]" : "left-[3px]")} />
      </span>
    </button>
  );
}

export function Seg<T extends string>({ value, onChange, options, label, size = "md" }: { value: T; onChange: (v: T) => void; options: [T, string][]; label?: string; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm font-semibold">{label}</span>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn("rounded-full border font-semibold", size === "sm" ? "h-9 px-3 text-[13px]" : "h-10 px-4 text-sm", value === v ? "border-brand bg-brand text-white" : "border-line-strong bg-surface")}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export const METHOD_LABEL: Record<string, string> = { online: "Online", cash: "Cash", upi: "UPI", card: "Card", pay_later: "Pay later", complimentary: "Complimentary", free: "Free" };

export function timeOptions(fromMins = 0, toMins = 1440, step = 30) {
  const out: { value: number; label: string }[] = [];
  for (let m = fromMins; m <= toMins; m += step) {
    const h = Math.floor((m % 1440) / 60);
    const mm = m % 60;
    out.push({ value: m, label: `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, "0")} ${h >= 12 && h < 24 ? "PM" : "AM"}` });
  }
  return out;
}
