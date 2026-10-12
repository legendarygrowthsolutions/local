import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const fx = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/db/seed/fixtures", `${name}.json`), "utf8"));

export const fixtures = {
  listings: fx("listings") as { id: string; slug: string; cityId: string; templateId: string; title: string }[],
  venues: fx("venues") as { id: string; slug: string; cityId: string; name: string }[],
};

export function listingFor(templateId: string, city = "c_mumbai", n = 0) {
  return fixtures.listings.filter((l) => l.cityId === city && l.templateId === templateId)[n];
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
