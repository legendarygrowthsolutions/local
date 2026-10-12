import type { Metadata } from "next";
import { cache } from "react";
import { trackView } from "@/services/views";
import Link from "next/link";
import { getVenueDetail } from "@/services/discover";
import { or404 } from "@/lib/or404";
import { SaveButton } from "@/components/listing/save-button";
import { ShareButton } from "@/components/listing/share-button";
import { About, HostCard, MapCard, Section, ThingsToKnow } from "@/components/listing/detail-parts";
import { DetailHero } from "@/components/listing/detail-hero";
import { VenueSports } from "@/components/listing/venue-sports";
import { cn } from "@/lib/utils";
import { Rail } from "@/components/listing/rail";
import { abs, breadcrumbs, JsonLd, venueJsonLd } from "@/lib/seo";
import { formatINR } from "@/lib/pricing";

type Params = Promise<{ city: string; slug: string }>;

// Shared by generateMetadata and the page, so the data loads once per request.
const loadDetail = cache((city: string, slug: string) => or404(getVenueDetail(city, slug)));
async function load(params: Params) {
  const { city, slug } = await params;
  return loadDetail(city, slug);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const d = await load(params);
  const sports = d.sports.map((s) => s.name).join(" & ");
  return {
    title: `${d.venue.name} — ${sports} courts in ${d.area.name}, ${d.city.name}`,
    description: `Book ${sports.toLowerCase()} at ${d.venue.name}, ${d.area.name}. From ${formatINR(d.priceFrom)}/hr. ${d.venue.amenities.slice(0, 3).join(", ")}.`,
    alternates: { canonical: abs(d.card.href) },
  };
}

export default async function VenuePage({ params }: { params: Params }) {
  const d = await load(params);
  await trackView(d.venue.id);
  const { venue, card } = d;
  const open = card.whenLabel.startsWith("Open now");
  return (
    <main className="pb-28 md:pb-10">
      <JsonLd data={[venueJsonLd(d), breadcrumbs([{ name: d.city.name, path: `/${d.city.slug}` }, { name: "Sports", path: `/${d.city.slug}/sports` }, { name: venue.name, path: card.href }])]} />
      <div className="mx-auto grid max-w-[1280px] md:grid-cols-[minmax(0,1fr)_380px] md:gap-10 md:px-8 md:pt-8">
        <div className="flex min-w-0 flex-col">
          <DetailHero id={venue.id} title={venue.name} media={venue.media} tone={card.tone} icon="Activity" fallback={`/${d.city.slug}/sports`} variant={2} short />

          <div className="relative -mt-6 flex flex-col gap-[18px] rounded-t-[28px] bg-ground px-5 pt-[22px] md:mt-6 md:gap-7 md:rounded-none md:px-0 md:pt-0">
            <header className="flex flex-col gap-1.5">
              <h1 className="font-display text-[28px] font-extrabold leading-tight md:text-[44px]">{venue.name}</h1>
              <p className="text-[13px] text-muted">
                {d.area.name} · {d.resources.length} {d.resources.length === 1 ? "court" : "courts"}
              </p>
              <p className={cn("text-[13px] font-bold", open ? "text-free" : "text-muted")}>{open ? `Open now · ${venue.hoursLabel}` : `Closed now · ${card.whenLabel}`}</p>
            </header>

            <VenueSports detail={d} />

            <ul className="flex flex-wrap gap-2" aria-label="Amenities">
              {venue.amenities.map((a) => (
                <li key={a} className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-2">
                  {a}
                </li>
              ))}
            </ul>

            <HostCard host={d.host} />

            <Section title="About">
              <About text={venue.description} />
            </Section>

            <Section title="Things to know">
              <ThingsToKnow items={venue.thingsToKnow} />
            </Section>

            <Section title="Location">
              <MapCard lat={venue.lat} lng={venue.lng} label={venue.name} address={venue.address} />
            </Section>
          </div>
        </div>
        <aside className="hidden md:block">
          <div className="sticky top-24 flex flex-col gap-4 rounded-[24px] border border-line bg-surface p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Courts from</p>
                <p className="font-display text-3xl font-extrabold">
                  {formatINR(d.priceFrom)}
                  <span className="font-sans text-base font-medium text-muted">/hr</span>
                </p>
              </div>
              <div className="flex gap-2">
                <ShareButton title={venue.name} />
                <SaveButton id={venue.id} title={venue.name} size="md" />
              </div>
            </div>
            <p className="text-sm text-muted">Peak pricing on weekday evenings and weekends.</p>
            <Link href={`/book/v/${venue.id}`} className="inline-flex h-[54px] items-center justify-center rounded-2xl bg-brand text-base font-bold text-white hover:bg-brand-hover">
              Book a slot
            </Link>
          </div>
        </aside>
      </div>
      {d.similar.length > 1 && (
        <div className="mx-auto mt-12 max-w-[1280px] md:px-8">
          <Rail rail={{ id: "similar", title: `More places to play in ${d.city.name}`, href: `/${d.city.slug}/sports`, layout: "carousel", items: d.similar }} />
        </div>
      )}
    </main>
  );
}
