"use client";

import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function useCountdown(expiresAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : null;
}

export function HoldTimer({ expiresAt, label = "We're holding your spot for", className, onDark }: { expiresAt: string | null | undefined; label?: string; className?: string; onDark?: boolean }) {
  const left = useCountdown(expiresAt);
  if (left === null) return null;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div
      className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold", onDark ? "bg-white/10 text-white" : "bg-urgent-tint text-urgent", className)}
      role="timer"
      aria-live="off"
    >
      <Timer className="size-4" />
      <span className="flex-1">{left > 0 ? label : "Your hold has expired"}</span>
      {left > 0 && (
        <span className="tabular-nums" suppressHydrationWarning>
          {mm}:{ss}
        </span>
      )}
    </div>
  );
}

/** Compact header chip (wireframe 12): "Held 9:42". */
export function HoldChip({ expiresAt }: { expiresAt: string | null | undefined }) {
  const left = useCountdown(expiresAt);
  if (left === null) return null;
  return (
    <span className="inline-flex h-[30px] flex-none items-center gap-1.5 rounded-lg bg-urgent-tint px-2.5 text-[13px] font-bold text-urgent" role="timer" aria-live="off" aria-label={left > 0 ? `Spot held for ${Math.floor(left / 60)} minutes ${left % 60} seconds` : "Hold expired"}>
      <Timer className="size-4" aria-hidden />
      <span className="tabular-nums" suppressHydrationWarning aria-hidden>
        {left > 0 ? `Held ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Expired"}
      </span>
    </span>
  );
}
