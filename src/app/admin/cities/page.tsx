import { requireAdminPage } from "@/lib/guards";
import { citiesWithStats } from "@/services/admin";
import { AdminPage } from "@/components/admin/page-bits";
import { CityManager } from "@/components/admin/city-manager";

export const metadata = { title: "Cities & areas" };

export default async function CitiesPage() {
  await requireAdminPage();
  return (
    <AdminPage title="Cities & areas" sub="Adding a city needs no code: it gets its own home page, category pages, sitemap entries and location detection as soon as it's active.">
      <CityManager cities={await citiesWithStats()} />
    </AdminPage>
  );
}
