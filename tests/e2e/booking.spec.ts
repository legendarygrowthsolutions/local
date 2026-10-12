import { expect, test } from "@playwright/test";
import { fixtures, listingFor, login, uniquePhone } from "./helpers";

test.describe("user golden paths", () => {
  test("new user books tickets: login at checkout → profile → review → failed then successful payment → ticket", async ({ page }) => {
    const event = listingFor("tpl_ticket_single", "c_pune");
    await page.goto(`/pune/e/${event.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: event.title })).toBeVisible();
    await page.getByRole("link", { name: /book tickets/i }).last().click();
    await expect(page).toHaveURL(/\/book\/e\//);

    // Pick the first available tier, twice
    const add = page.getByRole("button", { name: /^Add (?!one)/ }).first();
    await add.click();
    await page.getByRole("button", { name: /^Add one/ }).first().click();
    await page.getByRole("button", { name: /continue · log in/i }).last().click();

    // OTP login as a brand-new user
    await expect(page).toHaveURL(/\/login/);
    await page.getByPlaceholder("98765 43210").fill(uniquePhone());
    const sent = page.waitForResponse((r) => r.url().endsWith("/api/auth/otp/send"));
    await page.getByRole("button", { name: "Get OTP" }).click();
    const { devCode } = (await (await sent).json()) as { devCode: string };
    // A wrong code shows the error state; then the development-mode code button signs in.
    await page.getByLabel("Digit 1").fill(devCode === "000000" ? "111111" : "000000");
    await expect(page.getByText("That code didn't match")).toBeVisible();
    await page.getByRole("button", { name: /^Use code/ }).click();

    // Profile
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel("Full name").fill("Playwright Tester");
    await page.getByRole("radio", { name: "Prefer not to say" }).click();
    await page.getByLabel("Day").fill("01");
    await page.getByLabel("Month").fill("01");
    await page.getByLabel("Year").fill("1995");
    await page.getByRole("button", { name: "Continue" }).click();

    // Back on the booking flow, past the selection
    await expect(page).toHaveURL(/step=(details|review)/);
    if (page.url().includes("step=details")) await page.getByRole("button", { name: /^continue$/i }).last().click();
    await expect(page.getByRole("timer", { name: /Spot held for/ }).first()).toBeVisible();
    await expect(page.getByText("Convenience fee")).toBeVisible();

    // Coupon
    await page.getByPlaceholder(/coupon code/i).fill("LOCAL10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/LOCAL10.*applied/)).toBeVisible();

    await page.getByRole("button", { name: /^Proceed to pay ₹/ }).last().click();
    await expect(page).toHaveURL(/\/book\/pay\//);
    await page.getByRole("button", { name: "Simulate failure" }).click();
    await expect(page.getByText("Payment failed")).toBeVisible();
    await page.getByRole("button", { name: /^Pay ₹/ }).click();

    await expect(page).toHaveURL(/\/book\/done\//);
    await expect(page.getByRole("heading", { name: /You.re in!/ })).toBeVisible();
    await expect(page.getByLabel(/QR code for booking/)).toBeVisible();

    await page.goto("/me/bookings");
    await expect(page.getByText(event.title)).toBeVisible();
  });

  test("demo user books a court slot and cancels it for a refund", async ({ page }) => {
    await login(page, "9876543210");
    const venue = fixtures.venues.find((v) => v.cityId === "c_nagpur")!;
    await page.goto(`/book/v/${venue.id}`);
    // Tomorrow has a full day of future slots
    await page.getByRole("radio").nth(1).click();
    const slot = page.getByRole("button", { name: /^\d+:\d\d (AM|PM) to .*₹/, disabled: false }).first();
    const label = (await slot.getAttribute("aria-label"))!;
    await slot.click();
    // "Any available" pins a court; the chosen slot stays selected on that court's grid.
    await expect(page.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^continue$/i }).last().click();
    await expect(page.getByRole("timer", { name: /Spot held for/ }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Proceed to pay ₹/ }).last().click();
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await expect(page.getByRole("heading", { name: /You.re in!/ })).toBeVisible();

    await page.getByRole("link", { name: "View my bookings" }).click();
    await page.getByRole("link", { name: new RegExp(venue.name.split(" ")[0]) }).first().click();
    await page.getByRole("button", { name: "Cancel booking" }).click();
    await page.getByRole("button", { name: "Yes, cancel" }).click();
    await expect(page.getByText(/refund on its way/i)).toBeVisible();
    await expect(page.getByText("Refunded").first()).toBeVisible();
  });

  test("free RSVP confirms without payment, once per person", async ({ page }) => {
    await login(page, uniquePhone());
    await page.request.patch("/api/me", { data: { name: "RSVP Tester", gender: "na", dob: "1994-05-05" } });
    const rsvp = listingFor("tpl_rsvp", "c_nagpur");
    const book = async () => {
      await page.goto(`/book/e/${rsvp.id}`);
      await page.getByRole("button", { name: /^continue$/i }).last().click();
      await page.getByRole("button", { name: /confirm rsvp/i }).last().click();
    };
    await book();
    await expect(page.getByRole("heading", { name: /You.re in!|Request sent!/ })).toBeVisible();
    // A second free place for the same date is refused.
    await book();
    await expect(page.getByText("You already have a place for this date")).toBeVisible();
  });
});
