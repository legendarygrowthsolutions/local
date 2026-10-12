import type { Metadata } from "next";
import { abs } from "@/lib/seo";
import { CategoryView, categoryTitle, loadCategory, type CategoryParams, type CategorySearch } from "../category-view";

export async function generateMetadata({ params }: { params: CategoryParams }): Promise<Metadata> {
  const { city, category, sub } = await loadCategory(params);
  const title = categoryTitle(category.name, sub?.name, city.name, category.slug === "sports");
  return {
    title,
    description: `${title}: dates, prices and instant booking on local.`,
    alternates: { canonical: abs(`/${city.slug}/${category.slug}/${sub?.slug}`) },
  };
}

export default function Page({ params, searchParams }: { params: CategoryParams; searchParams: CategorySearch }) {
  return <CategoryView params={params} searchParams={searchParams} />;
}
