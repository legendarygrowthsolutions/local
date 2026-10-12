"use client";

import Link from "next/link";
import { useState } from "react";
import { m } from "motion/react";
import { CircleAlert, ExternalLink, Pencil } from "lucide-react";
import type { HostListingRow } from "@/services/host";
import { useHostListings } from "@/lib/api/host-hooks";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/pricing";
import { ListingStatus } from "./bits";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "review", label: "In review" },
  { id: "draft", label: "Drafts" },
  { id: "rejected", label: "Needs changes" },
  { id: "ended", label: "Ended" },
];

export function ListingsTable({ initial, isOwner }: { initial: HostListingRow[]; isOwner: boolean }) {
  const { data = initial } = useHostListings(initial);
  const [f, setF] = useState("all");
  const rows = data.filter((r) => f === "all" || r.status === f);
  const count = (id: string) => (id === "all" ? data.length : data.filter((r) => r.status === id).length);
  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {FILTERS.map((x) => (
          <Chip key={x.id} active={f === x.id} onClick={() => setF(x.id)}>
            {x.label} <span className={f === x.id ? "text-white/75" : "text-muted"}>{count(x.id)}</span>
          </Chip>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title={f === "all" ? "No listings yet" : "Nothing here"}
          body={f === "all" ? "Create your first listing. Free ones go live as soon as they're approved." : undefined}
          action={
            f === "all" ? (
              <Button asChild size="sm">
                <Link href="/host/listings/new">New listing</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_1fr_110px_110px_100px_88px] gap-4 border-b border-line px-5 py-3 text-xs font-semibold text-muted md:grid">
            <span>Listing</span>
            <span>Booking type</span>
            <span>Sold</span>
            <span>{isOwner ? "Revenue" : ""}</span>
            <span>Status</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {rows.map((r, i) => (
              <m.li key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.02 } }} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 md:grid-cols-[minmax(0,1.6fr)_1fr_110px_110px_100px_88px] md:px-5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="truncate text-sm text-muted">{r.whenLabel}</p>
                  {r.pendingReview && <p className="mt-1 text-xs font-semibold text-warn">Edit in review · guests see the live version</p>}
                  {r.status === "rejected" && r.reviewNote && (
                    <p className="mt-1 flex items-start gap-1.5 text-sm text-danger">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {r.reviewNote} <Link href={r.editHref} className="font-semibold underline">Fix &amp; resubmit</Link>
                    </p>
                  )}
                </div>
                <span className="text-sm text-ink-2 max-md:hidden">{r.templateName}</span>
                <span className="text-sm tabular-nums max-md:hidden">{r.soldLabel}</span>
                <span className="text-sm tabular-nums max-md:hidden">{r.revenue === null ? "" : formatINR(r.revenue)}</span>
                <span className="justify-self-end md:justify-self-start">
                  <ListingStatus status={r.status} />
                </span>
                <div className="col-span-2 flex items-center gap-1 md:col-span-1 md:justify-end">
                  <span className="mr-auto text-xs text-muted md:hidden">
                    {r.soldLabel}
                    {r.revenue !== null && ` · ${formatINR(r.revenue)}`}
                  </span>
                  {r.publicHref && (
                    <Link href={r.publicHref} target="_blank" className="grid size-9 place-items-center rounded-lg hover:bg-field" aria-label={`View ${r.title} on local.`}>
                      <ExternalLink className="size-4" />
                    </Link>
                  )}
                  <Link href={r.editHref} className="grid size-9 place-items-center rounded-lg hover:bg-field" aria-label={`Edit ${r.title}`}>
                    <Pencil className="size-4" />
                  </Link>
                </div>
              </m.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
