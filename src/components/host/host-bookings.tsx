"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { useCheckIn, useHostBookings } from "@/lib/api/host-hooks";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatINR } from "@/lib/pricing";
import { formatRange } from "@/lib/time";
import { cn } from "@/lib/utils";
import { BookingStatusPill, maskPhone } from "./bits";

const WHEN = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
];

export function HostBookings({ isOwner }: { isOwner: boolean }) {
  const sp = useSearchParams();
  const [when, setWhen] = useState(sp.get("when") ?? "upcoming");
  const [target, setTarget] = useState(sp.get("target") ?? "");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(t);
  }, [qInput]);
  const { data, error, isPending, isFetching, refetch } = useHostBookings({ when, target: target || undefined, q: q || undefined });
  const checkIn = useCheckIn();

  const exportCsv = () => {
    if (!data) return;
    const head = ["Code", "Name", "Phone", "Listing", "Items", "Starts", "Status", ...(isOwner ? ["Amount"] : [])];
    const lines = data.items.map((b) => [b.code, b.customer, b.phone, b.title, b.label, b.startsAt, b.status, ...(isOwner ? [String(b.amount ?? "")] : [])]);
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `bookings-${when}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {WHEN.map((w) => (
          <Chip key={w.id} active={when === w.id} onClick={() => setWhen(w.id)}>
            {w.label}
          </Chip>
        ))}
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-10 max-w-64 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold outline-none" aria-label="Filter by listing">
          <option value="">All listings</option>
          {data?.targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <label className="relative ml-auto min-w-48 flex-1 md:max-w-xs md:flex-none">
          <span className="sr-only">Search bookings</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Name, phone or code" className="h-10 w-full rounded-full border border-line-strong bg-surface pl-10 pr-4 text-sm outline-none focus:border-brand" />
        </label>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data?.items.length} className="h-10 rounded-full">
          <Download className="size-4" /> CSV
        </Button>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {data ? `${data.total} bookings${data.total > data.items.length ? ` · showing first ${data.items.length}` : ""}` : " "}
        {isFetching && !isPending ? " · updating" : ""}
      </p>
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !data.items.length ? (
        <EmptyState title="No bookings here" body={when === "today" ? "Nobody's booked for today yet." : "Try another filter."} />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-line bg-surface">
          <ul className="divide-y divide-line">
            {data.items.map((b) => (
              <li key={b.id} className={cn("grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_140px_90px_110px_120px] md:px-5")}>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.customer}</p>
                  <p className="truncate text-xs text-muted">
                    {maskPhone(b.phone)} · <span className="font-mono">{b.code}</span>
                  </p>
                </div>
                <div className="min-w-0 max-md:col-span-2 max-md:row-start-2">
                  <p className="truncate text-sm">{b.title}</p>
                  <p className="truncate text-xs text-muted">{b.label}</p>
                </div>
                <span className="text-sm max-md:hidden">
                  {b.whenLabel.split(" · ")[0]}
                  <span className="block text-xs text-muted">{formatRange(b.startsAt, b.endsAt)}</span>
                </span>
                <span className="text-sm tabular-nums max-md:hidden">{isOwner && b.amount !== null ? formatINR(b.amount) : `${b.qty}×`}</span>
                <span className="justify-self-end md:justify-self-start">
                  <BookingStatusPill status={b.status} />
                </span>
                <span className="max-md:col-span-2 md:justify-self-end">
                  {b.status === "confirmed" && when !== "past" ? (
                    <Button
                      size="sm"
                      variant="soft"
                      loading={checkIn.isPending && checkIn.variables === b.code}
                      onClick={() =>
                        checkIn.mutate(b.code, {
                          onSuccess: (r) => (r.result === "ok" ? toast.success(`${b.customer} checked in`) : toast(r.message)),
                          onError: (e) => toast.error(e.message),
                        })
                      }
                    >
                      Check in
                    </Button>
                  ) : (
                    <span className="text-xs text-muted max-md:hidden">{b.qty} {b.kind === "venue" ? "court" : "×"}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
