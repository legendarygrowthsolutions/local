import "server-only";
import type { Booking, PayoutAccount, PayoutAccountInput, PayoutInput, User } from "@/contracts";
import { repo } from "@/repositories";
import type { PayoutRecord } from "@/repositories/types";
import { newId } from "@/lib/crypto";
import { addDays, formatDate, istParts } from "@/lib/time";
import { badRequest, conflict, notFound } from "./errors";
import { assertOwner, type HostContext } from "./host";

/**
 * Host payouts are paid by hand (bank transfer, UPI or cheque) once a week, and every payment is
 * recorded here with its reference, so the statement, the money sent and the proof stay together.
 *
 * Cycle: bookings made Monday to Sunday (IST), paid out the following Wednesday.
 * Statement per booking: the host earns the ticket value (`subtotal`). Coupons are funded by the
 * platform and the convenience fee is the platform's, so neither touches the host's share.
 * Refunds take back the same fraction of the ticket value as the guest got back.
 */

const PAID_STATUSES: Booking["status"][] = ["confirmed", "checked_in", "cancelled", "refunded"];
const r2 = (n: number) => Math.round(n * 100) / 100;

export const METHOD_LABEL: Record<PayoutRecord["method"], string> = { bank_transfer: "Bank transfer", upi: "UPI", cheque: "Cheque", other: "Other" };

/** Monday of the week that `ymd` falls in. */
export function cycleStart(ymd: string) {
  const wd = new Date(ymd + "T00:00:00Z").getUTCDay();
  return addDays(ymd, -((wd + 6) % 7));
}
export const cycleEnd = (from: string) => addDays(from, 6);
export const payoutDue = (from: string) => addDays(from, 9);
export const cycleLabel = (from: string) => `${formatDate(from).split(", ")[1]} to ${formatDate(cycleEnd(from)).split(", ")[1]}`;

export interface CycleStatement {
  hostId: string;
  from: string;
  to: string;
  bookings: number;
  gross: number;
  refunds: number;
  net: number;
  bookingIds: string[];
}

/** What each host earned per weekly cycle, for bookings made from `fromYmd` up to today. */
async function statements(hostIds: string[] | null, fromYmd: string, now: Date) {
  const [listings, venues] = await Promise.all([repo.listings.listAll(), repo.venues.listAll()]);
  const hostOf = new Map<string, string>([...listings.map((l) => [l.id, l.hostId] as const), ...venues.map((v) => [v.id, v.hostId] as const)]);
  const wanted = hostIds ? new Set(hostIds) : null;
  const since = new Date(Date.parse(`${fromYmd}T00:00:00+05:30`)).toISOString();
  const bookings = (await repo.bookings.listCreatedSince(since)).filter((b) => {
    const h = hostOf.get(b.listingId ?? b.venueId ?? "");
    return h && (!wanted || wanted.has(h)) && b.paymentRef && b.price.total > 0 && PAID_STATUSES.includes(b.status) && new Date(b.createdAt) <= now;
  });
  const refunded = await repo.payments.refundTotals(bookings.filter((b) => b.status === "refunded" || b.status === "cancelled").map((b) => b.id));
  const out = new Map<string, CycleStatement>();
  for (const b of bookings) {
    const hostId = hostOf.get(b.listingId ?? b.venueId ?? "")!;
    const from = cycleStart(istParts(new Date(b.createdAt)).ymd);
    const key = `${hostId}:${from}`;
    const s = out.get(key) ?? { hostId, from, to: cycleEnd(from), bookings: 0, gross: 0, refunds: 0, net: 0, bookingIds: [] };
    const ticket = b.price.subtotal;
    const paidForTickets = b.price.subtotal - b.price.discount;
    const back = refunded.get(b.id) ?? 0;
    const share = back <= 0 ? 0 : paidForTickets > 0 ? Math.min(1, back / paidForTickets) : 1;
    s.bookings++;
    s.gross = r2(s.gross + ticket);
    s.refunds = r2(s.refunds + ticket * share);
    s.net = r2(s.gross - s.refunds);
    s.bookingIds.push(b.id);
    out.set(key, s);
  }
  return out;
}

export function maskAccount(a: PayoutAccount | null) {
  if (!a) return null;
  if (a.method === "upi") return `UPI ${a.upiId}`;
  return `${a.bankName} ···· ${(a.accountNumber ?? "").slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Host side
// ---------------------------------------------------------------------------

export async function hostPayouts(ctx: HostContext, now = new Date()) {
  assertOwner(ctx);
  const today = istParts(now).ymd;
  const thisCycle = cycleStart(today);
  const weeks = 8;
  const firstCycle = addDays(thisCycle, -7 * (weeks - 1));
  const [stmts, records, account] = await Promise.all([
    statements([ctx.host.id], firstCycle, now),
    repo.payouts.list({ hostId: ctx.host.id }),
    repo.payoutAccounts.get(ctx.host.id),
  ]);
  const paid = records.filter((p) => !p.voidedAt);
  const cycles = Array.from({ length: weeks }, (_, i) => {
    const from = addDays(thisCycle, -7 * i);
    const s = stmts.get(`${ctx.host.id}:${from}`);
    const rec = paid.find((p) => p.cycleFrom === from) ?? null;
    const net = s?.net ?? 0;
    const status = rec ? ("paid" as const) : from === thisCycle ? ("accruing" as const) : net > 0 ? ("due" as const) : ("nothing" as const);
    return {
      id: `cy_${from}`,
      from,
      to: cycleEnd(from),
      label: cycleLabel(from),
      bookings: s?.bookings ?? 0,
      gross: s?.gross ?? 0,
      refunds: s?.refunds ?? 0,
      net,
      payoutDate: payoutDue(from),
      status,
      paid: rec && { amount: rec.amount, deductions: rec.deductions, adjustment: rec.adjustment, reference: rec.reference, paidOn: rec.paidOn, method: METHOD_LABEL[rec.method], paidTo: rec.paidTo },
    };
  });
  // What's owed now: every finished week not yet paid (oldest due date first), else this week so far.
  const dueCycles = cycles.filter((c) => c.status === "due");
  const accruing = cycles.find((c) => c.status === "accruing")!;
  const next = dueCycles.length
    ? { net: r2(dueCycles.reduce((s, c) => s + c.net, 0)), payoutDate: dueCycles[dueCycles.length - 1].payoutDate, label: dueCycles.length === 1 ? dueCycles[0].label : `${dueCycles.length} weeks` }
    : accruing;
  return {
    account: account && { ...account, accountNumber: account.accountNumber ? `···· ${account.accountNumber.slice(-4)}` : null, label: maskAccount(account)! },
    kycStatus: ctx.host.kycStatus,
    next: next && next.net > 0 ? { amount: next.net, date: next.payoutDate, label: next.label } : null,
    cycles,
    totalPaid: r2(paid.reduce((s, p) => s + p.amount, 0)),
    history: paid.map((p) => ({ id: p.id, label: cycleLabel(p.cycleFrom), amount: p.amount, reference: p.reference, paidOn: p.paidOn, method: METHOD_LABEL[p.method] })),
  };
}

/** The host's own payout account, with the account number masked. */
export async function getPayoutAccount(ctx: HostContext) {
  assertOwner(ctx);
  const a = await repo.payoutAccounts.get(ctx.host.id);
  return a && { ...a, accountNumber: a.accountNumber ? `···· ${a.accountNumber.slice(-4)}` : null };
}

export async function savePayoutAccount(ctx: HostContext, input: PayoutAccountInput, now = new Date()) {
  assertOwner(ctx);
  const bank = input.method === "bank";
  await repo.payoutAccounts.upsert(
    ctx.host.id,
    {
      method: input.method,
      holderName: input.holderName,
      accountNumber: bank ? input.accountNumber! : null,
      ifsc: bank ? input.ifsc! : null,
      bankName: bank ? input.bankName! : null,
      upiId: bank ? null : input.upiId!,
      updatedAt: now.toISOString(),
    },
    ctx.user.id,
  );
  return getPayoutAccount(ctx);
}

// ---------------------------------------------------------------------------
// Superadmin side
// ---------------------------------------------------------------------------

/** Unpaid cycles this far back are listed as due. Older ones need a payout recorded by hand anyway. */
const LOOKBACK_WEEKS = 12;

export async function adminPayouts(now = new Date()) {
  const today = istParts(now).ymd;
  const thisCycle = cycleStart(today);
  const firstCycle = addDays(thisCycle, -7 * LOOKBACK_WEEKS);
  const [hosts, cities, templates, stmts, records] = await Promise.all([
    repo.hosts.list(),
    repo.cities.listAll(),
    repo.templates.list(),
    statements(null, firstCycle, now),
    repo.payouts.list(),
  ]);
  const staffIds = [...new Set(records.flatMap((p) => [p.recordedBy, p.voidedBy]).filter((x): x is string => !!x))];
  const users = (await Promise.all(staffIds.map((id) => repo.users.byId(id)))).filter((u): u is User => !!u);
  const accounts = await repo.payoutAccounts.list(hosts.map((h) => h.id));
  const hostName = (id: string) => hosts.find((h) => h.id === id)?.brandName ?? "Unknown host";
  const recorded = new Set(records.filter((p) => !p.voidedAt).map((p) => `${p.hostId}:${p.cycleFrom}`));

  const due = [...stmts.values()]
    .filter((s) => s.from < thisCycle && s.net > 0 && !recorded.has(`${s.hostId}:${s.from}`))
    .map((s) => {
      const h = hosts.find((x) => x.id === s.hostId);
      const a = accounts.get(s.hostId) ?? null;
      return {
        key: `${s.hostId}:${s.from}`,
        hostId: s.hostId,
        brandName: h?.brandName ?? "Unknown host",
        city: cities.find((c) => c.id === h?.cityId)?.name ?? "",
        kycStatus: h?.kycStatus ?? "none",
        gstin: h?.gstin ?? null,
        account: a,
        cycleFrom: s.from,
        label: cycleLabel(s.from),
        dueOn: payoutDue(s.from),
        overdue: payoutDue(s.from) < today,
        bookings: s.bookings,
        gross: s.gross,
        refunds: s.refunds,
        net: s.net,
      };
    })
    .sort((a, b) => a.cycleFrom.localeCompare(b.cycleFrom) || a.brandName.localeCompare(b.brandName));

  const current = [...stmts.values()].filter((s) => s.from === thisCycle);
  // Platform side of the same bookings: fees collected and coupon discounts the platform funded.
  const sinceIso = new Date(Date.parse(`${thisCycle}T00:00:00+05:30`)).toISOString();
  const cycleBookings = (await repo.bookings.listCreatedSince(sinceIso)).filter((b) => b.paymentRef && PAID_STATUSES.includes(b.status));
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Superadmin";

  return {
    current: {
      label: cycleLabel(thisCycle),
      dueOn: payoutDue(thisCycle),
      net: r2(current.reduce((s, x) => s + x.net, 0)),
      fees: r2(cycleBookings.reduce((s, b) => s + b.price.convenienceFee + b.price.gstOnFee, 0)),
      couponCost: r2(cycleBookings.reduce((s, b) => s + b.price.discount, 0)),
    },
    dueTotal: r2(due.reduce((s, d) => s + d.net, 0)),
    due,
    history: records.map((p) => ({
      ...p,
      brandName: hostName(p.hostId),
      label: cycleLabel(p.cycleFrom),
      methodLabel: METHOD_LABEL[p.method],
      recordedByName: userName(p.recordedBy),
      voidedByName: p.voidedBy ? userName(p.voidedBy) : null,
    })),
    fees: templates.map((t) => ({ id: t.id, name: t.name, pricing: t.pricing, ...t.fees })),
  };
}

export async function recordPayout(admin: User, input: PayoutInput, now = new Date()) {
  const today = istParts(now).ymd;
  const host = await repo.hosts.byId(input.hostId);
  if (!host) throw notFound("Host not found");
  if (cycleStart(input.cycleFrom) !== input.cycleFrom) throw badRequest("A payout cycle starts on a Monday");
  if (cycleEnd(input.cycleFrom) >= today) throw badRequest("This cycle hasn't ended yet");
  if (input.paidOn > today) throw badRequest("The payment date can't be in the future");
  const existing = (await repo.payouts.list({ hostId: host.id })).find((p) => p.cycleFrom === input.cycleFrom && !p.voidedAt);
  if (existing) throw conflict(`A payout for this week is already recorded (${existing.reference}). Void it first to correct it.`, "payout_exists");
  const s = (await statements([host.id], input.cycleFrom, now)).get(`${host.id}:${input.cycleFrom}`);
  const net = s?.net ?? 0;
  const amount = r2(net - input.deductions + input.adjustment);
  if (amount <= 0) throw badRequest("The amount paid has to be more than zero");
  const account = await repo.payoutAccounts.get(host.id);
  if ((input.method === "bank_transfer" || input.method === "upi") && !account) throw badRequest(`${host.brandName} hasn't added payout details yet`);
  const record: PayoutRecord = {
    id: newId("po"),
    hostId: host.id,
    cycleFrom: input.cycleFrom,
    cycleTo: cycleEnd(input.cycleFrom),
    bookings: s?.bookings ?? 0,
    gross: s?.gross ?? 0,
    refunds: s?.refunds ?? 0,
    deductions: r2(input.deductions),
    adjustment: r2(input.adjustment),
    amount,
    method: input.method,
    reference: input.reference.toUpperCase(),
    paidOn: input.paidOn,
    paidTo: maskAccount(account) ?? METHOD_LABEL[input.method],
    notes: input.notes || null,
    recordedBy: admin.id,
    createdAt: now.toISOString(),
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };
  await repo.payouts.insert(record);
  return record;
}

/** Records are never deleted. A wrong one is voided with a reason, and the week shows as due again. */
export async function voidPayout(admin: User, id: string, reason: string, now = new Date()) {
  const p = await repo.payouts.byId(id);
  if (!p) throw notFound("Payout not found");
  if (p.voidedAt) throw conflict("This payout is already voided");
  await repo.payouts.void(id, admin.id, reason, now.toISOString());
  return repo.payouts.byId(id);
}

// ---------------------------------------------------------------------------
// CSV exports (for accounts and audit)
// ---------------------------------------------------------------------------

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas, and quote anything with separators.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

export async function payoutsCsv(hostId?: string) {
  const [records, hosts] = await Promise.all([repo.payouts.list(hostId ? { hostId } : {}), repo.hosts.list()]);
  const rows: unknown[][] = [
    ["Payout ID", "Host", "GSTIN", "Week from", "Week to", "Bookings", "Ticket sales", "Refunds", "Deductions", "Adjustment", "Amount paid", "Method", "Reference", "Paid on", "Paid to", "Notes", "Recorded at", "Status", "Void reason"],
  ];
  for (const p of records) {
    const h = hosts.find((x) => x.id === p.hostId);
    rows.push([
      p.id, h?.brandName ?? p.hostId, h?.gstin ?? "", p.cycleFrom, p.cycleTo, p.bookings, p.gross.toFixed(2), p.refunds.toFixed(2), p.deductions.toFixed(2),
      p.adjustment.toFixed(2), p.amount.toFixed(2), METHOD_LABEL[p.method], p.reference, p.paidOn, p.paidTo, p.notes ?? "", p.createdAt, p.voidedAt ? "Voided" : "Paid", p.voidReason ?? "",
    ]);
  }
  return toCsv(rows);
}

/** Every booking behind one host's week, for reconciling a payout line by line. */
export async function cycleBookingsCsv(hostId: string, cycleFrom: string, now = new Date()) {
  if (cycleStart(cycleFrom) !== cycleFrom) throw badRequest("A payout cycle starts on a Monday");
  const s = (await statements([hostId], cycleFrom, now)).get(`${hostId}:${cycleFrom}`);
  const rows: unknown[][] = [["Booking code", "Booked at", "Title", "Status", "Ticket value", "Coupon", "Discount (platform)", "Refunded to guest"]];
  if (s) {
    const refunds = await repo.payments.refundTotals(s.bookingIds);
    for (const id of s.bookingIds) {
      const b = (await repo.bookings.byId(id))!;
      rows.push([b.code, b.createdAt, b.title, b.status, b.price.subtotal.toFixed(2), b.couponCode ?? "", b.price.discount.toFixed(2), (refunds.get(id) ?? 0).toFixed(2)]);
    }
  }
  return toCsv(rows);
}
