import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/session";
import { getCategoryTree } from "@/services/catalog";
import { ProfileSetup } from "@/components/auth/profile-setup";

export const metadata: Metadata = { title: "Set up your profile", robots: { index: false } };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const tree = await getCategoryTree();
  const interests = tree.flatMap((c) => c.children.map((s) => ({ slug: s.slug, name: s.name, icon: s.icon }))).slice(0, 8);
  return (
    <Suspense>
      <ProfileSetup interests={interests} />
    </Suspense>
  );
}
