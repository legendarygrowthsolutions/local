import Link from "next/link";
import { ArrowUpRight, BadgeCheck, MapPin } from "lucide-react";
import type { Host } from "@/contracts";
import { cn } from "@/lib/utils";
import { initials } from "@/components/ui/avatar";
import { FollowButton } from "./follow-button";
import { ReadMore } from "./read-more";

/** Key fact row (wireframe 08): tinted icon tile, bold line, muted sub-line, optional action on the right. */
export function Fact({ icon, title, sub, action }: { icon: React.ReactNode; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3.5">
      <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-tint text-brand [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-snug">{title}</span>
        {sub && <span className="block text-[13px] text-muted">{sub}</span>}
      </span>
      {action}
    </li>
  );
}

export function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <h2 className="font-display text-lg font-extrabold md:text-xl">{title}</h2>
      {children}
    </section>
  );
}

export function directionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function Pills({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((p) => (
        <li key={p} className="rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-2">
          {p}
        </li>
      ))}
    </ul>
  );
}

export function HostCard({ host }: { host: Host }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-tone-0 text-sm font-bold text-brand-ink" aria-hidden>
        {initials(host.brandName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">Hosted by</p>
        <p className="flex items-center gap-1 truncate text-sm font-bold">
          {host.brandName}
          {host.kycStatus === "verified" && <BadgeCheck className="size-4 shrink-0 text-brand" aria-label="Verified host" />}
        </p>
      </div>
      <FollowButton hostId={host.id} hostName={host.brandName} />
    </div>
  );
}

/** Host-written description, clamped with "Read more" when long. */
export function About({ text }: { text: string }) {
  return <ReadMore paragraphs={text.split("\n\n")} />;
}

/** Static map placeholder + Google Maps deep link (Maps JS lands with real keys in phase 2). */
export function MapCard({ lat, lng, label, address }: { lat: number; lng: number; label: string; address: string }) {
  const href = directionsUrl(lat, lng);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative h-40 bg-[#EEF0EA]" aria-hidden>
        <svg className="absolute inset-0 size-full" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice">
          <path d="M-10 120 C 80 90, 140 140, 230 100 S 360 60, 420 80" stroke="#fff" strokeWidth="14" fill="none" />
          <path d="M120 -10 L 160 180" stroke="#fff" strokeWidth="10" />
          <path d="M290 -10 C 270 60, 310 110, 280 180" stroke="#fff" strokeWidth="8" fill="none" />
          <rect x="20" y="20" width="70" height="44" rx="6" fill="#E2E6DC" />
          <rect x="190" y="18" width="80" height="50" rx="6" fill="#E2E6DC" />
          <rect x="320" y="110" width="70" height="40" rx="6" fill="#DCE6E2" />
        </svg>
        <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-full place-items-center rounded-full bg-brand text-white shadow-[0_6px_20px_rgba(91,46,255,.35)]">
          <MapPin className="size-5" />
        </span>
      </div>
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{label}</p>
          <p className="line-clamp-2 text-sm text-muted">{address}</p>
        </div>
        <Link href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-line-strong px-3 text-sm font-semibold hover:border-ink/30">
          Directions <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

export function ThingsToKnow({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-[15px] text-ink-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}
