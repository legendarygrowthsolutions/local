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
        <Link href={`/h/${host.slug}`} className="flex items-center gap-1 truncate text-sm font-bold hover:text-brand-ink hover:underline">
          {host.brandName}
          {host.kycStatus === "verified" && <BadgeCheck className="size-4 shrink-0 text-brand" aria-label="Verified host" />}
        </Link>
      </div>
      <FollowButton hostId={host.id} hostName={host.brandName} />
    </div>
  );
}

/** Host-written description, clamped with "Read more" when long. */
export function About({ text }: { text: string }) {
  return <ReadMore paragraphs={text.split("\n\n")} />;
}

/**
 * Location card: an embedded Google Map when NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY is set (Maps Embed API,
 * free and unmetered), plus a Google Maps directions link either way.
 */
export function MapCard({ lat, lng, label, address }: { lat: number; lng: number; label: string; address: string }) {
  const href = directionsUrl(lat, lng);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {key && (
        <iframe
          title={`Map of ${label}`}
          src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${lat},${lng}&zoom=15`}
          className="block h-48 w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      )}
      <div className="flex items-center gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint text-brand" aria-hidden>
          <MapPin className="size-5" />
        </span>
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
