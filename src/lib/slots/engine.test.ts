import { describe, expect, it } from "vitest";
import type { SlotRule } from "@/contracts";
import { generateSlots, isPeak, nextSelection, selectionPrice, validateRange } from "./engine";

const rule: SlotRule = {
  id: "sr",
  resourceId: "r1",
  openMins: 6 * 60,
  closeMins: 23 * 60,
  minMins: 60,
  maxMins: 180,
  bufferMins: 0,
  advanceDays: 14,
  priceBase: 600,
  pricePeak: 800,
  peak: [
    { days: [1, 2, 3, 4, 5], fromMins: 18 * 60, toMins: 22 * 60 },
    { days: [0, 6], fromMins: 7 * 60, toMins: 22 * 60 },
  ],
};
// 2026-10-12 is a Monday. "now" = Sunday 2026-10-11 10:00 IST.
const now = new Date("2026-10-11T10:00:00+05:30");

describe("slot engine", () => {
  it("generates hourly slots across opening hours", () => {
    const slots = generateSlots({ resourceId: "r1", slotLengthMins: 60, rule, date: "2026-10-12", taken: [], blocks: [], now });
    expect(slots).toHaveLength(17);
    expect(slots[0].startsAt).toBe("2026-10-12T06:00:00+05:30");
    expect(slots.at(-1)!.endMins).toBe(23 * 60);
  });

  it("generates 30-minute slots with pro-rated prices", () => {
    const slots = generateSlots({ resourceId: "r1", slotLengthMins: 30, rule: { ...rule, minMins: 30 }, date: "2026-10-12", taken: [], blocks: [], now });
    expect(slots).toHaveLength(34);
    expect(slots[0].price).toBe(300);
    const evening = slots.find((s) => s.startMins === 19 * 60)!;
    expect(evening.peak).toBe(true);
    expect(evening.price).toBe(400);
  });

  it("marks weekday evenings and weekends as peak", () => {
    expect(isPeak(rule, "2026-10-12", 19 * 60)).toBe(true);
    expect(isPeak(rule, "2026-10-12", 10 * 60)).toBe(false);
    expect(isPeak(rule, "2026-10-11", 10 * 60)).toBe(true);
  });

  it("marks past, booked, held and blocked slots", () => {
    const slots = generateSlots({
      resourceId: "r1",
      slotLengthMins: 60,
      rule,
      date: "2026-10-11",
      taken: [
        { resourceId: "r1", date: "2026-10-11", startMins: 12 * 60, endMins: 13 * 60, kind: "booked" },
        { resourceId: "r1", date: "2026-10-11", startMins: 14 * 60, endMins: 15 * 60, kind: "held" },
      ],
      blocks: [{ id: "b", resourceId: "r1", startsAt: "2026-10-11T20:00:00+05:30", endsAt: "2026-10-11T22:00:00+05:30", reason: "x" }],
      now,
    });
    const at = (h: number) => slots.find((s) => s.startMins === h * 60)!.status;
    expect(at(9)).toBe("past");
    expect(at(10)).toBe("past");
    expect(at(11)).toBe("available");
    expect(at(12)).toBe("booked");
    expect(at(14)).toBe("held");
    expect(at(20)).toBe("blocked");
    expect(at(21)).toBe("blocked");
    expect(at(22)).toBe("available");
  });

  it("marks dates outside the advance window as past", () => {
    const slots = generateSlots({ resourceId: "r1", slotLengthMins: 60, rule, date: "2026-10-30", taken: [], blocks: [], now });
    expect(slots.every((s) => s.status === "past")).toBe(true);
  });

  it("extends a selection across contiguous free slots and respects max duration", () => {
    const slots = generateSlots({ resourceId: "r1", slotLengthMins: 60, rule, date: "2026-10-12", taken: [], blocks: [], now });
    const s = (h: number) => slots.find((x) => x.startMins === h * 60)!;
    let sel = nextSelection(slots, null, s(18), rule);
    expect(sel).toEqual({ startMins: 18 * 60, endMins: 19 * 60 });
    sel = nextSelection(slots, sel, s(20), rule);
    expect(sel).toEqual({ startMins: 18 * 60, endMins: 21 * 60 });
    expect(selectionPrice(slots, sel)).toBe(2400);
    // beyond 3 h restarts
    sel = nextSelection(slots, sel, s(21), rule);
    expect(sel).toEqual({ startMins: 21 * 60, endMins: 22 * 60 });
    // tapping the only selected slot clears it
    expect(nextSelection(slots, sel, s(21), rule)).toBeNull();
  });

  it("does not extend across a booked slot", () => {
    const slots = generateSlots({
      resourceId: "r1", slotLengthMins: 60, rule, date: "2026-10-12",
      taken: [{ resourceId: "r1", date: "2026-10-12", startMins: 19 * 60, endMins: 20 * 60, kind: "booked" }],
      blocks: [], now,
    });
    const s = (h: number) => slots.find((x) => x.startMins === h * 60)!;
    const sel = nextSelection(slots, { startMins: 18 * 60, endMins: 19 * 60 }, s(20), rule);
    expect(sel).toEqual({ startMins: 20 * 60, endMins: 21 * 60 });
  });

  it("validates ranges on the server", () => {
    const slots = generateSlots({ resourceId: "r1", slotLengthMins: 60, rule, date: "2026-10-12", taken: [], blocks: [], now });
    expect(validateRange(slots, { startMins: 18 * 60, endMins: 20 * 60 }, rule)).toEqual({ ok: true, price: 1600 });
    expect(validateRange(slots, { startMins: 18 * 60 + 30, endMins: 20 * 60 }, rule).ok).toBe(false);
    expect(validateRange(slots, { startMins: 6 * 60, endMins: 10 * 60 }, rule).ok).toBe(false);
  });
});
