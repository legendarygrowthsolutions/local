import { expect, test } from "@playwright/test";
import { login, uniquePhone } from "./helpers";

test.describe("host and superadmin golden paths", () => {
  test.skip(({ isMobile }) => isMobile, "Console flows are covered on desktop; mobile layout is covered by the a11y suite");

  test("apply → superadmin approves → host lists an event → moderation → live on local.", async ({ page }) => {
    const phone = uniquePhone();
    await login(page, phone);
    await page.request.patch("/api/me", { data: { name: "Asha Organiser", gender: "female", dob: "1993-05-05", interests: [] } });

    // Apply (free listings only)
    await page.goto("/host/apply");
    await page.getByRole("radio", { name: /Community/ }).click();
    await page.getByPlaceholder("e.g. Tidewater Collective").fill("Playwright Readers");
    await page.getByRole("button", { name: "Next: verification" }).click();
    await page.getByPlaceholder("What you run, for whom, and what makes it good.").fill("A friendly reading circle that meets every fortnight in a cafe.");
    await page.getByRole("radio", { name: /Free listings only/ }).click();
    await page.getByRole("button", { name: "Next: review" }).click();
    await page.getByRole("button", { name: /submit application/i }).click();
    await expect(page.getByRole("heading", { name: /reviewing it/i })).toBeVisible();

    // Superadmin approves
    await login(page, "9000000001");
    await page.goto("/admin/hosts?tab=pending");
    await page.getByRole("link", { name: /Playwright Readers/ }).click();
    await page.getByRole("button", { name: "Approve host" }).click();
    await expect(page.getByText("Playwright Readers approved")).toBeVisible();

    // Host creates a free RSVP listing through the wizard
    await login(page, phone);
    await page.goto("/host/listings/new");
    await page.getByPlaceholder(/Sunday Stand-up Showcase/).fill("Playwright Silent Reading");
    await page.getByRole("button", { name: "Meetups" }).click();
    await page.getByRole("textbox").nth(1).fill("Read quietly together for an hour, then chat");
    await page.locator("textarea").first().fill("Bring any book you like. We read in silence for an hour, then talk about what we're reading over coffee. All welcome.");
    await page.getByRole("button", { name: /continue/i }).last().click();
    await page.getByPlaceholder("e.g. The Courtyard Studio").fill("Paper Boat Cafe");
    await page.getByRole("combobox").first().selectOption({ index: 1 });
    await page.getByPlaceholder("Building, street, landmark").fill("12 Lake Road, near the market");
    await page.getByRole("button", { name: /continue/i }).last().click();
    await page.getByRole("radio", { name: /Free RSVP/ }).click();
    await page.getByRole("button", { name: /continue/i }).last().click();
    await page.getByRole("button", { name: /continue/i }).last().click();
    await page.getByRole("button", { name: /submit for review/i }).click();
    await expect(page).toHaveURL(/\/host\/listings$/);
    await expect(page.getByText("Playwright Silent Reading")).toBeVisible();
    await expect(page.getByText("In review").first()).toBeVisible();

    // Superadmin publishes
    await login(page, "9000000001");
    await page.goto("/admin/listings?tab=review");
    await page.getByRole("link", { name: /Playwright Silent Reading/ }).click();
    await page.getByRole("button", { name: /approve & publish/i }).click();
    await expect(page.getByText("Published")).toBeVisible();

    // Live for everyone
    await page.goto("/admin/listings?tab=live");
    await page.getByRole("link", { name: /Playwright Silent Reading/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Playwright Silent Reading" })).toBeVisible();
    const href = await page.getByRole("link", { name: /view on local\./i }).getAttribute("href");
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1, name: "Playwright Silent Reading" })).toBeVisible();
    await expect(page.getByRole("link", { name: "RSVP" }).first()).toBeVisible();

    // The host renames the live listing: it goes to review while guests keep seeing the live version.
    await login(page, phone);
    const { items } = (await (await page.request.get("/api/host/listings")).json()) as { items: { id: string; title: string }[] };
    const id = items.find((x) => x.title === "Playwright Silent Reading")!.id;
    await page.goto(`/host/listings/${id}/edit`);
    await page.getByPlaceholder(/Sunday Stand-up Showcase/).fill("Playwright Silent Reading Club");
    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText(/sent for review/i)).toBeVisible();
    await expect(page.getByText(/Edit in review/)).toBeVisible();
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1, name: "Playwright Silent Reading" })).toBeVisible();

    // Superadmin sees the before/after and approves the edit.
    await login(page, "9000000001");
    await page.goto("/admin/listings?tab=review");
    await page.getByRole("link", { name: /Playwright Silent Reading/ }).click();
    await expect(page.getByText("Edit to a live listing")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Playwright Silent Reading Club" })).toBeVisible();
    await page.getByRole("button", { name: /approve edit/i }).click();
    await expect(page.getByText("Edit approved and live")).toBeVisible();
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1, name: "Playwright Silent Reading Club" })).toBeVisible();
  });

  test("owner sees money; manager doesn't — in the UI and the API", async ({ page }) => {
    await login(page, "9000000003");
    await page.goto("/host");
    await expect(page.getByText("Gross sales · owner only")).toBeVisible();
    await expect(page.getByRole("link", { name: /Payouts/ })).toBeVisible();

    await login(page, "9000000004");
    await page.goto("/host");
    await expect(page.getByText("Gross sales · owner only")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Payouts/ })).toHaveCount(0);
    expect((await page.request.get("/api/host/payouts")).status()).toBe(403);
    const b = await (await page.request.get("/api/host/bookings?when=upcoming")).json();
    expect(b.items.every((x: { amount: number | null }) => x.amount === null)).toBe(true);
    await page.goto("/host/payouts");
    await expect(page).toHaveURL(/denied=1/);
  });
});
