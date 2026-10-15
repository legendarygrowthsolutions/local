// District (district.in) — Nagpur events. Category pages and event pages are server-rendered
// with schema.org JSON-LD, so plain HTTP is enough.
// Run: node scripts/crawl/district.mjs   → src/db/seed/real/raw/district.json
import { getText, jsonLd, mentionsNagpur, sleep, writeRaw } from "./lib.mjs";

const BASE = "https://www.district.in/events";
// District's category slugs; unknown ones return an empty list.
const CATEGORIES = [
  "music", "nightlife", "comedy-shows", "sports-events", "theatre", "navratri", "fests-fairs", "food-drinks", "screenings",
  "fitness-events", "conferences", "openmics", "workshops", "kids", "art-exhibitions", "activities", "performances", "expos",
  "social-mixers", "spirituality", "talks", "tours", "festivals", "exhibitions", "gaming", "adventure",
  // Genre filters from the Nagpur "All events" list.
  "bowling", "arcades", "concerts", "garba", "dandiya", "poetry", "standup-comedy", "open-mic", "quizzes", "parties",
];
const LISTING_PAGES = [`${BASE}/upcoming-events-in-nagpur`, ...CATEGORIES.map((c) => `${BASE}/${c}-in-nagpur-book-tickets`)];

const isEvent = (d) => String(d["@type"] ?? "").endsWith("Event") || d["@type"] === "Festival";

const links = new Map(); // url → listing pages it appeared on
for (const page of LISTING_PAGES) {
  const { status, text } = await getText(page);
  if (status !== 200) continue;
  for (const d of jsonLd(text)) {
    if (d["@type"] !== "ItemList") continue;
    for (const { item } of d.itemListElement ?? []) {
      // The "upcoming" list mixes in national tours; keep only Nagpur ones.
      if (!item?.url || !mentionsNagpur(item.location) && !mentionsNagpur(item.name)) continue;
      if (!links.has(item.url)) links.set(item.url, new Set());
      links.get(item.url).add(page.split("/events/")[1]);
    }
  }
  await sleep(300);
}
console.log(`${links.size} Nagpur event pages`);

const out = [];
for (const [url, listedIn] of links) {
  const { status, text } = await getText(url);
  if (status !== 200) {
    console.warn("skip", status, url);
    continue;
  }
  const ld = jsonLd(text);
  const events = ld.filter(isEvent);
  if (!events.length) continue;
  const faq = ld.find((d) => d["@type"] === "FAQPage");
  out.push({
    url,
    listedIn: [...listedIn].sort(),
    event: events[0],
    // Multi-date events carry one Event block per date (the first may be the whole run).
    occurrences: events.map((e) => ({ start: e.startDate, end: e.endDate, offers: e.offers ?? null })),
    faq: (faq?.mainEntity ?? []).map((q) => [q.name, q.acceptedAnswer?.text ?? ""]),
  });
  console.log("ok", events[0].name);
  await sleep(300);
}

writeRaw("district.json", { source: "district.in", crawledAt: new Date().toISOString(), events: out });
