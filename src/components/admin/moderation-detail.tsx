"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, CircleAlert, ExternalLink, Star, X } from "lucide-react";
import type { ModerationRow } from "@/services/admin";
import { Button } from "@/components/ui/button";
import { Cover } from "@/components/ui/cover";
import { ListingStatus } from "@/components/host/bits";
import { cn } from "@/lib/utils";
import { useAdminAction } from "./use-admin-action";

export function ModerationDetail({ row }: { row: ModerationRow }) {
  const [note, setNote] = useState(row.reviewNote ?? "");
  const decide = useAdminAction<{ decision: "approve" | "reject" }>(
    (v) => ({ url: `/api/admin/listings/${row.id}/decision`, body: { decision: v.decision, note: note || undefined } }),
    { success: (v) => (v.decision === "approve" ? "Published" : row.status === "live" ? "Taken down and sent back to the host" : "Sent back to the host") },
  );
  const feature = useAdminAction<boolean>((featured) => ({ url: `/api/admin/listings/${row.id}/feature`, body: { featured } }), {
    success: (f) => (f ? "Featured on the city home page" : "Removed from featured"),
  });
  const blockers = row.checks.filter((c) => !c.ok && (c.label.startsWith("Host") || c.label.startsWith("Paid") || c.label.startsWith("Has upcoming") || c.label.startsWith("Booking type") || c.label.startsWith("At least")));
  return (
    <section className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface p-5 md:p-6">
      <div className="grid gap-5 md:grid-cols-[240px_1fr]">
        <Cover media={row.media} tone={row.title.length % 4} icon={row.kind === "venue" ? "Activity" : "Ticket"} alt={row.title} className="aspect-[4/3] rounded-2xl" sizes="240px" />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ListingStatus status={row.status} />
            {row.featured && (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-tint px-2.5 text-xs font-bold text-brand-ink">
                <Star className="size-3 fill-brand text-brand" /> Featured
              </span>
            )}
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-brand">{row.categoryLabel}</span>
          </div>
          <h2 className="font-display text-2xl font-bold leading-tight">{row.title}</h2>
          <p className="text-[15px] text-ink-2">{row.summary}</p>
          <p className="text-sm text-muted">
            {row.whenLabel} · {row.areaName}, {row.cityName} · {row.priceLabel}
          </p>
          <p className="text-sm text-muted">
            By <b className="text-ink">{row.hostName}</b> · {row.templateName}
          </p>
          {row.publicHref && (
            <Link href={row.publicHref} target="_blank" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-brand">
              View on local. <ExternalLink className="size-3.5" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Checks</p>
          <ul className="flex flex-col gap-1.5">
            {row.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-sm">
                {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-free" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />}
                <span className={cn(!c.ok && "text-ink")}>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <dl className="flex flex-col gap-2 text-sm">
          {row.details.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <details className="rounded-xl bg-field/60 p-3">
        <summary className="cursor-pointer text-sm font-semibold">Full description</summary>
        <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
          {row.description.split("\n\n").map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </details>

      {row.reviewNote && row.status === "rejected" && <p className="rounded-xl bg-danger-tint p-3 text-sm text-danger">Sent back: {row.reviewNote}</p>}

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        {row.status === "live" && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-field/60 p-3">
            <Star className={cn("size-5", row.featured ? "fill-brand text-brand" : "text-muted")} />
            <p className="flex-1 text-sm">{row.featured ? "Shown in the featured carousel on the city home page." : "Feature it in the city home page carousel (up to 8 events per city)."}</p>
            <Button size="sm" variant={row.featured ? "secondary" : "soft"} loading={feature.isPending} onClick={() => feature.mutate(!row.featured)}>
              {row.featured ? "Unfeature" : "Feature"}
            </Button>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{row.status === "live" ? "Reason (to take it down)" : "Note to host"}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Required when sending back, e.g. “Please add a clearer description of what's included.”" className="resize-y rounded-xl border border-line-strong px-3 py-2.5 text-[15px] outline-none focus:border-brand" />
        </label>
        <div className="flex flex-wrap gap-2">
          {row.status !== "live" && (
            <Button className="bg-free hover:bg-[#095a31]" disabled={decide.isPending || blockers.length > 0} loading={decide.isPending && decide.variables?.decision === "approve"} onClick={() => decide.mutate({ decision: "approve" })}>
              <Check className="size-4" /> Approve & publish
            </Button>
          )}
          <Button variant="danger" disabled={decide.isPending || !note.trim()} loading={decide.isPending && decide.variables?.decision === "reject"} onClick={() => decide.mutate({ decision: "reject" })}>
            <X className="size-4" /> {row.status === "live" ? "Take down" : "Send back"}
          </Button>
        </div>
        {blockers.length > 0 && row.status !== "live" && <p className="text-sm text-warn">Can&apos;t publish yet: {blockers.map((b) => b.label.toLowerCase()).join("; ")}.</p>}
      </div>
    </section>
  );
}
