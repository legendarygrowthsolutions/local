import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCityCookie } from "@/lib/session";
import { getCity } from "@/services/catalog";
import { CityGate } from "@/components/city/city-gate";

export const metadata: Metadata = {
  title: { absolute: "local. — Everything to do in your city" },
  description: "Events, workshops, meetups, exhibitions and sports courts in Mumbai, Pune and Nagpur.",
};

export default async function Root() {
  const saved = await getCityCookie();
  if (saved && (await getCity(saved))) redirect(`/${saved}`);
  return <CityGate />;
}
