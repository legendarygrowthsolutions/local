import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { adminBadges } from "@/services/admin";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = { title: { default: "Superadmin", template: "%s · Superadmin | local." }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/");
  return (
    <AdminShell badges={await adminBadges()} userName={user.name ?? user.phone}>
      {children}
    </AdminShell>
  );
}
