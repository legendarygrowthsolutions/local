import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAreas, getCategories, getCity, resolveCategory } from "@/services/catalog";
import { searchListings, type PriceFilter, type SortKey } from "@/services/discover";
import { Explorer, type ExplorerFilters } from "@/components/listing/explorer";
import { breadcrumbs, JsonLd } from "@/lib/seo";

export type CategoryParams = Promise<{ city: string; category: string; sub?: string }>;
export type CategorySearch = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function loadCategory(params: CategoryParams) {
  const { city: citySlug, category: catSlug, sub: subSlug } = await params;
  const [city, resolved] = await Promise.all([getCity(citySlug), resolveCategory(catSlug, subSlug)]);
  if (!city || !resolved) notFound();
  return { city, ...resolved };
}

export function categoryTitle(name: string, sub: string | undefined, city: string, isSports: boolean) {
  if (isSports) return sub ? `${sub} courts in ${city}` : `Sports courts & turfs in ${city}`;
  return `${sub ?? name} in ${city}`;
}

export async function CategoryView({ params, searchParams }: { params: CategoryParams; searchParams: CategorySearch }) {
  const { city, category, sub } = await loadCategory(params);
  const sp = await searchParams;
  const filters: ExplorerFilters = {
    when: one(sp.when),
    price: one(sp.price),
    min: one(sp.min),
    max: one(sp.max),
    area: one(sp.area),
    sort: one(sp.sort),
  };
  const [initial, areas, cats] = await Promise.all([
    searchListings({
      city: city.slug,
      category: category.slug,
      sub: sub?.slug,
      ...filters,
      price: filters.price as PriceFilter,
      sort: filters.sort as SortKey,
      min: filters.min ? Number(filters.min) : undefined,
      max: filters.max ? Number(filters.max) : undefined,
      kind: undefined,
    }),
    getAreas(city.id),
    getCategories(),
  ]);
  const isSports = category.slug === "sports";
  const title = categoryTitle(category.name, sub?.name, city.name, isSports);
  const crumbs = [
    { name: city.name, path: `/${city.slug}` },
    { name: category.name, path: `/${city.slug}/${category.slug}` },
    ...(sub ? [{ name: sub.name, path: `/${city.slug}/${category.slug}/${sub.slug}` }] : []),
  ];

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-4 pb-8 pt-4 md:px-8 md:pt-8">
      <JsonLd data={breadcrumbs(crumbs)} />
      <Suspense>
        <Explorer
          key={`${category.slug}/${sub?.slug ?? ""}`}
          city={city.slug}
          cityName={city.name}
          category={category}
          sub={sub}
          subcategories={cats.filter((c) => c.parentId === category.id)}
          areas={areas}
          initial={initial}
          initialFilters={filters}
          showDates={!isSports}
          title={title}
          blurb={isSports ? "Pick a court, pick a slot, play." : category.blurb}
          crumbs={crumbs}
        />
      </Suspense>
    </main>
  );
}
