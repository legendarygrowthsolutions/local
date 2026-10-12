import Link from "next/link";
import { Plus, ShieldAlert } from "lucide-react";
import { requireHostPage } from "@/lib/host-session";
import { hostDashboard } from "@/services/host";
import { Kpi, ListingStatus } from "@/components/host/bits";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { formatDate, istParts } from "@/lib/time";

export const metadata = { title: "Overview" };

function greeting(now = new Date()) {
  const h = istParts(now).mins / 60;
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Wireframe 19 */
export default async function HostOverview({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const ctx = await requireHostPage("/host");
  const d = await hostDashboard(ctx);
  const { denied } = await searchParams;
  const first = ctx.user.name?.split(" ")[0];
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-6 md:px-8 md:py-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-tight md:text-[30px]">
            {greeting()}, {first ?? "there"}
          </h1>
          <p className="text-sm text-muted">Here&apos;s how your listings are doing this week.</p>
        </div>
        <Button asChild size="md" className="h-[46px] px-5">
          <Link href="/host/listings/new">
            <Plus className="size-4" aria-hidden /> Create listing
          </Link>
        </Button>
      </div>
      {denied && <p className="rounded-2xl bg-warn-tint px-4 py-3 text-sm text-warn">That page is for the owner only. Ask your owner if you need access.</p>}
      {ctx.host.kycStatus !== "verified" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <ShieldAlert className="size-5 text-warn" aria-hidden />
          <p className="flex-1 text-sm">
            <b>Paid ticketing is locked.</b> {ctx.host.kycStatus === "pending" ? "We're verifying your PAN and bank details." : "Add PAN and bank details to start selling tickets."} Free listings work right away.
          </p>
          {ctx.isOwner && (
            <Link href="/host/settings" className="text-sm font-semibold text-brand">
              Verification →
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Bookings (7 days)" value={<CountUp value={d.week.bookings} />} trend={d.week.bookingsTrend} trendSuffix=" vs last week" />
        {ctx.isOwner ? (
          <Kpi label="Gross sales · owner only" value={<CountUp value={d.week.gross ?? 0} format="inr-short" />} trend={d.week.grossTrend} />
        ) : (
          <Kpi label="Today: checked in" value={`${d.kpis.todayCheckedIn} / ${d.kpis.todayExpected}`} sub="Bookings starting today" />
        )}
        <Kpi label="Listing views" value={<CountUp value={d.week.views} />} trend={d.week.viewsTrend} />
        {ctx.isOwner ? (
          <Kpi dark label="Next payout · owner only" value={<CountUp value={d.kpis.nextPayout?.amount ?? 0} format="inr" />} sub={d.kpis.nextPayout ? formatDate(d.kpis.nextPayout.date) : "No payout scheduled"} />
        ) : (
          <Kpi dark label="Waiting for review" value={d.pendingReview} sub="Listings sent to the local. team" />
        )}
      </div>

      <section className="overflow-x-auto rounded-2xl border border-[#e6e6e1] bg-surface px-2 pt-2">
        <div className="flex items-center justify-between px-3 py-2.5">
          <h2 className="font-display text-lg font-bold">Your listings</h2>
          <Link href="/host/listings" className="text-[13px] font-semibold underline-offset-2 hover:underline">
            View all
          </Link>
        </div>
        {d.listings.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-3 pb-5">
            <p className="text-muted">Nothing listed yet. Your first listing takes about five minutes.</p>
            <Button asChild size="sm">
              <Link href="/host/listings/new">Create a listing</Link>
            </Button>
          </div>
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-muted">
                <th className="border-b border-[#e6e6e1] px-3 py-2.5 font-semibold">Listing</th>
                <th className="border-b border-[#e6e6e1] px-3 py-2.5 font-semibold">Type</th>
                <th className="border-b border-[#e6e6e1] px-3 py-2.5 font-semibold">Date</th>
                <th className="border-b border-[#e6e6e1] px-3 py-2.5 font-semibold">Sold</th>
                <th className="border-b border-[#e6e6e1] px-3 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {d.listings.map((l) => {
                const pctSold = l.capacity ? Math.min(100, Math.round((l.sold / l.capacity) * 100)) : null;
                return (
                  <tr key={l.id} className="border-b border-line last:border-0 hover:bg-field/40">
                    <td className="px-3 py-3.5 font-semibold">
                      <Link href={l.editHref} className="hover:text-brand-ink">
                        {l.title}
                      </Link>
                    </td>
                    <td className="px-3 py-3.5">{l.templateName}</td>
                    <td className="px-3 py-3.5">{l.whenLabel}</td>
                    <td className="px-3 py-3.5">
                      {pctSold !== null ? (
                        <span className="flex items-center gap-2 tabular-nums">
                          <span className="h-1.5 w-[120px] overflow-hidden rounded-full bg-[#eeeee9]" aria-hidden>
                            <span className="block h-full bg-brand" style={{ width: `${pctSold}%` }} />
                          </span>
                          {l.soldLabel.replace(" / ", "/")}
                        </span>
                      ) : (
                        l.soldLabel
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <ListingStatus status={l.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
