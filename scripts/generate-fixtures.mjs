// Deterministic fixture generator for the phase 1 mock API.
// Run: npm run fixtures   (writes src/db/seed/fixtures/*.json)
// All dates are written relative to ANCHOR; the mock store shifts them to "today" at load,
// so the prototype never goes stale.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ANCHOR = "2026-10-11";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../src/db/seed/fixtures");

// ---------- utils ----------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261011);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (p) => rand() < p;
const slugify = (s) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const pad = (n) => String(n).padStart(2, "0");

function addDays(ymd, days) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekday(ymd) {
  return new Date(ymd + "T00:00:00Z").getUTCDay();
}
function iso(ymd, mins) {
  const dayOffset = Math.floor(mins / 1440);
  const m = mins % 1440;
  return `${addDays(ymd, dayOffset)}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00+05:30`;
}
function nextWeekday(fromYmd, wd) {
  let d = fromYmd;
  while (weekday(d) !== wd) d = addDays(d, 1);
  return d;
}
function jitter(v, amt) {
  return Math.round((v + (rand() - 0.5) * amt) * 10000) / 10000;
}

// ---------- cities & areas ----------
// Mumbai and Pune are hidden while we launch in Nagpur (switch them back on from /admin/cities).
const cities = [
  { id: "c_mumbai", slug: "mumbai", name: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777, active: false, tagline: "The city that never sits still" },
  { id: "c_pune", slug: "pune", name: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567, active: false, tagline: "Weekends, sorted" },
  { id: "c_nagpur", slug: "nagpur", name: "Nagpur", state: "Maharashtra", lat: 21.1458, lng: 79.0882, active: true, tagline: "Orange City, after hours" },
];

const areaSeed = {
  c_mumbai: [["Bandra West", 19.0596, 72.8295], ["Andheri West", 19.1364, 72.8296], ["Lower Parel", 18.9977, 72.8376], ["Powai", 19.1176, 72.906], ["Juhu", 19.1075, 72.8263], ["Colaba", 18.9067, 72.8147], ["Worli", 19.0176, 72.8162], ["Malad West", 19.1872, 72.8484]],
  c_pune: [["Koregaon Park", 18.5362, 73.894], ["Baner", 18.559, 73.7868], ["Kothrud", 18.5074, 73.8077], ["Viman Nagar", 18.5679, 73.9143], ["Hinjewadi", 18.5913, 73.7389], ["Kalyani Nagar", 18.5463, 73.9033], ["Aundh", 18.558, 73.8075], ["Wakad", 18.5987, 73.7652]],
  c_nagpur: [["Dharampeth", 21.1418, 79.064], ["Civil Lines", 21.1594, 79.0767], ["Sitabuldi", 21.1438, 79.0821], ["Manish Nagar", 21.087, 79.079], ["Ramdaspeth", 21.135, 79.071], ["Wardha Road", 21.1, 79.07], ["Sadar", 21.163, 79.082], ["Pratap Nagar", 21.118, 79.051]],
};
const areas = [];
for (const c of cities) {
  for (const [name, lat, lng] of areaSeed[c.id]) {
    areas.push({ id: `a_${c.slug}_${slugify(name)}`, cityId: c.id, slug: slugify(name), name, lat, lng });
  }
}
const areasOf = (cityId) => areas.filter((a) => a.cityId === cityId);

// ---------- categories ----------
const top = [
  ["events", "Events", "Event", "Ticket", "Gigs, stand-up, theatre and festivals"],
  ["sports", "Sports", "Sports", "Volleyball", "Book courts and turfs near you"],
  ["workshops", "Workshops", "Workshop", "Palette", "Learn something with your hands"],
  ["meetups", "Meetups", "Meetup", "Users", "Clubs, communities and new people"],
  ["exhibitions", "Exhibitions", "Exhibition", "Frame", "Art, design and heritage shows"],
  ["competitions", "Competitions", "Competition", "Trophy", "Quizzes, hackathons and tournaments"],
];
const subs = {
  events: [["comedy", "Comedy", "Mic"], ["music", "Music", "Music"], ["theatre", "Theatre", "Drama"], ["festivals", "Festivals", "PartyPopper"]],
  sports: [["pickleball", "Pickleball", "Activity"], ["badminton", "Badminton", "Activity"], ["football", "Football", "Activity"], ["box-cricket", "Box cricket", "Activity"], ["tennis", "Tennis", "Activity"], ["padel", "Padel", "Activity"]],
  workshops: [["art-craft", "Art & craft", "Brush"], ["cooking", "Food & drink", "Coffee"], ["wellness", "Wellness", "Sun"], ["photography", "Photography", "Camera"]],
  meetups: [["book-clubs", "Book clubs", "BookOpen"], ["running", "Running clubs", "Footprints"], ["startups", "Startups & tech", "Rocket"], ["board-games", "Board games", "Dices"]],
  exhibitions: [["art", "Art", "Frame"], ["design", "Design", "PenTool"], ["heritage", "Heritage", "Landmark"]],
  competitions: [["quizzes", "Quizzes", "Brain"], ["hackathons", "Hackathons", "Code"], ["tournaments", "Tournaments", "Medal"]],
};
const categories = [];
top.forEach(([slug, name, singular, icon, blurb], i) => {
  categories.push({ id: `cat_${slug}`, slug, name, singular, parentId: null, icon, sort: i, blurb });
  subs[slug].forEach(([s, n, ic], j) => {
    categories.push({ id: `cat_${slug}_${s}`, slug: s, name: n, singular: n, parentId: `cat_${slug}`, icon: ic, sort: j });
  });
});
const catId = (top, sub) => (sub ? `cat_${top}_${sub}` : `cat_${top}`);

// ---------- journey templates ----------
const fees = (pct, flat = 0) => ({ convenienceFeePct: pct, convenienceFeeFlat: flat, gstOnFeePct: 18, absorbFeeAllowed: true });
const rules = (o = {}) => ({ seatHoldMins: 10, waitlist: false, hostApprovalPerBooking: false, transferable: false, maxPerOrder: 6, minPerOrder: 1, ...o });
const step = (type, required = true, config = {}) => ({ type, required, config });
const templates = [
  { id: "tpl_info", name: "Info only", description: "Free listing, no booking. Directions, calendar and an external link.", allowedCategories: ["events", "exhibitions", "meetups"], bookingMode: "none", schedule: "single", pricing: "free", ticketScope: null, steps: [], rules: rules({ seatHoldMins: 0 }), fees: fees(0), cancellation: { policy: "none", hoursBefore: 0, refundPct: 0 }, ctaLabel: "Get directions", active: true },
  { id: "tpl_rsvp", name: "Free RSVP", description: "Register with an optional capacity cap and host approval.", allowedCategories: ["meetups", "events", "workshops"], bookingMode: "rsvp", schedule: "single", pricing: "free", ticketScope: null, steps: [step("pick_session", false), step("attendee_form"), step("confirmation")], rules: rules({ maxPerOrder: 2, seatHoldMins: 0 }), fees: fees(0), cancellation: { policy: "full_until", hoursBefore: 0, refundPct: 100 }, ctaLabel: "RSVP", active: true },
  { id: "tpl_ticket_single", name: "Ticketed (single day)", description: "Ticket tiers for one show, with a seat hold during checkout.", allowedCategories: ["events", "workshops"], bookingMode: "ticketed", schedule: "single", pricing: "paid", ticketScope: null, steps: [step("pick_tickets"), step("attendee_form", false), step("review"), step("payment"), step("confirmation")], rules: rules({ waitlist: true }), fees: fees(3.75), cancellation: { policy: "full_until", hoursBefore: 48, refundPct: 100 }, ctaLabel: "Book tickets", active: true },
  { id: "tpl_ticket_multi", name: "Ticketed (multi-day)", description: "Day tickets plus a season pass for festivals.", allowedCategories: ["events"], bookingMode: "ticketed", schedule: "multi_day", pricing: "paid", ticketScope: "both", steps: [step("pick_session"), step("pick_pass", false), step("pick_tickets"), step("attendee_form", false), step("review"), step("payment"), step("confirmation")], rules: rules({ waitlist: true, maxPerOrder: 8 }), fees: fees(3.75), cancellation: { policy: "full_until", hoursBefore: 72, refundPct: 100 }, ctaLabel: "Book tickets", active: true },
  { id: "tpl_recurring", name: "Recurring workshop", description: "Weekly sessions, booked per session.", allowedCategories: ["workshops"], bookingMode: "ticketed", schedule: "recurring", pricing: "paid", ticketScope: "per_session", steps: [step("pick_session"), step("pick_tickets"), step("attendee_form", false), step("review"), step("payment"), step("confirmation")], rules: rules({ maxPerOrder: 4 }), fees: fees(2.5), cancellation: { policy: "full_until", hoursBefore: 24, refundPct: 100 }, ctaLabel: "Book a seat", active: true },
  { id: "tpl_timed_entry", name: "Timed-entry exhibition", description: "A date range with entry windows each day.", allowedCategories: ["exhibitions"], bookingMode: "ticketed", schedule: "date_range", pricing: "paid", ticketScope: "per_session", steps: [step("pick_session"), step("pick_tickets"), step("review"), step("payment"), step("confirmation")], rules: rules({ maxPerOrder: 8 }), fees: fees(2.5), cancellation: { policy: "full_until", hoursBefore: 24, refundPct: 100 }, ctaLabel: "Book entry", active: true },
  { id: "tpl_court_60", name: "Court slots (hourly)", description: "Courts and turfs booked in 60-minute slots.", allowedCategories: ["sports"], bookingMode: "slot", schedule: "open_hours", pricing: "paid", ticketScope: null, steps: [step("pick_sport"), step("pick_session"), step("pick_resource"), step("pick_slots"), step("review"), step("payment"), step("confirmation")], rules: rules({ seatHoldMins: 8, maxPerOrder: 1 }), fees: fees(2, 0), cancellation: { policy: "full_until", hoursBefore: 6, refundPct: 100 }, ctaLabel: "Book a slot", active: true },
  { id: "tpl_court_30", name: "Court slots (30 min)", description: "Courts booked in 30-minute slots.", allowedCategories: ["sports"], bookingMode: "slot", schedule: "open_hours", pricing: "paid", ticketScope: null, steps: [step("pick_sport"), step("pick_session"), step("pick_resource"), step("pick_slots"), step("review"), step("payment"), step("confirmation")], rules: rules({ seatHoldMins: 8, maxPerOrder: 1 }), fees: fees(2, 0), cancellation: { policy: "full_until", hoursBefore: 6, refundPct: 100 }, ctaLabel: "Book a slot", active: true },
  { id: "tpl_competition", name: "Competition (teams)", description: "Divisions, a team form and an entry fee.", allowedCategories: ["competitions"], bookingMode: "registration", schedule: "single", pricing: "both", ticketScope: null, steps: [step("pick_tickets", true, { label: "Division" }), step("team_details"), step("review"), step("payment"), step("confirmation")], rules: rules({ maxPerOrder: 1 }), fees: fees(2.5), cancellation: { policy: "partial", hoursBefore: 72, refundPct: 50 }, ctaLabel: "Register", active: true },
];

// ---------- hosts ----------
const hostSeed = {
  c_mumbai: [["Tidewater Collective", "organiser"], ["Punchline Collective", "organiser"], ["Kiln House Studio", "instructor"], ["Bandra Bookworms", "community"], ["Smash Arena", "venue"], ["Turf Tribe", "venue"]],
  c_pune: [["The Courtyard Project", "organiser"], ["Deccan Live", "organiser"], ["Clay & Co. Studio", "instructor"], ["Koregaon Runners", "community"], ["Kick-off Turf", "venue"], ["Rally Point Sports", "venue"]],
  c_nagpur: [["Sitabuldi Sessions", "organiser"], ["Orange City Live", "organiser"], ["Mud & Wheel", "instructor"], ["Orange City Runners", "community"], ["Nagpur Sports Hub", "venue"], ["Vidarbha Courts", "venue"]],
};
const bios = {
  organiser: "We put on intimate gigs, comedy nights and weekend festivals, mostly in small rooms where you can actually see the stage.",
  instructor: "A small studio run by working artists. Classes are hands-on, capped at 12, and all materials are included.",
  community: "A volunteer-run community. Show up, say hi and you're one of us. Every meetup is free.",
  venue: "Well-kept courts, clean changing rooms and friendly staff. Equipment on rent at the front desk.",
};
const hosts = [];
for (const c of cities) {
  hostSeed[c.id].forEach(([brandName, type], i) => {
    hosts.push({
      id: `h_${c.slug}_${i + 1}`,
      userId: c.slug === "mumbai" && i === 0 ? "u_host" : null,
      type,
      brandName,
      cityId: c.id,
      bio: bios[type],
      instagram: "@" + slugify(brandName).replace(/-/g, ""),
      kycStatus: type === "community" ? "none" : "verified",
      status: "approved",
      since: `20${int(21, 25)}-0${int(1, 9)}-01`,
      contactName: pick(["Riya Kapoor", "Kabir Shah", "Ananya Iyer", "Rohit Kulkarni", "Meera Nair", "Arjun Deshpande"]),
      contactPhone: `98${int(10000000, 99999999)}`,
      email: `hello@${slugify(brandName).replace(/-/g, "")}.in`,
      website: null,
      gstin: type === "community" ? null : `27ABCDE${int(1000, 9999)}F1Z${int(1, 9)}`,
      expectedPerMonth: pick(["1–2", "3–5", "6–10", "10+"]),
      wantsPaid: type !== "community",
      documents: type === "community" ? [] : [
        { id: `doc_${c.slug}_${i}_pan`, kind: "pan", fileName: "pan-card.pdf", status: "verified" },
        { id: `doc_${c.slug}_${i}_bank`, kind: "bank", fileName: "cancelled-cheque.jpg", status: "verified" },
      ],
      reviewNote: null,
      submittedAt: iso(addDays(ANCHOR, -int(200, 600)), 600),
    });
  });
}
// Applications waiting for the superadmin (M6)
[
  ["Saffron Supper Club", "organiser", "c_mumbai", "Ishaan Mehra", true, 0],
  ["Courtside Collective", "venue", "c_pune", "Tanvi Joshi", true, 1],
  ["Inkwell Studio", "instructor", "c_nagpur", "Farhan Qureshi", false, 2],
  ["Bandra Run Crew", "community", "c_mumbai", "Zoya Fernandes", false, 3],
].forEach(([brandName, type, cityId, contactName, wantsPaid, n]) => {
  hosts.push({
    id: `h_app_${n + 1}`,
    userId: null,
    type,
    brandName,
    cityId,
    bio: bios[type],
    instagram: "@" + slugify(brandName).replace(/-/g, ""),
    kycStatus: wantsPaid ? "pending" : "none",
    status: n === 3 ? "changes" : "pending",
    since: ANCHOR.slice(0, 7) + "-01",
    contactName,
    contactPhone: `97${int(10000000, 99999999)}`,
    email: `hello@${slugify(brandName).replace(/-/g, "")}.in`,
    website: null,
    gstin: wantsPaid ? `27PQRSX${int(1000, 9999)}K1Z${int(1, 9)}` : null,
    expectedPerMonth: pick(["1–2", "3–5", "6–10"]),
    wantsPaid,
    documents: wantsPaid
      ? [
          { id: `doc_app_${n}_pan`, kind: "pan", fileName: "pan.pdf", status: "uploaded" },
          { id: `doc_app_${n}_bank`, kind: "bank", fileName: "bank-proof.pdf", status: "uploaded" },
        ]
      : [],
    reviewNote: n === 3 ? "Please add a link to a past run or your Instagram so we can verify the group." : null,
    submittedAt: iso(addDays(ANCHOR, -n), 600 + n * 90),
  });
});
const hostOf = (cityId, type, n = 0) => hosts.filter((h) => h.cityId === cityId && h.type === type)[n] ?? hosts.find((h) => h.cityId === cityId);

// ---------- listing seeds ----------
// [category, sub, template, title, summary, priceBase|null, timeMins, durationMins]
const S = (cat, sub, tpl, title, summary, price, time, dur, extra = {}) => ({ cat, sub, tpl, title, summary, price, time, dur, ...extra });
const seeds = [
  S("events", "comedy", "tpl_ticket_single", "Rohan Desai: Overthinking It", "A new hour of stand-up about rent, parents and the group chat.", 499, 20 * 60, 90, { host: "organiser", hostN: 1 }),
  S("events", "comedy", "tpl_ticket_single", "The Late Late Laugh Club", "Five comics, one late night. Fresh sets only.", 349, 21 * 60 + 30, 100, { host: "organiser", hostN: 1 }),
  S("events", "comedy", "tpl_rsvp", "Sunday Open Mic", "Sign up to perform or come to watch. Free entry, buy a coffee.", null, 18 * 60, 120, { host: "organiser", hostN: 1 }),
  S("events", "comedy", "tpl_ticket_single", "Aditi Rao: Main Character Energy", "Observational comedy from one of the sharpest new voices.", 599, 19 * 60 + 30, 75, { host: "organiser", hostN: 1 }),
  S("events", "music", "tpl_ticket_single", "Indie Nights: Monsoon Sessions", "Three bands from the city's indie scene, back to back.", 699, 20 * 60, 180, { host: "organiser" }),
  S("events", "music", "tpl_ticket_single", "Sufi Under the Stars", "An open-air evening of qawwali and Sufi poetry.", 899, 19 * 60, 150, { host: "organiser" }),
  S("events", "music", "tpl_ticket_single", "Jazz on the Terrace", "A quartet, a sunset and a very good playlist between sets.", 799, 18 * 60 + 30, 150, { host: "organiser" }),
  S("events", "music", "tpl_ticket_single", "Retro Bollywood Night", "Seventies and eighties hits, live band, full dance floor.", 549, 21 * 60, 180, { host: "organiser" }),
  S("events", "music", "tpl_ticket_multi", "{City} Sound Festival", "Two days, three stages and thirty artists across indie, electronic and folk.", 1499, 15 * 60, 480, { host: "organiser", days: 2 }),
  S("events", "theatre", "tpl_ticket_single", "The Last Local Train", "A two-hander about strangers stuck on the final train home.", 450, 19 * 60 + 30, 90, { host: "organiser" }),
  S("events", "theatre", "tpl_ticket_single", "Chai, Cigarette aur Kahaniyan", "Short Hindi plays performed in the round.", 399, 18 * 60, 100, { host: "organiser" }),
  S("events", "theatre", "tpl_rsvp", "Improv Jam Night", "Audience suggestions, zero scripts. Free with RSVP.", null, 20 * 60, 90, { host: "organiser", hostN: 1 }),
  S("events", "festivals", "tpl_ticket_multi", "{City} Food & Flea Weekend", "Sixty food stalls, independent brands and live music all weekend.", 299, 12 * 60, 600, { host: "organiser", days: 3 }),
  S("events", "festivals", "tpl_info", "Diwali Design Bazaar", "Handmade lamps, textiles and gifts from local makers. Free entry.", null, 11 * 60, 540, { host: "organiser" }),
  S("workshops", "art-craft", "tpl_recurring", "Wheel Throwing for Beginners", "Get your hands muddy and leave with two pieces of your own.", 1800, 11 * 60, 150, { host: "instructor" }),
  S("workshops", "art-craft", "tpl_recurring", "Weekend Watercolour Basics", "Washes, layering and loose florals. All materials included.", 1200, 16 * 60, 120, { host: "instructor" }),
  S("workshops", "art-craft", "tpl_ticket_single", "Block Printing Workshop", "Carve your own block and print a tote to take home.", 1500, 11 * 60, 180, { host: "instructor" }),
  S("workshops", "art-craft", "tpl_recurring", "Candle Making Studio", "Soy wax, scents and moulds. Make three candles in an evening.", 1100, 18 * 60, 120, { host: "instructor" }),
  S("workshops", "cooking", "tpl_recurring", "Sourdough from Scratch", "Starter, shaping and scoring. Take home a loaf and a starter.", 2200, 10 * 60, 210, { host: "instructor" }),
  S("workshops", "cooking", "tpl_ticket_single", "{City} Street Food Cook-along", "Cook five street-food classics with a chef who grew up on them.", 1600, 17 * 60, 150, { host: "instructor" }),
  S("workshops", "wellness", "tpl_rsvp", "Sunrise Yoga in the Park", "A gentle flow for all levels. Bring a mat and water.", null, 6 * 60 + 30, 60, { host: "community" }),
  S("workshops", "wellness", "tpl_recurring", "Breathwork & Sound Bath", "Guided breathing followed by a 40-minute sound bath.", 900, 19 * 60, 75, { host: "instructor" }),
  S("workshops", "photography", "tpl_recurring", "Phone Photography Walk", "Learn composition and light on a two-hour walk.", 799, 7 * 60, 120, { host: "instructor" }),
  S("workshops", "photography", "tpl_ticket_single", "Portrait Lighting 101", "Studio lights, reflectors and posing. Bring any camera.", 2500, 14 * 60, 180, { host: "instructor" }),
  S("meetups", "book-clubs", "tpl_rsvp", "Silent Book Club", "Bring a book, read quietly for an hour, then chat if you like.", null, 17 * 60, 120, { host: "community" }),
  S("meetups", "running", "tpl_rsvp", "Saturday 5K Run Club", "A social 5K at an easy pace, followed by chai.", null, 6 * 60, 75, { host: "community" }),
  S("meetups", "startups", "tpl_rsvp", "Founders' Chai Morning", "Early-stage founders swapping notes over chai. No pitches.", null, 8 * 60 + 30, 90, { host: "community" }),
  S("meetups", "board-games", "tpl_ticket_single", "Board Game Night", "A library of 200 games and someone to teach you any of them.", 249, 19 * 60, 180, { host: "community" }),
  S("meetups", "art", "tpl_rsvp", "Sketchwalk: Old {City}", "Draw the city's old lanes with other sketchers. All levels.", null, 7 * 60 + 30, 150, { host: "community", subOverride: null, catOverride: "meetups" }),
  S("meetups", "startups", "tpl_info", "Product Folks Meetup", "Talks and demos from product people in the city.", null, 18 * 60 + 30, 150, { host: "community" }),
  S("exhibitions", "art", "tpl_timed_entry", "Monsoon Lines: Contemporary Ink", "Forty works on paper by artists from the western coast.", 200, 11 * 60, 0, { host: "organiser", range: 21 }),
  S("exhibitions", "heritage", "tpl_timed_entry", "Textiles of the Deccan", "Paithani, Himroo and Khun: three centuries of weaving.", 150, 11 * 60, 0, { host: "organiser", range: 18 }),
  S("exhibitions", "design", "tpl_timed_entry", "Future Homes: Design Expo", "Furniture, materials and small-space ideas from young studios.", 300, 11 * 60, 0, { host: "organiser", range: 10 }),
  S("exhibitions", "art", "tpl_info", "Light & Shadow: A Photo Show", "Street photography from the city's photo walk community. Free entry.", null, 11 * 60, 480, { host: "community" }),
  S("exhibitions", "art", "tpl_timed_entry", "Stories in Clay", "Contemporary ceramics, from tableware to sculpture.", 100, 11 * 60, 0, { host: "instructor", range: 14 }),
  S("competitions", "quizzes", "tpl_competition", "City Quiz League: Season 4", "Teams of up to four, eight rounds, one very smug winner.", 800, 18 * 60, 180, { host: "community" }),
  S("competitions", "hackathons", "tpl_competition", "48h Civic Hackathon", "Build something useful for your city in a weekend. Mentors and meals included.", 0, 10 * 60, 2880, { host: "community" }),
  S("competitions", "tournaments", "tpl_competition", "Weekend Pickleball Open", "Doubles tournament with beginner and intermediate draws.", 1200, 8 * 60, 480, { host: "venue" }),
  S("competitions", "tournaments", "tpl_competition", "Corporate Box Cricket Cup", "Six-a-side box cricket for office teams. Knockout format.", 6000, 9 * 60, 540, { host: "venue" }),
  S("competitions", "quizzes", "tpl_competition", "Battle of the Bands", "Inter-college band competition with a studio session as the prize.", 1500, 16 * 60, 300, { host: "organiser", catOverride: "competitions" }),
];

const venueWords = ["The Courtyard", "Tin Roof", "Blue Door", "Paper Boat", "Lantern", "Banyan", "Copper Kettle", "The Attic", "Indigo", "Mango Tree", "Monsoon", "Saffron", "The Loft", "Cobalt", "Sandbox", "Jamun"];
const venueKinds = ["Studio", "Social", "House", "Terrace", "Theatre", "Café", "Hall", "Garden", "Collective", "Room"];

const thingsByTpl = {
  tpl_ticket_single: ["Entry from 30 minutes before start", "Age 16+ (ID may be checked)", "Tickets are non-transferable", "Limited seating, first come first seated"],
  tpl_ticket_multi: ["Day tickets are valid for the chosen day only", "The season pass covers all days", "Re-entry allowed with wristband", "Age 18+ for the bar area"],
  tpl_recurring: ["All materials included", "Wear clothes you don't mind getting messy", "Max 12 people per batch", "Arrive 10 minutes early"],
  tpl_rsvp: ["Free entry, RSVP to save a spot", "Please cancel if you can't make it", "All levels welcome"],
  tpl_timed_entry: ["Choose an entry window; stay as long as you like", "Students get a discount at entry with ID", "Photography allowed without flash", "Wheelchair accessible"],
  tpl_info: ["Free entry, no booking needed", "Open to all ages", "Nearest metro and parking are on the map"],
  tpl_competition: ["Registration closes 48 hours before start", "One registration per team", "Rules and fixtures are shared by email", "Bring a valid ID for every team member"],
};

const formsByTpl = {
  tpl_rsvp: [{ id: "f_heard", label: "How did you hear about us?", type: "select", options: ["Instagram", "A friend", "local.", "Other"], required: false }],
  tpl_ticket_single: [{ id: "f_insta", label: "Instagram handle (optional)", type: "text", required: false }],
  tpl_competition: [
    { id: "f_team", label: "Team name", type: "text", required: true },
    { id: "f_members", label: "Team size", type: "select", options: ["2", "3", "4", "5", "6"], required: true },
    { id: "f_org", label: "College or company", type: "text", required: false },
  ],
};

// ---------- build listings, sessions, ticket types ----------
const listings = [];
const sessions = [];
const ticketTypes = [];
let sid = 0;
let tid = 0;

function cityName(c, s) {
  return s.replace(/\{City\}/g, c.name);
}

for (const c of cities) {
  const cAreas = areasOf(c.id);
  seeds.forEach((s, i) => {
    // drop a few per city so cities don't look identical
    if ((i + c.slug.length) % 9 === 0 && s.tpl !== "tpl_competition") return;
    const area = cAreas[(i * 3 + c.slug.length) % cAreas.length];
    const title = cityName(c, s.title);
    const venueName = `${venueWords[(i + c.slug.length * 2) % venueWords.length]} ${venueKinds[(i * 7 + c.slug.length) % venueKinds.length]}`;
    const host = hostOf(c.id, s.host, s.hostN ?? 0);
    const id = `l_${c.slug}_${pad(i + 1)}`;
    const slug = slugify(title) + "-" + c.slug.slice(0, 3) + (i + 1);
    const tpl = templates.find((t) => t.id === s.tpl);
    const dayOffset = (i * 5 + c.slug.length * 3) % 30;
    let startDay = addDays(ANCHOR, dayOffset);
    // weekend-ish events on weekends
    if (["events", "meetups"].includes(s.cat) && i % 3 !== 0) startDay = nextWeekday(addDays(ANCHOR, dayOffset % 14), i % 2 ? 6 : 5);
    if (i < 6) startDay = addDays(ANCHOR, i % 3); // a few happening very soon

    const listing = {
      id,
      hostId: host.id,
      cityId: c.id,
      areaId: area.id,
      categoryId: catId(s.catOverride ?? s.cat),
      subcategoryId: s.subOverride === null || s.catOverride ? null : catId(s.cat, s.sub),
      templateId: s.tpl,
      slug,
      title,
      summary: cityName(c, s.summary),
      description: [
        cityName(c, s.summary),
        `Hosted by ${host.brandName} at ${venueName}, ${area.name}. ${tpl.bookingMode === "none" ? "Just walk in — there is nothing to book." : "Spots are limited, so book early."}`,
        "Expect a relaxed crowd, good sound and a team that genuinely cares about the details. Doors open a little before the start time; grab a drink and settle in.",
      ].join("\n\n"),
      media: [],
      venueName,
      address: `${venueName}, ${int(2, 48)} ${pick(["Hill Road", "Link Road", "Main Street", "Station Road", "MG Road", "Lake Road", "Temple Lane"])}, ${area.name}, ${c.name}`,
      lat: jitter(area.lat, 0.01),
      lng: jitter(area.lng, 0.01),
      ageLimit: pick(["All ages", "16+", "18+", "All ages", "12+"]),
      languages: s.sub === "theatre" && i % 2 ? ["Hindi"] : pick([["English"], ["English", "Hindi"], ["Hindi", "Marathi"], ["English"]]),
      tags: [s.sub, s.cat, tpl.pricing === "free" || s.price === null ? "free" : "paid"].filter(Boolean),
      thingsToKnow: thingsByTpl[s.tpl],
      externalUrl: s.tpl === "tpl_info" ? "https://example.com" : null,
      status: "live",
      featuredRank: null,
      formFields: formsByTpl[s.tpl] ?? [],
      createdAt: iso(addDays(ANCHOR, -int(3, 40)), 600),
    };
    listings.push(listing);

    const mkSession = (day, startMins, durMins, capacity, label) => {
      const sess = { id: `s_${++sid}`, listingId: id, startsAt: iso(day, startMins), endsAt: iso(day, startMins + durMins), capacity, label };
      sessions.push(sess);
      return sess;
    };
    const mkTicket = (o) => {
      const t = { id: `t_${++tid}`, listingId: id, sessionId: null, description: "", perOrderMax: tpl.rules.maxPerOrder, isPass: false, sold: 0, ...o };
      ticketTypes.push(t);
      return t;
    };

    switch (s.tpl) {
      case "tpl_info": {
        mkSession(startDay, s.time, s.dur || 480, 0, "Open day");
        break;
      }
      case "tpl_rsvp": {
        const cap = pick([30, 40, 60, 80]);
        mkSession(startDay, s.time, s.dur, cap, "RSVP");
        mkTicket({ name: "Free RSVP", price: 0, qty: cap, sold: int(Math.floor(cap * 0.3), cap - 2), perOrderMax: 2 });
        break;
      }
      case "tpl_ticket_single": {
        const cap = pick([80, 120, 150, 200]);
        mkSession(startDay, s.time, s.dur, cap, "Show");
        const p = s.price;
        mkTicket({ name: "Early bird", description: "Limited release", price: Math.round((p * 0.8) / 50) * 50 - 1 || p, qty: 30, sold: chance(0.6) ? 30 : int(20, 29), perOrderMax: 4 });
        mkTicket({ name: "General admission", description: "Standing / open seating", price: p, qty: cap - 50, sold: int(Math.floor((cap - 50) * 0.3), cap - 55) });
        if (s.cat === "events") mkTicket({ name: "Front row", description: "Reserved seat in the first two rows", price: Math.round((p * 1.8) / 50) * 50 - 1, qty: 20, sold: int(12, 19), perOrderMax: 2 });
        break;
      }
      case "tpl_ticket_multi": {
        const days = s.days ?? 2;
        const firstDay = nextWeekday(addDays(ANCHOR, 4 + (i % 10)), 5 + (days === 2 ? 1 : 0));
        const p = s.price;
        const dayNames = ["Day 1", "Day 2", "Day 3"];
        for (let d = 0; d < days; d++) {
          const day = addDays(firstDay, d);
          const sess = mkSession(day, s.time, s.dur, 1500, dayNames[d]);
          mkTicket({ sessionId: sess.id, name: `${dayNames[d]} ticket`, description: "Entry for one day", price: p, qty: 1500, sold: int(600, 1450) });
        }
        mkTicket({ name: `${days}-day season pass`, description: "Entry on every day of the festival", price: Math.round((p * days * 0.8) / 50) * 50 - 1, qty: 500, sold: int(200, 480), isPass: true });
        break;
      }
      case "tpl_recurring": {
        const wd = pick([6, 0, 6, 0, 3]);
        let d = nextWeekday(addDays(ANCHOR, i % 4), wd);
        for (let w = 0; w < 6; w++) {
          mkSession(d, s.time, s.dur, 12, `Batch ${w + 1}`);
          d = addDays(d, 7);
        }
        mkTicket({ name: "One seat", description: "Includes all materials", price: s.price, qty: 9999, perOrderMax: 4 });
        mkTicket({ name: "Pair (2 seats)", description: "Bring a friend and save", price: Math.round((s.price * 1.8) / 50) * 50, qty: 9999, perOrderMax: 2 });
        break;
      }
      case "tpl_timed_entry": {
        const startD = addDays(ANCHOR, -int(2, 6));
        for (let d = 0; d < (s.range ?? 14); d++) {
          const day = addDays(startD, d);
          if (weekday(day) === 1) continue; // closed Mondays
          for (const [from, label] of [[11 * 60, "11 AM – 1 PM"], [13 * 60, "1 – 3 PM"], [15 * 60, "3 – 5 PM"], [17 * 60, "5 – 7 PM"]]) {
            mkSession(day, from, 120, 60, label);
          }
        }
        mkTicket({ name: "Adult", price: s.price, qty: 99999, perOrderMax: 8 });
        mkTicket({ name: "Student", description: "Valid student ID required at entry", price: Math.round(s.price * 0.5), qty: 99999, perOrderMax: 8 });
        mkTicket({ name: "Child (5–12)", description: "Under 5 enter free", price: Math.round(s.price * 0.3 / 10) * 10, qty: 99999, perOrderMax: 6 });
        break;
      }
      case "tpl_competition": {
        mkSession(addDays(ANCHOR, 8 + (i % 12)), s.time, s.dur, 64, "Main event");
        if (s.price === 0) {
          mkTicket({ name: "Team registration", description: "Teams of 2–5. Free to enter", price: 0, qty: 40, sold: int(20, 38), perOrderMax: 1 });
        } else {
          mkTicket({ name: "Open division", description: "Anyone can enter", price: s.price, qty: 32, sold: int(10, 30), perOrderMax: 1 });
          mkTicket({ name: "Beginner division", description: "For first-timers", price: Math.round(s.price * 0.75), qty: 16, sold: int(4, 15), perOrderMax: 1 });
        }
        break;
      }
    }
  });
  // featured: pick a few paid ones close to now
  const cityListings = listings.filter((l) => l.cityId === c.id && l.templateId !== "tpl_info");
  [1, 4, 8, 12, 14].forEach((idx, r) => {
    const l = cityListings[idx % cityListings.length];
    if (l) l.featuredRank = r + 1;
  });
}

// ---------- venues, resources, slot rules ----------
const sportPrice = { pickleball: [600, 800], badminton: [400, 550], football: [1400, 1800], "box-cricket": [1200, 1600], tennis: [700, 900], padel: [1600, 2000] };
const sportSurface = { pickleball: ["Acrylic", "Cushioned acrylic"], badminton: ["Wooden", "Synthetic mat"], football: ["Artificial turf"], "box-cricket": ["Artificial turf"], tennis: ["Hard court", "Clay"], padel: ["Synthetic grass"] };
const courtWord = { pickleball: "Court", badminton: "Court", football: "Turf", "box-cricket": "Box", tennis: "Court", padel: "Court" };
const venueBrands = ["Smash Arena", "Pickle Republic", "Turf Tribe", "Shuttle House", "Box Cricket Bay", "Ace Tennis Centre", "Padel Point", "Kick-off Arena", "Dropshot Club", "Court Nine"];
const venueSports = [["pickleball", "badminton"], ["pickleball"], ["football", "box-cricket"], ["badminton"], ["box-cricket"], ["tennis", "pickleball"], ["padel"], ["football"], ["badminton", "pickleball"], ["pickleball", "padel"]];
const amenitySets = [["Parking", "Washrooms", "Drinking water", "Changing rooms", "Equipment on rent"], ["Floodlights", "Parking", "Washrooms", "Café"], ["Changing rooms", "Showers", "Lockers", "Equipment on rent", "First aid"], ["Washrooms", "Drinking water", "Seating area"]];

const venues = [];
const resources = [];
const slotRules = [];
const blocks = [];
for (const c of cities) {
  const cAreas = areasOf(c.id);
  const venueHosts = hosts.filter((h) => h.cityId === c.id && h.type === "venue");
  venueBrands.forEach((brand, i) => {
    const area = cAreas[(i * 5 + c.slug.length) % cAreas.length];
    const name = `${brand} ${area.name.replace(/ (West|East)$/, "")}`;
    const sports = venueSports[i];
    const half = sports.every((s) => s === "badminton" || s === "pickleball") && i % 2 === 0;
    const id = `v_${c.slug}_${pad(i + 1)}`;
    const venue = {
      id,
      hostId: venueHosts[i % venueHosts.length].id,
      cityId: c.id,
      areaId: area.id,
      templateId: half ? "tpl_court_30" : "tpl_court_60",
      slug: slugify(name),
      name,
      summary: `${sports.map((s) => s.replace("-", " ")).join(" & ")} in ${area.name}. ${half ? "Book in 30-minute slots." : "Book by the hour."}`,
      description: `${name} has ${sports.length > 1 ? "courts for " + sports.join(" and ").replace(/-/g, " ") : "well-kept " + sports[0].replace("-", " ") + " courts"}, floodlit for evening games. Walk-ins are welcome when slots are free, but evenings and weekends fill up fast, so book ahead.`,
      media: [],
      address: `${name}, ${int(2, 90)} ${pick(["Link Road", "Ring Road", "Station Road", "Sports Complex Lane", "Club Road"])}, ${area.name}, ${c.name}`,
      lat: jitter(area.lat, 0.012),
      lng: jitter(area.lng, 0.012),
      amenities: amenitySets[i % amenitySets.length],
      hoursLabel: "6 AM – 11 PM",
      sports,
      thingsToKnow: ["Non-marking shoes are compulsory", "Arrive 10 minutes before your slot", "Rackets and balls available on rent", "Free cancellation up to 6 hours before"],
      featuredRank: i < 3 ? i + 1 : null,
      status: "live",
    };
    venues.push(venue);
    let rn = 0;
    for (const sport of sports) {
      const count = sport === "football" || sport === "box-cricket" ? int(1, 2) : int(2, 4);
      for (let k = 0; k < count; k++) {
        rn++;
        const indoor = sport === "badminton" || (sport === "pickleball" && k < 2);
        const rid = `r_${id}_${rn}`;
        const len = half ? (k === count - 1 && count > 1 ? 60 : 30) : 60;
        resources.push({ id: rid, venueId: id, name: `${courtWord[sport]} ${k + 1}`, sport, indoor, surface: pick(sportSurface[sport]), slotLengthMins: len, capacity: sport === "football" ? 14 : sport === "box-cricket" ? 12 : 4 });
        const [base, peak] = sportPrice[sport];
        slotRules.push({ id: `sr_${rid}`, resourceId: rid, openMins: 6 * 60, closeMins: 23 * 60, minMins: len, maxMins: 180, bufferMins: 0, advanceDays: 14, priceBase: base - (indoor ? 0 : 100), pricePeak: peak - (indoor ? 0 : 100), peak: [{ days: [1, 2, 3, 4, 5], fromMins: 18 * 60, toMins: 22 * 60 }, { days: [0, 6], fromMins: 7 * 60, toMins: 22 * 60 }] });
        if (rn === 1) blocks.push({ id: `b_${rid}`, resourceId: rid, startsAt: iso(addDays(ANCHOR, 2), 6 * 60), endsAt: iso(addDays(ANCHOR, 2), 9 * 60), reason: "Maintenance" });
      }
    }
  });
}

// ---------- users & demo bookings ----------
const users = [
  { id: "u_demo", phone: "9876543210", name: "Aarav Mehta", gender: "male", dob: "1996-04-12", cityId: "c_mumbai", interests: ["comedy", "pickleball", "art-craft"], role: "user", saved: [], createdAt: iso(addDays(ANCHOR, -120), 600) },
  { id: "u_host", phone: "9000000002", name: "Riya Kapoor", gender: "female", dob: "1992-09-30", cityId: "c_mumbai", interests: ["music"], role: "host", saved: [], createdAt: iso(addDays(ANCHOR, -300), 600) },
  { id: "u_admin", phone: "9000000001", name: "Admin", gender: "na", dob: "1990-01-01", cityId: "c_mumbai", interests: [], role: "admin", saved: [], createdAt: iso(addDays(ANCHOR, -400), 600) },
  { id: "u_venue", phone: "9000000003", name: "Kabir Shah", gender: "male", dob: "1988-02-14", cityId: "c_mumbai", interests: ["pickleball"], role: "host", saved: [], createdAt: iso(addDays(ANCHOR, -500), 600) },
  { id: "u_manager", phone: "9000000004", name: "Neha Joshi", gender: "female", dob: "1997-07-21", cityId: "c_mumbai", interests: ["badminton"], role: "host", saved: [], createdAt: iso(addDays(ANCHOR, -90), 600) },
];

// Host teams (PLAN §11.1): owners see money; managers run bookings and check-in.
const hostMembers = [
  { id: "hm_1", hostId: "h_mumbai_1", userId: "u_host", phone: "9000000002", name: "Riya Kapoor", role: "owner", status: "active", invitedBy: null, createdAt: iso(addDays(ANCHOR, -300), 600) },
  { id: "hm_2", hostId: "h_mumbai_5", userId: "u_venue", phone: "9000000003", name: "Kabir Shah", role: "owner", status: "active", invitedBy: null, createdAt: iso(addDays(ANCHOR, -500), 600) },
  { id: "hm_3", hostId: "h_mumbai_5", userId: "u_manager", phone: "9000000004", name: "Neha Joshi", role: "manager", status: "active", invitedBy: "u_venue", createdAt: iso(addDays(ANCHOR, -90), 600) },
  { id: "hm_4", hostId: "h_mumbai_5", userId: null, phone: "9000000005", name: null, role: "manager", status: "invited", invitedBy: "u_venue", createdAt: iso(addDays(ANCHOR, -2), 600) },
];

function price(subtotal, tpl) {
  if (subtotal === 0) return { subtotal: 0, discount: 0, convenienceFee: 0, gstOnFee: 0, total: 0 };
  const fee = Math.round(subtotal * tpl.fees.convenienceFeePct) / 100 + tpl.fees.convenienceFeeFlat;
  const gst = Math.round(fee * tpl.fees.gstOnFeePct) / 100;
  return { subtotal, discount: 0, convenienceFee: Math.round(fee * 100) / 100, gstOnFee: gst, total: Math.round((subtotal + fee + gst) * 100) / 100 };
}

const bookings = [];
function demoTicketBooking(listing, status, code) {
  const tpl = templates.find((t) => t.id === listing.templateId);
  const sess = sessions.find((s) => s.listingId === listing.id);
  const own = ticketTypes.filter((t) => t.listingId === listing.id && (t.sessionId === null || t.sessionId === sess.id));
  const tt = own.find((t) => t.name === "General admission") ?? own.at(-1);
  const qty = 2;
  bookings.push({
    id: `bk_${code}`, code, userId: "u_demo", kind: "listing", listingId: listing.id, venueId: null, cityId: listing.cityId,
    title: listing.title, venueName: `${listing.venueName}`, status,
    items: [{ ticketTypeId: tt.id, sessionId: sess.id, resourceId: null, startsAt: sess.startsAt, endsAt: sess.endsAt, label: tt.name, qty, unitPrice: tt.price }],
    price: price(tt.price * qty, tpl), couponCode: null,
    attendee: { name: "Aarav Mehta", phone: "9876543210", answers: {} },
    startsAt: sess.startsAt, endsAt: sess.endsAt, holdExpiresAt: null, createdAt: iso(addDays(ANCHOR, -3), 700), paymentRef: "pay_demo_" + code,
  });
}
const mumListings = listings.filter((l) => l.cityId === "c_mumbai");
demoTicketBooking(mumListings.find((l) => l.templateId === "tpl_ticket_single"), "confirmed", "LCL7Q2KX");
demoTicketBooking(mumListings.filter((l) => l.templateId === "tpl_recurring")[0], "confirmed", "LCL3M9TP");
// a past one
const past = mumListings.find((l) => l.templateId === "tpl_ticket_single" && l.id !== bookings[0].listingId);
demoTicketBooking(past, "checked_in", "LCL8H4ND");
const pb = bookings.at(-1);
pb.startsAt = iso(addDays(ANCHOR, -9), 20 * 60); pb.endsAt = iso(addDays(ANCHOR, -9), 22 * 60);
pb.items[0].startsAt = pb.startsAt; pb.items[0].endsAt = pb.endsAt;
// a venue slot booking
{
  const v = venues.find((x) => x.cityId === "c_mumbai" && x.sports.includes("pickleball"));
  const r = resources.find((x) => x.venueId === v.id && x.sport === "pickleball");
  const rule = slotRules.find((x) => x.resourceId === r.id);
  const day = addDays(ANCHOR, 1);
  const startsAt = iso(day, 19 * 60), endsAt = iso(day, 20 * 60);
  const tpl = templates.find((t) => t.id === v.templateId);
  bookings.push({
    id: "bk_LCL5V1PB", code: "LCL5V1PB", userId: "u_demo", kind: "venue", listingId: null, venueId: v.id, cityId: v.cityId,
    title: `Pickleball · ${r.name}`, venueName: v.name, status: "confirmed",
    items: [{ ticketTypeId: null, sessionId: null, resourceId: r.id, startsAt, endsAt, label: `${r.name} · 7–8 PM`, qty: 1, unitPrice: rule.pricePeak }],
    price: price(rule.pricePeak, tpl), couponCode: null, attendee: { name: "Aarav Mehta", phone: "9876543210", answers: {} },
    startsAt, endsAt, holdExpiresAt: null, createdAt: iso(addDays(ANCHOR, -1), 900), paymentRef: "pay_demo_LCL5V1PB",
  });
}

const coupons = [
  { id: "cp_1", code: "LOCAL10", type: "pct", value: 10, maxDiscount: 200, description: "10% off, up to ₹200", perUserLimit: null, firstBookingOnly: false, minSubtotal: 0, validUntil: null },
  { id: "cp_2", code: "FIRST100", type: "flat", value: 100, maxDiscount: 100, description: "₹100 off your first booking", perUserLimit: 1, firstBookingOnly: true, minSubtotal: 200, validUntil: null },
];

// ---------- write ----------
mkdirSync(OUT, { recursive: true });
const files = { meta: { anchor: ANCHOR, generatedAt: new Date().toISOString() }, cities, areas, categories, templates, hosts, hostMembers, listings, sessions, ticketTypes, venues, resources, slotRules, blocks, users, bookings, coupons };
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(data, null, 1) + "\n");
}
console.log(
  Object.entries(files)
    .filter(([k]) => k !== "meta")
    .map(([k, v]) => `${k}: ${v.length}`)
    .join(" · "),
);
