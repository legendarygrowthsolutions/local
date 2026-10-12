"use client";

import { useState } from "react";
import type { VenueDetail } from "@/contracts";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { StickyCta } from "./sticky-cta";

/** Wireframe 10: sport picker → that sport's courts → sticky "Book a slot" deep-linked to the sport. */
export function VenueSports({ detail }: { detail: Pick<VenueDetail, "venue" | "resources" | "sportSummaries"> }) {
  const { venue, resources, sportSummaries } = detail;
  const [sport, setSport] = useState(sportSummaries[0]?.slug);
  const current = sportSummaries.find((s) => s.slug === sport) ?? sportSummaries[0];
  const courts = resources.filter((r) => r.sport === current?.slug);
  const href = `/book/v/${venue.id}${current ? `?sport=${current.slug}` : ""}`;
  return (
    <>
      {sportSummaries.length > 1 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-lg font-extrabold md:text-xl">Pick a sport</h2>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0" role="radiogroup" aria-label="Sport">
            {sportSummaries.map((s) => {
              const on = s.slug === current?.slug;
              return (
                <button
                  key={s.slug}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSport(s.slug)}
                  className={cn("flex min-w-28 flex-none flex-col items-start gap-0.5 rounded-2xl border-[1.5px] px-3.5 py-3 text-left transition-colors", on ? "border-brand bg-tint" : "border-line-strong bg-surface hover:border-ink/30")}
                >
                  <b className="text-sm">{s.name}</b>
                  <small className={cn("text-xs", on ? "text-brand-ink" : "text-muted")}>
                    {s.courts} {s.courts === 1 ? "court" : "courts"} · {formatINR(s.priceFrom)}/hr
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col">
        <h2 className="mb-1 font-display text-lg font-extrabold md:text-xl">{current?.name} courts</h2>
        <ul>
          {courts.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 border-b border-line py-3 text-sm last:border-0">
              <span>
                <b>{r.name}</b>
                <span className="text-muted">
                  {" "}
                  · {r.indoor ? "Indoor" : "Outdoor"} · {r.surface}
                </span>
              </span>
              <span className="flex-none text-[13px] text-muted">{r.slotLengthMins} min slots</span>
            </li>
          ))}
        </ul>
      </section>

      <StickyCta
        title={`${current?.name ?? "Courts"} from`}
        price={
          <>
            {formatINR(current?.priceFrom ?? 0)}
            <span className="font-sans text-sm font-medium text-muted">/hr</span>
          </>
        }
        href={href}
        label="Book a slot"
      />
    </>
  );
}
