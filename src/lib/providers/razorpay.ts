import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ServiceError } from "@/services/errors";

/**
 * Razorpay REST client (orders, payments, refunds) and signature checks.
 * Docs: https://razorpay.com/docs/api/ — amounts are integer paise.
 */
// Overridable so the provider suite can run against a local stand-in of the same API.
const api = () => process.env.RAZORPAY_API_BASE ?? "https://api.razorpay.com/v1";
/** Where Razorpay Checkout's script is served from. */
export const checkoutScriptUrl = () => process.env.RAZORPAY_CHECKOUT_SRC ?? "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}
export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
}

export function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? null };
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { keyId, keySecret } = razorpayKeys();
  let res: Response;
  try {
    res = await fetch(api() + path, {
      method,
      headers: { authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.error("[razorpay] network", path, e);
    throw new ServiceError(502, "gateway_unreachable", "We couldn't reach the payment gateway. Please try again.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; description?: string } };
  if (!res.ok) {
    console.error("[razorpay]", method, path, res.status, json.error);
    throw new ServiceError(502, "gateway_error", "The payment gateway couldn't process that. Please try again.");
  }
  return json;
}

const hmacHex = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
function equalHex(a: string, b: string) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export const razorpay = {
  createOrder: (o: { amount: number; receipt: string; notes: Record<string, string> }) =>
    call<RazorpayOrder>("POST", "/orders", { amount: o.amount, currency: "INR", receipt: o.receipt.slice(0, 40), notes: o.notes }),
  fetchPayment: (id: string) => call<RazorpayPayment>("GET", `/payments/${encodeURIComponent(id)}`),
  capture: (id: string, amount: number) => call<RazorpayPayment>("POST", `/payments/${encodeURIComponent(id)}/capture`, { amount, currency: "INR" }),
  refund: (paymentId: string, amount: number, notes: Record<string, string>) =>
    call<{ id: string; amount: number; status: string }>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount, notes }),

  /** Checkout handler signature: HMAC-SHA256(order_id + "|" + payment_id, key secret). */
  verifyCheckout(orderId: string, paymentId: string, signature: string) {
    return equalHex(hmacHex(razorpayKeys().keySecret, `${orderId}|${paymentId}`), signature);
  },
  /** Webhook signature: HMAC-SHA256(raw body, webhook secret), in X-Razorpay-Signature. */
  verifyWebhook(rawBody: string, signature: string) {
    const secret = razorpayKeys().webhookSecret;
    if (!secret) return false;
    return equalHex(hmacHex(secret, rawBody), signature);
  },
};
