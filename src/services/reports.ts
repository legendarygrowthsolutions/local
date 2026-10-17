import "server-only";
import type { Booking } from "@/contracts";
import { repo } from "@/repositories";
import { addDays, daysBetween, fromISO, istParts, weekdayOf } from "@/lib/time";
import { assertApproved, hostTargets, type HostContext } from "./host";

/**
 * Host reports: income, occupancy and timing patterns over a date range (by booking start date,
 * IST). Money fields are null for managers, as everywhere else in the console. Online and
 * host-recorded bookings are shown side by side so a venue sees its whole day, not just the app's.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const COUNTED: Booking["status"][] = ["confirmed", "checked_in", "requested"];
const SETTLED: Booking["status"][] = ["confirmed", "checked_in", "requested", "cancelled", "refunded"];

export type ReportRange = "7d" | "30d" | "90d" | "custom";

export interface HostReport {
  from: string;
  to: string;
  days: number;
  owner: boolean;
  summary: {
    bookings: number;
    cancelled: number;
    cancelRate: number;
    checkedIn: number;
    checkInRate: number;
    courtHours: number;
    tickets: number;
    uniqueGuests: number;
    repeatGuests: number;
    repeatRate: number;
    gross: number | null;
    onlineGross: number | null;
    offlineGross: number | null;
    refunds: number | null;
    due: number | null;
    extras: number | null;
    avgTicket: number | null;
    /** Change vs the previous period of the same length (null when nothing to compare). */
    trend: { bookings: number | null; gross: number | null };
  };
  byDay: { date: string; bookings: number; gross: number | null; online: number; host: number }[];
  byHour: { hour: number; bookings: number; share: number }[];
  byWeekday: { weekday: number; bookings: number }[];
  occupancy: { resourceId: string; name: string; sport: string; venue: string; bookedHours: number; openHours: number; pct: number; gross: number | null }[];
  byTarget: { id: string; title: string; kind: "event" | "venue"; bookings: number; gross: number | null }[];
  sources: { source: "online" | "host"; bookings: number; gross: number | null }[];
  methods: { method: string; bookings: number; gross: number | null }[];
  topGuests: { name: string; phone: string; bookings: number; lastAt: string; spend: number | null }[];
}

export function reportWindow(range: ReportRange, from: string | undefined, to: string | undefined, now = new Date()) {
  const today = istParts(now).ymd;
  if (range === "custom" && from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && to >= from && daysBetween(from, to) <= 366) return { from, to };
  const n = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  return { from: addDays(today, -(n - 1)), to: today };
}

export async function hostReport(ctx: HostContext, range: ReportRange, custom: { from?: string; to?: string; target?: string } = {}, now = new Date()): Promise<HostReport> {
  assertApproved(ctx);
  const { from, to } = reportWindow(range, custom.from, custom.to, now);
  const days = daysBetween(from, to) + 1;
  const prevFrom = addDays(from, -days);
  const prevTo = addDays(from, -1);
  const { listings, venues } = await hostTargets(ctx);
  const tl = custom.target ? listings.filter((l) => l.id === custom.target) : listings;
  const tv = custom.target ? venues.filter((v) => v.id === custom.target) : venues;
  const [all, resources, users] = await Promise.all([
    repo.bookings.listForTargets(tl.map((l) => l.id), tv.map((v) => v.id)),
    repo.venues.resources(tv.map((v) => v.id)),
    Promise.resolve(null),
  ]);
  void users;
  const rules = await repo.venues.slotRules(resources.map((r) => r.id));
  const money = (v: number) => (ctx.isOwner ? r2(v) : null);
  const inRange = (b: Booking, a: string, z: string) => {
    const d = fromISO(b.startsAt).ymd;
    return d >= a && d <= z;
  };
  const settled = all.filter((b) => SETTLED.includes(b.status) && inRange(b, from, to));
  const counted = settled.filter((b) => COUNTED.includes(b.status));
  const prev = all.filter((b) => COUNTED.includes(b.status) && inRange(b, prevFrom, prevTo));
  const refunded = await repo.payments.refundTotals(settled.filter((b) => b.status === "refunded" || b.status === "cancelled").map((b) => b.id));
  const value = (b: Booking) => b.price.subtotal - b.price.discount;
  const gross = (list: Booking[]) => list.reduce((s, b) => s + value(b), 0);
  const hours = (b: Booking) => b.items.filter((i) => i.resourceId && i.startsAt && i.endsAt).reduce((s, i) => s + (new Date(i.endsAt!).getTime() - new Date(i.startsAt!).getTime()) / 3_600_000, 0);
  const pct = (cur: number, before: number) => (before > 0 ? Math.round(((cur - before) / before) * 100) : null);

  // Guests: by phone when there is one, else by account.
  const guestKey = (b: Booking) => (b.attendee?.phone && /^[6-9]\d{9}$/.test(b.attendee.phone) ? b.attendee.phone : b.userId);
  const guests = new Map<string, { name: string; phone: string; bookings: number; lastAt: string; spend: number }>();
  for (const b of counted) {
    const k = guestKey(b);
    const g = guests.get(k) ?? { name: b.attendee?.name ?? "Guest", phone: /^[6-9]\d{9}$/.test(k) ? k : "", bookings: 0, lastAt: b.startsAt, spend: 0 };
    g.bookings++;
    g.spend = r2(g.spend + value(b));
    if (b.startsAt > g.lastAt) g.lastAt = b.startsAt;
    if (b.attendee?.name) g.name = b.attendee.name;
    guests.set(k, g);
  }
  const repeat = [...guests.values()].filter((g) => g.bookings > 1).length;

  const byDay = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const list = counted.filter((b) => fromISO(b.startsAt).ymd === date);
    return { date, bookings: list.length, gross: money(gross(list)), online: list.filter((b) => (b.source ?? "online") === "online").length, host: list.filter((b) => b.source === "host").length };
  });
  const hourCounts = new Map<number, number>();
  for (const b of counted) hourCounts.set(Math.floor(fromISO(b.startsAt).mins / 60), (hourCounts.get(Math.floor(fromISO(b.startsAt).mins / 60)) ?? 0) + 1);
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, bookings: hourCounts.get(hour) ?? 0, share: counted.length ? Math.round(((hourCounts.get(hour) ?? 0) / counted.length) * 100) : 0 })).filter((h) => h.hour >= 5);
  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({ weekday, bookings: counted.filter((b) => weekdayOf(fromISO(b.startsAt).ymd) === weekday).length }));

  // Court occupancy: booked hours over the hours the court was open in the period (today counts as a full day).
  const occupancy = resources
    .map((r) => {
      const rule = rules.find((x) => x.resourceId === r.id);
      const openPerDay = rule ? Math.max(0, rule.closeMins - rule.openMins) / 60 : 0;
      const list = counted.filter((b) => b.items.some((i) => i.resourceId === r.id));
      const bookedHours = list.reduce((s, b) => s + b.items.filter((i) => i.resourceId === r.id && i.startsAt && i.endsAt).reduce((a, i) => a + (new Date(i.endsAt!).getTime() - new Date(i.startsAt!).getTime()) / 3_600_000, 0), 0);
      const openHours = openPerDay * days;
      return { resourceId: r.id, name: r.name, sport: r.sport, venue: tv.find((v) => v.id === r.venueId)?.name ?? "", bookedHours: r2(bookedHours), openHours: r2(openHours), pct: openHours > 0 ? Math.min(100, Math.round((bookedHours / openHours) * 100)) : 0, gross: money(gross(list)) };
    })
    .sort((a, b) => b.pct - a.pct);

  const byTarget = [
    ...tv.map((v) => ({ id: v.id, title: v.name, kind: "venue" as const, list: counted.filter((b) => b.venueId === v.id) })),
    ...tl.map((l) => ({ id: l.id, title: l.title, kind: "event" as const, list: counted.filter((b) => b.listingId === l.id) })),
  ]
    .filter((t) => t.list.length)
    .map(({ list, ...t }) => ({ ...t, bookings: list.length, gross: money(gross(list)) }))
    .sort((a, b) => b.bookings - a.bookings);

  const bySource = (source: "online" | "host") => counted.filter((b) => (b.source ?? "online") === source);
  const methodOf = (b: Booking) => b.paymentMethod ?? (b.paymentRef ? "online" : b.price.total === 0 ? "free" : "online");
  const methodSet = [...new Set(counted.map(methodOf))];
  const extrasTotal = counted.reduce((s, b) => s + b.items.filter((i) => !i.resourceId && !i.ticketTypeId).reduce((a, i) => a + i.unitPrice * i.qty, 0), 0);
  const online = bySource("online");
  const host = bySource("host");

  return {
    from,
    to,
    days,
    owner: ctx.isOwner,
    summary: {
      bookings: counted.length,
      cancelled: settled.length - counted.length,
      cancelRate: settled.length ? Math.round(((settled.length - counted.length) / settled.length) * 100) : 0,
      checkedIn: counted.filter((b) => b.status === "checked_in").length,
      checkInRate: counted.length ? Math.round((counted.filter((b) => b.status === "checked_in").length / counted.filter((b) => new Date(b.endsAt).getTime() < now.getTime()).length || 0) * 100) : 0,
      courtHours: r2(counted.reduce((s, b) => s + hours(b), 0)),
      tickets: counted.filter((b) => b.kind === "listing").reduce((s, b) => s + b.items.filter((i) => i.ticketTypeId).reduce((a, i) => a + i.qty, 0), 0),
      uniqueGuests: guests.size,
      repeatGuests: repeat,
      repeatRate: guests.size ? Math.round((repeat / guests.size) * 100) : 0,
      gross: money(gross(counted)),
      onlineGross: money(gross(online)),
      offlineGross: money(gross(host)),
      refunds: money([...refunded.values()].reduce((s, v) => s + v, 0)),
      due: money(counted.reduce((s, b) => s + (b.amountDue ?? 0), 0)),
      extras: money(extrasTotal),
      avgTicket: counted.length ? money(gross(counted) / counted.length) : money(0),
      trend: { bookings: pct(counted.length, prev.length), gross: ctx.isOwner ? pct(gross(counted), gross(prev)) : null },
    },
    byDay,
    byHour,
    byWeekday,
    occupancy,
    byTarget,
    sources: (["online", "host"] as const).map((source) => ({ source, bookings: bySource(source).length, gross: money(gross(bySource(source))) })),
    methods: methodSet.map((method) => ({ method, bookings: counted.filter((b) => methodOf(b) === method).length, gross: money(gross(counted.filter((b) => methodOf(b) === method))) })).sort((a, b) => b.bookings - a.bookings),
    topGuests: [...guests.values()]
      .sort((a, b) => b.bookings - a.bookings || b.spend - a.spend)
      .slice(0, 10)
      .map((g) => ({ ...g, phone: g.phone ? `${g.phone.slice(0, 2)}XXXXX${g.phone.slice(-3)}` : "", spend: money(g.spend) })),
  };
}

/** CSV of the report's bookings, one row per booking. */
export async function hostReportCsv(ctx: HostContext, range: ReportRange, custom: { from?: string; to?: string; target?: string } = {}, now = new Date()) {
  assertApproved(ctx);
  const { from, to } = reportWindow(range, custom.from, custom.to, now);
  const { listings, venues } = await hostTargets(ctx);
  const all = (await repo.bookings.listForTargets(listings.map((l) => l.id), venues.map((v) => v.id))).filter((b) => {
    const d = fromISO(b.startsAt).ymd;
    return SETTLED.includes(b.status) && d >= from && d <= to && (!custom.target || b.listingId === custom.target || b.venueId === custom.target);
  });
  const head = ["Code", "Starts", "Ends", "Listing", "Items", "Guest", "Phone", "Status", "Source", "Payment", ...(ctx.isOwner ? ["Ticket value", "Amount due"] : [])];
  const rows = all
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((b) => [
      b.code,
      b.startsAt,
      b.endsAt,
      b.title,
      b.items.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ""}${i.label}`).join("; "),
      b.attendee?.name ?? "",
      b.attendee?.phone ?? "",
      b.status,
      b.source ?? "online",
      b.paymentMethod ?? (b.paymentRef ? "online" : ""),
      ...(ctx.isOwner ? [String(r2(b.price.subtotal - b.price.discount)), String(b.amountDue ?? 0)] : []),
    ]);
  return [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
