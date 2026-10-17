import type { Metadata } from "next";
import { requireHostPage } from "@/lib/host-session";
import { repo } from "@/repositories";
import { hostTargets } from "@/services/host";
import { HostShell } from "@/components/host/host-shell";

export const metadata: Metadata = { title: { default: "Host console", template: "%s · Host console | local." }, robots: { index: false } };

export default async function HostConsoleLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireHostPage("/host");
  const [{ venues }, city] = await Promise.all([hostTargets(ctx), repo.cities.byId(ctx.host.cityId)]);
  return (
    <HostShell
      host={{ id: ctx.host.id, brandName: ctx.host.brandName, type: ctx.host.type, kycStatus: ctx.host.kycStatus }}
      role={ctx.member.role}
      scoped={ctx.scope !== null}
      hasVenues={venues.length > 0 || ctx.host.type === "venue"}
      memberships={ctx.memberships.map((m) => ({ id: m.host.id, brandName: m.host.brandName, role: m.member.role }))}
      userName={ctx.user.name ?? ctx.user.phone}
      citySlug={city?.slug ?? "nagpur"}
    >
      {children}
    </HostShell>
  );
}
