import Link from "next/link";
import type { ListingCard } from "@/contracts";
import { cn } from "@/lib/utils";
import { featuredMeta } from "./featured-meta";

const SIDE_TONES = ["bg-tone-0", "bg-tone-1", "bg-tone-2", "bg-tone-3"];
const SIDE_INKS = ["bg-[#cfe3e1]", "bg-[#d3dccf]", "bg-[#e7d8cf]", "bg-[#d3dae6]"];

/** Desktop hero (wireframe 18): one big dark featured card and two soft side cards. */
export function FeaturedBento({ main, side }: { main: ListingCard; side: ListingCard[] }) {
  return (
    <section aria-label="Featured" className="grid grid-cols-[2fr_1fr] gap-4">
      <Link href={main.href} className="group relative flex min-h-[400px] items-end overflow-hidden rounded-[28px] bg-feature p-9 text-white">
        <span className="absolute -right-[140px] -top-[180px] size-[460px] rounded-full bg-feature-2" aria-hidden />
        <span className="absolute right-[110px] top-[70px] size-[200px] rounded-full bg-spark transition-transform duration-500 group-hover:scale-105" aria-hidden />
        <span className="absolute right-[60px] top-[250px] size-[90px] rounded-full bg-feature-3" aria-hidden />
        <div className="relative flex max-w-[520px] flex-col gap-3">
          <span className="self-start rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold tracking-[0.04em]">FEATURED</span>
          <h2 className="font-display text-[44px] font-extrabold leading-[1.02]">{main.title}</h2>
          <p className="text-[15px] text-feature-muted">{featuredMeta(main)}</p>
          <span className="mt-1.5 self-start rounded-xl bg-white px-[18px] py-[11px] text-sm font-bold text-ink">{main.ctaLabel}</span>
        </div>
      </Link>
      <div className="grid grid-rows-2 gap-4">
        {side.slice(0, 2).map((c, i) => (
          <Link key={c.id} href={c.href} className={cn("group relative flex flex-col justify-end gap-1 overflow-hidden rounded-[28px] p-[22px]", SIDE_TONES[c.tone % 4])}>
            {i === 0 ? (
              <span className={cn("absolute -right-[30px] -top-10 size-[150px] rounded-full", SIDE_INKS[c.tone % 4])} aria-hidden />
            ) : (
              <span className={cn("absolute right-[22px] top-[22px] h-[70px] w-[120px] rounded-md border-[3px] border-current opacity-20")} aria-hidden />
            )}
            <span className="relative text-xs font-bold uppercase tracking-[0.02em] text-brand">{c.badge && c.badge.top.includes("–") ? `${c.badge.top} ${c.badge.bottom}` : c.whenLabel}</span>
            <span className="relative font-display text-xl font-extrabold group-hover:text-brand-ink">{c.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
