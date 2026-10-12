import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { getCity } from "@/services/catalog";
import { getHome } from "@/services/discover";
import { getSessionUser } from "@/lib/session";
import { FeaturedCarousel } from "@/components/listing/featured-carousel";
import { FeaturedBento } from "@/components/listing/featured-bento";
import { Rail } from "@/components/listing/rail";
import { SpotlightRail } from "@/components/listing/spotlight-rail";
import { CategoryIcon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { CitySwitcher } from "@/components/city/city-switcher";
import { HostPromo } from "@/components/listing/host-promo";
import { JsonLd, organization, abs } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city: slug } = await params;
  const city = await getCity(slug);
  if (!city) return {};
  return {
    title: `Things to do in ${city.name} — events, workshops & sports`,
    description: `Discover the best events, workshops, meetups, exhibitions and sports courts in ${city.name}. Book tickets and slots in seconds on local.`,
    alternates: { canonical: abs(`/${city.slug}`) },
    openGraph: { title: `Things to do in ${city.name}`, url: abs(`/${city.slug}`) },
  };
}

export default async function CityHome({ params }: { params: Promise<{ city: string }> }) {
  const { city: slug } = await params;
  const city = await getCity(slug);
  if (!city) notFound();
  const user = await getSessionUser();
  const home = await getHome(city.slug, user);
  const [main, ...rest] = home.featured;
  // The bento needs two side cards; top up from the first rail when fewer are featured.
  const side = [...rest, ...(home.quickFilters[0]?.items ?? []).filter((c) => c.id !== main?.id && !rest.some((r) => r.id === c.id))].slice(0, 2);

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-5 pb-8 md:gap-10 md:px-8 md:pt-8">
      <JsonLd data={organization()} />
      <h1 className="sr-only">Things to do in {city.name}</h1>

      {/* Phone top (wireframe 05) */}
      <div className="flex flex-col gap-5 px-5 pt-4 md:hidden">
        <div className="flex h-11 items-center justify-between">
          <CitySwitcher city={city.slug} cityName={city.name} variant="stacked" />
          {user ? (
            <Link href="/me" aria-label="Your profile">
              <Avatar name={user.name} src={user.avatar} className="size-[42px] text-sm" />
            </Link>
          ) : (
            <Link href={`/login?next=/${city.slug}`} className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white">
              Log in
            </Link>
          )}
        </div>
        <Link href={`/${city.slug}/search`} className="flex h-[50px] items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 text-[15px] text-muted">
          <Search className="size-5" aria-hidden /> Search events, courts, workshops…
        </Link>
      </div>

      {home.featured.length === 0 && home.rails.length === 0 && home.quickFilters.length === 0 && (
        <section className="mx-5 flex flex-col items-start gap-3 rounded-[28px] bg-feature p-6 text-white md:mx-0 md:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-soft">New on local.</p>
          <h2 className="font-display text-3xl font-bold md:text-4xl">We&apos;re just getting started in {city.name}</h2>
          <p className="max-w-lg text-feature-muted">Events, workshops and courts are being added. Run something people love? Be one of the first hosts here.</p>
          <Link href="/host/apply" className="mt-2 inline-flex h-12 items-center rounded-xl bg-white px-5 font-semibold text-ink">
            Host on local.
          </Link>
        </section>
      )}

      {/* Categories: icon row on phones (above the hero), tiles on desktop (below it) */}
      <nav aria-label="Categories" className="no-scrollbar -mt-1 flex gap-1.5 overflow-x-auto px-5 md:hidden">
        {home.categories.map((c) => (
          <Link key={c.id} href={`/${city.slug}/${c.slug}`} className="flex min-w-[60px] flex-none flex-col items-center gap-1.5 text-xs font-semibold">
            <span className="grid size-14 place-items-center rounded-[18px] border border-line bg-surface text-brand">
              <CategoryIcon name={c.icon} className="size-6" strokeWidth={1.8} />
            </span>
            <span>{c.name}</span>
          </Link>
        ))}
      </nav>

      <FeaturedCarousel items={home.featured} className="md:hidden" />
      {main && (
        <div className="max-md:hidden">
          <FeaturedBento main={main} side={side} />
        </div>
      )}

      <nav aria-label="Browse categories" className="grid grid-cols-6 gap-3 max-md:hidden">
        {home.categories.map((c) => (
          <Link key={c.id} href={`/${city.slug}/${c.slug}`} className="group flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3.5 text-sm font-semibold transition-colors hover:border-brand/40">
            <span className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-tint text-brand">
              <CategoryIcon name={c.icon} className="size-[18px]" strokeWidth={2} />
            </span>
            <span className="truncate">{c.name}</span>
          </Link>
        ))}
      </nav>

      {home.quickFilters.length > 0 && <SpotlightRail filters={home.quickFilters} cityName={city.name} />}

      {home.rails.map((r, i) => (
        <div key={r.id} className="contents">
          <Rail rail={r} />
          {i === 1 && <HostPromo />}
        </div>
      ))}
    </main>
  );
}
