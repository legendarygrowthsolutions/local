import type { TakenRange } from "@/lib/slots/engine";

import { hash01 } from "@/lib/hash";

export { hash01 };

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
