import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getAreas, getCity } from "@/services/catalog";
import { Explorer } from "@/components/listing/explorer";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { city: slug } = await params;
  const city = await getCity(slug);
  if (!city) notFound();
  const sp = await searchParams;
  const filters = { q: one(sp.q), when: one(sp.when), price: one(sp.price), min: one(sp.min), max: one(sp.max), area: one(sp.area), sort: one(sp.sort), kind: one(sp.kind) };
  const areas = await getAreas(city.id);
  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-4 pb-8 pt-4 md:px-8 md:pt-8">
      <Suspense>
        <Explorer city={city.slug} cityName={city.name} subcategories={[]} areas={areas} initialFilters={filters} searchMode />
      </Suspense>
    </main>
  );
}
