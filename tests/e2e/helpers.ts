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

export function listingFor(templateId: string, city = "c_mumbai", n = 0) {
  return fixtures.listings.filter((l) => l.cityId === city && l.templateId === templateId && upcoming(l.id))[n];
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
