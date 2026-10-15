"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { m } from "motion/react";
import {
  CalendarRange, ExternalLink, LayoutDashboard, ListChecks, Menu, ScanLine, Settings, Ticket, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useSwitchHost } from "@/lib/api/host-hooks";
import { cn } from "@/lib/utils";

export interface ShellProps {
  host: { id: string; brandName: string; type: string; kycStatus: string };
  role: "owner" | "manager";
  hasVenues: boolean;
  memberships: { id: string; brandName: string; role: string }[];
  userName: string;
  citySlug: string;
  children: React.ReactNode;
}

type NavItem = { href: string; label: string; icon: LucideIcon; owner?: boolean; venue?: boolean; exact?: boolean };
// Wireframe 19 order and labels ("Reviews" is out of scope for v1).
const NAV: NavItem[] = [
  { href: "/host", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/host/listings", label: "Listings", icon: ListChecks },
  { href: "/host/bookings", label: "Bookings", icon: Ticket },
  { href: "/host/slots", label: "Slots & calendar", icon: CalendarRange, venue: true },
  { href: "/host/checkin", label: "Check-in scanner", icon: ScanLine },
  { href: "/host/payouts", label: "Payouts", icon: Wallet, owner: true },
  { href: "/host/team", label: "Team (owner / manager)", icon: Users, owner: true },
  { href: "/host/settings", label: "Settings", icon: Settings, owner: true },
];

export function HostShell({ host, role, hasVenues, memberships, userName, citySlug, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const switchHost = useSwitchHost();
  const items = NAV.filter((n) => (!n.owner || role === "owner") && (!n.venue || hasVenues));
  const active = (n: NavItem) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));
  const primary = items.filter((n) => ["/host", "/host/listings", "/host/bookings", "/host/checkin"].includes(n.href));
  const rest = items.filter((n) => !primary.includes(n));
  // The listing editor runs full width with its own top bar (wireframe 20).
  if (/^\/host\/listings\/(new|[^/]+\/edit)/.test(pathname)) return <div className="min-h-dvh bg-[#fafaf7]">{children}</div>;

  const RoleCard = (
    <div className="flex flex-col gap-1.5 rounded-[14px] bg-tint p-3 text-[13px]">
      <b className="truncate">{host.brandName}</b>
      <span className={cn("font-semibold", host.kycStatus === "verified" ? "text-free" : "text-warn")}>{host.kycStatus === "verified" ? "Verified host" : "Verification pending"}</span>
      <span className="flex items-center gap-1.5">
        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-extrabold", role === "owner" ? "bg-brand text-white" : "bg-ink text-white")}>{role.toUpperCase()}</span>
        <span className="truncate text-xs text-brand-ink">{userName}</span>
      </span>
      <span className="text-[11px] leading-[1.35] text-brand-ink">Managers see bookings &amp; check-in only, not revenue or payouts.</span>
    </div>
  );

  const HostSwitcher =
    memberships.length > 1 ? (
      <select
        aria-label="Switch host"
        value={host.id}
        onChange={(e) => switchHost.mutate(e.target.value, { onSuccess: () => router.refresh() })}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none"
      >
        {memberships.map((m) => (
          <option key={m.id} value={m.id} className="text-ink">
            {m.brandName} ({m.role})
          </option>
        ))}
      </select>
    ) : null;

  return (
    <div className="min-h-dvh bg-[#fafaf7] md:grid md:grid-cols-[250px_1fr]">
      {/* Desktop sidebar (wireframe 19) */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 overflow-y-auto border-r border-[#e6e6e1] bg-surface px-3.5 py-5 md:flex">
        <Link href="/host" className="px-3 pb-1 font-display text-[22px] font-bold">
          local<span className="text-brand">.</span>
        </Link>
        <p className="px-3 pb-3.5 text-[11px] font-bold tracking-[0.08em] text-muted">HOST CONSOLE</p>
        {memberships.length > 1 && <div className="mx-1 mb-3">{HostSwitcher}</div>}
        <nav aria-label="Host" className="flex flex-col gap-1">
          {items.map((n) => {
            const on = active(n);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={cn("relative flex h-[42px] items-center rounded-[10px] px-3 text-sm font-medium transition-colors", on ? "text-white" : "text-ink-2 hover:bg-field")}
              >
                {on && <m.span layoutId="host-nav" className="absolute inset-0 rounded-[10px] bg-brand" />}
                <span className="relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3 pt-6">
          {RoleCard}
          <Link href={`/${citySlug}`} className="flex items-center gap-2 px-3 text-sm text-muted hover:text-ink">
            <ExternalLink className="size-4" /> Back to local.
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-ground/90 px-4 backdrop-blur-md md:hidden">
        <Link href="/host" className="font-display text-xl font-extrabold">
          local<span className="text-brand">.</span>
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-muted">{host.brandName}</span>
        <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide", role === "owner" ? "bg-tint text-brand-ink" : "bg-field text-muted")}>{role.toUpperCase()}</span>
      </header>

      <main className="min-w-0 pb-24 md:pb-10">{children}</main>

      {/* Mobile bottom nav */}
      <nav aria-label="Host" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
        <ul className="flex justify-around px-2 pt-1.5 pb-1.5">
          {[...primary, { href: "#more", label: "More", icon: Menu } as NavItem].map((n) => {
            const Icon = n.icon;
            const on = n.href === "#more" ? rest.some(active) : active(n);
            const inner = (
              <>
                <span className="relative grid h-8 w-14 place-items-center">
                  {on && <m.span layoutId="host-tab" className="absolute inset-0 rounded-full bg-tint" />}
                  <Icon className={cn("relative size-[22px]", on ? "text-brand" : "text-muted")} />
                </span>
                <span className={cn("text-[11px] font-semibold", on ? "text-brand-ink" : "text-muted")}>{n.label}</span>
              </>
            );
            return (
              <li key={n.href} className="flex-1">
                {n.href === "#more" ? (
                  <button type="button" onClick={() => setMore(true)} className="flex w-full flex-col items-center gap-0.5 py-1">
                    {inner}
                  </button>
                ) : (
                  <Link href={n.href} className="flex flex-col items-center gap-0.5 py-1">
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <Sheet open={more} onOpenChange={setMore} title={host.brandName} description={role === "owner" ? "Owner" : "Manager"}>
        <div className="flex flex-col gap-1 pb-4">
          {rest.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setMore(false)} className="flex h-12 items-center gap-3 rounded-xl px-3 font-semibold hover:bg-field">
              <n.icon className="size-5 text-brand" /> {n.label}
            </Link>
          ))}
          <Link href={`/${citySlug}`} onClick={() => setMore(false)} className="flex h-12 items-center gap-3 rounded-xl px-3 font-semibold text-muted hover:bg-field">
            <ExternalLink className="size-5" /> Back to local.
          </Link>
          {memberships.length > 1 && (
            <div className="mt-2 rounded-xl bg-feature p-3">
              <p className="mb-1 text-xs font-semibold text-feature-muted">Switch host</p>
              {HostSwitcher}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[28px] font-bold leading-tight md:text-[32px]">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
