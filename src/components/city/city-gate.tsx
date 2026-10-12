import { Suspense } from "react";
import { CityPicker } from "./city-picker";
import { Logo } from "@/components/ui/logo";
import { OnboardingProgress } from "@/components/auth/onboarding-progress";

export function CityGate({ current, onboarding }: { current?: string; onboarding?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-[18px] px-5 pb-7 pt-5 md:my-[8vh] md:min-h-0 md:max-w-xl md:rounded-[32px] md:border md:border-line md:bg-surface md:p-10 md:shadow-[0_24px_64px_-32px_rgb(12_35_38/0.25)]">
      {onboarding ? (
        <OnboardingProgress step={2} />
      ) : (
        <div className="flex h-11 items-center">
          <Logo href={current ? `/${current}` : "/"} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[32px] font-extrabold leading-tight">Pick your city</h1>
        <p className="text-[15px] text-muted">We&apos;ll show what&apos;s happening around you.</p>
      </div>
      <Suspense>
        <CityPicker current={current} />
      </Suspense>
    </main>
  );
}
