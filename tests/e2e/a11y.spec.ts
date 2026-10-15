import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hasHorizontalOverflow, login, nagpur } from "./helpers";

const event = nagpur.listing("tpl_ticket_single");
const venue = nagpur.venues[0];

const PUBLIC = [
  ["city picker", "/city"],
  ["home", "/nagpur"],
  ["category", "/nagpur/events"],
  ["sub-category", "/nagpur/sports/pickleball"],
  ["search", "/nagpur/search?when=weekend"],
  ["event detail", `/nagpur/e/${event.slug}`],
  ["venue detail", `/nagpur/v/${venue.slug}`],
  ["login", "/login"],
  ["booking: tickets", `/book/e/${event.id}`],
  ["booking: slots", `/book/v/${venue.id}`],
] as const;

async function audit(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const [name, path] of PUBLIC) {
  test(`${name} — no serious a11y issues, no sideways scroll`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await audit(page)).toEqual([]);
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });
}

test("signed-in areas — user, host, admin", async ({ page }) => {
  await login(page, "9876543210");
  for (const path of ["/me", "/me/bookings", "/legal"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await audit(page), path).toEqual([]);
    expect(await hasHorizontalOverflow(page), path).toBe(false);
  }
  await login(page, "9000000003");
  for (const path of ["/host", "/host/listings", "/host/bookings", "/host/checkin", "/host/slots", "/host/listings/new", "/host/payouts"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await audit(page), path).toEqual([]);
    expect(await hasHorizontalOverflow(page), path).toBe(false);
  }
  await login(page, "9000000001");
  for (const path of ["/admin", "/admin/hosts", "/admin/listings", "/admin/templates", "/admin/cities", "/admin/bookings", "/admin/payouts", "/admin/coupons"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await audit(page), path).toEqual([]);
    expect(await hasHorizontalOverflow(page), path).toBe(false);
  }
});
