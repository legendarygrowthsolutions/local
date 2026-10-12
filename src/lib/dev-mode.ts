/**
 * DEV=1 switches the app to dummy services: login codes are shown on screen instead of sent by
 * SMS (no Twilio/MSG91), and payments go through the simulated gateway (no Razorpay). It wins over
 * OTP_PROVIDER / PAYMENT_PROVIDER. Never set it for real users: anyone could sign in as anyone.
 */
let warned = false;
export function devServices(): boolean {
  const on = process.env.DEV === "1";
  if (on && !warned && process.env.NODE_ENV === "production") {
    warned = true;
    console.warn("[dev] DEV=1: dummy SMS and simulated payments are active. Do not use with real users.");
  }
  return on;
}
