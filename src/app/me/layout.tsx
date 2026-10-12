import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { memberships } from "@/services/host";
import { AppChrome } from "@/components/layout/app-chrome";
import { AccountShell } from "@/components/layout/account-shell";

export const metadata: Metadata = { robots: { index: false } };

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/me");
  if (!user.name) redirect("/onboarding?next=/me");
  const hostOf = (await memberships(user.id))[0];
  const host = hostOf?.host.status === "approved" ? { href: "/host", label: "Host console" } : hostOf ? { href: "/host/apply", label: "Your host application" } : { href: "/host/apply", label: "Host on local." };
  return (
    <AppChrome cityId={user.cityId}>
      <AccountShell user={{ name: user.name, phone: user.phone, avatar: user.avatar }} host={host}>
        {children}
      </AccountShell>
    </AppChrome>
  );
}
