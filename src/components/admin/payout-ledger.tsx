"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import type { PayoutAccount } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatINR } from "@/lib/pricing";
import { formatDate, istParts } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAdminAction } from "./use-admin-action";

export interface DueRow {
  key: string;
  hostId: string;
  brandName: string;
  city: string;
  kycStatus: string;
  gstin: string | null;
  account: PayoutAccount | null;
  cycleFrom: string;
  label: string;
  dueOn: string;
  overdue: boolean;
  bookings: number;
  gross: number;
  refunds: number;
  net: number;
}

export interface HistoryRow {
  id: string;
  hostId: string;
  brandName: string;
  label: string;
  amount: number;
  deductions: number;
  adjustment: number;
  methodLabel: string;
  reference: string;
  paidOn: string;
  paidTo: string;
  notes: string | null;
  recordedByName: string;
  createdAt: string;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
}

type Method = "bank_transfer" | "upi" | "cheque" | "other";
type Draft = { row: DueRow; deductions: string; adjustment: string; method: Method; reference: string; paidOn: string; notes: string };

const input = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-brand";
const th = "border-b border-[#e6e6e1] px-4 py-2.5 font-semibold";
const td = "px-4 py-3 align-top";
const toNum = (s: string) => (s.trim() === "" ? 0 : Number(s));

export function AccountDetails({ account }: { account: PayoutAccount | null }) {
  if (!account) return <span className="text-xs font-semibold text-warn">No payout details yet</span>;
  if (account.method === "upi")
    return (
      <span className="text-xs leading-5">
        <b className="block font-semibold">{account.holderName}</b>
        UPI <span className="font-mono">{account.upiId}</span>
      </span>
    );
  return (
    <span className="text-xs leading-5">
      <b className="block font-semibold">{account.holderName}</b>
      {account.bankName} · <span className="font-mono">{account.accountNumber}</span>
      <span className="block font-mono text-muted">{account.ifsc}</span>
    </span>
  );
}

export function DuePayouts({ rows, today }: { rows: DueRow[]; today: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const record = useAdminAction<Draft>(
    (d) => ({
      url: "/api/admin/payouts",
      body: {
        hostId: d.row.hostId,
        cycleFrom: d.row.cycleFrom,
        deductions: toNum(d.deductions),
        adjustment: toNum(d.adjustment),
        method: d.method,
        reference: d.reference,
        paidOn: d.paidOn,
        notes: d.notes || undefined,
      },
    }),
    { success: (d) => `Payout to ${d.row.brandName} recorded` },
  );
  const amount = draft ? Math.round((draft.row.net - toNum(draft.deductions) + toNum(draft.adjustment)) * 100) / 100 : 0;
  const valid = !!draft && draft.reference.trim().length >= 4 && !!draft.paidOn && amount > 0 && !Number.isNaN(amount);

  if (!rows.length) return <p className="px-5 pb-5 text-sm text-muted">Nothing is waiting to be paid. Weeks show up here once they end.</p>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              {["Host", "Week", "Bookings", "Ticket sales", "Refunds", "To pay", "Pay to", ""].map((h, i) => (
                <th key={i} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-0">
                <td className={td}>
                  <span className="block font-semibold">{r.brandName}</span>
                  <span className="block text-xs text-muted">
                    {r.city}
                    {r.gstin ? ` · GSTIN ${r.gstin}` : ""}
                  </span>
                  <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold", r.kycStatus === "verified" ? "bg-free-tint text-free" : "bg-warn-tint text-warn")}>
                    {r.kycStatus === "verified" ? "KYC verified" : "KYC not verified"}
                  </span>
                </td>
                <td className={td}>
                  <span className="block">{r.label}</span>
                  <span className={cn("block text-xs", r.overdue ? "font-semibold text-danger" : "text-muted")}>
                    {r.overdue ? "Overdue since" : "Due"} {formatDate(r.dueOn).split(", ")[1]}
                  </span>
                </td>
                <td className={cn(td, "tabular-nums")}>{r.bookings}</td>
                <td className={cn(td, "tabular-nums")}>{formatINR(r.gross)}</td>
                <td className={cn(td, "tabular-nums text-muted")}>{r.refunds ? `- ${formatINR(r.refunds)}` : "Nil"}</td>
                <td className={cn(td, "font-semibold tabular-nums")}>{formatINR(r.net)}</td>
                <td className={td}>
                  <AccountDetails account={r.account} />
                </td>
                <td className={cn(td, "whitespace-nowrap text-right")}>
                  <a href={`/api/admin/payouts/statement?hostId=${encodeURIComponent(r.hostId)}&cycle=${r.cycleFrom}`} className="mr-2 inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand hover:bg-tint">
                    <FileText className="size-3.5" /> Statement
                  </a>
                  <Button size="sm" onClick={() => setDraft({ row: r, deductions: "", adjustment: "", method: r.account?.method === "upi" ? "upi" : "bank_transfer", reference: "", paidOn: today, notes: "" })}>
                    Record payout
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft ? `Record payout to ${draft.row.brandName}` : ""}
        description={draft ? `Week of ${draft.row.label}. Record it after the money has been sent.` : undefined}
        footer={
          draft && (
            <Button size="lg" block loading={record.isPending} disabled={!valid} onClick={() => record.mutate(draft, { onSuccess: () => setDraft(null) })}>
              Record {formatINR(amount)} as paid
            </Button>
          )
        }
      >
        {draft && (
          <div className="flex flex-col gap-4 pb-2">
            <div className="rounded-xl bg-field p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Ticket sales</span>
                <span className="tabular-nums">{formatINR(draft.row.gross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Refunds</span>
                <span className="tabular-nums">- {formatINR(draft.row.refunds)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold">
                <span>Owed for the week</span>
                <span className="tabular-nums">{formatINR(draft.row.net)}</span>
              </div>
            </div>
            <div className="rounded-xl border border-line p-3">
              <p className="mb-1 text-xs font-semibold text-muted">Pay to</p>
              <AccountDetails account={draft.row.account} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">TDS / deductions (₹)</span>
                <input className={input} inputMode="decimal" value={draft.deductions} onChange={(e) => setDraft({ ...draft, deductions: e.target.value })} placeholder="0" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Adjustment (₹)</span>
                <input className={input} inputMode="decimal" value={draft.adjustment} onChange={(e) => setDraft({ ...draft, adjustment: e.target.value })} placeholder="0, or negative" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Method</span>
                <select className={input} value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value as Method })}>
                  <option value="bank_transfer">Bank transfer (NEFT/IMPS/RTGS)</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Paid on</span>
                <input className={input} type="date" max={today} value={draft.paidOn} onChange={(e) => setDraft({ ...draft, paidOn: e.target.value })} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">UTR / reference</span>
              <input className={cn(input, "font-mono uppercase")} value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} placeholder="e.g. HDFCN52026101512345" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Notes (optional)</span>
              <textarea className={cn(input, "h-20 py-2")} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Why there's a deduction or adjustment, who approved it" />
            </label>
          </div>
        )}
      </Sheet>
    </>
  );
}

export function PayoutHistory({ rows }: { rows: HistoryRow[] }) {
  const [voiding, setVoiding] = useState<{ row: HistoryRow; reason: string } | null>(null);
  const voidIt = useAdminAction<{ row: HistoryRow; reason: string }>((v) => ({ url: `/api/admin/payouts/${v.row.id}/void`, body: { reason: v.reason } }), { success: "Payout record voided" });
  return (
    <>
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="font-display text-lg font-bold">Payout records</h2>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a CSV download, not a page */}
        <a download href="/api/admin/payouts/export" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-semibold hover:border-ink/30">
          <Download className="size-4" /> Export CSV
        </a>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">No payouts recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {["Paid on", "Host", "Week", "Amount", "Method", "Reference", "Recorded by", ""].map((h, i) => (
                  <th key={i} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={cn("border-b border-line last:border-0", p.voidedAt && "text-muted")}>
                  <td className={td}>{formatDate(p.paidOn, true)}</td>
                  <td className={td}>
                    <span className="block font-semibold">{p.brandName}</span>
                    <span className="block text-xs text-muted">{p.paidTo}</span>
                  </td>
                  <td className={td}>{p.label}</td>
                  <td className={cn(td, "tabular-nums")}>
                    <span className={cn("font-semibold", p.voidedAt && "line-through")}>{formatINR(p.amount)}</span>
                    {(p.deductions > 0 || p.adjustment !== 0) && (
                      <span className="block text-xs text-muted">
                        {p.deductions > 0 ? `${formatINR(p.deductions)} deducted` : ""}
                        {p.deductions > 0 && p.adjustment !== 0 ? ", " : ""}
                        {p.adjustment !== 0 ? `${p.adjustment > 0 ? "+" : "-"}${formatINR(Math.abs(p.adjustment))} adjusted` : ""}
                      </span>
                    )}
                  </td>
                  <td className={td}>{p.methodLabel}</td>
                  <td className={cn(td, "font-mono text-xs")}>
                    {p.reference}
                    {p.notes && <span className="block whitespace-normal font-sans text-muted">{p.notes}</span>}
                  </td>
                  <td className={cn(td, "text-xs")}>
                    {p.recordedByName}
                    <span className="block text-muted">{formatDate(istParts(new Date(p.createdAt)).ymd).split(", ")[1]}</span>
                  </td>
                  <td className={cn(td, "text-right")}>
                    {p.voidedAt ? (
                      <span className="inline-block max-w-[200px] whitespace-normal text-left text-xs">
                        <b className="block text-danger">Voided</b>
                        {p.voidReason}
                        {p.voidedByName ? ` (${p.voidedByName})` : ""}
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setVoiding({ row: p, reason: "" })}>
                        Void
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Sheet
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        title="Void this payout record?"
        description={voiding ? `${formatINR(voiding.row.amount)} to ${voiding.row.brandName}, ref ${voiding.row.reference}. The record stays in the ledger marked as voided, and the week shows as due again.` : undefined}
        footer={
          voiding && (
            <Button size="lg" block variant="danger" loading={voidIt.isPending} disabled={voiding.reason.trim().length < 4} onClick={() => voidIt.mutate(voiding, { onSuccess: () => setVoiding(null) })}>
              Void record
            </Button>
          )
        }
      >
        {voiding && (
          <label className="flex flex-col gap-1.5 pb-2">
            <span className="text-sm font-semibold">Reason</span>
            <textarea className={cn(input, "h-24 py-2")} value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} placeholder="e.g. Transfer bounced, wrong UTR entered" />
          </label>
        )}
      </Sheet>
    </>
  );
}
