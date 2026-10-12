import "server-only";

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
   * How OTPs are delivered. `dev` logs the code on the server and returns it to the client so
   * the login screen can show it (never use in production with real users).
   */
  otpProvider(): "dev" | "none" {
    const p = process.env.OTP_PROVIDER ?? (isProd ? "none" : "dev");
    return p === "dev" ? "dev" : "none";
  },
  /**
   * Payment gateway. `test` is the built-in test gateway (the pay screen chooses success or
   * failure), allowed by default outside production only. A real gateway plugs in here.
   */
  paymentProvider(): "test" | "none" {
    const p = process.env.PAYMENT_PROVIDER ?? (isProd ? "none" : "test");
    return p === "test" ? "test" : "none";
  },
  /** Ceiling on OTP sends across all numbers per hour (backstop against SMS pumping). */
  otpGlobalHourlyCap: Number(process.env.OTP_GLOBAL_HOURLY_CAP) || 2000,
  /** Secure cookies everywhere except plain-http local development. */
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "1" : isProd,
};
