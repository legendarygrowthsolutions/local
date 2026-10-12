"use client";

import { safeNext } from "@/components/auth/login-flow";

import { m } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, MapPin, Search } from "lucide-react";
import type { City } from "@/contracts";
import { useCities } from "@/lib/api/hooks";
import { rememberCity } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import { useDetectCity, type DetectState } from "./use-detect-city";

/**
 * Wireframe 04. Full page: tap a tile (or a typed suggestion, or the detected city) to select, then "Explore {city}".
 * Compact (header sheet): tapping a tile goes straight there.
 */
export function CityPicker({ current, onPicked, compact }: { current?: string; onPicked?: (c: City) => void; compact?: boolean }) {
  const { data: cities, isLoading, error, refetch } = useCities();
  const { state, detect } = useDetectCity(cities);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | undefined>(current);
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");

  const go = (c: City) => {
    rememberCity(c.slug);
    onPicked?.(c);
    const safe = safeNext(next, "");
    router.push(safe ? safe.replace(/^\/[^/]+/, `/${c.slug}`) : `/${c.slug}`);
  };
  const choose = (c: City) => (compact ? go(c) : (setPicked(c.slug), setQ("")));

  // Ask once on first open of the full-page picker (brief: default city from location permission).
  useEffect(() => {
    if (!compact && cities?.length && state.status === "idle") detect();
  }, [compact, cities, state.status, detect]);
  // A detected city becomes the selection unless the person already chose one.
  const detected = state.status === "found" ? state.city.slug : undefined;
  const selected = picked ?? detected;
  const selectedCity = cities?.find((c) => c.slug === selected);

  const t = q.trim().toLowerCase();
  const matches = useMemo(() => (t ? (cities ?? []).filter((c) => c.name.toLowerCase().startsWith(t) || c.name.toLowerCase().includes(t)) : []), [cities, t]);

  return (
    <div className="flex flex-1 flex-col gap-[18px]">
      <LocationStrip state={state} onAllow={detect} onUse={(c) => choose(c)} disabled={!cities} />

      <div className="relative">
        <label htmlFor="cityq" className="sr-only">
          Search for your city
        </label>
        <div className="flex h-[54px] items-center gap-2.5 rounded-2xl border-2 border-line-strong bg-surface px-3.5 text-muted transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_4px_var(--color-tint)]">
          <Search className="size-5 flex-none" aria-hidden />
          <input
            id="cityq"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type your city"
            autoComplete="address-level2"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-subtle"
          />
        </div>
        {t && (
          <div className="mt-1.5 rounded-[14px] border border-line bg-surface px-3">
            {matches.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(c)}
                className={cn("flex min-h-[52px] w-full items-center gap-3 px-1 text-left text-[15px]", i < matches.length - 1 && "border-b border-line")}
              >
                <Highlight text={c.name} q={t} />
                <span className="ml-auto text-xs text-muted">{c.state}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="py-3.5 text-sm text-muted">
                We&apos;re not in &ldquo;{q}&rdquo; yet. We&apos;re live in {(cities ?? []).map((c) => c.name).join(", ")}, with more cities soon.
              </p>
            )}
          </div>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] font-bold">Popular cities</p>
          <div className="grid grid-cols-3 gap-2.5">
            {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-[18px]" />)}
            {cities?.map((c, i) => (
              <m.button
                key={c.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => choose(c)}
                aria-pressed={compact ? undefined : selected === c.slug}
                className={cn(
                  "relative flex h-28 items-end overflow-hidden rounded-[18px] p-2.5 text-left font-display text-[15px] font-extrabold text-ink transition-shadow",
                  tileTone(c.slug, i),
                  !compact && "md:h-36",
                  (compact ? current : selected) === c.slug && "shadow-[0_0_0_2px_var(--color-ground),0_0_0_4px_var(--color-brand)]",
                )}
              >
                <CityMark slug={c.slug} i={i} />
                {(compact ? current : selected) === c.slug && (
                  <span className="absolute right-2 top-2 grid size-[22px] place-items-center rounded-full bg-brand text-white" aria-hidden>
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
                <span className="relative">{c.name}</span>
              </m.button>
            ))}
          </div>
        </div>
      )}

      {!compact && (
        <Button size="lg" block className="mt-auto font-bold md:mt-4" disabled={!selectedCity} onClick={() => selectedCity && go(selectedCity)}>
          {selectedCity ? `Explore ${selectedCity.name}` : "Pick a city"}
        </Button>
      )}
    </div>
  );
}

const TONES = ["bg-tone-2", "bg-tone-0", "bg-tone-1", "bg-tone-3"];
/** Cities with their own look; any other city falls back to the tone rotation. Nagpur is the Orange City. */
const CITY_TONES: Record<string, string> = { mumbai: "bg-tone-2", pune: "bg-tone-0", nagpur: "bg-[#ffe3c2]" };
const CITY_MARKS: Record<string, number> = { mumbai: 0, pune: 1, nagpur: 2 };
const tileTone = (slug: string, i: number) => CITY_TONES[slug] ?? TONES[i % TONES.length];

/** Soft landmark shapes, one per tile (decorative). */
function CityMark({ slug, i }: { slug: string; i: number }) {
  switch (CITY_MARKS[slug] ?? (i % 4)) {
    case 0:
      return <span aria-hidden className="absolute left-3.5 top-5 h-9 w-11 rounded-t-full border-[6px] border-b-0 border-[#e7d8cf]" />;
    case 1:
      return (
        <span aria-hidden>
          <span className="absolute left-3.5 top-[18px] h-10 w-3.5 rounded-[3px] bg-[#c9dcda]" />
          <span className="absolute left-[34px] top-[30px] h-7 w-3.5 rounded-[3px] bg-[#c9dcda]" />
        </span>
      );
    case 2:
      // An orange with a leaf
      return (
        <span aria-hidden>
          <span className="absolute left-3.5 top-4 size-[50px] rounded-full bg-[#f5a03a] shadow-[inset_-6px_-6px_0_rgb(214_120_20/0.35)]" />
          <span className="absolute left-[44px] top-2.5 h-3 w-5 -rotate-[24deg] rounded-[100%_0] bg-[#6f9a4a]" />
        </span>
      );
    default:
      return <span aria-hidden className="absolute -left-[20%] top-9 h-3 w-[140%] -rotate-12 bg-[#d3dae6]" />;
  }
}

function Highlight({ text, q }: { text: string; q: string }) {
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, at)}
      <strong>{text.slice(at, at + q.length)}</strong>
      {text.slice(at + q.length)}
    </span>
  );
}

const STRIP: Record<string, string> = {
  idle: "Turn on location to see what’s near you.",
  denied: "Location is off. Type your city, or",
  unavailable: "We couldn’t get your location. Type your city, or",
  timeout: "Finding you took too long. Type your city, or",
};

function LocationStrip({ state, onAllow, onUse, disabled }: { state: DetectState; onAllow: () => void; onUse: (c: City) => void; disabled: boolean }) {
  const action = "flex-none rounded-[10px] bg-tint px-3 py-2 text-[13px] font-bold text-brand-ink disabled:opacity-60";
  return (
    <div className="flex min-h-[54px] items-center gap-3 rounded-[14px] border border-line bg-surface py-2.5 pl-3.5 pr-2.5 text-[13px] leading-[1.4] text-ink-2" role="status">
      {state.status === "locating" ? <LoaderCircle className="size-5 flex-none animate-spin text-brand" aria-hidden /> : <MapPin className="size-5 flex-none text-brand" strokeWidth={1.8} aria-hidden />}
      {state.status === "locating" && <span className="flex-1">Finding you…</span>}
      {(state.status === "found" || state.status === "far") && (
        <>
          <span className="flex-1">
            {state.status === "found" ? (
              <>
                Looks like you&apos;re in <b>{state.city.name}</b>.
              </>
            ) : (
              <>
                We&apos;re not in your city yet. Nearest is <b>{state.city.name}</b> ({Math.round(state.km)} km).
              </>
            )}
          </span>
          {state.status === "far" && (
            <button type="button" className={action} onClick={() => onUse(state.city)}>
              Use {state.city.name}
            </button>
          )}
        </>
      )}
      {state.status in STRIP && (
        <>
          <span className="flex-1">{STRIP[state.status]}</span>
          <button type="button" className={action} onClick={onAllow} disabled={disabled}>
            Allow
          </button>
        </>
      )}
    </div>
  );
}
