import { cn } from "@/lib/utils";

const LISTING: Record<string, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-free-tint text-free" },
  review: { label: "In review", cls: "bg-warn-tint text-warn" },
  draft: { label: "Draft", cls: "bg-field text-muted" },
  rejected: { label: "Rejected", cls: "bg-danger-tint text-danger" },
  ended: { label: "Ended", cls: "bg-field text-subtle" },
};
const BOOKING: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-tint text-brand-ink" },
  requested: { label: "Requested", cls: "bg-warn-tint text-warn" },
  checked_in: { label: "Checked in", cls: "bg-free-tint text-free" },
  cancelled: { label: "Cancelled", cls: "bg-field text-subtle" },
  refunded: { label: "Refunded", cls: "bg-field text-subtle" },
  no_show: { label: "No-show", cls: "bg-danger-tint text-danger" },
};

export function ListingStatus({ status }: { status: string }) {
  const s = LISTING[status] ?? LISTING.draft;
  return <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold", s.cls)}>{s.label}</span>;
}

export function BookingStatusPill({ status }: { status: string }) {
  const s = BOOKING[status] ?? { label: status, cls: "bg-field text-muted" };
  return <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold", s.cls)}>{s.label}</span>;
}

/** KPI card (wireframe 19): label, big number, green/red week-over-week trend. */
export function Kpi({
  label,
  value,
  sub,
  dark,
  lock,
  trend,
  trendSuffix = "",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  dark?: boolean;
  lock?: boolean;
  trend?: number | null;
  trendSuffix?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-2xl border p-[18px]", dark ? "border-feature bg-feature text-white" : "border-[#e6e6e1] bg-surface")}>
      <p className={cn("text-[13px]", dark ? "text-feature-muted" : "text-muted")}>
        {label}
        {lock && <span className={cn("ml-1.5 rounded px-1 py-px text-[10px] font-bold", dark ? "bg-white/10" : "bg-field")}>OWNER ONLY</span>}
      </p>
      <p className="font-display text-[28px] font-bold leading-tight">{value}</p>
      {trend !== undefined && trend !== null && (
        <p className={cn("text-xs font-semibold", trend >= 0 ? "text-free" : "text-danger")}>
          <span aria-hidden>{trend >= 0 ? "▲" : "▼"}</span>
          <span className="sr-only">{trend >= 0 ? "Up" : "Down"}</span> {Math.abs(trend)}%{trendSuffix}
        </p>
      )}
      {sub && <p className={cn("text-[13px]", dark ? "text-feature-muted" : "text-muted")}>{sub}</p>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[20px] border border-line bg-surface", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 md:px-5">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function maskPhone(p: string) {
  return p ? `+91 ${p.slice(0, 2)}XXX X${p.slice(-4)}` : "";
}
