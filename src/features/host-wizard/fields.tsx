"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputCls =
  "h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)] disabled:bg-field disabled:text-muted";

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="text-sm text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const minsToTime = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const timeToMins = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function TimeInput({ value, onChange, label, error }: { value: number; onChange: (m: number) => void; label: string; error?: string }) {
  return (
    <Field label={label} error={error}>
      <input type="time" step={900} className={inputCls} value={minsToTime(value)} onChange={(e) => onChange(timeToMins(e.target.value))} />
    </Field>
  );
}

export function NumberInput({ value, onChange, min = 0, max, prefix, disabled, className }: { value: number; onChange: (n: number) => void; min?: number; max?: number; prefix?: string; disabled?: boolean; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted">{prefix}</span>}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        disabled={disabled}
        className={cn(inputCls, prefix && "pl-7")}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(min, Math.min(max ?? Infinity, Number(e.target.value) || 0)))}
      />
    </div>
  );
}

export function Counter({ value, onChange, min = 1, max = 99 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex h-12 items-center rounded-xl border border-line-strong bg-surface">
      <button type="button" className="grid h-full w-11 place-items-center disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Decrease">
        <Minus className="size-4" />
      </button>
      <span className="w-10 text-center font-semibold tabular-nums">{value}</span>
      <button type="button" className="grid h-full w-11 place-items-center disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Increase">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-12 w-full items-center justify-between gap-4 text-left">
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </span>
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-brand" : "bg-line-strong")}>
        <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-[left]", checked ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

export function Card({ title, sub, children, className }: { title?: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-4 md:p-5", className)}>
      {title && (
        <div>
          <h2 className="font-display text-lg font-bold">{title}</h2>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Downscale an image in the browser before upload (keeps uploads small and fast). */
export async function imageToDataUrl(file: File, max = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
