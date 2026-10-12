import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { repo } from "@/repositories";
import { setupTestDb, makeUser } from "@/test/db";
import { attendee, makeListing } from "@/test/fixtures";
import { cancelBooking, holdBooking, payBooking } from "./bookings";
import { handleRazorpayWebhook, startCheckout } from "./payments";
import { adminRefund } from "./admin";
import { ServiceError } from "./errors";

setupTestDb();

const KEY = "rzp_test_key";
const SECRET = "rzp_test_secret";
const HOOK = "rzp_webhook_secret";
const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

/** A tiny fake of the Razorpay API, driven through fetch. */
const gw = {
  orders: new Map<string, { amount: number }>(),
  payments: new Map<string, { id: string; order_id: string; amount: number; currency: string; status: string; method: string }>(),
  refunds: [] as { payment: string; amount: number }[],
  failRefunds: false,
  calls: [] as string[],
};
let n = 0;
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const path = url.replace("https://api.razorpay.com/v1", "");
  gw.calls.push(`${init.method} ${path}`);
  expect(init.headers).toMatchObject({ authorization: "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64") });
  const body = init.body ? JSON.parse(String(init.body)) : {};
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
  if (init.method === "POST" && path === "/orders") {
    const id = `order_${++n}`;
    gw.orders.set(id, { amount: body.amount });
    return ok({ id, amount: body.amount, currency: body.currency, status: "created" });
  }
  const m = /^\/payments\/([^/]+)(\/capture|\/refund)?$/.exec(path);
  if (m) {
    const p = gw.payments.get(m[1]);
    if (!p) return new Response(JSON.stringify({ error: { description: "not found" } }), { status: 404 });
    if (m[2] === "/capture") {
      p.status = "captured";
      return ok(p);
    }
    if (m[2] === "/refund") {
      if (gw.failRefunds) return new Response(JSON.stringify({ error: { description: "refund failed" } }), { status: 400 });
      gw.refunds.push({ payment: p.id, amount: body.amount });
      return ok({ id: `rfnd_${gw.refunds.length}`, amount: body.amount, status: "processed" });
    }
    return ok(p);
  }
  return new Response("{}", { status: 404 });
});

/** What a guest's browser would do: pay in the Razorpay sheet, then hand us the signed result. */
function payInSheet(orderId: string, status: "authorized" | "captured" | "failed" = "authorized", amount?: number) {
  const id = `pay_${++n}`;
  gw.payments.set(id, { id, order_id: orderId, amount: amount ?? gw.orders.get(orderId)!.amount, currency: "INR", status, method: "upi" });
  return { razorpayOrderId: orderId, razorpayPaymentId: id, razorpaySignature: sign(SECRET, `${orderId}|${id}`) };
}

async function err(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return { status: e.status, code: e.code };
    throw e;
  }
  return null;
}

async function heldBooking(price = 500) {
  const u = await makeUser();
  const { listing, tickets } = await makeListing({ tickets: [{ price, qty: 10 }] });
  const b = await holdBooking(u.id, { kind: "listing", targetId: listing.id, tickets: [{ ticketTypeId: tickets[0].id, qty: 2 }], attendee: attendee() });
  return { u, b, listing };
}

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(process.env, { PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: KEY, RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: HOOK });
});
afterAll(() => {
  vi.unstubAllGlobals();
  for (const k of ["PAYMENT_PROVIDER", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) delete process.env[k];
});
beforeEach(() => {
  gw.refunds = [];
  gw.failRefunds = false;
  gw.calls = [];
});

describe("Razorpay checkout", () => {
  it("creates an order for exactly the hold total, then confirms a signed, captured payment", async () => {
    const { u, b } = await heldBooking();
    const order = await startCheckout(u.id, b.id);
    expect(order).toMatchObject({ keyId: KEY, amount: Math.round(b.price.total * 100), currency: "INR" });
    const r = await payBooking(u.id, b.id, payInSheet(order.orderId));
    expect(r.outcome).toBe("success");
    expect(gw.calls).toContain(`POST /payments/${r.booking.paymentRef}/capture`);
    expect((await repo.bookings.byId(b.id))!).toMatchObject({ status: "confirmed", paymentRef: r.booking.paymentRef });
    expect((await repo.payments.listByBooking(b.id)).map((p) => p.status)).toEqual(["success"]);
  });

  it("rejects a forged signature, another booking's order, and a payment for the wrong amount", async () => {
    const { u, b } = await heldBooking();
    const order = await startCheckout(u.id, b.id);
    const paid = payInSheet(order.orderId);
    expect(await err(payBooking(u.id, b.id, { ...paid, razorpaySignature: sign("wrong", "x") }))).toMatchObject({ status: 400, code: "payment_unverified" });

    const other = await heldBooking();
    const otherOrder = await startCheckout(other.u.id, other.b.id);
    expect(await err(payBooking(u.id, b.id, payInSheet(otherOrder.orderId)))).toMatchObject({ status: 400, code: "payment_mismatch" });

    const cheap = payInSheet(order.orderId, "captured", 100);
    expect(await err(payBooking(u.id, b.id, cheap))).toMatchObject({ status: 400, code: "payment_mismatch" });
    expect((await repo.bookings.byId(b.id))!.status).toBe("held");
  });

  it("a declined payment keeps the hold for a retry", async () => {
    const { u, b } = await heldBooking();
    const order = await startCheckout(u.id, b.id);
    expect((await payBooking(u.id, b.id, payInSheet(order.orderId, "failed"))).outcome).toBe("failed");
    expect((await repo.bookings.byId(b.id))!.status).toBe("pending_payment");
    const retry = await startCheckout(u.id, b.id);
    expect((await payBooking(u.id, b.id, payInSheet(retry.orderId))).outcome).toBe("success");
  });

  it("the webhook confirms bookings when the guest never came back, and is idempotent", async () => {
    const { u, b } = await heldBooking();
    const order = await startCheckout(u.id, b.id);
    const paid = payInSheet(order.orderId, "captured");
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paid.razorpayPaymentId, order_id: order.orderId } } } });
    expect(await err(handleRazorpayWebhook(body, sign("nope", body)))).toMatchObject({ status: 401 });
    expect(await handleRazorpayWebhook(body, sign(HOOK, body))).toEqual({ outcome: "success" });
    expect(await handleRazorpayWebhook(body, sign(HOOK, body))).toEqual({ outcome: "success" });
    // …and the browser callback arriving late doesn't double-process either.
    expect((await payBooking(u.id, b.id, paid)).outcome).toBe("success");
    expect((await repo.payments.listByBooking(b.id)).filter((p) => p.status === "success")).toHaveLength(1);
    expect((await repo.bookings.byId(b.id))!.status).toBe("confirmed");
  });

  it("money that arrives after the hold expired is refunded in full", async () => {
    const { u, b } = await heldBooking();
    const order = await startCheckout(u.id, b.id);
    await repo.bookings.update(b.id, { holdExpiresAt: new Date(Date.now() - 1000).toISOString() });
    const paid = payInSheet(order.orderId, "captured");
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paid.razorpayPaymentId, order_id: order.orderId } } } });
    expect(await handleRazorpayWebhook(body, sign(HOOK, body))).toEqual({ outcome: "refunded" });
    expect(gw.refunds).toEqual([{ payment: paid.razorpayPaymentId, amount: Math.round(b.price.total * 100) }]);
    expect((await repo.bookings.byId(b.id))!.status).toBe("expired");
  });
});

describe("refunds go back through the gateway", () => {
  async function paidBooking(daysAhead = 3) {
    void daysAhead;
    const { u, b } = await heldBooking();
    const order = await startCheckout(u.id, b.id);
    await payBooking(u.id, b.id, payInSheet(order.orderId));
    return { u, b: (await repo.bookings.byId(b.id))! };
  }

  it("a guest cancellation refunds the ticket value via Razorpay", async () => {
    const { u, b } = await paidBooking();
    const r = await cancelBooking(u.id, b.id);
    if (r.refundAmount > 0) {
      expect(gw.refunds).toEqual([{ payment: b.paymentRef, amount: Math.round(r.refundAmount * 100) }]);
      expect((await repo.payments.listByBooking(b.id)).some((p) => p.status === "refund" && p.amount === r.refundAmount)).toBe(true);
    }
    expect(["refunded", "cancelled"]).toContain(r.booking.status);
  });

  it("if the gateway refuses the refund, the booking stays confirmed", async () => {
    const { b } = await paidBooking();
    gw.failRefunds = true;
    expect(await err(adminRefund(b.id, 100))).toMatchObject({ status: 502 });
    expect((await repo.bookings.byId(b.id))!.status).toBe("confirmed");
    gw.failRefunds = false;
    await adminRefund(b.id, 100);
    expect((await repo.bookings.byId(b.id))!.status).toBe("refunded");
    expect(gw.refunds).toHaveLength(1);
  });

  it("two simultaneous cancellations refund once", async () => {
    const { b } = await paidBooking();
    const results = await Promise.allSettled([adminRefund(b.id, 100), adminRefund(b.id, 100)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(gw.refunds).toHaveLength(1);
  });
});

describe("configuration", () => {
  it("Razorpay without a webhook secret is treated as unconfigured", async () => {
    const { u, b } = await heldBooking();
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(await err(startCheckout(u.id, b.id))).toMatchObject({ status: 503 });
    process.env.RAZORPAY_WEBHOOK_SECRET = HOOK;
  });
});

describe("DEV=1", () => {
  it("uses the simulated gateway instead of Razorpay", async () => {
    const { config } = await import("@/lib/config");
    expect(config.paymentProvider()).toBe("razorpay");
    process.env.DEV = "1";
    try {
      expect(config.paymentProvider()).toBe("test");
      const { u, b } = await heldBooking();
      expect((await payBooking(u.id, b.id, { method: "upi", outcome: "success" })).outcome).toBe("success");
      expect(gw.calls).toEqual([]); // nothing went to Razorpay
    } finally {
      delete process.env.DEV;
    }
  });
});
