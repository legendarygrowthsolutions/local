import "server-only";
import type { Area, Category, JourneyTemplate, Listing, ListingCard, Resource, SlotRule, Venue } from "@/contracts";
import { hash01 } from "@/mocks/occupancy";
import { formatINR } from "@/lib/pricing";
import { dateBadge, formatDate, formatDay, formatMins, formatWhen, fromISO, istParts } from "@/lib/time";
import type { ListingInventory } from "./inventory";

export interface CardContext {
  citySlug: string;
  categories: Category[];
  areas: Area[];
  templates: JourneyTemplate[];
}

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function toneFor(id: string) {
  return Math.floor(hash01(id) * 4);
}

export function listingCard(l: Listing, inv: ListingInventory, ctx: CardContext, now = new Date()): ListingCard | null {
  const next = inv.upcoming[0];
  if (!next) return null;
  const tpl = ctx.templates.find((t) => t.id === l.templateId)!;
  const cat = ctx.categories.find((c) => c.id === l.categoryId)!;
  const sub = l.subcategoryId ? ctx.categories.find((c) => c.id === l.subcategoryId) ?? null : null;
  const area = ctx.areas.find((a) => a.id === l.areaId);

  let whenLabel = formatWhen(next.startsAt, now);
  const firstYmd = fromISO(next.startsAt).ymd;
  const lastYmd = fromISO(inv.upcoming[inv.upcoming.length - 1].startsAt).ymd;
  const badge = tpl.schedule === "multi_day" || tpl.schedule === "date_range" ? dateBadge(firstYmd, lastYmd) : dateBadge(firstYmd);
  if (tpl.schedule === "recurring") {
    const p = fromISO(next.startsAt);
    whenLabel = `Every ${WEEKDAYS_LONG[p.weekday]} · ${formatMins(p.mins, { compact: true })}`;
  } else if (tpl.schedule === "date_range") {
    const last = fromISO(inv.upcoming[inv.upcoming.length - 1].startsAt).ymd;
    const first = fromISO(next.startsAt).ymd;
    whenLabel = first === istParts(now).ymd ? `Open today · till ${formatDate(last).split(", ")[1]}` : `${formatDay(first, now)} – ${formatDate(last).split(", ")[1]}`;
  } else if (tpl.schedule === "multi_day" && inv.upcoming.length > 1) {
    const a = fromISO(inv.upcoming[0].startsAt).ymd;
    const b = fromISO(inv.upcoming[inv.upcoming.length - 1].startsAt).ymd;
    whenLabel = `${formatDate(a)} – ${formatDate(b).split(", ")[1]}`;
  }

  const sellable = inv.tickets.filter((t) => t.remaining > 0);
  const priced = (sellable.length ? sellable : inv.tickets).map((t) => t.price);
  const minPrice = priced.length ? Math.min(...priced) : 0;
  const maxPrice = priced.length ? Math.max(...priced) : 0;
  const free = tpl.pricing === "free" || maxPrice === 0;
  const perTeam = tpl.bookingMode === "registration";
  const priceLabel = free
    ? "Free"
    : `${formatINR(minPrice)}${perTeam ? " / team" : ""}${minPrice !== maxPrice ? " onwards" : ""}`;

  let urgency: string | null = null;
  if (tpl.bookingMode !== "none") {
    const totalRemaining = inv.upcoming.reduce((s, x) => s + x.remaining, 0);
    const finite = inv.tickets.filter((t) => t.qty < 9999);
    const ratio = finite.length ? finite.reduce((s, t) => s + t.remaining, 0) / finite.reduce((s, t) => s + t.qty, 0) : 1;
    if (totalRemaining === 0) urgency = "Sold out";
    else if (ratio < 0.1) urgency = "Few left";
    else if (!finite.length && next.remaining > 0 && next.remaining <= 3) urgency = "Few left";
    else if (ratio < 0.2) urgency = "Selling fast";
  }

  return {
    kind: "event",
    id: l.id,
    slug: l.slug,
    href: `/${ctx.citySlug}/e/${l.slug}`,
    title: l.title,
    categorySlug: cat.slug,
    categoryLabel: cat.singular,
    subcategoryLabel: sub?.name ?? null,
    areaName: area?.name ?? "",
    venueName: l.venueName,
    whenLabel,
    startsAt: next.startsAt,
    priceFrom: free ? null : minPrice,
    priceLabel,
    media: l.media,
    tone: toneFor(l.id),
    icon: sub?.icon ?? cat.icon,
    urgency,
    ctaLabel: tpl.ctaLabel,
    badge,
  };
}

export function venueCard(
  v: Venue,
  resources: Resource[],
  rules: SlotRule[],
  ctx: CardContext,
  now = new Date(),
): ListingCard {
  const tpl = ctx.templates.find((t) => t.id === v.templateId)!;
  const area = ctx.areas.find((a) => a.id === v.areaId);
  const vr = resources.filter((r) => r.venueId === v.id);
  const vrules = rules.filter((r) => vr.some((x) => x.id === r.resourceId));
  const minPrice = vrules.length ? Math.min(...vrules.map((r) => r.priceBase)) : 0;
  const open = vrules[0]?.openMins ?? 360;
  const close = vrules[0]?.closeMins ?? 1380;
  const { mins } = istParts(now);
  const whenLabel =
    mins >= open && mins < close
      ? `Open now · till ${formatMins(close, { compact: true })}`
      : `Opens ${formatMins(open, { compact: true })}`;
  const sportNames = v.sports.map((s) => ctx.categories.find((c) => c.slug === s && c.parentId === "cat_sports")?.name ?? s);
  return {
    kind: "venue",
    id: v.id,
    slug: v.slug,
    href: `/${ctx.citySlug}/v/${v.slug}`,
    title: v.name,
    categorySlug: "sports",
    categoryLabel: "Sports",
    subcategoryLabel: sportNames.join(" · "),
    areaName: area?.name ?? "",
    venueName: v.name,
    whenLabel,
    startsAt: null,
    priceFrom: minPrice,
    priceLabel: `${formatINR(minPrice)}/hr onwards`,
    media: v.media,
    tone: toneFor(v.id),
    icon: "Activity",
    urgency: null,
    ctaLabel: tpl.ctaLabel,
    badge: null,
  };
}
