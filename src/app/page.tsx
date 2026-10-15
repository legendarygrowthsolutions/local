import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCityCookie } from "@/lib/session";
import { getCities, getCity } from "@/services/catalog";
import { CityGate } from "@/components/city/city-gate";

export const metadata: Metadata = {
  title: { absolute: "local. | Everything to do in your city" },
  description: "Events, shows, activities and sports courts in Nagpur.",
};

export default async function Root() {
  const saved = await getCityCookie();
  if (saved && (await getCity(saved))) redirect(`/${saved}`);
  // Nothing to pick while only one city is live.
  const cities = await getCities();
  if (cities.length === 1) redirect(`/${cities[0].slug}`);
  return <CityGate />;
}
