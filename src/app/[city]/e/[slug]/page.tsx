import type { Metadata } from "next";
import { cache } from "react";
import { trackView } from "@/services/views";
import Link from "next/link";
import { CalendarDays, MapPin, Repeat } from "lucide-react";
import { getListingDetail } from "@/services/discover";
import { or404 } from "@/lib/or404";
import { SaveButton } from "@/components/listing/save-button";
import { ShareButton } from "@/components/listing/share-button";
import { About, directionsUrl, Fact, HostCard, MapCard, Pills, Section, ThingsToKnow } from "@/components/listing/detail-parts";
import { DetailHero } from "@/components/listing/detail-hero";
import { StickyCta } from "@/components/listing/sticky-cta";
import { Rail } from "@/components/listing/rail";
import { UrgencyTag } from "@/components/listing/listing-card";
import { abs, breadcrumbs, eventJsonLd, JsonLd } from "@/lib/seo";
import { formatDate, formatRange, fromISO } from "@/lib/time";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Params = Promise<{ city: string; slug: string }>;

// Shared by generateMetadata and the page, so the data loads once per request.
const loadDetail = cache((city: string, slug: string) => or404(getListingDetail(city, slug)));
async function load(params: Params) {
  const { city, slug } = await params;
  return loadDetail(city, slug);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const d = await load(params);
  const title = `${d.listing.title} — ${d.listing.venueName}, ${d.area.name}`;
  return {
    title,
    description: `${d.listing.summary} ${d.card.whenLabel}. ${d.card.priceLabel}. Book on local.`,
    alternates: { canonical: abs(d.card.href) },
    openGraph: { title: d.listing.title, description: d.listing.summary, url: abs(d.card.href), type: "website" },
  };
}

export default async function EventPage({ params }: { params: Params }) {
  const d = await load(params);
  await trackView(d.listing.id);
  const { listing, template, sessions, card } = d;
  const first = sessions[0];
  const f = fromISO(first.startsAt);
  const durMins = Math.round((new Date(first.endsAt).getTime() - new Date(first.startsAt).getTime()) / 60000);
  const bookable = template.bookingMode !== "none";
  const soldOut = card.urgency === "Sold out";
  const ctaHref = bookable ? `/book/e/${listing.id}` : `https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`;
  const multi = sessions.length > 1;
  const dateFact =
    template.schedule === "recurring"
      ? { icon: <Repeat />, title: card.whenLabel, sub: `${sessions.length} upcoming batches · next ${formatDate(f.ymd)}` }
      : template.schedule === "date_range"
        ? { icon: <CalendarDays />, title: card.whenLabel, sub: "Closed Mondays · pick an entry window" }
        : template.schedule === "multi_day"
          ? { icon: <CalendarDays />, title: card.whenLabel, sub: `${sessions.length} days · day tickets or a season pass` }
          : { icon: <CalendarDays />, title: formatDate(f.ymd), sub: formatRange(first.startsAt, first.endsAt) };
  const priceSub = template.bookingMode === "rsvp" ? "RSVP to save a spot" : template.bookingMode === "none" ? "No booking needed" : card.urgency ?? "Inclusive of taxes, fees extra";

  const durLabel = durMins > 0 && durMins < 1440 ? (durMins >= 60 ? `${Math.floor(durMins / 60)} h${durMins % 60 ? ` ${durMins % 60} min` : ""}` : `${durMins} min`) : null;
  const pills = [d.category.singular, d.subcategory?.name, listing.ageLimit !== "All ages" ? listing.ageLimit : null, listing.languages.join(" · ")].filter((x): x is string => !!x);
  const priceShort = card.priceFrom === null ? "Free" : formatINR(card.priceFrom);
  const priceTitle = template.bookingMode === "registration" ? "Entry from" : card.priceFrom === null ? "Entry" : "Starts from";

  return (
    <main className="pb-28 md:pb-10">
      <JsonLd data={[eventJsonLd(d), breadcrumbs([{ name: d.city.name, path: `/${d.city.slug}` }, { name: d.category.name, path: `/${d.city.slug}/${d.category.slug}` }, { name: listing.title, path: card.href }])]} />

      <div className="mx-auto grid max-w-[1280px] md:grid-cols-[minmax(0,1fr)_380px] md:gap-10 md:px-8 md:pt-8">
        <div className="flex min-w-0 flex-col">
          <DetailHero id={listing.id} title={listing.title} media={listing.media} tone={card.tone} icon={card.icon} fallback={`/${d.city.slug}`} />

          {/* Content sheet: overlaps the hero on phones */}
          <div className="relative -mt-7 flex flex-col gap-[18px] rounded-t-[28px] bg-ground px-5 pt-[22px] md:mt-6 md:gap-7 md:rounded-none md:px-0 md:pt-0">
            <header className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Pills items={pills} />
                {card.urgency && <UrgencyTag label={card.urgency} className="h-[30px] rounded-[10px]" />}
              </div>
              <h1 className="font-display text-[27px] font-extrabold leading-[1.08] md:text-[44px]">{listing.title}</h1>
              <p className="text-[15px] text-muted max-md:hidden">{listing.summary}</p>
            </header>

            <ul className="flex flex-col gap-3">
              <Fact {...dateFact} sub={[durLabel && template.schedule !== "date_range" ? durLabel : null, dateFact.sub].filter(Boolean).join(" · ")} />
              <Fact
                icon={<MapPin />}
                title={listing.venueName}
                sub={`${d.area.name}, ${d.city.name}`}
                action={
                  <Link href={directionsUrl(listing.lat, listing.lng)} target="_blank" rel="noopener noreferrer" className="flex-none text-[13px] font-bold text-brand hover:underline">
                    Directions
                  </Link>
                }
              />
            </ul>

            <HostCard host={d.host} />

            <Section title="About">
              <About text={listing.description} />
            </Section>

            {multi && template.schedule !== "multi_day" && (
              <Section title={template.schedule === "recurring" ? "Upcoming batches" : "Upcoming dates"}>
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
                  {[...new Map(sessions.map((s) => [fromISO(s.startsAt).ymd, s])).values()].slice(0, 10).map((s) => (
                    <span key={s.id} className={cn("shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm", s.remaining === 0 && "text-subtle line-through")}>
                      {formatDate(fromISO(s.startsAt).ymd)}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {d.ticketTypes.length > 0 && template.bookingMode !== "rsvp" && (
              <Section title={template.bookingMode === "registration" ? "Divisions" : "Tickets"}>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {d.ticketTypes.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold">{t.name}</p>
                        {t.description && <p className="text-[13px] text-muted">{t.description}</p>}
                      </div>
                      <span className={cn("shrink-0 font-extrabold", t.remaining === 0 && "text-subtle line-through")}>{formatINR(t.price, { free: "Free" })}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Things to know">
              <ThingsToKnow items={listing.thingsToKnow} />
            </Section>

            <Section title="Location">
              <MapCard lat={listing.lat} lng={listing.lng} label={listing.venueName} address={listing.address} />
            </Section>
          </div>
        </div>

        <aside className="hidden md:block">
          <div className="sticky top-24 flex flex-col gap-4 rounded-[24px] border border-line bg-surface p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">{priceTitle}</p>
                <p className="font-display text-3xl font-extrabold">{priceShort}</p>
              </div>
              <div className="flex gap-2">
                <ShareButton title={listing.title} />
                <SaveButton id={listing.id} title={listing.title} size="md" />
              </div>
            </div>
            <p className="text-sm text-muted">{card.whenLabel}</p>
            <Link
              href={ctaHref}
              target={bookable ? undefined : "_blank"}
              className={cn("inline-flex h-[54px] items-center justify-center rounded-2xl bg-brand text-base font-bold text-white hover:bg-brand-hover", soldOut && "pointer-events-none bg-line-strong text-muted")}
            >
              {soldOut ? "Sold out" : card.ctaLabel}
            </Link>
            <p className="text-center text-xs text-muted">{priceSub}</p>
          </div>
        </aside>
      </div>

      {d.similar.length > 1 && (
        <div className="mx-auto mt-12 max-w-[1280px] md:px-8">
          <Rail rail={{ id: "similar", title: `More ${d.category.name.toLowerCase()} in ${d.city.name}`, href: `/${d.city.slug}/${d.category.slug}`, layout: "carousel", items: d.similar }} />
        </div>
      )}

      <StickyCta title={priceTitle} price={priceShort} href={ctaHref} label={soldOut ? "Sold out" : card.ctaLabel} disabled={soldOut} external={!bookable} />
    </main>
  );
}
