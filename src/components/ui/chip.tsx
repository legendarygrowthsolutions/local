"use client";

import { cn } from "@/lib/utils";

export function Chip({
  active,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors duration-200",
        active ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink hover:border-ink/30",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
