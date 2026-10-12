"use client";

import { Minus, Plus } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { cn } from "@/lib/utils";

export function Stepper({
  value,
  min = 0,
  max,
  onChange,
  label,
  disabled,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  disabled?: boolean;
}) {
  if (value === 0 && !disabled) {
    return (
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={max <= 0}
        className="h-10 rounded-xl border-[1.5px] border-ink bg-surface px-5 text-sm font-bold text-ink transition-colors hover:bg-field disabled:border-line-strong disabled:text-subtle"
        aria-label={`Add ${label}`}
      >
        Add
      </button>
    );
  }
  return (
    <div className={cn("flex h-10 items-center rounded-xl border-[1.5px] border-brand bg-surface text-brand", disabled && "opacity-50")} role="group" aria-label={label}>
      <button type="button" className="grid h-10 w-10 place-items-center rounded-l-xl hover:bg-tint" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Remove one ${label}`} disabled={disabled}>
        <Minus className="size-4" />
      </button>
      <span className="relative w-6 overflow-hidden text-center text-sm font-extrabold tabular-nums text-ink" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span key={value} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} className="inline-block">
            {value}
          </m.span>
        </AnimatePresence>
      </span>
      <button type="button" className="grid h-10 w-10 place-items-center rounded-r-xl hover:bg-tint disabled:opacity-40" onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label={`Add one ${label}`}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}
