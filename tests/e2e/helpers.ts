import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

const fx = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/mocks/fixtures", `${name}.json`), "utf8"));

export const fixtures = {
  listings: fx("listings") as { id: string; slug: string; cityId: string; templateId: string; title: string }[],
  venues: fx("venues") as { id: string; slug: string; cityId: string; name: string }[],
};

export function listingFor(templateId: string, city = "c_mumbai", n = 0) {
  return fixtures.listings.filter((l) => l.cityId === city && l.templateId === templateId)[n];
}

/** Log in through the mock OTP API; cookies are shared with the page's browser context. */
export async function login(page: Page, phone: string) {
  await page.request.post("/api/auth/logout");
  await page.request.post("/api/auth/otp/send", { data: { phone } });
  const r = await page.request.post("/api/auth/otp/verify", { data: { phone, code: "123456" } });
  return (await r.json()) as { user: { id: string; name: string | null }; isNew: boolean };
}

export const uniquePhone = () => `9${String(Date.now()).slice(-9)}`;

/** True if the document is wider than the viewport (horizontal scroll). */
export async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}
