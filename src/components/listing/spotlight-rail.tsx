"use client";

import { useState } from "react";
import type { HomePayload } from "@/contracts";
import { cn } from "@/lib/utils";
import { RailHeader, RailTrack } from "./rail";

/**
 * First home section (wireframes 05 + 18): chips switch the rail between this weekend, today, free and under ₹500.
 * Every chip's items come from the home API; nothing is filtered client-side.
 */
export function SpotlightRail({ filters, cityName }: { filters: HomePayload["quickFilters"]; cityName: string }) {
  const [active, setActive] = useState(filters[0]?.id);
  const current = filters.find((f) => f.id === active) ?? filters[0];
  if (!current) return null;
  const title = current.id === "weekend" ? "Happening this weekend" : current.id === "today" ? "Happening today" : current.id === "free" ? "Free to go" : "Under ₹500";
  return (
    <section aria-labelledby="rail-spotlight" className="flex flex-col gap-3 md:gap-4">
      <div className="flex flex-col gap-3 md:flex-col-reverse md:gap-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 md:px-0" role="group" aria-label="Filter this rail">
          {filters.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={f.id === current.id}
              onClick={() => setActive(f.id)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                f.id === current.id ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:border-ink/30",
              )}
            >
              {i === 0 ? (
                <>
                  <span className="md:hidden">{f.label}</span>
                  <span className="max-md:hidden">All</span>
                </>
              ) : (
                f.label
              )}
            </button>
          ))}
        </div>
        <RailHeader
          id="rail-spotlight"
          title={
            current.id === "weekend" ? (
              <>
                <span className="md:hidden">{title}</span>
                <span className="max-md:hidden">This weekend in {cityName}</span>
              </>
            ) : (
              title
            )
          }
          href={current.href}
        />
      </div>
      <RailTrack key={current.id} items={current.items} />
    </section>
  );
}
