import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const fx = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/db/seed/fixtures", `${name}.json`), "utf8"));

export const fixtures = {
  listings: fx("listings") as { id: string; slug: string; cityId: string; templateId: string; title: string }[],
  venues: fx("venues") as { id: string; slug: string; cityId: string; name: string }[],
};

const sessions = fx("sessions") as { listingId: string; startsAt: string }[];
const anchor = (fx("meta") as { anchor: string }).anchor;
// Seeding shifts the fixture anchor to today, so "starts on or after anchor + 1 day" means "tomorrow
// or later": the listing can't have ended by the time the suite runs, whatever the time of day.
const tomorrow = new Date(Date.parse(anchor) + 86_400_000).toISOString().slice(0, 10);
const upcoming = (id: string) => sessions.some((s) => s.listingId === id) && sessions.filter((s) => s.listingId === id).every((s) => s.startsAt.slice(0, 10) >= tomorrow);

/** A demo listing (Mumbai/Pune are hidden at launch; switch the city on first, see `showCity`). */
export function listingFor(templateId: string, city = "c_mumbai", n = 0) {
  return fixtures.listings.filter((l) => l.cityId === city && l.templateId === templateId && upcoming(l.id))[n];
}

// Nagpur carries real, imported listings with absolute dates (scripts/crawl). Re-run the crawl when they go stale.
const imported = JSON.parse(readFileSync(join(process.cwd(), "src/db/seed/real/nagpur.json"), "utf8")) as {
  listings: { id: string; slug: string; templateId: string; title: string }[];
  sessions: { listingId: string; startsAt: string }[];
  ticketTypes: { listingId: string; qty: number; sold: number }[];
  venues: { id: string; slug: string; name: string }[];
};
const tomorrowIST = new Date(Date.now() + (330 + 24 * 60) * 60_000).toISOString().slice(0, 10);
export const nagpur = {
  venues: imported.venues,
  /** An imported listing on this template, every date at least a day away, with tickets left. */
  listing(templateId: string) {
    const l = imported.listings.find(
      (x) =>
        x.templateId === templateId &&
        imported.sessions.filter((s) => s.listingId === x.id).every((s) => s.startsAt.slice(0, 10) >= tomorrowIST) &&
        imported.ticketTypes.some((t) => t.listingId === x.id && t.sold < t.qty),
    );
    if (!l) throw new Error(`No upcoming imported ${templateId} listing — re-run the Nagpur crawl (scripts/crawl/README.md)`);
    return l;
  },
};

/** Switch a hidden demo city on or off as the superadmin (the session is left logged in as admin). */
export async function showCity(page: Page, slug: "mumbai" | "pune", active: boolean) {
  await login(page, "9000000001");
  const c = (fx("cities") as { id: string; slug: string; name: string; state: string; lat: number; lng: number; tagline: string }[]).find((x) => x.slug === slug)!;
  const r = await page.request.put(`/api/admin/cities/${c.id}`, { data: { name: c.name, slug: c.slug, state: c.state, lat: c.lat, lng: c.lng, tagline: c.tagline, active } });
  if (!r.ok()) throw new Error(`Couldn't update ${slug}: ${r.status()}`);
}

/**
 * Log in through the OTP API (the E2E server runs with OTP_PROVIDER=dev, so the send response
 * carries the code). Cookies are shared with the page's browser context.
 */
export async function login(page: Page, phone: string) {
  await page.request.post("/api/auth/logout");
  const sent = await page.request.post("/api/auth/otp/send", { data: { phone } });
  const { devCode } = (await sent.json()) as { devCode?: string };
  if (!devCode) throw new Error(`OTP send failed: ${sent.status()}`);
  const r = await page.request.post("/api/auth/otp/verify", { data: { phone, code: devCode } });
  return (await r.json()) as { user: { id: string; name: string | null }; isNew: boolean };
}

export const uniquePhone = () => `9${String(Date.now()).slice(-9)}`;

/** True if the document is wider than the viewport (horizontal scroll). */
export async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}
