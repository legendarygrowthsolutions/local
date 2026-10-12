import "server-only";
import type { Booking } from "@/contracts";
import { repo } from "@/repositories";
import type { PaymentRecord } from "@/repositories/types";
import { config } from "@/lib/config";
import { newId, randomCode } from "@/lib/crypto";
import { razorpay, razorpayKeys } from "@/lib/providers/razorpay";
import { fromPaise, toPaise } from "@/db/mappers";
import { badRequest, conflict, notFound, ServiceError } from "./errors";
import { rateLimit } from "./rate-limit";
import { assertCouponUsable } from "./coupons";

const HOLDING: Booking["status"][] = ["held", "pending_payment"];

async function ownHold(userId: string, id: string, now: Date) {
  const b = await repo.bookings.byId(id);
  if (!b || b.userId !== userId) throw notFound("Booking not found");
  if (b.status === "expired") throw new ServiceError(410, "hold_expired", "Your hold expired. Please pick your tickets again.");
  if (!HOLDING.includes(b.status)) throw conflict("This booking can't be paid for");
  if (b.couponCode) {
    const coupon = await repo.coupons.byCode(b.couponCode);
    if (coupon) await assertCouponUsable(userId, coupon, b.price.subtotal, { bookingId: b.id, now });
  }
  return b;
}

/**
 * Razorpay step 1: create a gateway order for exactly this hold's total and hand the browser what
 * Checkout needs. Nothing about the amount comes from the client.
 */
export async function startCheckout(userId: string, id: string, now = new Date()) {
  if (config.paymentProvider() !== "razorpay") throw new ServiceError(503, "payments_unavailable", "Payments aren't available right now. Please try again later.");
  await rateLimit(`checkout:${userId}`, 20, 10 * 60_000, "Too many payment attempts. Please wait a few minutes.", now);
  const b = await ownHold(userId, id, now);
  if (b.price.total <= 0) throw conflict("This booking is free; there's nothing to pay");
  const amount = toPaise(b.price.total);
  const order = await razorpay.createOrder({ amount, receipt: b.code, notes: { bookingId: b.id, code: b.code } });
  if (order.amount !== amount || order.currency !== "INR") throw new ServiceError(502, "gateway_error", "The payment gateway returned an unexpected amount.");
  await repo.payments.insert({ id: newId("pay"), bookingId: b.id, provider: "razorpay", method: "checkout", status: "created", amount: b.price.total, ref: "", orderId: order.id, createdAt: now.toISOString() });
  const user = await repo.users.byId(userId);
  return {
    provider: "razorpay" as const,
    keyId: razorpayKeys().keyId,
    orderId: order.id,
    amount,
    currency: "INR",
    name: "local.",
    description: b.title.slice(0, 120),
    prefill: { contact: user ? `+91${user.phone}` : undefined, name: user?.name ?? undefined },
  };
}

/** Razorpay step 2: the browser hands back the signed result of Checkout. */
export async function confirmCheckout(userId: string, id: string, r: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }, now = new Date()) {
  if (config.paymentProvider() !== "razorpay") throw new ServiceError(503, "payments_unavailable", "Payments aren't available right now. Please try again later.");
  if (!razorpay.verifyCheckout(r.razorpayOrderId, r.razorpayPaymentId, r.razorpaySignature)) throw badRequest("We couldn't verify that payment", "payment_unverified");
  const rec = await repo.payments.byOrderId(r.razorpayOrderId);
  const b = await repo.bookings.byId(id);
  if (!rec || rec.bookingId !== id || !b || b.userId !== userId) throw badRequest("That payment doesn't belong to this booking", "payment_mismatch");
  return settle(rec, r.razorpayPaymentId, now);
}

/**
 * Settle a gateway payment against its booking. Shared by the checkout callback and the webhook, so
 * it's idempotent. The gateway is asked for the payment's real state (never trusting the client),
 * authorised payments are captured, and money that arrives after the hold is gone is refunded.
 */
export async function settle(rec: PaymentRecord, paymentId: string, now = new Date()): Promise<{ outcome: "success" | "failed" | "refunded"; booking: Booking }> {
  const p = await razorpay.fetchPayment(paymentId);
  if (p.order_id !== rec.orderId || p.amount !== toPaise(rec.amount) || p.currency !== "INR") throw badRequest("That payment doesn't match this booking", "payment_mismatch");

  if (p.status === "failed") {
    await repo.transaction(async () => {
      if (rec.status === "created") await repo.payments.update(rec.id, { status: "failed", ref: p.id, method: p.method ?? "checkout" });
      const b = await repo.bookings.byId(rec.bookingId);
      if (b?.status === "held") await repo.bookings.update(b.id, { status: "pending_payment" });
    });
    return { outcome: "failed", booking: (await repo.bookings.byId(rec.bookingId))! };
  }
  if (p.status === "authorized") await razorpay.capture(p.id, p.amount);
  else if (p.status !== "captured") throw conflict("That payment hasn't completed yet");

  const result = await repo.transaction(async () => {
    const b = (await repo.bookings.byId(rec.bookingId))!;
    if (b.paymentRef === p.id) return { outcome: "success" as const, booking: b, refund: false };
    await repo.payments.update(rec.id, { status: "success", ref: p.id, method: p.method ?? "checkout" });
    if (HOLDING.includes(b.status)) {
      const booking = (await repo.bookings.update(b.id, { status: "confirmed", holdExpiresAt: null, paymentRef: p.id }))!;
      return { outcome: "success" as const, booking, refund: false };
    }
    return { outcome: "refunded" as const, booking: b, refund: true };
  });
  if (result.refund) {
    // Paid after the hold expired (or was cancelled): the seats may be gone, so return the money in full.
    const rf = await razorpay.refund(p.id, p.amount, { bookingId: rec.bookingId, reason: "hold_expired" });
    await repo.payments.insert({ id: newId("pay"), bookingId: rec.bookingId, provider: "razorpay", method: "refund", status: "refund", amount: fromPaise(p.amount), ref: rf.id, createdAt: now.toISOString() });
  }
  return { outcome: result.outcome, booking: result.booking };
}

/** Razorpay webhook: confirms bookings even when the guest closed the tab before returning. */
export async function handleRazorpayWebhook(rawBody: string, signature: string | null) {
  if (config.paymentProvider() !== "razorpay") throw new ServiceError(404, "not_found", "Not found");
  if (!signature || !razorpay.verifyWebhook(rawBody, signature)) throw new ServiceError(401, "bad_signature", "Invalid signature");
  const evt = JSON.parse(rawBody) as { event: string; payload?: { payment?: { entity?: { id: string; order_id: string | null } } } };
  const payment = evt.payload?.payment?.entity;
  if (!payment?.order_id || !["payment.captured", "payment.authorized", "order.paid", "payment.failed"].includes(evt.event)) return { ignored: true };
  const rec = await repo.payments.byOrderId(payment.order_id);
  if (!rec) return { ignored: true };
  const r = await settle(rec, payment.id);
  return { outcome: r.outcome };
}

/**
 * Return money for a booking. Calls the gateway for Razorpay payments; test-gateway payments just
 * record the refund. Throws (and refunds nothing) if the gateway refuses.
 */
export async function refundBooking(b: Booking, amount: number, reason: string, now = new Date()) {
  if (amount <= 0) return null;
  const paid = (await repo.payments.listByBooking(b.id)).find((p) => p.status === "success" && p.ref === b.paymentRef);
  if (paid?.provider === "razorpay") {
    const rf = await razorpay.refund(paid.ref, toPaise(amount), { bookingId: b.id, reason });
    await repo.payments.insert({ id: newId("pay"), bookingId: b.id, provider: "razorpay", method: "refund", status: "refund", amount, ref: rf.id, createdAt: now.toISOString() });
    return rf.id;
  }
  const ref = `rfnd_test_${randomCode(12, "abcdefghijkmnpqrstuvwxyz23456789")}`;
  await repo.payments.insert({ id: ref, bookingId: b.id, provider: paid?.provider ?? "test", method: "refund", status: "refund", amount, ref, createdAt: now.toISOString() });
  return ref;
}

/**
 * Cancel a settled booking and refund `amount`. The booking is claimed first (so two cancels can't
 * both refund), the gateway is called outside any transaction, and a failed refund restores it.
 */
export async function cancelWithRefund(id: string, expect: Booking["status"][], amount: number, reason: string, now = new Date()) {
  const claimed = await repo.transaction(async () => {
    const b = await repo.bookings.byId(id);
    if (!b || !expect.includes(b.status)) return null;
    await repo.bookings.update(id, { status: "cancelled" });
    return b;
  });
  if (!claimed) throw conflict("This booking has already changed. Refresh and try again.");
  try {
    await refundBooking(claimed, amount, reason, now);
  } catch (e) {
    await repo.bookings.update(id, { status: claimed.status });
    throw e;
  }
  return (await repo.bookings.update(id, { status: amount > 0 ? "refunded" : "cancelled" }))!;
}
