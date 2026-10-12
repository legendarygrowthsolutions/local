import { Landmark, ShieldCheck } from "lucide-react";
import { requireHostPage } from "@/lib/host-session";
import { hostPayouts } from "@/services/host";
import { PageHead } from "@/components/host/host-shell";
import { Kpi, Panel } from "@/components/host/bits";
import { formatINR } from "@/lib/pricing";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  const ctx = await requireHostPage("/host/payouts", { owner: true });
  const p = await hostPayouts(ctx);
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHead title="Payouts" sub="Weekly settlements to your bank account. Attendees pay the convenience fee, so you receive the full ticket value." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi dark label="Next payout" value={formatINR(p.next.amount)} sub={`For ${p.next.label} · on ${formatDate(p.next.date)}`} />
        <Kpi label="Last 5 weeks" value={formatINR(p.lifetime)} sub="Net of refunds" />
        <div className="flex flex-col gap-1 rounded-[20px] border border-line bg-surface p-5">
          <p className="text-xs font-semibold text-muted">Paid to</p>
          <p className="flex items-center gap-2 font-semibold">
            <Landmark className="size-4 text-brand" /> {p.bank ?? "No bank account yet"}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className={cn("size-3.5", p.kycStatus === "verified" ? "text-free" : "text-warn")} /> KYC {p.kycStatus === "verified" ? "verified" : p.kycStatus === "pending" ? "in review" : "not started"}
          </p>
        </div>
      </div>
      <Panel title="Settlements">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-3 font-semibold">Week (by booking date)</th>
                <th className="px-3 py-3 font-semibold">Bookings</th>
                <th className="px-3 py-3 font-semibold">Ticket sales</th>
                <th className="px-3 py-3 font-semibold">Refunds</th>
                <th className="px-3 py-3 font-semibold">Payout</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {p.cycles.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 font-semibold">{c.label}</td>
                  <td className="px-3 py-3.5 tabular-nums">{c.bookings}</td>
                  <td className="px-3 py-3.5 tabular-nums">{formatINR(c.gross)}</td>
                  <td className="px-3 py-3.5 tabular-nums text-muted">{c.refunds ? `− ${formatINR(c.refunds)}` : "—"}</td>
                  <td className="px-3 py-3.5 font-semibold tabular-nums">{formatINR(c.net)}</td>
                  <td className="px-5 py-3.5">
                    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold", c.status === "paid" ? "bg-free-tint text-free" : c.status === "accruing" ? "bg-tint text-brand-ink" : "bg-field text-muted")}>
                      {c.status === "paid" ? "Paid" : c.status === "accruing" ? "This week" : `Due ${formatDate(c.payoutDate).split(", ")[1]}`}
                    </span>
                    {c.utr && <span className="ml-2 font-mono text-xs text-subtle">{c.utr}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-subtle">Figures are computed from confirmed bookings, net of refunds. Payouts settle weekly to your verified bank account.</p>
    </div>
  );
}
