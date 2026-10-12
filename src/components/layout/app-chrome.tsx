import { getCityCookie } from "@/lib/session";
import { repo } from "@/repositories";
import { SiteHeader } from "./site-header";
import { BottomTabs } from "./bottom-tabs";

/** Header + tabs for pages outside /{city} (account area). City comes from cookie or profile. */
export async function AppChrome({ children, cityId }: { children: React.ReactNode; cityId?: string | null }) {
  const slug = await getCityCookie();
  const active = await repo.cities.list();
  const city = active.find((c) => c.slug === slug) ?? active.find((c) => c.id === cityId) ?? active[0];
  return (
    <>
      <SiteHeader city={city.slug} cityName={city.name} />
      <div className="min-h-dvh pb-28 md:pb-12">{children}</div>
      <BottomTabs city={city.slug} />
    </>
  );
}
