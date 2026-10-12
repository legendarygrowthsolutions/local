"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** 6-box OTP with auto-advance, backspace, paste and Web OTP API autofill. */
export function OtpInput({ value, onChange, onComplete, invalid, disabled }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; invalid?: boolean; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  useEffect(() => {
    refs.current[0]?.focus();
    if (!("OTPCredential" in window)) return;
    const ac = new AbortController();
    (navigator.credentials as unknown as { get: (o: unknown) => Promise<{ code?: string } | null> })
      .get({ otp: { transport: ["sms"] }, signal: ac.signal })
      .then((otp) => {
        if (otp?.code) {
          onChange(otp.code);
          onComplete(otp.code);
        }
      })
      .catch(() => {});
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a wrong code is cleared, start again from the first box.
  useEffect(() => {
    if (value === "" && !disabled) refs.current[0]?.focus();
  }, [value, disabled]);

  const set = (i: number, d: string) => {
    const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, 6).replace(/\D/g, "");
    onChange(next);
    if (next.length === 6) onComplete(next);
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="One-time password">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          maxLength={6}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (!v) return;
            if (v.length > 1) {
              const pasted = v.slice(0, 6);
              onChange(pasted);
              refs.current[Math.min(pasted.length, 5)]?.focus();
              if (pasted.length === 6) onComplete(pasted);
              return;
            }
            set(i, v);
            refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (d) set(i, "");
              else if (i > 0) {
                refs.current[i - 1]?.focus();
                onChange(value.slice(0, i - 1) + value.slice(i));
              }
            }
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-[58px] w-full min-w-0 rounded-[14px] border-2 bg-surface text-center font-display text-2xl font-bold outline-none transition-[border-color,box-shadow]",
            invalid ? "border-danger" : d ? "border-ink" : "border-line-strong",
            "focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)]",
          )}
        />
      ))}
    </div>
  );
}
