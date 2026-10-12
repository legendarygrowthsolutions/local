"use client";

import useEmblaCarousel from "embla-carousel-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ListingCard } from "@/contracts";
import { cn } from "@/lib/utils";
import { featuredMeta } from "./featured-meta";

/** Phone featured poster (wireframe 05): dark feature surface, dots top-left. Desktop uses FeaturedBento. */
export function FeaturedCarousel({ items, className }: { items: ListingCard[]; className?: string }) {
  const [ref, api] = useEmblaCarousel({ loop: true, align: "start" });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = reduce ? null : setInterval(() => api.scrollNext(), 6000);
    return () => {
      api.off("select", onSelect);
      if (t) clearInterval(t);
    };
  }, [api]);

  const go = useCallback((i: number) => api?.scrollTo(i), [api]);
  if (!items.length) return null;

  return (
    <section aria-roledescription="carousel" aria-label="Featured" className={cn("relative px-5", className)}>
      <div className="overflow-hidden rounded-3xl" ref={ref}>
        <div className="flex">
          {items.map((c, i) => (
            <div key={c.id} className="min-w-0 flex-[0_0_100%]" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
              <Link href={c.href} className="relative block h-[200px] overflow-hidden bg-feature text-white">
                <span className="absolute -right-20 -top-[100px] size-60 rounded-full bg-feature-2" aria-hidden />
                <span className="absolute right-10 top-[30px] size-[100px] rounded-full bg-spark" aria-hidden />
                <div className="absolute inset-x-4 bottom-4 flex flex-col gap-1.5">
                  <span className="self-start rounded-md bg-white/15 px-2 py-1 text-[11px] font-bold tracking-[0.04em]">FEATURED</span>
                  <h2 className="line-clamp-2 max-w-[270px] font-display text-[23px] font-extrabold leading-[1.08]">{c.title}</h2>
                  <p className="truncate text-[13px] text-feature-muted">{featuredMeta(c)}</p>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>
      {items.length > 1 && (
        <div className="absolute left-9 top-2.5 flex" role="tablist" aria-label="Choose slide">
          {items.map((c, i) => (
            <button key={c.id} role="tab" aria-selected={i === index} aria-label={`Show ${c.title}`} onClick={() => go(i)} className="grid h-6 min-w-6 place-items-center">
              <span className={cn("block h-1.5 rounded-full transition-all duration-300", i === index ? "w-[18px] bg-white" : "w-1.5 bg-feature-muted/50")} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
