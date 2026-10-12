"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { CircleAlert, CircleCheck, Clock, FlaskConical, ScanLine } from "lucide-react";
import { useCheckIn, type CheckInResult } from "@/lib/api/host-hooks";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatRange } from "@/lib/time";
import { cn } from "@/lib/utils";

const TONE: Record<CheckInResult["result"], { cls: string; icon: typeof CircleCheck; title: string }> = {
  ok: { cls: "border-free/30 bg-free-tint text-free", icon: CircleCheck, title: "Checked in" },
  already: { cls: "border-line bg-warn-tint text-warn", icon: CircleAlert, title: "Already checked in" },
  early: { cls: "border-line bg-warn-tint text-warn", icon: Clock, title: "Not today" },
  invalid: { cls: "border-[#f1c6bc] bg-danger-tint text-danger", icon: CircleAlert, title: "Can't check in" },
};

export function CheckInScanner() {
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [history, setHistory] = useState<CheckInResult[]>([]);
  const checkIn = useCheckIn();
  const last = checkIn.data;

  const run = (c: string) => {
    if (!c.trim()) return;
    checkIn.mutate(c.trim().toUpperCase(), {
      onSuccess: (r) => {
        setHistory((h) => [r, ...h].slice(0, 8));
        setCode("");
        if ("vibrate" in navigator) navigator.vibrate(r.result === "ok" ? 60 : [40, 60, 40]);
      },
    });
  };

  const simulate = async () => {
    setScanning(true);
    try {
      const [{ code: next }] = await Promise.all([api<{ code: string | null }>("/api/host/checkin/next"), new Promise((r) => setTimeout(r, 900))]);
      if (next) run(next);
      else toast("Everyone booked for today is already checked in");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="relative aspect-square overflow-hidden rounded-[28px] bg-feature">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(91,46,255,.35),transparent_55%)]" aria-hidden />
        <div className="absolute inset-[18%] rounded-3xl" aria-hidden>
          {["left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-3xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-3xl"].map((c) => (
            <span key={c} className={cn("absolute size-12 border-white", c)} />
          ))}
          <AnimatePresence>
            {scanning && (
              <m.span
                initial={{ top: "5%", opacity: 0 }}
                animate={{ top: ["5%", "92%", "5%"], opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-x-3 h-0.5 rounded-full bg-brand-soft shadow-[0_0_16px_4px_rgba(127,208,214,.6)]"
              />
            )}
          </AnimatePresence>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-5 text-center text-white">
          <p className="text-sm text-feature-muted">{scanning ? "Looking for a QR code…" : "Camera scanning arrives in phase 2"}</p>
          <Button variant="onDark" onClick={simulate} loading={scanning} disabled={checkIn.isPending}>
            <FlaskConical className="size-4" /> Simulate a scan
          </Button>
        </div>
        <ScanLine className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 text-white/15" aria-hidden />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(code);
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Booking code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Booking code, e.g. LCL7Q2KX"
            className="h-14 w-full rounded-2xl border border-line-strong bg-surface px-4 font-mono text-lg uppercase tracking-wider outline-none placeholder:font-sans placeholder:text-base placeholder:normal-case placeholder:tracking-normal focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)]"
            autoCapitalize="characters"
          />
        </label>
        <Button type="submit" size="lg" loading={checkIn.isPending && !scanning} disabled={!code.trim()}>
          Check in
        </Button>
      </form>
      {checkIn.error && <p className="text-sm text-danger">{checkIn.error.message}</p>}

      <AnimatePresence mode="wait">
        {last && (
          <m.div key={last.booking.id + last.result + history.length} initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} className={cn("flex gap-3 rounded-2xl border p-4", TONE[last.result].cls)} role="status">
            {(() => {
              const I = TONE[last.result].icon;
              return <I className="mt-0.5 size-6 shrink-0" />;
            })()}
            <div className="min-w-0 text-ink">
              <p className={cn("font-display text-lg font-bold", TONE[last.result].cls.split(" ").pop())}>{TONE[last.result].title}</p>
              <p className="font-semibold">{last.booking.customer}</p>
              <p className="text-sm text-ink-2">
                {last.booking.label} · {last.booking.title}
              </p>
              <p className="text-sm text-muted">
                {last.booking.whenLabel.split(" · ")[0]} · {formatRange(last.booking.startsAt, last.booking.endsAt)} · <span className="font-mono">{last.booking.code}</span>
              </p>
              <p className="mt-1 text-sm font-semibold">{last.message}</p>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {history.length > 1 && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">This session</p>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {history.slice(1).map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">
                  {h.booking.customer} · <span className="font-mono text-muted">{h.booking.code}</span>
                </span>
                <span className={cn("shrink-0 font-semibold", h.result === "ok" ? "text-free" : "text-warn")}>{TONE[h.result].title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link href="/host/bookings?when=today" className="text-sm font-semibold text-brand">
        See today&apos;s full list →
      </Link>
    </div>
  );
}
