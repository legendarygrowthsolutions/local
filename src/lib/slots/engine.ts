import type { Block, Slot, SlotRule, SlotStatus } from "@/contracts";
import { addDays, daysBetween, fromISO, istParts, toISO, weekdayOf } from "@/lib/time";

export interface TakenRange {
  resourceId: string;
  date: string;
  startMins: number;
  endMins: number;
  kind: "booked" | "held";
}

export interface GenerateSlotsInput {
  resourceId: string;
  slotLengthMins: number;
  rule: SlotRule;
  date: string; // YYYY-MM-DD (IST)
  taken: TakenRange[];
  blocks: Block[];
  now?: Date;
}

export function isPeak(rule: SlotRule, date: string, startMins: number) {
  const wd = weekdayOf(date);
  return rule.peak.some((p) => p.days.includes(wd) && startMins >= p.fromMins && startMins < p.toMins);
}

/** Price for a single slot, pro-rated from the hourly rate. */
export function slotPrice(rule: SlotRule, date: string, startMins: number, lengthMins: number) {
  const hourly = isPeak(rule, date, startMins) ? rule.pricePeak : rule.priceBase;
  return Math.round((hourly * lengthMins) / 60);
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Bookable window for a resource: today .. today + advanceDays - 1 */
export function bookableDates(rule: SlotRule, now: Date = new Date()) {
  const today = istParts(now).ymd;
  return Array.from({ length: rule.advanceDays }, (_, i) => addDays(today, i));
}

export function generateSlots({ resourceId, slotLengthMins, rule, date, taken, blocks, now = new Date() }: GenerateSlotsInput): Slot[] {
  const step = slotLengthMins + rule.bufferMins;
  const nowParts = istParts(now);
  const dayDiff = daysBetween(nowParts.ymd, date);
  const slots: Slot[] = [];

  const blockRanges = blocks
    .filter((b) => b.resourceId === resourceId)
    .map((b) => {
      const s = fromISO(b.startsAt);
      const e = fromISO(b.endsAt);
      if (s.ymd !== date && e.ymd !== date) return null;
      return { start: s.ymd === date ? s.mins : 0, end: e.ymd === date ? e.mins : 1440 };
    })
    .filter((x): x is { start: number; end: number } => x !== null);

  const takenToday = taken.filter((t) => t.resourceId === resourceId && t.date === date);

  for (let start = rule.openMins; start + slotLengthMins <= rule.closeMins; start += step) {
    const end = start + slotLengthMins;
    let status: SlotStatus = "available";
    if (dayDiff < 0 || dayDiff >= rule.advanceDays || (dayDiff === 0 && start <= nowParts.mins)) status = "past";
    else if (blockRanges.some((b) => overlaps(start, end, b.start, b.end))) status = "blocked";
    else {
      const hit = takenToday.find((t) => overlaps(start, end, t.startMins, t.endMins));
      if (hit) status = hit.kind;
    }
    slots.push({
      startMins: start,
      endMins: end,
      startsAt: toISO(date, start),
      price: slotPrice(rule, date, start, slotLengthMins),
      peak: isPeak(rule, date, start),
      status,
    });
  }
  return slots;
}

export interface SlotSelection {
  startMins: number;
  endMins: number;
}

/**
 * Tap-to-extend selection: tapping a slot starts a new selection; tapping a later
 * slot extends it if every slot in between is available and the total stays within maxMins.
 * Tapping inside the current selection shrinks it to end at that slot (or clears it if it's the first).
 */
export function nextSelection(
  slots: Slot[],
  current: SlotSelection | null,
  tapped: Slot,
  rule: Pick<SlotRule, "maxMins" | "minMins">,
): SlotSelection | null {
  if (tapped.status !== "available") return current;
  if (!current) return { startMins: tapped.startMins, endMins: tapped.endMins };

  if (tapped.startMins >= current.startMins && tapped.startMins < current.endMins) {
    if (tapped.startMins === current.startMins) {
      return current.endMins === tapped.endMins ? null : { startMins: tapped.startMins, endMins: tapped.endMins };
    }
    return { startMins: current.startMins, endMins: tapped.endMins };
  }

  if (tapped.startMins >= current.endMins) {
    const between = slots.filter((s) => s.startMins >= current.startMins && s.endMins <= tapped.endMins);
    const contiguous = between.every((s) => s.status === "available");
    const total = tapped.endMins - current.startMins;
    if (contiguous && total <= rule.maxMins) return { startMins: current.startMins, endMins: tapped.endMins };
  }
  return { startMins: tapped.startMins, endMins: tapped.endMins };
}

export function selectionPrice(slots: Slot[], sel: SlotSelection | null) {
  if (!sel) return 0;
  return slots.filter((s) => s.startMins >= sel.startMins && s.endMins <= sel.endMins).reduce((sum, s) => sum + s.price, 0);
}

/** Validate a requested range on the server: every slot inside must exist and be available. */
export function validateRange(slots: Slot[], sel: SlotSelection, rule: Pick<SlotRule, "maxMins" | "minMins">) {
  const inside = slots.filter((s) => s.startMins >= sel.startMins && s.endMins <= sel.endMins);
  if (inside.length === 0) return { ok: false as const, reason: "No slots in range" };
  const covered = inside[inside.length - 1].endMins - inside[0].startMins;
  if (inside[0].startMins !== sel.startMins || inside[inside.length - 1].endMins !== sel.endMins)
    return { ok: false as const, reason: "Range must align to slot boundaries" };
  if (covered < rule.minMins) return { ok: false as const, reason: "Below minimum duration" };
  if (covered > rule.maxMins) return { ok: false as const, reason: "Above maximum duration" };
  const bad = inside.find((s) => s.status !== "available");
  if (bad) return { ok: false as const, reason: "Some slots are no longer available" };
  return { ok: true as const, price: inside.reduce((sum, s) => sum + s.price, 0) };
}

export function groupByDaypart(slots: Slot[]) {
  return [
    { id: "morning", label: "Morning", slots: slots.filter((s) => s.startMins < 12 * 60) },
    { id: "afternoon", label: "Afternoon", slots: slots.filter((s) => s.startMins >= 12 * 60 && s.startMins < 17 * 60) },
    { id: "evening", label: "Evening", slots: slots.filter((s) => s.startMins >= 17 * 60) },
  ].filter((g) => g.slots.length > 0);
}
