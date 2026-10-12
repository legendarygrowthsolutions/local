import type { Metadata } from "next";
import { abs } from "@/lib/seo";
import { CategoryView, categoryTitle, loadCategory, type CategoryParams, type CategorySearch } from "./category-view";

export async function generateMetadata({ params }: { params: CategoryParams }): Promise<Metadata> {
  const { city, category } = await loadCategory(params);
  const title = categoryTitle(category.name, undefined, city.name, category.slug === "sports");
  return {
    title,
    description: `${title}: dates, prices and booking on local. ${category.blurb ?? ""}`.trim(),
    alternates: { canonical: abs(`/${city.slug}/${category.slug}`) },
  };
}

export default function Page({ params, searchParams }: { params: CategoryParams; searchParams: CategorySearch }) {
  return <CategoryView params={params} searchParams={searchParams} />;
}
