// KheloMore (khelomore.com) — Nagpur sports venues, their courts and a weekday + weekend slot grid
// (for real hourly prices), plus any Nagpur tournaments/events. KheloMore's web app talks to a public
// GraphQL endpoint; the queries below are trimmed copies of the ones its bundle sends.
// Run: node scripts/crawl/khelomore.mjs   → src/db/seed/real/raw/khelomore.json
import { mentionsNagpur, sleep, UA, writeRaw } from "./lib.mjs";

const NAGPUR = { lat: "21.1458", lon: "79.0882" };
const VENUES_API = "https://www.khelomore.com/sports-venues/api/";

async function gql(operationName, query, variables) {
  const res = await fetch(VENUES_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: "https://www.khelomore.com",
      referer: "https://www.khelomore.com/sports-venues/nagpur",
      // The API rejects requests without the web app's name/version headers.
      "x-km-app-name": " PNP2",
      "x-km-app-version": "1.0",
    },
    body: JSON.stringify({ operationName, query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(`${operationName}: ${json.errors[0].message}`);
  return json.data;
}

const AVAILABLE = `query availableVenues($input: SearchRequest) {
  availableVenues(input: $input) { data { meta { recordCount page } results { id name cityName } } }
}`;

// Takes the ids as an untyped variable (as the web app does).
const VENUE = `query Venues {
  venues {
    id name aboutDetail addressLine1 addressLine2 locality subLocality cityName pinCode overallRating numberOfRatings
    startTime endTime maxPrice minPrice phone tandc thingstoremember active status bookingCount
    location { lat lon } imageURLs mainImageURL amenities { name } tags { name } highLight { name }
    properties { id name capacity minCapacity dimension minDurationPolicy advancedBookingDays sports { name } }
    cancellationPolicy { policyName cancellationAmount minutesToTimeSlot description }
  }
}`;

const SLOTS = `query TimeSlots($propertyId: Int!, $date: String!, $timeslotType: String) {
  timeSlots(propertyId: $propertyId, date: $date, timeslotType: $timeslotType) {
    startTime endTime price discountedPrice specialPrice status isPopulerSlot
  }
}`;

const EVENTS = `query getListOfEvents($input: EventFilter) { getListOfEvents(input: $input) { count eventList { id } } }`;
const EVENT = `query getEventDetailById($id: Int) {
  getEventDetailById(id: $id) {
    id name description sportName venueName startDate endDate registrationStartDate registrationEndDate startTime endTime
    difficultyLevel minAge maxAge address subArea area city state pinCode latitude longitude termsAndCondition
    cancellationPolicy active status coverImageUrls galleryImageUrls hostName hostDescription perks amenities activityEvent
  }
}`;
const TICKETS = `query getListOfEventsTicketByEventId($id: Int) {
  getListOfEventsTicketByEventId(id: $id) { id name description eventTicketType teamSize price disPrice isFree totalTicketCount availableTicketCount isActive }
}`;

/** Next Wednesday and Saturday (weekday and weekend price grids). */
function sampleDates(now = new Date()) {
  const pick = (wd) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1 + ((wd - d.getUTCDay() - 1 + 7) % 7));
    return d.toISOString().slice(0, 10);
  };
  return { weekday: pick(3), weekend: pick(6) };
}

// 1. Venue ids near Nagpur, paged.
const ids = [];
for (let page = 1; page < 20; page++) {
  const d = await gql("availableVenues", AVAILABLE, { input: { date: sampleDates().weekday, page, location: NAGPUR, sortBy: "radius", sortOrder: "asc" } });
  const { meta, results } = d.availableVenues.data;
  ids.push(...results.filter((v) => v.cityName?.toLowerCase() === "nagpur").map((v) => v.id));
  if (!results.length || page * 20 >= meta.recordCount) break;
}
console.log(`${ids.length} Nagpur venues`);

// 2. Venue detail and slot grids.
const dates = sampleDates();
const venues = [];
for (const id of [...new Set(ids)]) {
  const [v] = (await gql("Venues", VENUE, { ids: [id] })).venues ?? [];
  if (!v) continue;
  v.slots = {};
  for (const p of v.properties ?? []) {
    for (const [kind, date] of Object.entries(dates)) {
      const s = await gql("TimeSlots", SLOTS, { propertyId: p.id, date, timeslotType: null }).catch(() => ({ timeSlots: [] }));
      v.slots[`${p.id}:${kind}`] = s.timeSlots ?? [];
    }
  }
  venues.push(v);
  console.log("venue", v.name, (v.properties ?? []).length, "courts");
  await sleep(150);
}

// 3. Events/tournaments. The list API filters by an internal city id, so scan them and keep Nagpur ones.
const events = [];
for (let city = 0; city <= 120; city++) {
  for (const activity of [false, true]) {
    const d = await gql("getListOfEvents", EVENTS, { input: { city, searchKey: "", sports: [], hostId: null, activity } }).catch(() => null);
    for (const { id } of d?.getListOfEvents?.eventList ?? []) {
      const e = (await gql("getEventDetailById", EVENT, { id })).getEventDetailById;
      if (!e || !mentionsNagpur([e.city, e.address, e.area])) continue;
      e.tickets = (await gql("getListOfEventsTicketByEventId", TICKETS, { id })).getListOfEventsTicketByEventId ?? [];
      events.push(e);
      console.log("event", e.name);
    }
  }
}
console.log(`${events.length} Nagpur events`);

writeRaw("khelomore.json", { source: "khelomore.com", crawledAt: new Date().toISOString(), sampleDates: dates, venues, events });
