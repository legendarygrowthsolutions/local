"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, Info, MessageCircleMore } from "lucide-react";
import { PhoneSchema } from "@/contracts";
import { useSendOtp, useVerifyOtp } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { OtpInput } from "./otp-input";

export function safeNext(next: string | null, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function LoginFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [timer, setTimer] = useState(0);
  const send = useSendOtp();
  const verify = useVerifyOtp();

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const submitPhone = (e?: React.FormEvent) => {
    e?.preventDefault();
    const parsed = PhoneSchema.safeParse(phone);
    if (!parsed.success) return setPhoneError(parsed.error.issues[0].message);
    setPhoneError(null);
    send.mutate(phone, {
      onSuccess: (r) => {
        setStep("otp");
        setCode("");
        setTimer(r.resendInSec);
      },
    });
  };

  const submitCode = (c = code) => {
    if (c.length !== 6 || verify.isPending) return;
    verify.mutate(
      { phone, code: c },
      {
        onSuccess: (r) => {
          router.replace(r.isNew ? `/onboarding?next=${encodeURIComponent(next)}` : next);
          router.refresh();
        },
        onError: () => setCode(""),
      },
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-7 pt-5 lg:max-w-6xl lg:px-10 lg:pt-8">
      <div className="flex h-11 items-center justify-between">
        {step === "otp" ? (
          <button type="button" onClick={() => setStep("phone")} className="grid size-11 place-items-center rounded-full border border-line bg-surface hover:bg-field" aria-label="Change number">
            <ChevronLeft className="size-5" />
          </button>
        ) : (
          <Logo />
        )}
        {step === "phone" && (
          <Link href={next} className="text-[13px] font-semibold text-muted hover:text-ink">
            Skip for now
          </Link>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step === "phone" ? (
          <m.form key="phone" onSubmit={submitPhone} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="mt-5 flex flex-1 flex-col gap-5 lg:my-auto lg:grid lg:flex-none lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-16">
            <div className="flex flex-col gap-5 lg:gap-8">
            <Mosaic />
            <div className="mt-1 flex flex-col gap-2">
              <h1 className="font-display text-[36px] font-extrabold leading-[1.02] lg:text-[56px]">
                Everything to do
                <br />
                in <span className="text-brand">your city.</span>
              </h1>
              <p className="text-[15px] leading-[1.45] text-muted lg:text-lg">Events, meetups, workshops and courts — discover and book in a tap.</p>
            </div>
            </div>
            <div className="mt-auto flex flex-col gap-5 lg:mt-0 lg:rounded-[28px] lg:border lg:border-line lg:bg-surface lg:p-8 lg:shadow-[0_24px_64px_-32px_rgb(12_35_38/0.25)]">
            <h2 className="hidden font-display text-2xl font-bold lg:block">Log in or sign up</h2>
            <div className="flex flex-col gap-2.5">
              <label htmlFor="phone" className="text-[13px] font-bold">
                Mobile number
              </label>
              <div className={`flex h-14 items-center gap-2.5 rounded-2xl border-2 bg-surface px-4 transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_4px_var(--color-tint)] ${phoneError ? "border-danger" : "border-line-strong"}`}>
                <span className="text-base font-bold">+91</span>
                <span className="h-6 w-px bg-line-strong" aria-hidden />
                <input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  autoFocus
                  aria-invalid={!!phoneError}
                  aria-describedby={phoneError ? "phone-error" : undefined}
                  className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold tracking-wide outline-none placeholder:font-normal placeholder:text-subtle"
                />
              </div>
              {phoneError && (
                <p id="phone-error" className="text-sm text-danger">
                  {phoneError}
                </p>
              )}
              {send.error && <p className="text-sm text-danger">{send.error.message}</p>}
              <Button type="submit" size="lg" block loading={send.isPending} disabled={phone.length < 10} className="font-bold">
                Get OTP
              </Button>
              <p className="mt-0.5 text-center text-xs leading-normal text-muted">
                By continuing you agree to our{" "}
                <Link href="/legal#terms" className="text-ink underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/legal#privacy" className="text-ink underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
            <p className="flex flex-wrap justify-center gap-1.5 border-t border-line pt-4 text-[13px] text-muted">
              Host events or run a venue?{" "}
              <Link href="/host/apply" className="font-bold text-brand">
                Apply as host →
              </Link>
            </p>
            </div>
          </m.form>
        ) : (
          <m.div key="otp" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="mt-6 flex flex-1 flex-col gap-[26px] lg:mx-auto lg:my-auto lg:w-full lg:max-w-md lg:flex-none">
            <span className="grid size-[72px] place-items-center rounded-[22px] bg-tint text-brand" aria-hidden>
              <MessageCircleMore className="size-[34px]" strokeWidth={1.8} />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[32px] font-extrabold leading-tight">Enter the code</h1>
              <p className="text-[15px] text-muted">
                Sent via SMS to{" "}
                <strong className="text-ink">
                  +91 {phone.slice(0, 5)} {phone.slice(5)}
                </strong>{" "}
                ·{" "}
                <button type="button" onClick={() => setStep("phone")} className="font-bold text-brand">
                  Edit
                </button>
              </p>
            </div>
            <div className="flex flex-col gap-3.5">
              <m.div animate={verify.isError ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.35 }}>
                <OtpInput value={code} onChange={setCode} onComplete={submitCode} invalid={verify.isError} disabled={verify.isPending} />
              </m.div>
              {verify.error && (
                <p className="text-sm text-danger" role="alert">
                  {verify.error.message}
                </p>
              )}
              <div className="flex items-center justify-between text-[13px] text-muted">
                {timer > 0 ? (
                  <span>
                    Resend in <strong className="text-ink">0:{String(timer).padStart(2, "0")}</strong>
                  </span>
                ) : (
                  <button type="button" onClick={() => submitPhone()} className="font-semibold text-brand">
                    Resend code
                  </button>
                )}
                <button type="button" disabled={timer > 0} onClick={() => submitPhone()} className="font-semibold text-brand disabled:text-subtle">
                  Get code on WhatsApp
                </button>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-[14px] bg-field p-3.5 text-[13px] leading-[1.45] text-ink-2">
              <Info className="mt-px size-[18px] flex-none" strokeWidth={1.8} aria-hidden />
              <span>Phase 1 prototype: the mock auth API accepts any 6-digit code (000000 shows the error state). OTP auto-reads on Android (Web OTP API).</span>
            </div>
            <Button size="lg" block loading={verify.isPending} disabled={code.length !== 6} onClick={() => submitCode()} className="mt-auto font-bold">
              Verify &amp; continue
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/** Decorative tone-on-tone tiles (wireframe 01). Purely visual, so hidden from assistive tech. */
function Mosaic() {
  const tile = "relative flex items-end overflow-hidden rounded-[18px] p-2.5 text-xs font-semibold";
  return (
    <div className="grid grid-cols-3 grid-rows-[124px_124px] gap-2 lg:grid-rows-[180px_180px] lg:gap-3" aria-hidden>
      <div className={`${tile} row-span-2 bg-feature text-feature-muted`}>
        <span className="absolute -right-[50px] -top-10 size-[140px] rounded-full bg-feature-2" />
        <span className="absolute left-[18px] top-[90px] size-[54px] rounded-full bg-spark" />
        <span className="relative">Live gigs</span>
      </div>
      <div className={`${tile} bg-tone-1 text-ink-2`}>
        <span className="absolute -right-[18px] -top-[18px] size-[70px] rounded-full border-8 border-[#d3dccf]" />
        <span className="relative">Pickleball</span>
      </div>
      <div className={`${tile} bg-tone-2 text-ink-2`}>
        <span className="absolute left-3.5 top-[18px] h-10 w-20 rounded-t-full bg-[#e7d8cf]" />
        <span className="relative">Pottery</span>
      </div>
      <div className={`${tile} bg-tone-3 text-ink-2`}>
        <span className="absolute -left-[20%] top-[34px] h-3.5 w-[140%] -rotate-[14deg] bg-[#d3dae6]" />
        <span className="relative">Run club</span>
      </div>
      <div className={`${tile} bg-tone-0 text-ink-2`}>
        <span className="absolute right-3.5 top-3.5 size-[54px] rotate-[18deg] rounded-xl bg-[#cfe3e1]" />
        <span className="relative">Art shows</span>
      </div>
    </div>
  );
}
