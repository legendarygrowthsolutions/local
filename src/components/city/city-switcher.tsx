"use client";

import dynamic from "next/dynamic";
import { ChevronDown, MapPin } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// The sheet (vaul + picker) is only downloaded once someone opens it.
const CitySheet = dynamic(() => import("./city-sheet").then((m) => m.CitySheet), { ssr: false });

export function CitySwitcher({
  city,
  cityName,
  className,
  onDark,
  variant = "pill",
}: {
  city: string;
  cityName: string;
  className?: string;
  onDark?: boolean;
  /** pill: pin + name (desktop header); stacked: "Exploring" over a big name (phone home, wireframe 05) */
  variant?: "pill" | "stacked" | "outlined";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        onPointerEnter={() => setMounted(true)}
        className={cn(
          variant === "stacked"
            ? "flex flex-col items-start text-left"
            : variant === "outlined"
              ? "inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:border-line-strong"
              : "inline-flex h-10 items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[15px] font-semibold transition-colors",
          variant === "pill" && (onDark ? "text-white hover:bg-white/10" : "text-ink hover:bg-field"),
          className,
        )}
        aria-label={`City: ${cityName}. Change city`}
        aria-haspopup="dialog"
      >
        {variant === "stacked" ? (
          <>
            <span className="text-[11px] font-semibold text-muted">Exploring</span>
            <span className="flex items-center gap-1 font-display text-[22px] font-extrabold leading-tight">
              {cityName}
              <ChevronDown className="size-[18px] text-brand" strokeWidth={2.4} />
            </span>
          </>
        ) : (
          <>
            <MapPin className={cn("text-brand", variant === "outlined" ? "size-4" : "size-[18px]")} />
            {cityName}
            <ChevronDown className={cn(variant === "outlined" ? "size-3.5 text-ink" : "size-4 text-muted")} />
          </>
        )}
      </button>
      {mounted && <CitySheet open={open} onOpenChange={setOpen} city={city} />}
    </>
  );
}
