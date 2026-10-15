import "server-only";
import { devServices } from "./dev-mode";

const isProd = process.env.NODE_ENV === "production";
let warned = false;

/**
 * Server configuration from the environment. Development works with no setup; production
 * refuses to run auth without a real secret.
 */
export const config = {
  isProd,
  /** Secret for hashing OTPs. Required in production (≥ 32 chars). */
  authSecret(): string {
    const s = process.env.AUTH_SECRET;
    if (s && s.length >= 32) return s;
    if (isProd) throw new Error("AUTH_SECRET must be set (32+ characters) in production");
    if (!warned) {
      warned = true;
      console.warn("[auth] AUTH_SECRET not set; using an insecure development secret");
    }
    return "dev-only-insecure-secret-change-me-0123456789";
  },

  /**
   * Payment gateway. `test` is the built-in test gateway (the pay screen chooses success or
   * failure), allowed by default outside production only. A real gateway plugs in here.
   */
  paymentProvider(): "test" | "razorpay" | "none" {
    if (devServices()) return "test";
    const p = process.env.PAYMENT_PROVIDER ?? (isProd ? "none" : "test");
    if (p === "razorpay") {
      if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET) return "razorpay";
      console.error("[payments] PAYMENT_PROVIDER=razorpay needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET");
      return "none";
    }
    return p === "test" ? "test" : "none";
  },
  /**
   * Mobile numbers (10 digits, comma-separated) that become superadmins when they sign in. This is
   * how the first admin gets in on a fresh database; after that, admins can promote others at /admin/users.
   */
  superadminPhones(): Set<string> {
    return new Set((process.env.SUPERADMIN_PHONES ?? "").split(",").map((p) => p.replace(/\D/g, "").slice(-10)).filter((p) => p.length === 10));
  },
  /** Ceiling on OTP sends across all numbers per hour (backstop against SMS pumping). */
  otpGlobalHourlyCap: Number(process.env.OTP_GLOBAL_HOURLY_CAP) || 2000,
  /** Secure cookies everywhere except plain-http local development. */
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "1" : isProd,
};
