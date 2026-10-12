"use client";

import Link from "next/link";
import { useState, ViewTransition } from "react";
import type { ListingCard as Card } from "@/contracts";
import { Cover } from "@/components/ui/cover";
import { cn } from "@/lib/utils";
import { coverTransitionName } from "@/lib/transitions";
import { SaveButton } from "./save-button";

export function UrgencyTag({ label, className }: { label: string; className?: string }) {
  const soldOut = label === "Sold out";
  return <span className={cn("inline-flex h-6 items-center rounded-lg px-2 text-[11px] font-bold", soldOut ? "bg-ink/80 text-white" : "bg-urgent-tint text-urgent", className)}>{label}</span>;
}

/** White date chip on posters: "SAT / 18" (wireframes 05, 18). */
export function DateBadge({ badge, className }: { badge: NonNullable<Card["badge"]>; className?: string }) {
  return (
    <span className={cn("absolute left-2.5 top-2.5 rounded-[10px] bg-white px-2 py-1 text-center text-[11px] font-extrabold leading-[1.15] text-ink md:left-3 md:top-3 md:text-xs", className)}>
      {badge.top}
      <br />
      {badge.bottom}
    </span>
  );
}

/**
 * The same listing can appear in several rails, and view-transition names must be unique,
 * so a card only claims the shared name once it's pressed.
 */
function useMorph(id: string) {
  const [armed, setArmed] = useState(false);
  const arm = () => setArmed(true);
  // Always render the boundary (changing the tree mid-tap would swallow the click);
  // only the name changes when pressed.
  const wrap = (node: React.ReactNode) => (
    <ViewTransition name={armed ? coverTransitionName(id) : undefined} share={armed ? "morph" : "none"} default="none">
      {node}
    </ViewTransition>
  );
  return { arm, wrap };
}

function Price({ card, className }: { card: Card; className?: string }) {
  if (card.priceFrom === null) return <span className={cn("font-bold text-free", className)}>{card.ctaLabel.toLowerCase().includes("rsvp") ? "Free · RSVP" : "Free"}</span>;
  return <b className={cn("text-ink", className)}>{card.priceLabel.replace(" onwards", "")}</b>;
}

/**
 * layout:
 * - "poster": portrait card with a date chip, for home rails (wireframes 05 + 18)
 * - "feature": wide cover with details beneath, for category/search lists (wireframe 07)
 * - "row": white row card with a small thumbnail, for "Play near you" (wireframe 05)
 */
export function ListingCard({ card, layout = "poster", priority }: { card: Card; layout?: "poster" | "feature" | "row"; priority?: boolean }) {
  const { arm, wrap } = useMorph(card.id);
  const label = (card.subcategoryLabel ?? card.categoryLabel).toUpperCase();
  const common = { href: card.href, onPointerDown: arm, onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && arm() };

  if (layout === "row")
    return (
      <Link {...common} className="group flex items-center gap-3 rounded-[18px] border border-line bg-surface p-2.5 transition-colors hover:border-line-strong">
        {wrap(<Cover media={card.media} tone={card.tone} icon={card.icon} alt="" sizes="72px" className="size-[72px] flex-none rounded-[14px]" />)}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate text-[15px] font-bold group-hover:text-brand-ink">
            {card.title}
            {card.kind === "venue" && card.areaName && !card.title.includes(card.areaName) ? ` · ${card.areaName}` : ""}
          </h3>
          <p className="truncate text-xs text-muted">{card.kind === "venue" ? card.subcategoryLabel : `${card.whenLabel} · ${card.areaName}`}</p>
          <p className="text-[13px] font-extrabold">
            {card.priceFrom === null ? <Price card={card} /> : card.kind === "venue" ? (
              <>
                {card.priceLabel.replace("/hr onwards", "")}
                <span className="font-medium text-muted"> /hr onwards</span>
              </>
            ) : (
              card.priceLabel
            )}
          </p>
        </div>
      </Link>
    );

  if (layout === "feature")
    return (
      <Link {...common} className="group flex flex-col gap-2.5">
        <div className="relative">
          {wrap(
            <Cover
              media={card.media}
              tone={card.tone}
              icon={card.icon}
              alt=""
              priority={priority}
              sizes="(max-width: 640px) 100vw, 400px"
              className="h-[190px] rounded-[22px] transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-[1.01] sm:h-auto sm:aspect-[16/10]"
            />,
          )}
          {card.urgency && <UrgencyTag label={card.urgency} className="absolute left-3 top-3" />}
          <SaveButton id={card.id} title={card.title} size="md" className="absolute right-2 top-2 border-0 bg-white" />
        </div>
        <div className="flex justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold uppercase text-brand">{card.kind === "venue" ? label : card.whenLabel}</span>
            <h3 className="line-clamp-2 text-[17px] font-bold leading-[1.25] group-hover:text-brand-ink">{card.title}</h3>
            <p className="truncate text-[13px] text-muted">{card.kind === "venue" ? `${card.areaName} · ${card.whenLabel}` : [card.venueName, card.areaName].filter(Boolean).join(", ")}</p>
          </div>
          <div className="flex-none text-right">
            {card.priceFrom === null ? (
              <Price card={card} className="text-sm" />
            ) : (
              <>
                <span className="text-[11px] text-muted">{card.priceLabel.includes("onwards") ? "from" : card.kind === "venue" ? "per hour" : " "}</span>
                <br />
                <span className="text-base font-extrabold">{card.priceLabel.replace(" onwards", "").replace("/hr", "")}</span>
              </>
            )}
          </div>
        </div>
      </Link>
    );

  return (
    <Link {...common} className="group flex w-[160px] shrink-0 snap-start flex-col gap-1.5 md:w-[calc((100%-60px)/4)]">
      <div className="relative">
        {wrap(
          <Cover
            media={card.media}
            tone={card.tone}
            icon={card.icon}
            alt=""
            priority={priority}
            sizes="(max-width: 768px) 160px, 300px"
            className="aspect-[4/5] rounded-[18px] transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-[1.015] md:rounded-[20px]"
          />,
        )}
        {card.badge && <DateBadge badge={card.badge} />}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
          <SaveButton id={card.id} title={card.title} />
        </div>
        {card.urgency && <UrgencyTag label={card.urgency} className="absolute bottom-2.5 left-2.5" />}
      </div>
      <span className="mt-1 truncate text-[11px] font-bold tracking-[0.03em] text-brand md:text-xs">{label}</span>
      <h3 className="line-clamp-2 text-sm font-bold leading-[1.25] group-hover:text-brand-ink md:text-base">{card.title}</h3>
      <p className="truncate text-xs text-muted md:text-[13px]">
        {card.priceFrom === null ? (
          <Price card={card} />
        ) : (
          <>
            {card.areaName} · <Price card={card} />
          </>
        )}
      </p>
    </Link>
  );
}

export function ListingCardSkeleton({ layout = "poster" }: { layout?: "poster" | "feature" | "row" }) {
  if (layout === "row")
    return (
      <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-2.5">
        <div className="skeleton size-[72px] rounded-[14px]" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="skeleton h-4 w-4/5 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
      </div>
    );
  if (layout === "feature")
    return (
      <div className="flex flex-col gap-2.5">
        <div className="skeleton h-[190px] rounded-[22px] sm:h-auto sm:aspect-[16/10]" />
        <div className="skeleton h-3 w-28 rounded" />
        <div className="skeleton h-4 w-4/5 rounded" />
        <div className="skeleton h-3 w-3/5 rounded" />
      </div>
    );
  return (
    <div className="flex w-[160px] shrink-0 flex-col gap-1.5 md:w-[calc((100%-60px)/4)]">
      <div className="skeleton aspect-[4/5] rounded-[18px]" />
      <div className="skeleton mt-1 h-3 w-16 rounded" />
      <div className="skeleton h-4 w-4/5 rounded" />
      <div className="skeleton h-3 w-3/5 rounded" />
    </div>
  );
}
