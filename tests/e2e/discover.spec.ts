import { expect, test } from "@playwright/test";

test.describe("discovery", () => {
  test("home → category → tap a card → detail (card covers morph via view transitions)", async ({ page }) => {
    await page.goto("/mumbai");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.getByRole("link", { name: "Workshops", exact: true }).first().click();
    await expect(page).toHaveURL(/\/mumbai\/workshops/);
    const first = page.locator("main a[href*='/e/']").first();
    const title = (await first.locator("h3").textContent())!.trim();
    await first.locator("[aria-hidden='true']").first().click(); // tap the cover, as people do
    await expect(page).toHaveURL(/\/mumbai\/e\//);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  });

  test("search filters results as you type, and filters persist in the URL", async ({ page }) => {
    await page.goto("/mumbai/search");
    await page.getByRole("searchbox", { name: "Search" }).fill("pickleball");
    await expect(page).toHaveURL(/q=pickleball/);
    await expect(page.getByRole("button", { name: /^All · \d+$/ })).toBeVisible();
    await expect(page.locator("main h3").first()).toBeVisible();
    await page.getByRole("button", { name: /^Courts · \d+$/ }).click();
    await expect(page).toHaveURL(/kind=venue/);
    await page.getByRole("button", { name: /^filters/i }).click();
    await page.getByRole("checkbox", { name: "Free only" }).check();
    await page.getByRole("button", { name: /^(Show \d+ results?|No results|Show results)$/ }).click();
    await expect(page).toHaveURL(/price=free/);
  });

  test("city picker falls back to typing when location is unavailable", async ({ page, context }) => {
    await context.clearPermissions();
    await page.goto("/city");
    await page.getByPlaceholder("Type your city").fill("nag");
    await page.getByRole("button", { name: /Nagpur/ }).first().click();
    await page.getByRole("button", { name: "Explore Nagpur" }).click();
    await expect(page).toHaveURL(/\/nagpur$/);
  });
});
