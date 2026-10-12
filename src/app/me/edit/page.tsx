import { requireUserPage } from "@/lib/guards";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getCategoryTree } from "@/services/catalog";
import { ProfileSetup } from "@/components/auth/profile-setup";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditPage() {
  await requireUserPage("/me/edit");
  const tree = await getCategoryTree();
  const interests = tree.flatMap((c) => c.children.map((s) => ({ slug: s.slug, name: s.name, icon: s.icon }))).slice(0, 8);
  return (
    <Suspense>
      <ProfileSetup interests={interests} mode="edit" />
    </Suspense>
  );
}
