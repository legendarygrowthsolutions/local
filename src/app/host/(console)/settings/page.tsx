import { requireHostPage } from "@/lib/host-session";
import { PageHead } from "@/components/host/host-shell";
import { HostSettings } from "@/components/host/host-settings";
import { HostOperationsSettings } from "@/components/host/host-operations-settings";
import { hostSettings } from "@/services/host-settings";
import { hostTargets } from "@/services/host";
import { repo } from "@/repositories";
import { abs } from "@/lib/seo";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireHostPage("/host/settings", { owner: true });
  const h = ctx.host;
  // The platform default shown next to "inherit": the booking type of the host's first venue or listing.
  const { venues, listings } = await hostTargets(ctx);
  const tplId = venues[0]?.templateId ?? listings[0]?.templateId;
  const tpl = tplId ? await repo.templates.byId(tplId) : null;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHead title="Settings" sub="Your public profile, verification, and how your venue runs day to day." />
      <HostSettings
        linkBase={abs("/h/")}
        host={{ slug: h.slug, brandName: h.brandName, bio: h.bio, instagram: h.instagram ?? "", email: h.email ?? "", kycStatus: h.kycStatus, gstin: h.gstin, documents: h.documents.map((d) => ({ kind: d.kind, fileName: d.fileName, status: d.status })) }}
      />
      <h2 className="mt-2 font-display text-[22px] font-bold">Operations</h2>
      <HostOperationsSettings initial={hostSettings(h)} templateReschedule={tpl?.reschedule ?? null} />
    </div>
  );
}
