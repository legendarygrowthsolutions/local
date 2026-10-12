import type { Booking, JourneyTemplate } from "@/contracts";
import { computePrice } from "@/lib/pricing";
import { addDays, formatMins, fromISO, istParts, toISO } from "@/lib/time";
import { hash01, seededTaken } from "./occupancy";
import type { MockDb } from "./store";

const NAMES = [
  "Aditya Rao", "Sneha Patil", "Vikram Singh", "Pooja Shah", "Rahul Nair", "Ishita Gupta", "Karan Malhotra", "Divya Menon",
  "Siddharth Jain", "Neha Kulkarni", "Aman Verma", "Tanya Bhatia", "Nikhil Joshi", "Priya Sharma", "Rohan Iyer", "Kavya Reddy",
  "Arnav Desai", "Simran Kaur", "Yash Agarwal", "Meghna Das", "Harsh Pandey", "Riya Sen", "Omkar Pawar", "Aisha Khan",
];

/**
 * Real-looking booking rows for hosts that have console users, so dashboards, booking lists,
 * check-in and payouts have data. They mirror inventory that fixtures already count as sold
 * (ticket "sold", seeded session occupancy, seeded court occupancy), hence `seeded: true`.
 */
export function seedHostBookings(db: MockDb, now = new Date()) {
  const hostIds = new Set(db.hostMembers.map((m) => m.hostId));
  const out: Booking[] = [];
  const tpl = (id: string) => db.templates.find((t) => t.id === id) as JourneyTemplate;
  const today = istParts(now).ymd;
  let n = 0;
  const person = (key: string) => {
    const name = NAMES[Math.floor(hash01(key) * NAMES.length)];
    const phone = "9" + String(Math.floor(hash01(key + "p") * 1e9)).padStart(9, "0");
    return { name, phone, answers: {} };
  };
  const code = (key: string) => "LCS" + Math.floor(hash01(key) * 36 ** 5).toString(36).toUpperCase().padStart(5, "0");

  // Ticketed listings
  for (const l of db.listings.filter((x) => hostIds.has(x.hostId))) {
    const t = tpl(l.templateId);
    if (t.bookingMode === "none") continue;
    const sessions = db.sessions.filter((s) => s.listingId === l.id);
    const tickets = db.ticketTypes.filter((x) => x.listingId === l.id);
    const finite = tickets.filter((x) => x.qty < 9999);
    const lines: { sessionId: string; ticketId: string; qty: number }[] = [];
    if (finite.length) {
      for (const tt of finite) {
        let left = Math.min(tt.sold, 36);
        let i = 0;
        while (left > 0) {
          const qty = Math.min(left, 1 + Math.floor(hash01(`${tt.id}|${i}`) * Math.min(4, tt.perOrderMax)));
          const sess = tt.sessionId ?? sessions[Math.floor(hash01(`${tt.id}|s|${i}`) * sessions.length)].id;
          lines.push({ sessionId: sess, ticketId: tt.id, qty });
          left -= qty;
          i++;
        }
      }
    } else {
      for (const s of sessions.slice(0, 12)) {
        let left = Math.floor(hash01(s.id) * s.capacity * 0.9);
        let i = 0;
        while (left > 0) {
          const tt = tickets[0];
          const qty = Math.min(left, 1 + Math.floor(hash01(`${s.id}|${i}`) * 3));
          lines.push({ sessionId: s.id, ticketId: tt.id, qty });
          left -= qty;
          i++;
        }
      }
    }
    for (const ln of lines) {
      const s = sessions.find((x) => x.id === ln.sessionId)!;
      const tt = tickets.find((x) => x.id === ln.ticketId)!;
      const key = `${l.id}|${n++}`;
      const sub = tt.price * ln.qty;
      const ended = new Date(s.endsAt) < now;
      const createdDaysAgo = 1 + Math.floor(hash01(key + "c") * 20);
      out.push({
        id: `bk_${code(key)}`,
        code: code(key),
        userId: "u_seed",
        kind: "listing",
        listingId: l.id,
        venueId: null,
        cityId: l.cityId,
        title: l.title,
        venueName: l.venueName,
        status: ended ? "checked_in" : "confirmed",
        items: [{ ticketTypeId: tt.id, sessionId: s.id, resourceId: null, startsAt: s.startsAt, endsAt: s.endsAt, label: tt.name, qty: ln.qty, unitPrice: tt.price }],
        price: computePrice(sub, t.fees),
        couponCode: null,
        attendee: person(key),
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        holdExpiresAt: null,
        createdAt: new Date(now.getTime() - createdDaysAgo * 86_400_000).toISOString(),
        paymentRef: sub > 0 ? `pay_seed_${n}` : null,
        seeded: true,
        checkedInAt: ended ? s.startsAt : null,
      });
    }
  }

  // Courts: mirror seeded occupancy from 7 days ago to 6 days ahead
  const nowMins = istParts(now).mins;
  for (const v of db.venues.filter((x) => hostIds.has(x.hostId))) {
    const t = tpl(v.templateId);
    for (const r of db.resources.filter((x) => x.venueId === v.id)) {
      const rule = db.slotRules.find((x) => x.resourceId === r.id)!;
      for (let d = -7; d <= 6; d++) {
        const date = addDays(today, d);
        for (const rng of seededTaken(r.id, date, rule.openMins, rule.closeMins)) {
          const key = `${r.id}|${date}|${rng.startMins}`;
          const peak = rule.peak.some((p) => p.days.includes(new Date(date + "T00:00:00Z").getUTCDay()) && rng.startMins >= p.fromMins && rng.startMins < p.toMins);
          const unit = peak ? rule.pricePeak : rule.priceBase;
          const past = d < 0 || (d === 0 && rng.endMins <= nowMins);
          const sport = db.categories.find((c) => c.slug === r.sport && c.parentId === "cat_sports")?.name ?? r.sport;
          const startsAt = toISO(date, rng.startMins);
          out.push({
            id: `bk_${code(key)}`,
            code: code(key),
            userId: "u_seed",
            kind: "venue",
            listingId: null,
            venueId: v.id,
            cityId: v.cityId,
            title: `${sport} · ${r.name}`,
            venueName: v.name,
            status: past ? (hash01(key + "ns") < 0.08 ? "confirmed" : "checked_in") : "confirmed",
            items: [{ ticketTypeId: null, sessionId: null, resourceId: r.id, startsAt, endsAt: toISO(date, rng.endMins), label: `${r.name} · ${formatMins(rng.startMins, { compact: true })} – ${formatMins(rng.endMins, { compact: true })}`, qty: 1, unitPrice: unit }],
            price: computePrice(unit, t.fees),
            couponCode: null,
            attendee: person(key),
            startsAt,
            endsAt: toISO(date, rng.endMins),
            holdExpiresAt: null,
            createdAt: new Date(new Date(startsAt).getTime() - (1 + Math.floor(hash01(key + "c") * 4)) * 86_400_000).toISOString(),
            paymentRef: `pay_seed_${n++}`,
            seeded: true,
            checkedInAt: past ? startsAt : null,
          });
        }
      }
    }
  }
  void fromISO;
  return out;
}
