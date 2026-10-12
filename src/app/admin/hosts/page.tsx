import { requireAdminPage } from "@/lib/guards";
import Link from "next/link";
import { listApplications, type HostTab } from "@/services/admin";
import { AdminPage, Tabs } from "@/components/admin/page-bits";
import { HostDetail } from "@/components/admin/host-detail";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils";

export const metadata = { title: "Host applications" };

const TYPE: Record<string, string> = { organiser: "Events", venue: "Sports venue", instructor: "Workshops", community: "Community" };

export default async function HostsPage({ searchParams }: { searchParams: Promise<{ tab?: string; id?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = (["pending", "changes", "approved", "rejected", "kyc"].includes(sp.tab ?? "") ? sp.tab : "pending") as HostTab;
  const { counts, items } = await listApplications(tab);
  const selected = items.find((h) => h.id === sp.id) ?? items[0];
  const href = (p: { tab?: string; id?: string }) => `/admin/hosts?tab=${p.tab ?? tab}${p.id ? `&id=${p.id}` : ""}`;
  const pill = (h: (typeof items)[number]) => {
    if (h.status !== "pending") return null;
    const docsMissing = h.wantsPaid && !(["pan", "bank"] as const).every((k) => h.documents.some((d) => d.kind === k));
    if (docsMissing) return { label: "Docs missing", cls: "bg-[#fdf0ec] text-[#8a2410]" };
    if (h.kycStatus === "verified") return { label: "KYC done", cls: "bg-[#e7f0fb] text-[#1f4e8c]" };
    return { label: "New", cls: "bg-[#fff1d6] text-[#7a4a00]" };
  };
  return (
    <AdminPage
      title="Host applications"
      sub="Approve hosts before they can publish listings."
      wide
      action={
        <Tabs
          active={tab}
          tabs={[
            { id: "pending", label: "Pending", count: counts.pending, href: href({ tab: "pending" }) },
            { id: "kyc", label: "KYC to verify", count: counts.kyc, href: href({ tab: "kyc" }) },
            { id: "changes", label: "Changes requested", count: counts.changes, href: href({ tab: "changes" }) },
            { id: "approved", label: "Approved", count: counts.approved, href: href({ tab: "approved" }) },
            { id: "rejected", label: "Rejected", count: counts.rejected, href: href({ tab: "rejected" }) },
          ]}
        />
      }
    >
      {items.length === 0 ? (
        <EmptyState title="Nothing in this queue" body="New applications will show up here." />
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <ul className={cn("min-w-0 flex-[1_1_340px] overflow-hidden rounded-2xl border border-[#e6e6e1] bg-surface", sp.id && "max-lg:hidden")}>
            {items.map((h) => {
              const p = pill(h);
              return (
                <li key={h.id} className="border-b border-[#eeeee9] last:border-0">
                  <Link href={href({ id: h.id })} scroll={false} className={cn("flex items-center gap-3 p-3.5 text-sm transition-colors", h.id === selected?.id ? "bg-tint shadow-[inset_4px_0_0_var(--color-brand)]" : "hover:bg-field/60")}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tone-0 text-xs font-bold text-brand-ink" aria-hidden>
                      {h.brandName[0]}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="truncate">{h.brandName}</b>
                      <span className="truncate text-xs text-muted">
                        {TYPE[h.type]} · {h.cityName} · {ago(h.submittedAt)}
                      </span>
                    </span>
                    {p && <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", p.cls)}>{p.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          {selected && (
            <div className={cn("min-w-0 flex-[1.4_1_420px]", !sp.id && "max-lg:hidden")}>
              <Link href={href({})} className="mb-3 inline-block text-sm font-semibold text-muted lg:hidden">
                ← All applications
              </Link>
              <HostDetail key={selected.id + selected.status + selected.kycStatus} host={{ ...selected, typeLabel: TYPE[selected.type] }} />
            </div>
          )}
        </div>
      )}
    </AdminPage>
  );
}

function ago(iso: string, now = Date.now()) {
  const h = Math.max(0, Math.round((now - new Date(iso).getTime()) / 3_600_000));
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
