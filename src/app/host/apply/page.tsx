import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { memberships } from "@/services/host";
import { getCities } from "@/services/catalog";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { ApplyForm } from "@/components/host/apply-form";
import { ApplicationStatus } from "@/components/host/application-status";
import { ApplyLayout, HOST_POINTS } from "@/components/host/apply-layout";

export const metadata: Metadata = {
  title: "Host on local.",
  description: "List events, workshops and sports courts on local. Free listings, paid ticketing after verification.",
};

export default async function HostApply({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await getSessionUser();
  const { edit } = await searchParams;
  const ms = user ? await memberships(user.id) : [];
  const owned = ms.find((m) => m.member.role === "owner")?.host;
  if (ms.some((m) => m.host.status === "approved")) redirect("/host");

  if (user && owned && !(edit && owned.status === "changes")) {
    return (
      <Shell>
        <ApplicationStatus
          host={{ brandName: owned.brandName, status: owned.status, submittedAt: owned.submittedAt, reviewNote: owned.reviewNote, wantsPaid: owned.wantsPaid, kycStatus: owned.kycStatus }}
        />
      </Shell>
    );
  }

  if (user && user.name) {
    const cities = await getCities();
    return (
      <ApplyLayout>
        <ApplyForm
          cities={cities.map((c) => ({ id: c.id, name: c.name }))}
          defaults={{ contactName: user.name, cityId: user.cityId ?? cities[0].id, ...(owned ? { brandName: owned.brandName, type: owned.type, bio: owned.bio, instagram: owned.instagram ?? "", email: owned.email ?? "", cityId: owned.cityId, wantsPaid: owned.wantsPaid, gstin: owned.gstin ?? "", documents: owned.documents.filter((d) => d.mediaId && d.status !== "rejected").map((d) => ({ kind: d.kind, fileName: d.fileName, mediaId: d.mediaId! })) } : {}) }}
          phone={user.phone}
        />
      </ApplyLayout>
    );
  }

  return (
    <Shell>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand">For organisers & venues</p>
        <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] md:text-5xl">
          Host on local<span className="text-brand">.</span>
        </h1>
        <p className="mt-3 text-lg text-muted lg:hidden">Reach people looking for something to do this weekend.</p>
        <p className="mt-3 hidden text-lg text-muted lg:block">Tell us who you are and what you run. Our team reviews every host, usually within a day.</p>
      </div>
      <ul className="flex flex-col gap-3 lg:hidden">
        {HOST_POINTS.map((p) => (
          <li key={p.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-tint text-brand">
              <p.icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{p.title}</span>
              <span className="block text-sm text-muted">{p.body}</span>
            </span>
          </li>
        ))}
      </ul>
      <Button asChild size="lg" block>
        <Link href={user ? "/onboarding?next=/host/apply" : "/login?next=/host/apply"}>Log in to apply</Link>
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ApplyLayout>
      <div className="flex flex-1 flex-col gap-7 py-2 lg:flex-none">
        <div className="flex items-center justify-between lg:hidden">
          <Logo />
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> Back to exploring
          </Link>
        </div>
        {children}
      </div>
    </ApplyLayout>
  );
}
