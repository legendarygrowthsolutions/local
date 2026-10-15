import { Download, FileText } from "lucide-react";
import { requireHostPage } from "@/lib/host-session";
import { hostPayouts } from "@/services/payouts";
import { PageHead } from "@/components/host/host-shell";
import { Kpi, Panel } from "@/components/host/bits";
import { PayoutAccountCard } from "@/components/host/payout-account";
import { formatINR } from "@/lib/pricing";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payouts" };

const STATUS = {
  paid: { label: "Paid", cls: "bg-free-tint text-free" },
  accruing: { label: "This week", cls: "bg-tint text-brand-ink" },
  due: { label: "Due", cls: "bg-warn-tint text-warn" },
  nothing: { label: "No sales", cls: "bg-field text-muted" },
};

export default async function PayoutsPage() {
  const ctx = await requireHostPage("/host/payouts", { owner: true });
  const p = await hostPayouts(ctx);
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <PageHead title="Payouts" sub="Paid weekly to your account. Attendees pay the convenience fee and coupons are on us, so you receive the full ticket value, less refunds." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi dark label="Owed to you" value={formatINR(p.next?.amount ?? 0)} sub={p.next ? `For ${p.next.label}, due from ${formatDate(p.next.date)}` : "Nothing due right now"} />
        <Kpi label="Paid to you so far" value={formatINR(p.totalPaid)} sub={`${p.history.length} ${p.history.length === 1 ? "payout" : "payouts"}`} />
        <PayoutAccountCard label={p.account?.label ?? null} holderName={p.account?.holderName ?? null} kycStatus={p.kycStatus} />
      </div>
      <Panel
        title="Weekly statements"
        action={
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- a CSV download, not a page
          <a download href="/api/host/payouts/export" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-semibold hover:border-ink/30">
            <Download className="size-4" /> Payout records
          </a>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-3 font-semibold">Week (by booking date)</th>
                <th className="px-3 py-3 font-semibold">Bookings</th>
                <th className="px-3 py-3 font-semibold">Ticket sales</th>
                <th className="px-3 py-3 font-semibold">Refunds</th>
                <th className="px-3 py-3 font-semibold">Owed</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold" aria-label="Statement" />
              </tr>
            </thead>
            <tbody>
              {p.cycles.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 font-semibold">{c.label}</td>
                  <td className="px-3 py-3.5 tabular-nums">{c.bookings}</td>
                  <td className="px-3 py-3.5 tabular-nums">{formatINR(c.gross)}</td>
                  <td className="px-3 py-3.5 tabular-nums text-muted">{c.refunds ? `- ${formatINR(c.refunds)}` : "Nil"}</td>
                  <td className="px-3 py-3.5 font-semibold tabular-nums">{formatINR(c.net)}</td>
                  <td className="px-3 py-3.5">
                    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold", STATUS[c.status].cls)}>
                      {c.status === "due" ? `Due ${formatDate(c.payoutDate).split(", ")[1]}` : STATUS[c.status].label}
                    </span>
                    {c.paid && (
                      <span className="mt-1 block text-xs text-muted">
                        {formatINR(c.paid.amount)} by {c.paid.method} on {formatDate(c.paid.paidOn).split(", ")[1]}
                        {c.paid.deductions > 0 ? `, ${formatINR(c.paid.deductions)} TDS/deductions` : ""}
                        <span className="block font-mono">{c.paid.reference}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {c.bookings > 0 && (
                      <a href={`/api/host/payouts/statement?cycle=${c.from}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand hover:bg-tint">
                        <FileText className="size-3.5" /> CSV
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-subtle">Statements count paid bookings by the day they were made. Each payout is recorded with its bank reference (UTR) once it has been sent. Questions about a payout? Write to us with the week and the reference.</p>
    </div>
  );
}
