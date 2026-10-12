import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

/** Golden paths + accessibility, against a production build (`npm run e2e`). */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    // Smallest supported width (PLAN §10 M7: 360 → 1440); layout + a11y checks only.
    { name: "small", testMatch: /a11y\.spec/, use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // A fresh, seeded database for every run.
    command: `tsx scripts/db.ts reset && next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: "file:./data/e2e.db",
      // Dummy SMS (code shown on screen) + simulated payment gateway on a production build.
      DEV: "1",
      AUTH_SECRET: "e2e-only-secret-not-for-production-0123456789",
      COOKIE_SECURE: "0",
      // The suite signs the same demo accounts in many times from one machine.
      RATE_LIMIT_SCALE: "100",
    },
    timeout: 90_000,
  },
});
