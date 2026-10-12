import { notFound } from "next/navigation";
import { getCategories, getCities, getCity } from "@/services/catalog";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { BottomTabs } from "@/components/layout/bottom-tabs";
import { RememberCity } from "@/components/city/remember-city";

export default async function CityLayout({ children, params }: { children: React.ReactNode; params: Promise<{ city: string }> }) {
  const { city: slug } = await params;
  const city = await getCity(slug);
  if (!city) notFound();
  const [cities, categories] = await Promise.all([getCities(), getCategories()]);
  return (
    <>
      <RememberCity slug={city.slug} />
      <SiteHeader city={city.slug} cityName={city.name} />
      <div className="min-h-dvh pb-24 md:pb-0">{children}</div>
      <SiteFooter cities={cities} categories={categories} current={city.slug} />
      <BottomTabs city={city.slug} />
    </>
  );
}
