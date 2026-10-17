import { requireHostPage } from "@/lib/host-session";
import { PageHead } from "@/components/host/host-shell";
import { HostSettings } from "@/components/host/host-settings";
import { abs } from "@/lib/seo";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireHostPage("/host/settings", { owner: true });
  const h = ctx.host;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHead title="Settings" sub="Your public host profile and verification." />
      <HostSettings
        linkBase={abs("/h/")}
        host={{ slug: h.slug, brandName: h.brandName, bio: h.bio, instagram: h.instagram ?? "", email: h.email ?? "", kycStatus: h.kycStatus, gstin: h.gstin, documents: h.documents.map((d) => ({ kind: d.kind, fileName: d.fileName, status: d.status })) }}
      />
    </div>
  );
}
