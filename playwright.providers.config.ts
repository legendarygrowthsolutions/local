import { defineConfig, devices } from "@playwright/test";

/**
 * Provider suite: the app configured for real providers (MSG91 login codes, Razorpay payments),
 * talking HTTP to a local stand-in of those APIs (tests/providers/fake-providers.mjs).
 * Run with `npm run e2e:providers` (it builds with the stand-in's checkout origin allowed by CSP).
 */
const PORT = 3201;
const FAKE = 3299;
export const providerEnv = {
  RAZORPAY_KEY_ID: "rzp_test_e2e",
  RAZORPAY_KEY_SECRET: "rzp_e2e_secret",
  RAZORPAY_WEBHOOK_SECRET: "rzp_e2e_webhook_secret",
  MSG91_AUTH_KEY: "msg91-e2e-key",
};

export default defineConfig({
  testDir: "tests/providers",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } },
  webServer: [
    { command: "node tests/providers/fake-providers.mjs", port: FAKE, reuseExistingServer: false, env: { ...providerEnv, FAKE_PROVIDERS_PORT: String(FAKE) } },
    {
      command: `tsx scripts/db.ts reset --demo && next start -p ${PORT}`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        ...providerEnv,
        DATABASE_URL: "file:./data/e2e-providers.db",
        AUTH_SECRET: "e2e-providers-secret-not-for-production-0123456789",
        COOKIE_SECURE: "0",
        RATE_LIMIT_SCALE: "100",
        OTP_PROVIDER: "msg91",
        MSG91_OTP_TEMPLATE_ID: "tpl-e2e",
        MSG91_API_BASE: `http://localhost:${FAKE}`,
        PAYMENT_PROVIDER: "razorpay",
        RAZORPAY_API_BASE: `http://localhost:${FAKE}/v1`,
        RAZORPAY_CHECKOUT_SRC: `http://localhost:${FAKE}/v1/checkout.js`,
      },
    },
  ],
});
