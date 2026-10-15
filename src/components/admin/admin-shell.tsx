"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { m } from "motion/react";
import { BookOpenCheck, ExternalLink, Menu } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Wireframes 21–22 order and labels.
const NAV: { href: string; label: string; badge?: "hosts" | "listings"; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/hosts", label: "Host applications", badge: "hosts" },
  { href: "/admin/listings", label: "Listing moderation", badge: "listings" },
  { href: "/admin/templates", label: "Journey templates" },
  { href: "/admin/categories", label: "Categories & tags" },
  { href: "/admin/cities", label: "Cities & areas" },
  { href: "/admin/bookings", label: "Bookings & refunds" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/payouts", label: "Payouts & fees" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/homepage", label: "Homepage & banners" },
];

function AdminNav({ badges, pathname, onNav }: { badges: { hosts: number; listings: number }; pathname: string; onNav?: () => void }) {
  const active = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));
  return (
    <nav aria-label="Superadmin" className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const on = active(n);
        const count = n.badge ? badges[n.badge] : 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNav}
            aria-current={on ? "page" : undefined}
            className={cn("relative flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-sm font-medium transition-colors", on ? "text-white" : "text-[#c8c8ce] hover:bg-white/6 hover:text-white")}
          >
            {on && <m.span layoutId="admin-nav" className="absolute inset-0 rounded-[10px] bg-brand" />}
            <span className="relative flex-1">{n.label}</span>
            {count > 0 && (
              <span className={cn("relative rounded-full px-2 py-0.5 text-[11px] font-bold text-white", n.badge === "hosts" ? "bg-[#d9381e]" : "bg-[#3a3a42]")}>
                {count}
                <span className="sr-only"> waiting</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ badges, userName, children }: { badges: { hosts: number; listings: number }; userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-[#fafaf7] md:grid md:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-0.5 overflow-y-auto bg-[#15151a] px-3.5 py-5 text-white md:flex">
        <Link href="/admin" className="px-3 pb-1 font-display text-[22px] font-bold">
          local<span className="text-spark">.</span>
        </Link>
        <p className="px-3 pb-3.5 text-[11px] font-bold tracking-[0.08em] text-[#a0a0a8]">SUPERADMIN</p>
        <AdminNav badges={badges} pathname={pathname} />
        <div className="mt-auto flex flex-col gap-2 pt-6">
          <Link href="/" className="flex items-center gap-2 px-3 text-sm text-[#a0a0a8] hover:text-white">
            <ExternalLink className="size-4" /> Open local.
          </Link>
          <p className="flex items-center gap-1.5 px-3 text-xs text-[#a0a0a8]">
            <BookOpenCheck className="size-3.5" /> {userName}
          </p>
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-ground/90 px-4 backdrop-blur-md md:hidden">
        <button type="button" onClick={() => setOpen(true)} className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-field" aria-label="Menu">
          <Menu className="size-5" />
        </button>
        <span className="font-display text-xl font-extrabold">
          local<span className="text-brand">.</span>
        </span>
        <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">ADMIN</span>
        {badges.hosts + badges.listings > 0 && <span className="ml-auto rounded-full bg-[#D9381E] px-2 py-0.5 text-xs font-bold text-white">{badges.hosts + badges.listings}</span>}
      </header>
      <main className="min-w-0 pb-16">{children}</main>
      <Sheet open={open} onOpenChange={setOpen} title="Superadmin" className="bg-[#15151a] text-white">
        <div className="pb-6">
          <AdminNav badges={badges} pathname={pathname} onNav={() => setOpen(false)} />
        </div>
      </Sheet>
    </div>
  );
}
