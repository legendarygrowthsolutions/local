"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/avatar";
import { CitySwitcher } from "@/components/city/city-switcher";
import { useMe } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

const NAV = [
  { slug: "events", label: "Events" },
  { slug: "sports", label: "Sports" },
  { slug: "workshops", label: "Workshops" },
  { slug: "meetups", label: "Meetups" },
];

/** Desktop top nav (≥ md, wireframe 18). Phones use the per-page top bar + bottom tabs. */
export function SiteHeader({ city, cityName }: { city: string; cityName: string }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  return (
    <header className="sticky top-0 z-40 hidden border-b border-line bg-surface/95 backdrop-blur-md md:block">
      <div className="mx-auto flex h-[74px] max-w-[1280px] items-center gap-5 px-8">
        <Logo href={`/${city}`} className="text-[28px]" />
        <CitySwitcher city={city} cityName={cityName} variant="outlined" />
        <Link href={`/${city}/search`} className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-[14px] bg-field px-3.5 text-sm text-muted transition-colors hover:bg-line">
          <Search className="size-[18px] flex-none" aria-hidden />
          <span className="truncate">Search events, venues, workshops</span>
        </Link>
        <nav aria-label="Categories" className="hidden items-center gap-[18px] lg:flex">
          {NAV.map((n) => {
            const active = pathname.startsWith(`/${city}/${n.slug}`);
            return (
              <Link key={n.slug} href={`/${city}/${n.slug}`} aria-current={active ? "page" : undefined} className={cn("px-1 py-2.5 text-sm font-semibold transition-colors", active ? "text-brand" : "text-ink hover:text-brand")}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link href={me?.role === "host" ? "/host" : "/host/apply"} className="flex-none rounded-xl border-[1.5px] border-ink px-4 py-2.5 text-sm font-bold transition-colors hover:bg-ink hover:text-white">
          List your event
        </Link>
        {me ? (
          <Link href="/me" aria-label="Your profile" className="flex-none">
            <Avatar name={me.name} src={me.avatar} className="size-[42px] text-sm" />
          </Link>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="inline-flex h-[42px] flex-none items-center rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-2">
            Log in
          </Link>
        )}
      </div>
    </header>
  );
}
