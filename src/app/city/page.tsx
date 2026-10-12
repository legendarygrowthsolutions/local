import type { Metadata } from "next";
import { getCityCookie } from "@/lib/session";
import { CityGate } from "@/components/city/city-gate";

export const metadata: Metadata = { title: "Choose your city", robots: { index: false } };

export default async function CityPage({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const { onboarding } = await searchParams;
  return <CityGate current={(await getCityCookie()) ?? undefined} onboarding={onboarding === "1"} />;
}
