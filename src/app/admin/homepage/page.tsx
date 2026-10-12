import Link from "next/link";
import { homepageCuration } from "@/services/admin";
import { getCities } from "@/services/catalog";
import { AdminPage, Tabs } from "@/components/admin/page-bits";
import { HomepageCuration } from "@/components/admin/homepage-curation";

export const metadata = { title: "Homepage & banners" };

export default async function HomepagePage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city: slug } = await searchParams;
  const cities = await getCities();
  const city = cities.find((c) => c.slug === slug) ?? cities[0];
  const d = await homepageCuration(city.id);
  return (
    <AdminPage
      title="Homepage & banners"
      sub="Featured events lead each city's home page: the big banner first, then the side cards. Up to 8 per city."
      wide
      action={
        <Link href={`/${city.slug}`} target="_blank" className="text-sm font-semibold text-brand">
          View {city.name} home ↗
        </Link>
      }
    >
      <Tabs active={city.slug} tabs={cities.map((c) => ({ id: c.slug, label: c.name, href: `/admin/homepage?city=${c.slug}` }))} />
      <HomepageCuration featured={d.featured} candidates={d.candidates} />
    </AdminPage>
  );
}
