"use client";

import { useState } from "react";
import { Check, ExternalLink, FileText, X } from "lucide-react";
import type { Host, HostMember } from "@/contracts";
import { Button } from "@/components/ui/button";
import { formatDate, fromISO } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAdminAction } from "./use-admin-action";

const DOC: Record<string, string> = { pan: "PAN card", bank: "Bank proof", gst: "GST certificate", id_proof: "ID proof" };
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending review", cls: "bg-warn-tint text-warn" },
  changes: { label: "Changes requested", cls: "bg-warn-tint text-warn" },
  approved: { label: "Approved", cls: "bg-free-tint text-free" },
  rejected: { label: "Rejected", cls: "bg-danger-tint text-danger" },
};

type Row = Host & { cityName: string; owner: HostMember | null; teamSize: number; listingCount: number; typeLabel: string };

export function HostDetail({ host }: { host: Row }) {
  const [note, setNote] = useState(host.reviewNote ?? "");
  const decide = useAdminAction<{ decision: "approved" | "changes" | "rejected" }>(
    (v) => ({ url: `/api/admin/hosts/${host.id}/decision`, body: { decision: v.decision, note: note || undefined } }),
    { success: (v) => (v.decision === "approved" ? `${host.brandName} approved` : v.decision === "changes" ? "Changes requested" : "Application rejected") },
  );
  const doc = useAdminAction<{ id: string; status: "verified" | "rejected" | "uploaded" }>((v) => ({ url: `/api/admin/hosts/${host.id}/documents/${v.id}`, body: { status: v.status } }));
  const s = STATUS[host.status];
  const facts: [string, React.ReactNode][] = [
    ["Host type", host.typeLabel],
    ["City", host.cityName],
    ["Wants paid ticketing", host.wantsPaid ? "Yes" : "No, free listings only"],
    ["Instagram", host.instagram ?? "Not added"],
    ["GSTIN", host.gstin ?? "Not added"],
    [host.type === "venue" ? "Courts" : "Expected events / mo", host.expectedPerMonth],
  ];
  const busy = decide.isPending;
  return (
    <section className="flex flex-col gap-[18px] rounded-2xl border border-[#e6e6e1] bg-surface p-[22px]">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-tone-0 font-display text-xl font-bold text-brand-ink" aria-hidden>
          {host.brandName[0]}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-display text-[22px] font-bold">{host.brandName}</h2>
          <p className="text-[13px] text-muted">
            Applied by {host.contactName} · +91 {host.contactPhone.slice(0, 5)} {host.contactPhone.slice(5)} · {formatDate(fromISO(host.submittedAt).ymd)}
          </p>
        </div>
        {host.status !== "pending" && <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", s.cls)}>{s.label}</span>}
      </div>

      <dl className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="truncate text-sm font-bold">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">About</p>
        <p className="text-[15px] leading-relaxed text-ink-2">{host.bio}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold">Documents</p>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", host.kycStatus === "verified" ? "bg-free-tint text-free" : host.kycStatus === "pending" ? "bg-warn-tint text-warn" : "bg-field text-muted")}>
            KYC {host.kycStatus === "none" ? "not needed" : host.kycStatus}
          </span>
        </div>
        {host.documents.length === 0 ? (
          <p className="rounded-xl bg-field p-3 text-sm text-muted">No documents. This host only wants free listings.</p>
        ) : (
          <ul className="grid gap-2 xl:grid-cols-2">
            {host.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 rounded-[10px] border border-[#e6e6e1] px-3 py-2.5 text-[13px]">
                <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block">{DOC[d.kind]}</span>
                  {d.mediaId ? (
                    <a href={`/api/documents/${d.mediaId}`} target="_blank" rel="noopener" className="block truncate text-xs font-semibold text-brand underline-offset-2 hover:underline">
                      {d.fileName}
                    </a>
                  ) : (
                    <span className="block truncate text-xs text-muted">{d.fileName}</span>
                  )}
                </span>
                {d.status === "uploaded" ? (
                  <span className="flex items-center gap-1">
                    <span className="mr-1 font-semibold text-[#7a4a00]">Review</span>
                    <button type="button" onClick={() => doc.mutate({ id: d.id, status: "verified" })} className="grid size-8 place-items-center rounded-lg bg-free-tint text-free hover:brightness-95" aria-label={`Verify ${DOC[d.kind]}`}>
                      <Check className="size-4" />
                    </button>
                    <button type="button" onClick={() => doc.mutate({ id: d.id, status: "rejected" })} className="grid size-8 place-items-center rounded-lg bg-danger-tint text-danger hover:brightness-95" aria-label={`Reject ${DOC[d.kind]}`}>
                      <X className="size-4" />
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => doc.mutate({ id: d.id, status: "uploaded" })} className={cn("font-semibold underline-offset-2 hover:underline", d.status === "verified" ? "text-[#1e6b3e]" : "text-danger")} title="Undo">
                    {d.status === "verified" ? "Verified" : "Rejected"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-subtle">Open each file to check it. Verifying PAN and bank proof marks KYC verified, so the host can sell paid tickets.</p>
      </div>

      {host.instagram && (
        <a href={`https://instagram.com/${host.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand">
          Check {host.instagram} <ExternalLink className="size-3.5" />
        </a>
      )}

      {host.status !== "approved" ? (
        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Note to applicant (optional when approving)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Required when requesting changes or rejecting"
              className="resize-y rounded-[10px] border-[1.5px] border-[#dcdcd6] p-2.5 text-sm outline-none focus:border-brand"
            />
          </label>
          <div className="flex flex-wrap gap-2.5 [&>button]:h-[46px] [&>button]:rounded-xl [&>button]:text-[15px]">
            <Button className="bg-[#1e6b3e] px-[22px] hover:bg-[#175632]" loading={busy && decide.variables?.decision === "approved"} disabled={busy} onClick={() => decide.mutate({ decision: "approved" })}>
              Approve host
            </Button>
            <Button variant="secondary" loading={busy && decide.variables?.decision === "changes"} disabled={busy || !note.trim()} onClick={() => decide.mutate({ decision: "changes" })}>
              Request changes
            </Button>
            <Button variant="danger" className="ml-auto" loading={busy && decide.variables?.decision === "rejected"} disabled={busy || !note.trim()} onClick={() => decide.mutate({ decision: "rejected" })}>
              Reject
            </Button>
          </div>
          {host.wantsPaid && host.kycStatus !== "verified" && <p className="text-xs text-muted">You can approve now for free listings and verify documents later; paid ticketing stays locked until KYC is verified.</p>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5 text-sm text-muted">
          <span>Approved host. Owner: {host.owner?.name ?? "Not set"}.</span>
          <Button size="sm" variant="danger" className="ml-auto" disabled={busy || !note.trim()} onClick={() => decide.mutate({ decision: "rejected" })}>
            Suspend
          </Button>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (required to suspend)" className="h-9 w-full rounded-lg border border-line-strong px-3 text-sm outline-none focus:border-brand sm:w-64" />
        </div>
      )}
    </section>
  );
}
