import "server-only";
import type { Booking, BookingItem, JourneyTemplate, Listing, Resource, Slot, SlotRule, Venue } from "@/contracts";
import { repo } from "@/repositories";
import { generateSlots, validateRange } from "@/lib/slots/engine";
import { formatMins, toISO } from "@/lib/time";
import { loadInventory } from "./inventory";
import { badRequest, conflict } from "./errors";

/**
 * Turning a pick (a court range, or tickets for a date) into priced booking lines. Shared by the
 * guest checkout, host-recorded bookings, bulk bookings, extensions and moves, so every path prices
 * and validates the same way.
 */

export interface CourtPick {
  resourceId: string;
  date: string;
  startMins: number;
  endMins: number;
}

export interface SlotWindow {
  /** Treat every slot of the day as open regardless of the clock (hosts see the whole day). */
  wholeDay?: boolean;
  /** Override the public booking window (days ahead). */
  advanceDays?: number;
  /** Leave one booking's own slots out of "taken" (when moving or extending it). */
  exceptBookingId?: string;
}

export async function courtSlots(resource: Resource, rule: SlotRule, date: string, now: Date, w: SlotWindow = {}): Promise<Slot[]> {
  const [taken, blocks] = await Promise.all([repo.venues.taken([resource.id], date, w.exceptBookingId), repo.venues.blocks([resource.id])]);
  return generateSlots({
    resourceId: resource.id,
    slotLengthMins: resource.slotLengthMins,
    rule: w.advanceDays ? { ...rule, advanceDays: w.advanceDays } : rule,
    date,
    taken,
    blocks,
    now: w.wholeDay ? new Date(date + "T00:00:00+05:30") : now,
  });
}

export const sportName = async (slug: string) => (await repo.categories.list()).find((c) => c.slug === slug && c.parentId === "cat_sports")?.name ?? slug;

export const courtLabel = (resource: Resource, startMins: number, endMins: number) =>
  `${resource.name} · ${formatMins(startMins, { compact: true })} – ${formatMins(endMins, { compact: true })}`;

export interface CourtLine {
  item: BookingItem;
  subtotal: number;
  startsAt: string;
  endsAt: string;
  title: string;
  resource: Resource;
  rule: SlotRule;
}

/**
 * Validate a court range and price it from the slot rule. `ignoreMax` lets the host book longer than
 * the public maximum; closing time and availability always apply.
 */
export async function buildCourtLine(venue: Venue, pick: CourtPick, now: Date, w: SlotWindow & { ignoreMax?: boolean } = {}): Promise<CourtLine> {
  const resource = (await repo.venues.resources([venue.id])).find((r) => r.id === pick.resourceId);
  if (!resource) throw badRequest("Unknown court");
  const rule = (await repo.venues.slotRules([resource.id]))[0];
  if (!rule) throw badRequest("No courts configured");
  const slots = await courtSlots(resource, rule, pick.date, now, w);
  const v = validateRange(slots, { startMins: pick.startMins, endMins: pick.endMins }, w.ignoreMax ? { minMins: rule.minMins, maxMins: 24 * 60 } : rule);
  if (!v.ok) throw conflict(v.reason, "slot_unavailable");
  const startsAt = toISO(pick.date, pick.startMins);
  const endsAt = toISO(pick.date, pick.endMins);
  return {
    item: { ticketTypeId: null, sessionId: null, resourceId: resource.id, startsAt, endsAt, label: courtLabel(resource, pick.startMins, pick.endMins), qty: 1, unitPrice: v.price },
    subtotal: v.price,
    startsAt,
    endsAt,
    title: `${await sportName(resource.sport)} · ${resource.name}`,
    resource,
    rule,
  };
}

export interface TicketLines {
  items: BookingItem[];
  subtotal: number;
  startsAt: string;
  endsAt: string;
  session: { id: string; startsAt: string; endsAt: string; remaining: number } | null;
}

/** Validate ticket lines against inventory and per-order limits and price them. */
export async function buildTicketLines(
  listing: Listing,
  tpl: JourneyTemplate,
  req: { sessionId?: string | null; tickets?: { ticketTypeId: string; qty: number }[] },
  now: Date,
  opts: { ignoreOrderLimits?: boolean } = {},
): Promise<TicketLines> {
  if (tpl.bookingMode === "none") throw badRequest("This listing doesn't take bookings");
  const inv = (await loadInventory([listing], now)).get(listing.id)!;
  const isPassOnly = (req.tickets ?? []).length > 0 && (req.tickets ?? []).every((t) => inv.tickets.find((x) => x.id === t.ticketTypeId)?.isPass);
  const session = req.sessionId ? inv.upcoming.find((s) => s.id === req.sessionId) : inv.upcoming[0];
  if (!session && !isPassOnly) throw conflict("That date is no longer available", "session_unavailable");

  // One line per ticket type, so per-type limits can't be dodged by repeating a type.
  const merged = new Map<string, number>();
  for (const l of req.tickets ?? []) merged.set(l.ticketTypeId, (merged.get(l.ticketTypeId) ?? 0) + l.qty);
  let lines = [...merged].map(([ticketTypeId, qty]) => ({ ticketTypeId, qty }));
  if (tpl.bookingMode === "rsvp" && lines.length === 0) {
    const t = inv.tickets[0];
    if (t) lines = [{ ticketTypeId: t.id, qty: 1 }];
  }
  if (lines.length === 0) throw badRequest("Pick at least one ticket");

  const total = lines.reduce((s, l) => s + l.qty, 0);
  if (!opts.ignoreOrderLimits && total > tpl.rules.maxPerOrder) throw badRequest(`You can book up to ${tpl.rules.maxPerOrder} per order`);
  let nonPass = 0;
  const items: BookingItem[] = [];
  for (const line of lines) {
    const t = inv.tickets.find((x) => x.id === line.ticketTypeId);
    if (!t) throw badRequest("Unknown ticket type");
    if (!t.isPass && t.sessionId && t.sessionId !== session?.id) throw badRequest(`${t.name} isn't valid for that date`);
    if (!opts.ignoreOrderLimits && line.qty > t.perOrderMax) throw badRequest(`Max ${t.perOrderMax} × ${t.name} per order`);
    if (t.remaining < line.qty) throw conflict(`Only ${t.remaining} × ${t.name} left`, "sold_out");
    if (!t.isPass) nonPass += line.qty;
    const sess = t.isPass ? null : session!;
    items.push({
      ticketTypeId: t.id,
      sessionId: sess?.id ?? null,
      resourceId: null,
      startsAt: sess?.startsAt ?? inv.upcoming[0]?.startsAt ?? null,
      endsAt: sess?.endsAt ?? inv.upcoming[inv.upcoming.length - 1]?.endsAt ?? null,
      label: t.name,
      qty: line.qty,
      unitPrice: t.price,
    });
  }
  if (session && nonPass > session.remaining) throw conflict(`Only ${session.remaining} spots left for that date`, "sold_out");
  return {
    items,
    subtotal: items.reduce((s, i) => s + i.qty * i.unitPrice, 0),
    startsAt: items[0].startsAt ?? session!.startsAt,
    endsAt: items[0].endsAt ?? session!.endsAt,
    session: session ?? null,
  };
}

/** The court line of a venue booking (extras are separate lines without a resource). */
export const courtItem = (b: Booking) => b.items.find((i) => i.resourceId && i.startsAt && i.endsAt) ?? null;
export const ticketValue = (b: Booking) => Math.round((b.price.subtotal - b.price.discount) * 100) / 100;
