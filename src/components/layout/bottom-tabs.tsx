"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import { Compass, House, Ticket, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomTabs({ city }: { city: string }) {
  const pathname = usePathname();
  // Detail pages have their own sticky CTA bar.
  if (/^\/[^/]+\/(e|v)\//.test(pathname)) return null;
  const tabs = [
    { href: `/${city}`, label: "Home", icon: House, match: (p: string) => p === `/${city}` },
    { href: `/${city}/search`, label: "Explore", icon: Compass, match: (p: string) => p.startsWith(`/${city}/`) && !p.includes("/e/") && !p.includes("/v/") },
    { href: "/me/bookings", label: "Bookings", icon: Ticket, match: (p: string) => p.startsWith("/me/bookings") },
    { href: "/me", label: "Profile", icon: UserRound, match: (p: string) => p === "/me" || p.startsWith("/me/saved") },
  ];
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1.5 pb-1.5">
        {tabs.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          return (
            <li key={t.label} className="flex-1">
              <Link href={t.href} className="relative flex flex-col items-center gap-0.5 py-1" aria-current={active ? "page" : undefined}>
                <span className="relative grid h-8 w-14 place-items-center">
                  {active && <m.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-tint" />}
                  <Icon className={cn("relative size-[22px]", active ? "text-brand" : "text-muted")} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span className={cn("text-[11px] font-semibold", active ? "text-brand-ink" : "text-muted")}>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
