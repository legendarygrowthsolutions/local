// Turns the raw crawls (src/db/seed/real/raw/*.json) into app fixtures for Nagpur:
// src/db/seed/real/nagpur.json (hosts, listings, sessions, ticket types, venues, courts, slot rules, plus the
// areas/categories/template the imported content needs). Dates stay absolute — unlike the demo fixtures,
// these are real events and are never re-anchored.
// Run: node scripts/crawl/build.mjs
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RAW_DIR, ROOT } from "./lib.mjs";

const read = (f) => JSON.parse(readFileSync(join(RAW_DIR, f), "utf8"));
const district = read("district.json");
const bms = read("bookmyshow.json");
const km = read("khelomore.json");

const CITY = "c_nagpur";
const CENTRE = { lat: 21.1458, lng: 79.0882 };
// Anything that has already finished by the time of the newest crawl is dropped.
const NOW = new Date([district.crawledAt, bms.crawledAt, km.crawledAt].sort().at(-1));

// ---------- helpers ----------
const hash = (s, n = 8) => createHash("sha1").update(s).digest("hex").slice(0, n);
const slugify = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const clean = (s) => (s ?? "").replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");

/** Any ISO timestamp → "YYYY-MM-DDTHH:MM:SS+05:30". */
function ist(iso) {
  const d = new Date(new Date(iso).getTime() + 330 * 60000);
  return `${d.toISOString().slice(0, 19)}+05:30`;
}
const istAt = (ymd, hhmm) => `${ymd}T${hhmm.length === 5 ? hhmm + ":00" : hhmm}+05:30`;
function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const ymdOf = (isoIst) => isoIst.slice(0, 10);
const minsOf = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** "SHARON VERMA LIVE IN NAGPUR" → "Sharon Verma Live in Nagpur"; mixed-case titles are left alone. */
function titleCase(s) {
  s = clean(s);
  if (/[a-z]/.test(s)) return s;
  const small = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "the", "to", "with", "x"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/^[a-z]/, (c) => c.toUpperCase())))
    .join(" ");
}
/** Organiser names arrive as legal names in capitals; keep the legal form but readable. */
const orgName = (s) => titleCase(clean(s).replace(/\s*\(.*?\)\s*$/, "")).replace(/\b(Llp|Pvt|Ltd)\b/g, (m) => m.toUpperCase());

/** Joined sentences ("…celebration.Dholida 4.0 is…") and single newlines become paragraphs. */
function paragraphs(text) {
  let t = clean(String(text ?? "").replace(/\r/g, ""));
  // Copy flattened from separate blocks ("Eminent SpeakersPanel DiscussionQ&A Session") has no line breaks at all.
  if (!t.includes("\n")) t = t.replace(/\)(?=[A-Z])/g, ")\n").replace(/([a-z])(?=[A-Z][a-z&]{2,}[\s A-Z])/g, "$1\n");
  return t
    .replace(/\s*•\s*/g, "\n• ")
    .replace(/([.!?])(?=[A-Z][a-z])/g, "$1\n")
    .split(/\n+/)
    .map((p) => clean(p))
    .filter(Boolean)
    .join("\n\n");
}
function summaryOf(text, max = 150, startsWith) {
  const paras = text.split("\n\n");
  // Skip headings ("Important Information") and pick the first real sentence; otherwise the longest line.
  const first =
    (startsWith && paras.find((p) => p.startsWith(startsWith))) ??
    paras.find((p) => p.length > 60 && /[.!?]/.test(p)) ??
    [...paras].sort((a, b) => b.length - a.length)[0];
  const sentence = first.match(/^.{20,}?[.!?](?=\s|$)/)?.[0] ?? first;
  return sentence.length <= max ? sentence : sentence.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
const htmlText = (html) =>
  clean(
    String(html ?? "")
      .replace(/<\/(p|li|div|h\d)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " "),
  )
    .split("\n")
    .map((l) => clean(l).replace(/^[-•\d.)\s]+(?=\S)/, ""))
    .filter(Boolean);

function money(n) {
  return Math.round(Number(n));
}

// ---------- areas ----------
// Existing demo areas are kept; these extend Nagpur so every real address maps to a sensible neighbourhood.
const AREA_SEED = [
  ["Dharampeth", 21.1418, 79.064], ["Civil Lines", 21.1594, 79.0767], ["Sitabuldi", 21.1438, 79.0821], ["Manish Nagar", 21.087, 79.079],
  ["Ramdaspeth", 21.135, 79.071], ["Wardha Road", 21.1, 79.07], ["Sadar", 21.163, 79.082], ["Pratap Nagar", 21.118, 79.051],
  ["Medical Square", 21.133, 79.097], ["Jaripatka", 21.183, 79.087], ["Wathoda", 21.139, 79.147], ["Nandanvan", 21.142, 79.131],
  ["Manewada", 21.106, 79.098], ["Besa", 21.068, 79.095], ["Hingna", 21.1, 78.975], ["Koradi Road", 21.21, 79.075],
  ["Kamptee Road", 21.19, 79.125], ["Mankapur", 21.183, 79.05], ["Bajaj Nagar", 21.127, 79.06], ["Wadi", 21.163, 78.99],
  ["MIHAN", 21.03, 79.03], ["Outskirts", 0, 0],
];
const EXISTING_AREAS = new Set(["dharampeth", "civil-lines", "sitabuldi", "manish-nagar", "ramdaspeth", "wardha-road", "sadar", "pratap-nagar"]);
const areaList = AREA_SEED.map(([name, lat, lng]) => ({ id: `a_nagpur_${slugify(name)}`, cityId: CITY, slug: slugify(name), name, lat, lng }));
const km2 = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};
// Neighbourhoods named in addresses that aren't areas themselves.
const AREA_ALIASES = { untkhana: "medical-square", "medical chowk": "medical-square", dighori: "wathoda", pardi: "wathoda", drugdhamna: "wadi", somalwada: "manish-nagar", "gandhi bagh": "ramdaspeth", "dhantoli": "ramdaspeth", "temple road": "civil-lines", "abhyankar nagar": "dharampeth", "shivaji nagar": "dharampeth", "katol road": "outskirts", mansar: "outskirts" };
function areaFor(lat, lng, address = "") {
  const text = address.toLowerCase();
  const named = areaList.find((a) => a.lat && text.includes(a.name.toLowerCase()));
  if (named) return named.id;
  const alias = Object.entries(AREA_ALIASES).find(([k]) => text.includes(k));
  if (alias) return `a_nagpur_${alias[1]}`;
  if (!lat || !lng) return "a_nagpur_sitabuldi";
  const p = { lat, lng };
  // Day-trip destinations (water parks, resorts) sit well outside the city.
  if (km2(p, CENTRE) > 18) return "a_nagpur_outskirts";
  return areaList.filter((a) => a.lat).sort((a, b) => km2(p, a) - km2(p, b))[0].id;
}

// ---------- categories & template the imported content needs ----------
const categories = [
  { id: "cat_events_screenings", slug: "screenings", name: "Screenings", singular: "Screening", parentId: "cat_events", icon: "Tv", sort: 4 },
  { id: "cat_events_open-mics", slug: "open-mics", name: "Open mics & poetry", singular: "Open mic", parentId: "cat_events", icon: "PenTool", sort: 5 },
  { id: "cat_meetups_talks", slug: "talks", name: "Talks & seminars", singular: "Talk", parentId: "cat_meetups", icon: "Presentation", sort: 4 },
  { id: "cat_activities", slug: "activities", name: "Activities", singular: "Activity", parentId: null, icon: "FerrisWheel", sort: 6, blurb: "Theme parks, arcades and days out" },
  { id: "cat_activities_theme-parks", slug: "theme-parks", name: "Theme & water parks", singular: "Theme park", parentId: "cat_activities", icon: "Waves", sort: 0 },
  { id: "cat_activities_arcades", slug: "arcades", name: "Arcades & bowling", singular: "Arcade", parentId: "cat_activities", icon: "Gamepad2", sort: 1 },
  { id: "cat_activities_play-zones", slug: "play-zones", name: "Trampoline & play zones", singular: "Play zone", parentId: "cat_activities", icon: "Activity", sort: 2 },
  { id: "cat_sports_table-tennis", slug: "table-tennis", name: "Table tennis", singular: "Table tennis", parentId: "cat_sports", icon: "Activity", sort: 6 },
  { id: "cat_sports_snooker-pool", slug: "snooker-pool", name: "Snooker & pool", singular: "Snooker & pool", parentId: "cat_sports", icon: "Activity", sort: 7 },
  { id: "cat_sports_gaming", slug: "gaming", name: "Gaming lounges", singular: "Gaming", parentId: "cat_sports", icon: "Gamepad2", sort: 8 },
];
const templates = [
  {
    id: "tpl_ticket_dates",
    name: "Ticketed (pick a date)",
    description: "Paid entry on several dates or slots; buyers pick one, the same tickets apply to every date.",
    allowedCategories: ["events", "activities", "meetups"],
    bookingMode: "ticketed",
    schedule: "recurring",
    pricing: "paid",
    ticketScope: "per_session",
    steps: [
      { type: "pick_session", required: true, config: {} },
      { type: "pick_tickets", required: true, config: {} },
      { type: "attendee_form", required: false, config: {} },
      { type: "review", required: true, config: {} },
      { type: "payment", required: true, config: {} },
      { type: "confirmation", required: true, config: {} },
    ],
    rules: { seatHoldMins: 10, waitlist: false, hostApprovalPerBooking: false, transferable: false, maxPerOrder: 10, minPerOrder: 1 },
    fees: { convenienceFeePct: 5, convenienceFeeFlat: 0, gstOnFeePct: 18, absorbFeeAllowed: true },
    cancellation: { policy: "none", hoursBefore: 0, refundPct: 0 },
    ctaLabel: "Book tickets",
    active: true,
  },
];

// ---------- hosts ----------
const hosts = new Map();
function hostFor(brand, type, website) {
  const name = clean(brand);
  const id = `h_ngp_${slugify(name).slice(0, 40)}`;
  if (!hosts.has(id)) {
    hosts.set(id, {
      id,
      userId: null, // unclaimed: no account owns imported organisers yet
      type,
      brandName: name,
      cityId: CITY,
      bio: type === "venue" ? `${name}, Nagpur.` : `${name} organises events in Nagpur.`,
      instagram: null,
      kycStatus: "none",
      status: "approved",
      since: NOW.toISOString().slice(0, 10),
      contactName: name,
      contactPhone: "",
      email: null,
      website: website ?? null,
      gstin: null,
      expectedPerMonth: "1–2",
      wantsPaid: true,
      documents: [],
      reviewNote: null,
      submittedAt: ist(NOW.toISOString()),
    });
  }
  return id;
}

// ---------- per-listing editorial mapping ----------
// category/sub, template and, for multi-date runs that the source only exposes in its copy, the run itself.
// Keys are source URLs (without query). Anything unmapped is skipped and reported.
const MAP = {
  // District
  "the-philosophy-of-resonance-satinder-sartaaj-live-in-nagpur-2026-buy-tickets": { cat: "events/music", featured: 2 },
  "screening-of-india-vs-west-indies-the-studs-nagpur-oct3-2026-buy-tickets": { cat: "events/screenings" },
  "raasera-oct16-2026-buy-tickets": { cat: "events/festivals", tpl: "tpl_ticket_dates" },
  "the-revolution-india-tour-nagpur-2027-buy-tickets": { cat: "events/music", featured: 3 },
  "el-clsico-barcelona-vs-real-madrid-live-screening-at-the-studs-nagpur-oct25-2026-buy-tickets": { cat: "events/screenings" },
  "sunidhi-chauhan-live-nagpur-2026-buy-tickets": { cat: "events/music", featured: 1 },
  "papon-live-in-concert-nagpur-2027-buy-tickets": { cat: "events/music", featured: 5 },
  // Nightly garba Oct 11–19, 6–10 PM (the event's first JSON-LD block spans the whole run).
  "--oct11-2026-buy-tickets": { cat: "events/festivals", tpl: "tpl_ticket_multi", run: { from: "2026-10-11", to: "2026-10-19", start: "18:00", end: "22:00" }, featured: 4 },
  "ghar-an-open-mic-for-words-by-tape-a-tale-nagpur-oct25-2026-buy-tickets": { cat: "events/open-mics", alsoOn: "events/ghar-an-open-mic-for-words-by-tape-a-tale/ET00377836" },
  "jamie-lever-india-tour-2026-nagpur-buy-tickets": { cat: "events/comedy", featured: 6 },
  "fresh-humor-hour-mar23-2026-buy-tickets": { cat: "events/comedy", tpl: "tpl_ticket_dates" },
  // Open daily; District lists it until Oct 31, 11 AM – 10 PM.
  "timezone-virtuous-retail-mall-nagpur-buy-tickets": { cat: "activities/arcades", tpl: "tpl_ticket_dates", run: { from: "2026-10-12", to: "2026-10-31", start: "11:00", end: "22:00" }, alsoOn: "activities/timezone-virtuous-retail-mall-nagpur/ET00502262" },
  "xplore-2026-buy-tickets": { cat: "activities/arcades", tpl: "tpl_ticket_dates" },
  // BookMyShow
  "events/sharon-verma-live-in-nagpur/ET00513357": { cat: "events/comedy" },
  "events/oversmartgiri-by-aditya-gundeti/ET00473415": { cat: "events/comedy" },
  "events/unforgettable-melodies-of-s-d-r-d-burman/et2klw4gve": { cat: "events/music" },
  "events/interact-law-2026-27/ET00508383": { cat: "meetups/talks" },
  "events/sham-e-malang-by-swantay-sukh-nagpur/ET00451445": { cat: "events/open-mics" },
  "events/kullu-on-tour-by-aaditya-kulshreshth/ET00513409": { cat: "events/comedy" },
  "events/shiksha-samagam-2026-27/ET00504933": { cat: "meetups/talks" },
  "events/vipul-goyal-live-in-nagpur/ET00391343": { cat: "events/comedy" },
  "events/open-mic-by-exploreyou/ET00521891": { cat: "events/open-mics" },
  // Open daily; next 30 days.
  "events/jus-jumpin-vr-nagpur/ET00437446": { cat: "activities/play-zones", tpl: "tpl_ticket_dates", run: { days: 30, start: "11:00", end: "22:00" } },
  "plays/farewell-an-entropy-of-separation/ET00481604": { cat: "events/theatre" },
  "plays/eka-lagnachi-pudhchi-gosht/ET00086550": { cat: "events/theatre" },
  "plays/hi-dosti-tutaychi-naay/ET00515978": { cat: "events/theatre" },
  "plays/mukul-sharma-live-a-poetry-storytelling-show/ET00468163": { cat: "events/theatre" },
  "plays/lafzon-ke-darmiyan/ET00520552": { cat: "events/theatre" },
  "plays/kahanibaaz-by-ashish-vidyarthi/ET00521436": { cat: "events/theatre" },
  // Garba nights; dates and timings are stated in each event's description.
  "activities/rass-garba/ET00521496": { cat: "events/festivals", tpl: "tpl_ticket_dates", run: { from: "2026-10-11", to: "2026-10-19", start: "18:00", end: "22:00" } },
  "activities/royal-rasleela-garba/ET00519532": { cat: "events/festivals", tpl: "tpl_ticket_multi", run: { from: "2026-10-11", to: "2026-10-19", start: "18:45", end: "22:30" } },
  "activities/sindhu-maharaj-garba-mahotsav-2026/ET00520545": { cat: "events/festivals" },
  "activities/rass-garba-event/ET00521515": { cat: "events/festivals", tpl: "tpl_ticket_multi", run: { from: "2026-10-11", to: "2026-10-19", start: "19:00", end: "22:00" } },
  "activities/coscon-x-ota-tokyo/ET00517349": { cat: "events/festivals" },
  // Theme parks; open daily until Oct 31 per their listings.
  "activities/dreamasia-water-adventure-park-nagpur/ET00404517": { cat: "activities/theme-parks", tpl: "tpl_ticket_dates", run: { from: "2026-10-14", to: "2026-10-31", start: "10:00", end: "18:00" } },
  "activities/lighthouse-waterpark-monsoon-is-here/ET00502982": { cat: "activities/theme-parks", summaryFrom: "Central India", tpl: "tpl_ticket_dates", run: { from: "2026-10-13", to: "2026-10-31", start: "10:00", end: "17:30" } },
};
const SKIP = new Set(["activities/timezone-virtuous-retail-mall-nagpur/ET00502262", "events/ghar-an-open-mic-for-words-by-tape-a-tale/ET00377836"]); // merged into District copies

const listings = [];
const sessions = [];
const ticketTypes = [];
const unmapped = [];
const report = [];

function catIds(path) {
  const [top, sub] = path.split("/");
  return { categoryId: `cat_${top}`, subcategoryId: sub ? `cat_${top}_${sub}` : null };
}

/** Sessions for a "run" (one per day) or explicit occurrences; finished ones are dropped. */
function buildSessions(key, occurrences, run, label) {
  let occ = occurrences;
  if (run) {
    const from = run.from ?? NOW.toISOString().slice(0, 10);
    const to = run.to ?? addDays(from, run.days - 1);
    occ = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const endDay = minsOf(run.end) <= minsOf(run.start) ? addDays(d, 1) : d;
      occ.push({ start: istAt(d, run.start), end: istAt(endDay, run.end) });
    }
  }
  return occ
    .filter((o) => new Date(o.end ?? o.start) > NOW)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((o, i, all) => ({
      id: `s_ngp_${hash(key)}_${i + 1}`,
      startsAt: o.start,
      endsAt: o.end ?? o.start,
      capacity: 500,
      label: all.length === 1 ? label : run ? new Date(o.start).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : `Show ${i + 1}`,
    }));
}

function addListing({ key, sourceUrl, source, title, description, media, venueName, address, lat, lng, ageLimit, languages, things, occurrences, offers, hostId }) {
  const m = MAP[key];
  if (!m) {
    unmapped.push(`${source}: ${key}`);
    return;
  }
  const tpl = m.tpl ?? "tpl_ticket_single";
  const id = `l_ngp_${hash(key)}`;
  const { categoryId, subcategoryId } = catIds(m.cat);
  const label = m.cat.startsWith("activities") ? "Entry" : "Show";
  const sess = buildSessions(key, occurrences, m.run, label);
  if (!sess.length) {
    report.push(`past, skipped: ${title}`);
    return;
  }
  const desc = paragraphs(description) || title;
  const slug = `${slugify(title).slice(0, 60)}-${hash(key, 4)}`;
  listings.push({
    id,
    hostId,
    cityId: CITY,
    areaId: areaFor(lat, lng, address),
    categoryId,
    subcategoryId,
    templateId: tpl,
    slug,
    title,
    summary: summaryOf(desc, 150, m.summaryFrom),
    description: desc,
    media: media.filter(Boolean).slice(0, 4),
    venueName,
    address,
    lat: lat || CENTRE.lat,
    lng: lng || CENTRE.lng,
    ageLimit,
    languages,
    tags: [subcategoryId?.split("_").at(-1), m.cat.split("/")[0], source].filter(Boolean),
    thingsToKnow: things.slice(0, 8),
    externalUrl: sourceUrl,
    status: "live",
    featuredRank: m.featured ?? null,
    formFields: [],
    createdAt: ist(NOW.toISOString()),
    reviewNote: null,
  });
  sessions.push(...sess.map((s) => ({ ...s, listingId: id })));

  // Tickets: one row per distinct offer name. Multi-day templates split day tickets (per session) from passes.
  const seen = new Map();
  for (const o of offers) {
    const name = clean(o.name) || "Entry";
    if (!o.price && o.price !== 0) continue;
    if (!seen.has(name) || (seen.get(name).soldOut && !o.soldOut)) seen.set(name, { ...o, name });
  }
  let list = [...seen.values()].sort((a, b) => a.price - b.price);
  if (!list.length) list = [{ name: "Entry", price: 0, soldOut: false }];
  let n = 0;
  const tid = () => `t_ngp_${hash(key)}_${++n}`;
  const isPass = (t) => /season|\bpass\b.*\b(9|all|full)\b|\b9 days?\b/i.test(t.name) && !/day pass|single day|one day/i.test(t.name);
  for (const t of list) {
    const pass = tpl === "tpl_ticket_multi" && isPass(t);
    const base = { listingId: id, name: titleCase(t.name), description: t.description ?? "", price: money(t.price), qty: 200, sold: t.soldOut ? 200 : 0, perOrderMax: 10, isPass: pass };
    if (tpl === "tpl_ticket_multi" && !pass) {
      // Day tickets: one per night.
      for (const s of sess) ticketTypes.push({ ...base, id: tid(), sessionId: s.id, description: base.description || `Entry on ${s.label}` });
    } else {
      ticketTypes.push({ ...base, id: tid(), sessionId: null, description: pass ? base.description || "Entry on every night" : base.description });
    }
  }
  report.push(`${m.cat.padEnd(22)} ${tpl.padEnd(17)} ${sess.length}× ${title}`);
}

// ---------- District ----------
const FAQ_SKIP = /group booking|cart time|delivery address|wristband|city shift|officially transfer|how long does|can.t make it|what language|minimum age|entry age limit/i;
function ageFromFaq(faq) {
  for (const [q, a] of faq) {
    if (!/age/i.test(q)) continue;
    const n = a.match(/(\d{1,2})\s*(?:\+|years|yrs)/i);
    if (n && !/no age restriction|open to all ages/i.test(a)) return `${n[1]}+`;
  }
  return "All ages";
}
for (const e of district.events) {
  const ev = e.event;
  const key = e.url.split("/events/")[1];
  const loc = ev.location ?? {};
  const address = typeof loc.address === "string" ? loc.address : [loc.name, loc.address?.addressLocality].filter(Boolean).join(", ");
  const tba = /to be announced/i.test(loc.name ?? "");
  const orgRaw = ev.organizer?.name;
  const offers = e.occurrences.flatMap((o) => (o.offers?.offers ?? []).map((f) => ({ name: f.name, price: f.price, soldOut: /SoldOut/i.test(f.availability ?? "") })));
  // District only lists offers that are on sale that day; fall back to the same listing on BookMyShow.
  const twin = MAP[key]?.alsoOn && bms.events.find((b) => b.k === MAP[key].alsoOn);
  if (!offers.length && twin) offers.push(...twin.events.flatMap((x) => x.offers.map(([name, price, av]) => ({ name, price, soldOut: /SoldOut/i.test(av ?? "") }))));
  if (!offers.length) {
    const agg = e.occurrences.map((o) => o.offers).find((o) => o?.price || o?.lowPrice);
    if (agg) offers.push({ name: "Entry", price: agg.lowPrice ?? agg.price });
  }
  const lang = e.faq.find(([q]) => /language/i.test(q))?.[1].match(/in ([A-Z][a-z]+(?:(?:,| and| &) [A-Z][a-z]+)*)/)?.[1];
  addListing({
    key,
    sourceUrl: e.url,
    source: "district",
    title: clean(ev.name).replace(/\s*\|\s*Nagpur$/i, ""),
    description: ev.description,
    media: [ev.image].flat(),
    venueName: tba ? "Venue to be announced" : clean(loc.name),
    address: tba ? "Nagpur" : clean(address),
    lat: loc.geo?.latitude,
    lng: loc.geo?.longitude,
    ageLimit: ageFromFaq(e.faq),
    languages: lang ? lang.split(/,| and | & /).map(clean).filter(Boolean) : [],
    things: e.faq.filter(([q, a]) => !FAQ_SKIP.test(q) && a.length < 200).map(([, a]) => clean(a)),
    occurrences: e.occurrences.map((o) => ({ start: ist(o.start), end: o.end ? ist(o.end) : undefined })).filter((o, i, all) => !(all.length > 1 && i === 0 && ymdOf(o.end ?? o.start) !== ymdOf(o.start))),
    offers,
    hostId: hostFor(orgRaw && !/bookmyshow|district/i.test(orgRaw) ? orgName(orgRaw) : clean(loc.name), orgRaw ? "organiser" : "venue"),
  });
}

// ---------- BookMyShow ----------
const ageBms = (a) => (!a || /all age/i.test(a) ? "All ages" : a.replace(/\s*yrs?\s*/i, ""));
for (const e of bms.events) {
  if (SKIP.has(e.k)) continue;
  const here = e.events.filter((x) => /nagpur/i.test(JSON.stringify(x.loc)));
  if (!here.length) continue;
  const first = here[0];
  const venue = clean(first.loc.name).replace(/\s*:\s*Nagpur$/i, "").replace(/:\s*$/, "");
  const tba = /to be announced/i.test(venue);
  const offers = here.flatMap((x) => x.offers.map(([name, price, av]) => ({ name, price, soldOut: /SoldOut/i.test(av ?? "") })));
  if (!offers.length && first.low) offers.push({ name: "Entry", price: first.low });
  addListing({
    key: e.k,
    sourceUrl: e.url,
    source: "bookmyshow",
    title: titleCase(first.name).replace(/\s*\|\s*Nagpur$/i, ""),
    description: e.about,
    media: [first.img].flat(),
    venueName: tba ? "Venue to be announced" : venue,
    address: tba ? "Nagpur" : clean(first.loc.addr) || `${venue}, Nagpur`,
    lat: tba ? null : first.loc.lat,
    lng: tba ? null : first.loc.lng,
    ageLimit: ageBms(first.age),
    languages: [first.lang].flat().filter(Boolean),
    things: [],
    occurrences: here.map((x) => ({ start: ist(x.start), end: x.end ? ist(x.end) : undefined })),
    offers,
    hostId: hostFor(tba ? "BookMyShow Nagpur listings" : venue, "venue"),
  });
}
for (const a of bms.attractions) {
  const ld = a.ld;
  const addr = ld.address ?? {};
  // "Adult Ticket Rs.399" style lines in the description are the only per-ticket prices exposed.
  const lines = a.about.split("\n");
  const priced = lines.map((l) => l.match(/^(.*?(?:ticket|children)[^R]*?)\s*Rs\.?\s*(\d+)/i)).filter(Boolean).map((m) => ({ name: clean(m[1]), price: Number(m[2]) }));
  const rules = lines.filter((l) => /prohibited|no cancellation|free entry|deposit|no entry/i.test(l)).map(clean);
  addListing({
    key: a.k,
    sourceUrl: a.url,
    source: "bookmyshow",
    title: clean(ld.name).replace(/\s+Nagpur$/i, ""),
    description: a.about,
    media: a.img,
    venueName: clean(ld.name),
    address: clean(addr.streetAddress) || "Nagpur",
    lat: ld.geo?.latitude,
    lng: ld.geo?.longitude,
    ageLimit: "All ages",
    languages: [ld.availableLanguage].flat().filter(Boolean),
    things: rules,
    occurrences: [],
    offers: priced.length ? priced : [{ name: "Entry ticket", price: ld.offers?.lowPrice ?? 0 }],
    hostId: hostFor(clean(ld.name), "venue"),
  });
}

// ---------- KheloMore tournaments ----------
for (const e of km.events) {
  const key = `khelomore/event/${e.id}`;
  MAP[key] ??= { cat: "competitions/tournaments", tpl: "tpl_competition" };
  const things = [...htmlText(e.termsAndCondition), ...htmlText(e.cancellationPolicy)];
  if (e.registrationEndDate) things.unshift(`Registrations close on ${new Date(e.registrationEndDate).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`);
  addListing({
    key,
    sourceUrl: "https://www.khelomore.com/events/explore-events",
    source: "khelomore",
    title: titleCase(e.name),
    description: htmlText(e.description).join("\n\n"),
    media: e.coverImageUrls ?? [],
    venueName: clean(e.venueName),
    address: clean([e.address, e.area].filter(Boolean).join(", ")),
    lat: e.latitude,
    lng: e.longitude,
    ageLimit: e.minAge ? `${e.minAge}+` : "All ages",
    languages: [],
    things,
    occurrences: [{ start: istAt(e.startDate, e.startTime), end: istAt(e.endDate, e.endTime) }],
    offers: (e.tickets ?? []).filter((t) => t.isActive).map((t) => ({ name: t.name, price: t.disPrice || t.price, description: clean(t.description), soldOut: t.availableTicketCount === 0 })),
    hostId: hostFor(clean(e.venueName) || clean(e.hostName), "organiser"),
  });
}

// ---------- KheloMore venues → venues, courts, slot rules ----------
const SPORT = { pickleball: "pickleball", badminton: "badminton", "box cricket": "box-cricket", cricket: "box-cricket", football: "football", "table tennis": "table-tennis", snooker: "snooker-pool", pool: "snooker-pool", esports: "gaming", foosball: "gaming" };
const INDOOR = new Set(["badminton", "table-tennis", "snooker-pool", "gaming"]);
const SPORT_NAME = { pickleball: "pickleball", badminton: "badminton", "box-cricket": "box cricket", football: "football", "table-tennis": "table tennis", "snooker-pool": "snooker & pool", gaming: "gaming" };
const fmtHour = (hhmm) => {
  let m = minsOf(hhmm);
  if (m >= 1439) m = 1440;
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${h % 12 || 12}${mm ? ":" + pad(mm) : ""} ${h < 12 ? "AM" : "PM"}`;
};

const venues = [];
const resources = [];
const slotRules = [];
for (const v of km.venues) {
  const name = clean(v.name);
  const lat = Number(v.location?.lat);
  const lng = Number(v.location?.lon);
  const vid = `v_ngp_km${v.id}`;
  const courts = [];
  for (const p of v.properties ?? []) {
    const sport = SPORT[(p.sports?.[0]?.name ?? "").toLowerCase()];
    if (!sport) continue;
    const parse = (kind) =>
      (v.slots[`${p.id}:${kind}`] ?? [])
        .map((s) => ({ from: minsOf(s.startTime), to: s.endTime === "00:00" || s.endTime === "23:59" ? 1440 : minsOf(s.endTime), price: Number(s.specialPrice || s.price) }))
        // Slots straddling midnight belong to the previous day's late session; the model keeps one window per day.
        .filter((s) => s.from >= 300 && s.to > s.from);
    const wk = parse("weekday");
    const we = parse("weekend");
    if (!wk.length && !we.length) continue;
    const all = [...wk, ...we];
    const len = all[0].to - all[0].from;
    const hourly = (s) => Math.round((s.price * 60) / (s.to - s.from));
    const base = Math.min(...(wk.length ? wk : we).map(hourly));
    const peak = Math.max(...all.map(hourly));
    const window = (list, days) => {
      const hot = list.filter((s) => hourly(s) === peak);
      return peak > base && hot.length ? [{ days, fromMins: hot[0].from, toMins: hot.at(-1).to }] : [];
    };
    const rid = `r_ngp_km${p.id}`;
    courts.push({
      id: rid,
      venueId: vid,
      name: clean(p.name),
      sport,
      indoor: INDOOR.has(sport) || (sport === "pickleball" && /floor|mall|hall|dome/i.test(`${v.addressLine1} ${name}`)),
      surface: clean(p.dimension) || "Standard",
      slotLengthMins: len,
      capacity: p.capacity || 4,
    });
    slotRules.push({
      id: `sr_${rid}`,
      resourceId: rid,
      openMins: Math.min(...all.map((s) => s.from)),
      closeMins: Math.max(...all.map((s) => s.to)),
      minMins: Math.max(len, p.minDurationPolicy || len),
      maxMins: 180,
      bufferMins: 0,
      advanceDays: Math.min(30, Math.max(1, p.advancedBookingDays || 14)),
      priceBase: base,
      pricePeak: peak,
      peak: [...window(wk, [1, 2, 3, 4, 5]), ...window(we, [0, 6])],
    });
  }
  if (!courts.length) {
    report.push(`venue without bookable courts, skipped: ${name}`);
    continue;
  }
  resources.push(...courts);
  const sports = [...new Set(courts.map((c) => c.sport))];
  const sportWords = sports.map((s) => SPORT_NAME[s]);
  const sportText = sportWords.length > 1 ? `${sportWords.slice(0, -1).join(", ")} and ${sportWords.at(-1)}` : sportWords[0];
  const areaId = areaFor(lat, lng, `${v.addressLine1 ?? ""} ${v.locality ?? ""} ${v.subLocality ?? ""}`);
  const areaName = areaList.find((a) => a.id === areaId)?.name ?? "Nagpur";
  const hours = `${fmtHour(v.startTime ?? "06:00")} – ${fmtHour(v.endTime ?? "23:00")}`;
  const things = [...htmlText(v.tandc), ...htmlText(v.thingstoremember), ...(v.cancellationPolicy ?? []).map((c) => clean(c.description))].filter((t, i, a) => t.length > 3 && a.indexOf(t) === i);
  const about = htmlText(v.aboutDetail).join("\n\n");
  const minLen = Math.min(...courts.map((c) => c.slotLengthMins));
  venues.push({
    id: vid,
    hostId: hostFor(name, "venue", `https://www.khelomore.com/sports-venues/nagpur/${slugify(name)}/${v.id}`),
    cityId: CITY,
    areaId,
    templateId: minLen <= 30 ? "tpl_court_30" : "tpl_court_60",
    slug: `${slugify(name)}-${slugify(areaName)}`.slice(0, 70),
    name,
    summary: `${sportText[0].toUpperCase()}${sportText.slice(1)} in ${areaName}. Book in ${minLen}-minute slots.`,
    description:
      about ||
      `${name} has ${courts.length} ${courts.length === 1 ? "court" : "courts"} for ${sportText}, open ${hours}.` +
        (v.addressLine1 ? `\n\nFind it at ${clean(v.addressLine1)}.` : ""),
    media: [v.mainImageURL, ...(v.imageURLs ?? [])].filter((u, i, a) => u && a.indexOf(u) === i).slice(0, 5),
    address: clean([v.addressLine1, v.addressLine2].filter(Boolean).join(", ")) || `${name}, ${v.locality}, Nagpur`,
    lat,
    lng,
    amenities: (v.amenities ?? []).map((a) => clean(a.name)).filter(Boolean),
    hoursLabel: hours,
    sports,
    thingsToKnow: things.slice(0, 8),
    featuredRank: null,
    status: "live",
  });
}
// Busiest venues first in "Play near you".
venues
  .map((v) => [v, km.venues.find((k) => `v_ngp_km${k.id}` === v.id)?.bookingCount ?? 0])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .forEach(([v], i) => (v.featuredRank = i + 1));
// Venue slugs must be unique per city.
for (const v of venues) {
  const dupes = venues.filter((x) => x.slug === v.slug);
  if (dupes.length > 1) dupes.forEach((x, i) => i > 0 && (x.slug = `${x.slug}-${i + 1}`));
}

const usedAreas = new Set([...listings, ...venues].map((x) => x.areaId));
const out = {
  generatedAt: new Date().toISOString(),
  sources: [
    { name: "District", url: "https://www.district.in/events/upcoming-events-in-nagpur", crawledAt: district.crawledAt },
    { name: "BookMyShow", url: "https://in.bookmyshow.com/explore/events-nagpur", crawledAt: bms.crawledAt },
    { name: "KheloMore", url: "https://www.khelomore.com/sports-venues/nagpur", crawledAt: km.crawledAt },
  ],
  areas: areaList.filter((a) => !EXISTING_AREAS.has(a.slug) && usedAreas.has(a.id)).map((a) => (a.slug === "outskirts" ? { ...a, lat: CENTRE.lat, lng: CENTRE.lng } : a)),
  categories,
  templates,
  hosts: [...hosts.values()],
  listings,
  sessions,
  ticketTypes,
  venues,
  resources,
  slotRules,
};
writeFileSync(join(ROOT, "src/db/seed/real/nagpur.json"), JSON.stringify(out, null, 1) + "\n");

console.log(report.join("\n"));
if (unmapped.length) console.warn(`\nUnmapped (add to MAP in scripts/crawl/build.mjs):\n  ${unmapped.join("\n  ")}`);
console.log(`\n${listings.length} listings (${sessions.length} sessions, ${ticketTypes.length} ticket types), ${venues.length} venues (${resources.length} courts), ${hosts.size} hosts`);
