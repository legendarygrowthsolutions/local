"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useHostBookings, useHostReport } from "@/lib/api/host-hooks";
import type { HostReport, ReportRange } from "@/services/reports";
import { Chip } from "@/components/ui/chip";
import { Kpi, Panel } from "@/components/host/bits";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatINR } from "@/lib/pricing";
import { dateStripParts, formatDate, formatMins, todayIST } from "@/lib/time";
import { qs } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { inputCls } from "./ops-ui";

const RANGES: [ReportRange, string][] = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["custom", "Custom"]];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const inr = (v: number | null, free = "") => (v === null ? "" : formatINR(v, { free }));

/**
 * One hue (brand teal) for magnitude, a neutral for the second series, text in ink tokens: the
 * bars carry the numbers, the tables beneath carry the exact values.
 */
export function HostReports({ isOwner }: { isOwner: boolean }) {
  const [range, setRange] = useState<ReportRange>("30d");
  const [from, setFrom] = useState(todayIST().slice(0, 8) + "01");
  const [to, setTo] = useState(todayIST());
  const [target, setTarget] = useState("");
  const params = { range, from: range === "custom" ? from : undefined, to: range === "custom" ? to : undefined, target: target || undefined };
  const { data: r, error, isPending, isFetching, refetch } = useHostReport(params);
  const { data: targets } = useHostBookings({ when: "upcoming" });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map(([id, label]) => (
          <Chip key={id} active={range === id} onClick={() => setRange(id)}>
            {label}
          </Chip>
        ))}
        {range === "custom" && (
          <span className="flex items-center gap-2">
            <input type="date" aria-label="From" className={`${inputCls} h-10 w-40 text-sm`} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-sm text-muted">to</span>
            <input type="date" aria-label="To" className={`${inputCls} h-10 w-40 text-sm`} value={to} min={from} max={todayIST()} onChange={(e) => setTo(e.target.value)} />
          </span>
        )}
        <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-10 max-w-64 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold outline-none" aria-label="Filter by listing">
          <option value="">All listings</option>
          {targets?.targets.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a CSV download, not a page */}
        <a download href={`/api/host/reports/export${qs(params)}`} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold hover:border-ink/30">
          <Download className="size-4" /> CSV
        </a>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending || !r ? (
        <Skeleton className="h-[520px] rounded-[20px]" />
      ) : (
        <div className={cn("flex flex-col gap-5", isFetching && "opacity-70")}>
          <p className="text-sm text-muted">
            {formatDate(r.from, true)} to {formatDate(r.to, true)} · {r.days} days
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Bookings" value={r.summary.bookings} trend={r.summary.trend.bookings} trendSuffix=" vs previous period" />
            {isOwner ? <Kpi dark label="Ticket value" value={inr(r.summary.gross, "₹0")} trend={r.summary.trend.gross} sub={`${inr(r.summary.onlineGross, "₹0")} online · ${inr(r.summary.offlineGross, "₹0")} at the venue`} /> : <Kpi label="Court hours" value={r.summary.courtHours} />}
            <Kpi label="Guests" value={r.summary.uniqueGuests} sub={`${r.summary.repeatRate}% came back (${r.summary.repeatGuests})`} />
            <Kpi label="Cancelled" value={`${r.summary.cancelRate}%`} sub={`${r.summary.cancelled} of ${r.summary.bookings + r.summary.cancelled}${isOwner && r.summary.refunds ? ` · ${inr(r.summary.refunds)} refunded` : ""}${r.summary.noShows ? ` · ${r.summary.noShows} no-show${r.summary.noShows === 1 ? "" : "s"}` : ""}`} />
          </div>
          {isOwner && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Court hours" value={r.summary.courtHours} sub={r.summary.tickets ? `${r.summary.tickets} tickets` : undefined} />
              <Kpi label="Average per booking" value={inr(r.summary.avgTicket, "₹0")} />
              <Kpi label="Extras sold" value={inr(r.summary.extras, "₹0")} sub="Rentals, lights, coaching" />
              <Kpi label="Still due at the venue" value={inr(r.summary.due, "₹0")} sub={r.summary.due ? `Pay-later, added charges${r.summary.payAtVenueDue ? ` and ${inr(r.summary.payAtVenueDue)} cash at venue` : ""}` : "All collected"} />
            </div>
          )}

          <Panel title="Bookings by day">
            <Bars rows={r.byDay.map((d) => ({ key: d.date, label: dateStripParts(d.date).day, title: `${formatDate(d.date)}: ${d.bookings} bookings${d.gross !== null ? `, ${formatINR(d.gross)}` : ""} (${d.online} online, ${d.host} at the venue)`, a: d.online, b: d.host }))} legend={["Online", "At the venue"]} dense={r.days > 31} />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Popular timings">
              {r.summary.bookings ? <Bars rows={r.byHour.map((h) => ({ key: String(h.hour), label: formatMins(h.hour * 60, { compact: true }).replace(" ", ""), title: `${formatMins(h.hour * 60, { compact: true })}: ${h.bookings} bookings (${h.share}%)`, a: h.bookings }))} dense /> : <EmptyState title="No bookings in this period" />}
            </Panel>
            <Panel title="By weekday">
              <Bars rows={r.byWeekday.map((w) => ({ key: String(w.weekday), label: WD[w.weekday], title: `${WD[w.weekday]}: ${w.bookings} bookings`, a: w.bookings }))} />
            </Panel>
          </div>

          {r.occupancy.length > 0 && (
            <Panel title="Court occupancy">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-muted">
                    <th className="px-4 py-2.5 md:px-5">Court</th>
                    <th className="px-2 py-2.5">Booked</th>
                    <th className="w-[40%] px-2 py-2.5">Occupancy</th>
                    {isOwner && <th className="px-4 py-2.5 text-right md:px-5">Value</th>}
                  </tr>
                </thead>
                <tbody>
                  {r.occupancy.map((o) => (
                    <tr key={o.resourceId} className="border-t border-line">
                      <td className="px-4 py-2.5 md:px-5">
                        <b>{o.name}</b> <span className="text-xs text-muted">{o.sport.replace("-", " ")}{o.venue ? ` · ${o.venue}` : ""}</span>
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">{o.bookedHours} / {o.openHours} h</td>
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-field" aria-hidden>
                            <span className="block h-full rounded-full bg-brand" style={{ width: `${o.pct}%` }} />
                          </span>
                          <span className="w-10 text-right text-xs font-semibold tabular-nums">{o.pct}%</span>
                        </span>
                      </td>
                      {isOwner && <td className="px-4 py-2.5 text-right tabular-nums md:px-5">{inr(o.gross, "₹0")}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Where bookings come from">
              <SimpleTable rows={[...r.sources.map((s) => ({ k: s.source === "online" ? "Booked online" : "Recorded at the venue", n: s.bookings, v: s.gross })), ...r.methods.map((m) => ({ k: `  ${({ online: "Online", cash: "Cash", upi: "UPI", card: "Card", pay_later: "Pay later", complimentary: "Complimentary", free: "Free" } as Record<string, string>)[m.method] ?? m.method}`, n: m.bookings, v: m.gross }))]} isOwner={isOwner} />
            </Panel>
            <Panel title="Top guests">
              {r.topGuests.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {r.topGuests.map((g, i) => (
                      <tr key={i} className="border-t border-line first:border-0">
                        <td className="px-4 py-2.5 md:px-5">
                          <b>{g.name}</b> <span className="text-xs text-muted">{g.phone}</span>
                        </td>
                        <td className="px-2 py-2.5 tabular-nums">{g.bookings}×</td>
                        <td className="px-2 py-2.5 text-xs text-muted">last {formatDate(g.lastAt.slice(0, 10))}</td>
                        {isOwner && <td className="px-4 py-2.5 text-right tabular-nums md:px-5">{inr(g.spend)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No guests yet" />
              )}
            </Panel>
          </div>
          {r.byTarget.length > 1 && (
            <Panel title="By listing">
              <SimpleTable rows={r.byTarget.map((t) => ({ k: t.title, n: t.bookings, v: t.gross }))} isOwner={isOwner} />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function SimpleTable({ rows, isOwner }: { rows: { k: string; n: number; v: number | null }[]; isOwner: boolean }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((x, i) => (
          <tr key={i} className="border-t border-line first:border-0">
            <td className={cn("px-4 py-2.5 md:px-5", x.k.startsWith("  ") && "pl-8 text-muted md:pl-9")}>{x.k.trim()}</td>
            <td className="px-2 py-2.5 text-right tabular-nums">{x.n}</td>
            {isOwner && <td className="px-4 py-2.5 text-right tabular-nums md:px-5">{inr(x.v, "₹0")}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Thin vertical bars with a hover tooltip (native title) and the exact values in a table below. */
function Bars({ rows, legend, dense }: { rows: { key: string; label: string; title: string; a: number; b?: number }[]; legend?: [string, string]; dense?: boolean }) {
  const max = Math.max(1, ...rows.map((x) => x.a + (x.b ?? 0)));
  const total = rows.reduce((s, x) => s + x.a + (x.b ?? 0), 0);
  if (!total) return <EmptyState title="Nothing in this period" />;
  return (
    <div className="flex flex-col gap-3 px-4 py-4 md:px-5">
      {legend && (
        <ul className="flex gap-4 text-xs text-muted">
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" aria-hidden /> {legend[0]}</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#9AA7A5]" aria-hidden /> {legend[1]}</li>
        </ul>
      )}
      <ol className="flex h-36 items-end gap-[3px]" aria-label="Bar chart">
        {rows.map((x) => {
          const hA = ((x.a / max) * 100).toFixed(1);
          const hB = (((x.b ?? 0) / max) * 100).toFixed(1);
          return (
            <li key={x.key} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={x.title}>
              {!!x.b && <span className="block w-full rounded-t-[3px] bg-[#9AA7A5] group-hover:bg-[#7E8C8A]" style={{ height: `${hB}%` }} />}
              <span className={cn("block w-full bg-brand group-hover:bg-brand-hover", x.b ? "mt-[2px]" : "rounded-t-[3px]")} style={{ height: `${hA}%`, minHeight: x.a ? 2 : 0 }} />
            </li>
          );
        })}
      </ol>
      <ol className="flex gap-[3px] text-[10px] text-muted" aria-hidden>
        {rows.map((x, i) => (
          <li key={x.key} className="min-w-0 flex-1 truncate text-center tabular-nums">{dense && i % Math.ceil(rows.length / 12) !== 0 ? "" : x.label}</li>
        ))}
      </ol>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Values</summary>
        <table className="mt-2 w-full">
          <tbody>
            {rows.filter((x) => x.a + (x.b ?? 0) > 0).map((x) => (
              <tr key={x.key}>
                <td className="py-0.5">{x.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
