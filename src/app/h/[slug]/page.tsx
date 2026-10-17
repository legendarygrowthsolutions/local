import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { ArrowRight, AtSign, BadgeCheck, CalendarDays, Globe, MapPin } from "lucide-react";
import { getHostProfile } from "@/services/discover";
import { or404 } from "@/lib/or404";
import { abs, hostJsonLd, JsonLd } from "@/lib/seo";
import { SITE_NAME } from "@/lib/utils";
import { AppChrome } from "@/components/layout/app-chrome";
import { ListingCard } from "@/components/listing/listing-card";
import { FollowButton } from "@/components/listing/follow-button";
import { ShareButton } from "@/components/listing/share-button";
import { initials } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Params = Promise<{ slug: string }>;

const TYPE_LABEL = { organiser: "Organiser", venue: "Venue", instructor: "Instructor", community: "Community" } as const;

// Shared by generateMetadata and the page, so the data loads once per request.
const loadProfile = cache((slug: string) => or404(getHostProfile(slug)));
async function load(params: Params) {
  const { slug } = await params;
  return loadProfile(slug);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await load(params);
  const where = p.cities.map((c) => c.name).join(" & ");
  const what = [p.events.length ? `${p.events.length} upcoming ${p.events.length === 1 ? "event" : "events"}` : null, p.venues.length ? `${p.venues.length} ${p.venues.length === 1 ? "venue" : "venues"}` : null].filter(Boolean).join(", ");
  const url = abs(`/h/${p.host.slug}`);
  return {
    title: `${p.host.brandName}${where ? ` · ${where}` : ""}`,
    description: `${what ? `${what} by ${p.host.brandName}. ` : ""}${p.host.bio}`.slice(0, 300),
    alternates: { canonical: url },
    openGraph: { title: p.host.brandName, description: p.host.bio, url, type: "profile" },
  };
}

/**
 * A host's public page: the one link for a bio. Everything the host has on sale, bookable from one place.
 * Not tied to a city, because a host can run things in several.
 */
export default async function HostPage({ params }: { params: Params }) {
  const p = await load(params);
  const { host, events, venues } = p;
  const since = host.since.slice(0, 4);
  const sections = [
    { id: "upcoming", title: "Upcoming", count: events.length, icon: CalendarDays },
    { id: "venues", title: host.type === "venue" ? "Book a court" : "Courts & venues", count: venues.length, icon: MapPin },
  ].filter((s) => s.count > 0);
  const stats = [
    { n: events.length, label: events.length === 1 ? "upcoming" : "upcoming" },
    { n: venues.length, label: venues.length === 1 ? "venue" : "venues" },
    { n: p.followers, label: p.followers === 1 ? "follower" : "followers" },
  ].filter((s) => s.n > 0);
  const instagram = host.instagram?.replace(/^@/, "");

  return (
    <AppChrome cityId={host.cityId}>
      <main className="mx-auto flex max-w-[1080px] flex-col gap-8 pb-10 md:gap-10 md:px-8 md:pt-6">
        <JsonLd data={hostJsonLd(p)} />

        <header className="relative overflow-hidden bg-surface md:rounded-[32px] md:border md:border-line">
          {/* Cover band: calm tone, same family as the fallback artwork. */}
          <div className="relative h-[120px] bg-tone-0 md:h-[160px]" aria-hidden>
            <div className="absolute -left-10 -top-20 size-56 rounded-full bg-brand/15 blur-3xl" />
            <div className="absolute -right-6 -top-10 size-48 rounded-full bg-spark/25 blur-3xl" />
          </div>

          <div className="flex flex-col gap-5 px-5 pb-6 md:px-10 md:pb-9">
            <div className="-mt-12 flex items-end justify-between gap-3 md:-mt-14">
              <span className="grid size-24 shrink-0 place-items-center rounded-full border-4 border-surface bg-brand font-display text-3xl font-extrabold text-white md:size-28 md:text-4xl" aria-hidden>
                {initials(host.brandName)}
              </span>
              <div className="flex items-center gap-2 pb-1">
                <ShareButton title={`${host.brandName} on ${SITE_NAME}`} className="bg-surface" />
                <FollowButton hostId={host.id} hostName={host.brandName} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand">
                {TYPE_LABEL[host.type]}
                {p.cities.length > 0 && ` · ${p.cities.map((c) => c.name).join(" & ")}`}
              </p>
              <h1 className="flex items-center gap-2 font-display text-[30px] font-extrabold leading-[1.05] md:text-[44px]">
                {host.brandName}
                {host.kycStatus === "verified" && <BadgeCheck className="size-6 shrink-0 text-brand md:size-8" aria-label="Verified host" />}
              </h1>
              <p className="max-w-2xl text-[15px] leading-relaxed text-ink-2">{host.bio}</p>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {stats.map((s) => (
                <span key={s.label} className="text-muted">
                  <b className="font-display text-base font-extrabold text-ink">{s.n}</b> {s.label}
                </span>
              ))}
              <span className="text-muted">
                Hosting since <b className="font-display text-base font-extrabold text-ink">{since}</b>
              </span>
            </div>

            {(instagram || host.website) && (
              <ul className="flex flex-wrap gap-2">
                {instagram && (
                  <li>
                    <a href={`https://www.instagram.com/${instagram}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm font-semibold hover:border-line-strong">
                      <AtSign className="size-4 text-brand" aria-hidden /> {instagram} on Instagram
                    </a>
                  </li>
                )}
                {host.website && (
                  <li>
                    <a href={host.website} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm font-semibold hover:border-line-strong">
                      <Globe className="size-4 text-brand" aria-hidden /> {host.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  </li>
                )}
              </ul>
            )}
          </div>
        </header>

        {sections.length > 1 && (
          <nav aria-label="On this page" className="no-scrollbar -mt-2 flex gap-2 overflow-x-auto px-5 md:px-0">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold hover:border-line-strong">
                <s.icon className="size-4 text-brand" aria-hidden /> {s.title} <span className="text-muted">{s.count}</span>
              </a>
            ))}
          </nav>
        )}

        {events.length > 0 && (
          <Section id="upcoming" title="Upcoming" sub={`${events.length} ${events.length === 1 ? "event" : "events"} on sale`}>
            <Grid>
              {events.map((c, i) => (
                <ListingCard key={c.id} card={c} layout="feature" priority={i < 2} />
              ))}
            </Grid>
          </Section>
        )}

        {venues.length > 0 && (
          <Section id="venues" title={host.type === "venue" ? "Book a court" : "Courts & venues"} sub="Pick a slot and pay in seconds">
            <Grid rows>
              {venues.map((c) => (
                <ListingCard key={c.id} card={c} layout="row" />
              ))}
            </Grid>
          </Section>
        )}

        {sections.length === 0 && (
          <div className="mx-5 flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-line-strong bg-surface px-6 py-12 text-center md:mx-0">
            <CalendarDays className="size-8 text-muted" aria-hidden />
            <p className="font-display text-xl font-extrabold">Nothing on sale right now</p>
            <p className="max-w-sm text-sm text-muted">Follow {host.brandName} and we&apos;ll let you know the moment they put something up.</p>
            <FollowButton hostId={host.id} hostName={host.brandName} />
          </div>
        )}

        <p className="px-5 text-center text-[13px] text-muted md:px-0">
          {host.brandName} takes bookings through {SITE_NAME}{" "}
          <Link href="/host/apply" className="inline-flex items-center gap-1 font-bold text-brand hover:underline">
            Run something people love? Host with us <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </p>
      </main>
    </AppChrome>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-24 flex-col gap-4">
      <div className="px-5 md:px-0">
        <h2 id={`${id}-h`} className="font-display text-xl font-extrabold leading-tight md:text-[30px]">
          {title}
        </h2>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Grid({ rows, children }: { rows?: boolean; children: React.ReactNode }) {
  return <div className={cn("grid grid-cols-1 px-5 md:px-0", rows ? "gap-3 lg:grid-cols-2 lg:gap-x-5" : "gap-y-6 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3")}>{children}</div>;
}
