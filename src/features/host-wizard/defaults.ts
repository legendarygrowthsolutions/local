import type { EventListingInput, ListingInput, SessionInput, VenueInput } from "@/contracts";
import { addDays, todayIST, weekdayOf } from "@/lib/time";

export function newEvent(): EventListingInput {
  return {
    kind: "event",
    title: "",
    categoryId: "",
    subcategoryId: null,
    summary: "",
    description: "",
    ageLimit: "All ages",
    languages: ["English"],
    areaId: "",
    venueName: "",
    address: "",
    media: [],
    templateId: "",
    sessions: [{ date: addDays(todayIST(), 7), startMins: 19 * 60, endMins: 21 * 60, capacity: 50, label: "" }],
    tickets: [],
    thingsToKnow: [],
    formFields: [],
    externalUrl: null,
  };
}

export function newVenue(): VenueInput {
  return {
    kind: "venue",
    name: "",
    summary: "",
    description: "",
    areaId: "",
    address: "",
    media: [],
    amenities: ["Parking", "Washrooms", "Drinking water"],
    templateId: "tpl_court_60",
    courts: [{ name: "Court 1", sport: "pickleball", indoor: true, surface: "Acrylic", slotLengthMins: 60, priceBase: 600, pricePeak: 800 }],
    openMins: 6 * 60,
    closeMins: 23 * 60,
    advanceDays: 14,
    maxMins: 180,
    bufferMins: 0,
    peakWeekdayEvenings: true,
    peakWeekends: true,
    thingsToKnow: ["Non-marking shoes are compulsory", "Arrive 10 minutes before your slot"],
  };
}

/** Sessions for each schedule shape, keeping what the host already entered where possible. */
export function sessionsForSchedule(schedule: string, current: SessionInput[]): SessionInput[] {
  const first = current[0] ?? { date: addDays(todayIST(), 7), startMins: 19 * 60, endMins: 21 * 60, capacity: 50, label: "" };
  if (schedule === "single" || schedule === "open_hours") return [first];
  if (schedule === "multi_day") return current.length >= 2 ? current : [first, { ...first, id: undefined, date: addDays(first.date, 1) }];
  if (schedule === "recurring") return weekly(first, current.length >= 2 ? current.length : 6);
  return current.length >= 1 ? current : [first];
}

export function weekly(first: SessionInput, weeks: number): SessionInput[] {
  return Array.from({ length: weeks }, (_, i) => ({ ...first, id: i === 0 ? first.id : undefined, date: addDays(first.date, 7 * i), label: "" }));
}

export function dateRangeSessions(o: { from: string; to: string; closed: number[]; windows: { startMins: number; endMins: number }[]; capacity: number }): SessionInput[] {
  const out: SessionInput[] = [];
  for (let d = o.from; d <= o.to && out.length < 400; d = addDays(d, 1)) {
    if (o.closed.includes(weekdayOf(d))) continue;
    for (const w of o.windows) out.push({ date: d, startMins: w.startMins, endMins: w.endMins, capacity: o.capacity, label: "" });
  }
  return out;
}

export const isEvent = (i: ListingInput): i is EventListingInput => i.kind === "event";

/** Switching booking type between an event and a court venue keeps what the two share. */
export function eventToVenue(e: EventListingInput): VenueInput {
  return { ...newVenue(), name: e.title, summary: e.summary, description: e.description, areaId: e.areaId, address: e.address, media: e.media };
}
export function venueToEvent(v: VenueInput): EventListingInput {
  return { ...newEvent(), title: v.name, summary: v.summary, description: v.description, areaId: v.areaId, address: v.address, media: v.media, venueName: v.name };
}
