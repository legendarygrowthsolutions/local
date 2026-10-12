import "server-only";
import type { AvailabilityPayload } from "@/contracts";
import { repo } from "@/repositories";
import { bookableDates, generateSlots } from "@/lib/slots/engine";
import { dateStripParts, formatDay } from "@/lib/time";
import { badRequest, notFound } from "./errors";

export async function getAvailability(venueId: string, sport: string | undefined, date: string | undefined, now = new Date()): Promise<AvailabilityPayload> {
  const venue = await repo.venues.byId(venueId);
  if (!venue) throw notFound("Venue not found");
  const chosenSport = sport && venue.sports.includes(sport) ? sport : venue.sports[0];
  const resources = (await repo.venues.resources([venue.id])).filter((r) => r.sport === chosenSport);
  const rules = await repo.venues.slotRules(resources.map((r) => r.id));
  if (!rules.length) throw badRequest("No courts configured");
  const dates = bookableDates(rules[0], now);
  const day = date && dates.includes(date) ? date : dates[0];
  const [taken, blocks] = await Promise.all([
    repo.venues.taken(resources.map((r) => r.id), day),
    repo.venues.blocks(resources.map((r) => r.id)),
  ]);
  return {
    venueId,
    date: day,
    sport: chosenSport,
    dates: dates.map((d) => {
      const p = dateStripParts(d);
      return { date: d, label: formatDay(d, now), weekday: p.weekday, day: p.day };
    }),
    resources: resources.map((resource) => {
      const rule = rules.find((r) => r.resourceId === resource.id)!;
      return {
        resource,
        rule,
        slots: generateSlots({ resourceId: resource.id, slotLengthMins: resource.slotLengthMins, rule, date: day, taken, blocks, now }),
      };
    }),
  };
}
