import Link from "next/link";
import type { HomeRail } from "@/contracts";
import { cn } from "@/lib/utils";
import { ListingCard } from "./listing-card";

export function RailHeader({ id, title, href }: { id: string; title: React.ReactNode; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 md:px-0">
      <h2 id={id} className="font-display text-xl font-extrabold leading-tight md:text-[30px]">
        {title}
      </h2>
      {href && (
        <Link href={href} className="shrink-0 text-[13px] font-bold text-brand hover:underline md:text-sm">
          See all<span className="max-md:hidden"> →</span>
        </Link>
      )}
    </div>
  );
}

export function RailTrack({ items, className }: { items: HomeRail["items"]; className?: string }) {
  return (
    <div className={cn("no-scrollbar flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 md:scroll-px-0 md:gap-5 md:px-0", className)}>
      {items.map((c) => (
        <ListingCard key={c.id} card={c} />
      ))}
    </div>
  );
}

/** A home rail. Venue-only rails ("Play near you") are stacked row cards on phones (wireframe 05). */
export function Rail({ rail }: { rail: HomeRail }) {
  const venues = rail.items.every((c) => c.kind === "venue");
  return (
    <section aria-labelledby={`rail-${rail.id}`} className="reveal flex flex-col gap-3 md:gap-4">
      <RailHeader id={`rail-${rail.id}`} title={rail.title} href={rail.href} />
      {venues ? (
        <>
          <div className="flex flex-col gap-2.5 px-5 md:hidden">
            {rail.items.slice(0, 3).map((c) => (
              <ListingCard key={c.id} card={c} layout="row" />
            ))}
          </div>
          <RailTrack items={rail.items} className="max-md:hidden" />
        </>
      ) : (
        <RailTrack items={rail.items} />
      )}
    </section>
  );
}
