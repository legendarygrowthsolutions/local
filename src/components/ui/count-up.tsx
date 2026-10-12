"use client";

import { useEffect, useRef, useState } from "react";
import { formatINR } from "@/lib/pricing";

/** Animates a number from 0 on first view. Instant with reduced motion. */
export function CountUp({ value, format = "int", duration = 700 }: { value: number; format?: "int" | "inr" | "inr-short"; duration?: number }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (started.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    started.current = true;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(p < 1 ? value * eased : value);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const fmt = (n: number) => (format === "inr" ? formatINR(Math.round(n)) : format === "inr-short" ? inrShort(n) : Math.round(n).toLocaleString("en-IN"));
  const text = fmt(shown);
  // Screen readers get the final value straight away.
  return (
    <span ref={ref} className="tabular-nums">
      <span className="sr-only">{fmt(value)}</span>
      <span aria-hidden>{text}</span>
    </span>
  );
}

/** ₹1.46L / ₹2.1Cr for big numbers, plain rupees below a lakh. */
export function inrShort(n: number) {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2).replace(/\.?0+$/, "")}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2).replace(/\.?0+$/, "")}L`;
  return formatINR(Math.round(n));
}
