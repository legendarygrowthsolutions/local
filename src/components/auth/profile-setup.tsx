"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { m } from "motion/react";
import { ProfileSchema, type ProfileInput } from "@/contracts";
import { useMe, useUpdateMe } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { fileToAvatar } from "@/components/ui/avatar";
import { OnboardingProgress } from "./onboarding-progress";
import { cn } from "@/lib/utils";
import { safeNext } from "./login-flow";

const GENDERS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "other", label: "Other" },
] as const;

const field = "h-[54px] w-full rounded-[14px] border-2 bg-surface px-4 text-base outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)]";

export function ProfileSetup({ interests, mode = "onboarding" }: { interests: { slug: string; name: string }[]; mode?: "onboarding" | "edit" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: me } = useMe();
  const update = useUpdateMe();
  const next = safeNext(params.get("next"), "/");
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const { register, handleSubmit, control, formState, watch, setValue } = useForm<ProfileInput, unknown, ProfileInput>({
    resolver: zodResolver(ProfileSchema) as never,
    defaultValues: { name: me?.name ?? "", gender: (me?.gender ?? undefined) as ProfileInput["gender"], dob: me?.dob ?? "", interests: me?.interests ?? [] },
  });
  const chosen = watch("interests") ?? [];
  const shownAvatar = avatar === undefined ? me?.avatar : avatar;

  const onSubmit = handleSubmit((v) =>
    update.mutate(avatar === undefined ? v : { ...v, avatar }, {
      onSuccess: () => {
        if (mode === "edit") return router.push("/me");
        const hasCity = document.cookie.includes("lcl_city=");
        router.replace(hasCity ? next : `/city?next=${encodeURIComponent(next)}&onboarding=1`);
        router.refresh();
      },
    }),
  );

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    try {
      setAvatar(await fileToAvatar(file));
    } catch {
      setPhotoError("Couldn't read that image. Try a JPG or PNG.");
    }
  };

  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-md flex-col gap-[22px] px-5 pb-7 pt-5 md:min-h-0 md:max-w-xl md:rounded-[32px] md:border md:border-line md:bg-surface md:p-10",
        mode === "onboarding" ? "md:my-[8vh] md:shadow-[0_24px_64px_-32px_rgb(12_35_38/0.25)]" : "md:mt-10 lg:mx-0 lg:mt-0 lg:max-w-2xl",
      )}
    >
      {mode === "onboarding" && <OnboardingProgress step={1} />}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => photoInput.current?.click()}
          aria-label={shownAvatar ? "Change photo" : "Add photo"}
          className={cn("relative grid size-[72px] flex-none place-items-center overflow-hidden rounded-full text-brand", shownAvatar ? "" : "border-2 border-dashed border-[#9fd3d6] bg-tint")}
        >
          {shownAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview / data URL
            <img src={shownAvatar} alt="" className="size-full object-cover" />
          ) : (
            <Camera className="size-[26px]" strokeWidth={1.8} aria-hidden />
          )}
        </button>
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[30px] font-extrabold leading-[1.05]">{mode === "edit" ? "Edit profile" : "Let\u2019s set you up"}</h1>
          <p className="text-sm text-muted">Used on your tickets &amp; age-gated events.</p>
        </div>
      </div>
      {photoError && <p className="-mt-3 text-sm text-danger">{photoError}</p>}

      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-[22px]" noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-[13px] font-bold">
            Full name
          </label>
          <input id="name" {...register("name")} autoComplete="name" placeholder="Your name" className={cn(field, formState.errors.name ? "border-danger" : "border-line-strong")} />
          {formState.errors.name && <p className="text-sm text-danger">{formState.errors.name.message}</p>}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-bold">Gender</legend>
          <Controller
            control={control}
            name="gender"
            render={({ field: f }) => (
              <div role="radiogroup" className="flex flex-col gap-2">
                <div className="flex gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="radio"
                      aria-checked={f.value === g.id}
                      onClick={() => f.onChange(g.id)}
                      className={cn("h-12 flex-1 rounded-[14px] border-2 text-sm font-semibold transition-colors", f.value === g.id ? "border-brand bg-brand text-white" : "border-line-strong bg-surface hover:border-ink/30")}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  role="radio"
                  aria-checked={f.value === "na"}
                  onClick={() => f.onChange("na")}
                  className={cn("self-start py-1 text-[13px] underline underline-offset-2", f.value === "na" ? "font-bold text-brand" : "text-muted")}
                >
                  Prefer not to say
                </button>
              </div>
            )}
          />
          {formState.errors.gender && <p className="text-sm text-danger">Please choose one</p>}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-bold">Date of birth</legend>
          <Controller control={control} name="dob" render={({ field: f }) => <DobInput value={f.value} onChange={f.onChange} invalid={!!formState.errors.dob} />} />
          {formState.errors.dob ? <p className="text-sm text-danger">{formState.errors.dob.message}</p> : <p className="text-xs text-muted">Some events are 18+. We never show this publicly.</p>}
        </fieldset>

        <fieldset>
          <legend className="mb-2.5 text-[13px] font-bold">
            What are you into? <span className="font-normal text-muted">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {interests.map((it, i) => {
              const on = chosen.includes(it.slug);
              return (
                <m.button
                  key={it.slug}
                  type="button"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.015 }}
                  aria-pressed={on}
                  onClick={() => setValue("interests", on ? chosen.filter((x) => x !== it.slug) : [...chosen, it.slug])}
                  className={cn("h-[38px] rounded-full border px-3.5 text-[13px] font-semibold transition-colors", on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface hover:border-ink/30")}
                >
                  {it.name}
                </m.button>
              );
            })}
          </div>
        </fieldset>

        {update.error && <p className="text-sm text-danger">{update.error.message}</p>}
        <div className="mt-auto pt-2">
          <Button type="submit" size="lg" block loading={update.isPending} className="font-bold">
            {mode === "edit" ? "Save changes" : "Continue"}
          </Button>
        </div>
      </form>
    </main>
  );
}

/** DD · MM · YYYY boxes ↔ ISO date; focus hops forward as each box fills. */
function DobInput({ value, onChange, invalid }: { value: string | undefined; onChange: (v: string) => void; invalid: boolean }) {
  const [y0, m0, d0] = (value ?? "").split("-");
  const [parts, setParts] = useState({ d: d0 ?? "", m: m0 ?? "", y: y0 ?? "" });
  const refs = { d: useRef<HTMLInputElement>(null), m: useRef<HTMLInputElement>(null), y: useRef<HTMLInputElement>(null) };
  const boxes = [
    { k: "d", label: "Day", ph: "DD", max: 2, next: "m" },
    { k: "m", label: "Month", ph: "MM", max: 2, next: "y" },
    { k: "y", label: "Year", ph: "YYYY", max: 4, next: null },
  ] as const;
  const set = (k: "d" | "m" | "y", raw: string, max: number, nextKey: "m" | "y" | null) => {
    const v = raw.replace(/\D/g, "").slice(0, max);
    const p = { ...parts, [k]: v };
    setParts(p);
    onChange(p.d.length === 2 && p.m.length === 2 && p.y.length === 4 ? `${p.y}-${p.m}-${p.d}` : "");
    if (v.length === max && nextKey) refs[nextKey].current?.focus();
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      {boxes.map((b) => (
        <input
          key={b.k}
          ref={refs[b.k]}
          aria-label={b.label}
          inputMode="numeric"
          autoComplete={b.k === "d" ? "bday-day" : b.k === "m" ? "bday-month" : "bday-year"}
          placeholder={b.ph}
          value={parts[b.k]}
          onChange={(e) => set(b.k, e.target.value, b.max, b.next)}
          aria-invalid={invalid}
          className={cn(field, "text-center tracking-wide", invalid ? "border-danger" : "border-line-strong")}
        />
      ))}
    </div>
  );
}
