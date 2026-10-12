import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { providerEnv } from "../../playwright.providers.config";

const FAKE = "http://localhost:3299";
const fx = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/db/seed/fixtures", `${name}.json`), "utf8"));
const listings = fx("listings") as { id: string; templateId: string; status: string; cityId: string }[];
const sessions = fx("sessions") as { listingId: string; startsAt: string }[];
const anchor = (fx("meta") as { anchor: string }).anchor;
const tickets = fx("ticketTypes") as { id: string; listingId: string; sessionId: string | null; price: number; qty: number; sold: number; isPass: boolean }[];

/** A live single-day ticketed listing with a paid, general ticket, 3+ days out (so it's refundable). */
function paidTicket() {
  // Seed dates are shifted so the fixture anchor becomes today; offsets from the anchor are offsets from today.
  const farOut = (id: string) => sessions.filter((x) => x.listingId === id).every((x) => x.startsAt.slice(0, 10) >= new Date(Date.parse(anchor) + 3 * 86_400_000).toISOString().slice(0, 10));
  for (const l of listings.filter((x) => x.templateId === "tpl_ticket_single" && x.status === "live" && farOut(x.id))) {
    const t = tickets.find((x) => x.listingId === l.id && x.price > 0 && !x.isPass && x.qty - x.sold > 5);
    if (t) return { listingId: l.id, ticketTypeId: t.id };
  }
  throw new Error("no paid ticket in fixtures");
}
const uniquePhone = () => `9${String(Date.now()).slice(-9)}`;

/** Log in through the real UI; the code arrives at the (stand-in) SMS provider, never on screen. */
async function uiLogin(page: Page, phone: string) {
  await page.goto("/login?next=/me");
  await page.getByPlaceholder("98765 43210").fill(phone);
  await page.getByRole("button", { name: "Get OTP" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  await expect(page.getByText(/Development mode/)).toHaveCount(0);
  const { code } = (await (await page.request.get(`${FAKE}/_otp/${phone}`)).json()) as { code: string };
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("Digit 1").fill(code);
  await expect(page).not.toHaveURL(/\/login/);
}

async function hold(page: Page) {
  const t = paidTicket();
  const r = await page.request.post("/api/bookings/hold", {
    data: { kind: "listing", targetId: t.listingId, tickets: [{ ticketTypeId: t.ticketTypeId, qty: 1 }], attendee: { name: "Provider Tester", phone: "9876500001", answers: {} } },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return ((await r.json()) as { booking: { id: string; price: { total: number } } }).booking;
}

test("login code is delivered through MSG91, not shown on screen", async ({ page }) => {
  const phone = uniquePhone();
  await uiLogin(page, phone);
  await expect(page).toHaveURL(/\/onboarding/);
});

test("Razorpay checkout: decline, then pay; booking confirmed and payment captured", async ({ page }) => {
  await uiLogin(page, "9876543210");
  await expect(page).toHaveURL(/\/me/);
  const b = await hold(page);
  await page.goto(`/book/pay/${b.id}`);
  await expect(page.getByText("TEST MODE")).toHaveCount(0);

  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  const sheet = page.getByRole("dialog", { name: "Razorpay test checkout" });
  await sheet.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText(/declined by the bank/)).toBeVisible();

  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await sheet.getByRole("button", { name: "Pay with UPI" }).click();
  await expect(page).toHaveURL(new RegExp(`/book/done/${b.id}`));

  const state = (await (await page.request.get(`${FAKE}/_state`)).json()) as { orders: { amount: number; notes: { bookingId: string } }[]; payments: { status: string; order_id: string }[] };
  const orders = state.orders.filter((o) => o.notes.bookingId === b.id);
  expect(orders.every((o) => o.amount === Math.round(b.price.total * 100))).toBe(true);
  expect(state.payments.filter((p) => orders.some((o) => (o as unknown as { id: string }).id === p.order_id)).map((p) => p.status).sort()).toEqual(["captured", "failed"]);
  const mine = (await (await page.request.get(`/api/bookings/${b.id}`)).json()) as { booking: { status: string } };
  expect(mine.booking.status).toBe("confirmed");
});

test("webhook confirms a paid booking when the guest never returns; forged webhooks are refused; refund on cancel", async ({ page }) => {
  await uiLogin(page, "9876543210");
  const b = await hold(page);
  const order = (await (await page.request.post(`/api/bookings/${b.id}/checkout`)).json()) as { orderId: string };
  // The guest pays in the sheet, then closes the tab before the app hears back.
  const paid = (await (await page.request.post(`${FAKE}/_checkout/pay`, { data: { order_id: order.orderId, key: providerEnv.RAZORPAY_KEY_ID, outcome: "pay" } })).json()) as { razorpay_payment_id: string };

  const body = JSON.stringify({ event: "payment.authorized", payload: { payment: { entity: { id: paid.razorpay_payment_id, order_id: order.orderId } } } });
  const forged = await page.request.post("/api/payments/razorpay/webhook", { data: body, headers: { "content-type": "application/json", "x-razorpay-signature": "0".repeat(64) } });
  expect(forged.status()).toBe(401);

  const sig = createHmac("sha256", providerEnv.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
  const ok = await page.request.post("/api/payments/razorpay/webhook", { data: body, headers: { "content-type": "application/json", "x-razorpay-signature": sig } });
  expect(await ok.json()).toEqual({ outcome: "success" });
  const again = await page.request.post("/api/payments/razorpay/webhook", { data: body, headers: { "content-type": "application/json", "x-razorpay-signature": sig } });
  expect(again.status()).toBe(200);

  const view = (await (await page.request.get(`/api/bookings/${b.id}`)).json()) as { booking: { status: string; cancel: { allowed: boolean; refundAmount: number } } };
  expect(view.booking.status).toBe("confirmed");

  // Cancelling (full refund until 48 h before) refunds the ticket value through the gateway.
  expect(view.booking.cancel).toMatchObject({ allowed: true });
  expect(view.booking.cancel.refundAmount).toBeGreaterThan(0);
  const before = ((await (await page.request.get(`${FAKE}/_state`)).json()) as { refunds: unknown[] }).refunds.length;
  const c = await page.request.post(`/api/bookings/${b.id}/cancel`);
  expect(c.ok(), await c.text()).toBeTruthy();
  const after = ((await (await page.request.get(`${FAKE}/_state`)).json()) as { refunds: { payment_id: string; amount: number }[] }).refunds;
  expect(after.length).toBe(before + 1);
  expect(after.at(-1)).toMatchObject({ payment_id: paid.razorpay_payment_id, amount: Math.round(view.booking.cancel.refundAmount * 100) });
  const done = (await (await page.request.get(`/api/bookings/${b.id}`)).json()) as { booking: { status: string } };
  expect(done.booking.status).toBe("refunded");
});
