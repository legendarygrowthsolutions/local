"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Heart, Store, Ticket, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { LogoutButton } from "@/components/auth/logout-button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/me", label: "Profile", icon: UserRound, exact: true },
  { href: "/me/bookings", label: "Bookings", icon: Ticket },
  { href: "/me/saved", label: "Saved", icon: Heart },
  { href: "/me/notifications", label: "Notifications", icon: Bell },
];

/**
 * Account area. Phones keep single-column pages (bottom tabs handle navigation);
 * from 1024 px a sticky sidebar holds identity + sections and pages fill the content column.
 */
export function AccountShell({ user, host, children }: { user: { name: string; phone: string; avatar?: string | null }; host: { href: string; label: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-[1240px] lg:grid lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-10 lg:px-8 lg:pt-10">
      <aside className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-4 lg:self-start">
        <div className="flex items-center gap-3 rounded-[20px] border border-line bg-surface p-4">
          <Avatar name={user.name} src={user.avatar} className="size-12 text-base" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{user.name}</p>
            <p className="text-xs text-muted">
              +91 {user.phone.slice(0, 5)} {user.phone.slice(5)}
            </p>
          </div>
          <Link href="/me/edit" className="text-sm font-bold text-brand">
            Edit
          </Link>
        </div>
        <nav aria-label="Account" className="flex flex-col gap-0.5 rounded-[20px] border border-line bg-surface p-2">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors", active ? "bg-tint text-brand-ink" : "text-ink hover:bg-field")}
              >
                <n.icon className={cn("size-[18px]", active ? "text-brand" : "text-muted")} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Link href={host.href} className="flex items-center gap-3 rounded-[20px] bg-feature p-4 text-white">
          <Store className="size-[18px] text-spark" />
          <span className="flex-1 text-sm font-bold">{host.label}</span>
          <ChevronRight className="size-4 text-feature-muted" />
        </Link>
        <div className="overflow-hidden rounded-[20px] border border-line bg-surface">
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
