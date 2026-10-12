import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { adminOverview } from "@/services/admin";
import { AdminPage } from "@/components/admin/page-bits";
import { Kpi, Panel } from "@/components/host/bits";
import { formatINR } from "@/lib/pricing";
import { CountUp } from "@/components/ui/count-up";
import { formatDay, fromISO } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function AdminOverviewPage() {
  const o = await adminOverview();
  const queues = [
    { href: "/admin/hosts?tab=pending", label: "Host applications", value: o.queues.applications, sub: `${o.queues.changes} waiting on the applicant` },
    { href: "/admin/hosts?tab=kyc", label: "KYC to verify", value: o.queues.kyc, sub: "Approved hosts who want paid ticketing" },
    { href: "/admin/listings?tab=review", label: "Listings to review", value: o.queues.listings, sub: "New and resubmitted" },
  ];
  const maxGmv = Math.max(1, ...o.byCity.map((c) => c.gmv));
  return (
    <AdminPage title="Overview" sub="The last 30 days across every city.">
      <div className="grid gap-3 sm:grid-cols-3">
        {queues.map((q) => (
          <Link key={q.href} href={q.href} className={cn("group flex flex-col gap-1 rounded-[20px] border p-5 transition-colors", q.value ? "border-brand/40 bg-tint hover:border-brand" : "border-line bg-surface hover:border-line-strong")}>
            <span className="text-xs font-semibold text-muted">{q.label}</span>
            <span className="flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold">{q.value}</span>
              <ArrowRight className="size-5 text-brand transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="text-xs text-muted">{q.sub}</span>
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi dark label="Ticket value sold · 30 days" value={<CountUp value={o.kpis.gmv30} format="inr" />} sub={`${o.kpis.bookings30} bookings`} />
        <Kpi label="Convenience fees · 30 days" value={<CountUp value={o.kpis.fees30} format="inr" />} sub="Platform revenue, excl. GST" />
        <Kpi label="Bookings starting today" value={<CountUp value={o.kpis.bookingsToday} />} />
        <Kpi label="Live listings" value={<CountUp value={o.kpis.liveListings} />} sub={`${o.kpis.approvedHosts} hosts · ${o.kpis.users} users`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="By city">
          <ul className="flex flex-col gap-4 p-5">
            {o.byCity.map((c) => (
              <li key={c.city} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">
                    {c.city} {!c.active && <span className="ml-1 rounded bg-field px-1.5 py-0.5 text-[10px] font-bold text-muted">INACTIVE</span>}
                  </span>
                  <span className="tabular-nums text-muted">
                    {formatINR(c.gmv)} · {c.bookings} bookings
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-field">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(c.gmv / maxGmv) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel
          title="Newest applications"
          action={
            <Link href="/admin/hosts" className="text-sm font-semibold text-brand">
              All →
            </Link>
          }
        >
          {o.recentApplications.length === 0 ? (
            <p className="p-5 text-sm text-muted">Queue is clear.</p>
          ) : (
            <ul className="divide-y divide-line">
              {o.recentApplications.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/hosts?tab=pending&id=${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-field/50">
                    <span className="grid size-9 place-items-center rounded-full bg-tint font-display font-bold text-brand-ink">{a.brandName[0]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{a.brandName}</span>
                      <span className="block text-xs text-muted">
                        {a.type} · {a.city}
                      </span>
                    </span>
                    <span className="text-xs text-muted">{formatDay(fromISO(a.submittedAt).ymd)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}
