import type { TakenRange } from "@/lib/slots/engine";

/** FNV-1a → [0,1). Stable across restarts so the prototype looks the same every time. */
export function hash01(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Seeded "other people's bookings" so slot grids look realistic without
 * storing thousands of fixture rows. Evenings and weekends are busier.
 */
export function seededTaken(resourceId: string, date: string, openMins: number, closeMins: number): TakenRange[] {
  const out: TakenRange[] = [];
  const wd = new Date(date + "T00:00:00Z").getUTCDay();
  const weekend = wd === 0 || wd === 6;
  for (let m = openMins; m + 60 <= closeMins; m += 60) {
    const evening = m >= 18 * 60 && m < 22 * 60;
    const p = evening ? (weekend ? 0.6 : 0.5) : weekend ? 0.35 : m < 9 * 60 ? 0.3 : 0.12;
    if (hash01(`${resourceId}|${date}|${m}`) < p) out.push({ resourceId, date, startMins: m, endMins: m + 60, kind: "booked" });
  }
  return out;
}
