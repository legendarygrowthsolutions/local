import { cn } from "@/lib/utils";

/** Two-step onboarding bar shared by profile (1) and city (2). */
export function OnboardingProgress({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex h-11 items-center gap-3">
      <span className="h-[5px] flex-1 rounded-full bg-brand" aria-hidden />
      <span className={cn("h-[5px] flex-1 rounded-full", step === 2 ? "bg-brand" : "bg-line-strong")} aria-hidden />
      <span className="text-xs font-semibold text-muted">{step} of 2</span>
    </div>
  );
}
