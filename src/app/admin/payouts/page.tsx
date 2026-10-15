import { requireAdminPage } from "@/lib/guards";
import Link from "next/link";
import { adminPayouts } from "@/services/payouts";
import { DuePayouts, PayoutHistory } from "@/components/admin/payout-ledger";
import { AdminPage } from "@/components/admin/page-bits";
import { formatINR } from "@/lib/pricing";
import { formatDate, istParts } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payouts & fees" };

export default async function PayoutsPage() {
  await requireAdminPage();
  const d = await adminPayouts();
  const today = istParts().ymd;
  return (
    <AdminPage
      title="Payouts & fees"
      sub="Hosts are paid by hand each week for bookings made Monday to Sunday, on the following Wednesday. Send the money, then record it here with the UTR. Coupons and the convenience fee sit with the platform, so hosts get the full ticket value less refunds."
      wide
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat dark label="Due to hosts" value={formatINR(d.dueTotal)} sub={d.due.length ? `${d.due.length} ${d.due.length === 1 ? "payout" : "payouts"} to send` : "All caught up"} />
        <Stat label={`This week so far · ${d.current.label}`} value={formatINR(d.current.net)} sub={`Due ${formatDate(d.current.dueOn)}`} />
        <Stat label="Platform fees · this week" value={formatINR(d.current.fees)} sub={`Convenience fee + GST. Coupons cost ${formatINR(d.current.couponCost)}`} />
      </div>

      <section className="rounded-2xl border border-[#e6e6e1] bg-surface">
        <h2 className="px-5 pb-1 pt-4 font-display text-lg font-bold">Due for payout</h2>
        <DuePayouts rows={d.due} today={today} />
      </section>

      <section className="rounded-2xl border border-[#e6e6e1] bg-surface">
        <PayoutHistory rows={d.history} />
      </section>

      <section className="overflow-x-auto rounded-2xl border border-[#e6e6e1] bg-surface">
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="font-display text-lg font-bold">Fees by journey template</h2>
          <Link href="/admin/templates" className="text-[13px] font-semibold text-brand">
            Edit in templates →
          </Link>
        </div>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              {["Template", "Convenience fee", "GST on fee", "Host can absorb"].map((h) => (
                <th key={h} className="border-b border-[#e6e6e1] px-5 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.fees.map((f) => (
              <tr key={f.id} className="border-b border-line last:border-0">
                <td className="px-5 py-3 font-semibold">
                  <Link href={`/admin/templates?id=${f.id}`} className="hover:text-brand-ink">
                    {f.name}
                  </Link>
                </td>
                <td className="px-5 py-3">{f.pricing === "free" ? "Nil" : [f.convenienceFeePct ? `${f.convenienceFeePct}%` : null, f.convenienceFeeFlat ? formatINR(f.convenienceFeeFlat) : null].filter(Boolean).join(" + ") || "None"}</td>
                <td className="px-5 py-3">{f.pricing === "free" ? "Nil" : `${f.gstOnFeePct}%`}</td>
                <td className="px-5 py-3">{f.absorbFeeAllowed ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminPage>
  );
}

function Stat({ label, value, sub, dark }: { label: string; value: string; sub: string; dark?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-2xl border p-[18px]", dark ? "border-feature bg-feature text-white" : "border-[#e6e6e1] bg-surface")}>
      <span className={cn("text-[13px]", dark ? "text-feature-muted" : "text-muted")}>{label}</span>
      <b className="font-display text-[28px] font-bold leading-tight">{value}</b>
      <span className={cn("text-[13px]", dark ? "text-feature-muted" : "text-muted")}>{sub}</span>
    </div>
  );
}
