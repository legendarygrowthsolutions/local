import { requireAdminPage } from "@/lib/guards";
import Link from "next/link";
import { adminPayouts } from "@/services/admin";
import { AdminPage } from "@/components/admin/page-bits";
import { formatINR } from "@/lib/pricing";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payouts & fees" };

export default async function PayoutsPage() {
  await requireAdminPage();
  const d = await adminPayouts();
  return (
    <AdminPage title="Payouts & fees" sub="Hosts are paid weekly for bookings made Monday to Sunday, on the following Wednesday. Attendees pay the convenience fee." wide>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`This cycle · ${d.current.label}`} value={formatINR(d.current.net)} sub={`Pays out ${formatDate(d.current.payoutDate)}`} />
        <Stat label={`Last cycle · ${d.previous.label}`} value={formatINR(d.previous.net)} sub={d.previous.paid ? `Paid ${formatDate(d.previous.payoutDate)}` : `Pays out ${formatDate(d.previous.payoutDate)}`} />
        <Stat dark label="Platform fees · this cycle" value={formatINR(d.current.fees)} sub="Convenience fee + GST collected" />
      </div>

      <section className="overflow-x-auto rounded-2xl border border-[#e6e6e1] bg-surface">
        <h2 className="px-5 pb-1 pt-4 font-display text-lg font-bold">Host payouts</h2>
        {d.rows.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">No paid bookings in the last two cycles.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {["Host", "KYC", "Bookings", "Gross", "Refunds", "Net this cycle", "Last cycle"].map((h) => (
                  <th key={h} className="border-b border-[#e6e6e1] px-5 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <Link href={`/admin/hosts?tab=approved&id=${r.id}`} className="font-semibold hover:text-brand-ink">
                      {r.brandName}
                    </Link>
                    <span className="block text-xs text-muted">{r.city}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", r.kycStatus === "verified" ? "bg-free-tint text-free" : "bg-warn-tint text-warn")}>{r.kycStatus === "verified" ? "Verified" : "On hold"}</span>
                  </td>
                  <td className="px-5 py-3 tabular-nums">{r.current.bookings}</td>
                  <td className="px-5 py-3 tabular-nums">{formatINR(r.current.gross)}</td>
                  <td className="px-5 py-3 tabular-nums text-muted">{r.current.refunds ? `− ${formatINR(r.current.refunds)}` : "—"}</td>
                  <td className="px-5 py-3 font-semibold tabular-nums">{formatINR(r.current.net)}</td>
                  <td className="px-5 py-3 tabular-nums text-muted">{formatINR(r.previous.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                <td className="px-5 py-3">{f.pricing === "free" ? "—" : [f.convenienceFeePct ? `${f.convenienceFeePct}%` : null, f.convenienceFeeFlat ? formatINR(f.convenienceFeeFlat) : null].filter(Boolean).join(" + ") || "None"}</td>
                <td className="px-5 py-3">{f.pricing === "free" ? "—" : `${f.gstOnFeePct}%`}</td>
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
