import "server-only";
import type { User } from "@/contracts";
import { repo } from "@/repositories";
import { config } from "@/lib/config";
import { hmac, newId, randomDigits, safeEqual } from "@/lib/crypto";
import { badRequest, ServiceError } from "./errors";
import { activateInvites } from "./host";
import { rateLimit } from "./rate-limit";

const OTP_TTL_MS = 5 * 60_000;
const RESEND_SEC = 30;
const MAX_ATTEMPTS = 5;

const hashCode = (phone: string, code: string) => hmac(config.authSecret(), `${phone}:${code}`);

/**
 * Send a one-time code. Codes are random, stored only as an HMAC, expire in 5 minutes and allow
 * 5 guesses. Sends are limited per number (resend cooldown, 5 per hour) and per client IP.
 */
export async function sendOtp(phone: string, ip: string, now = new Date(), channel: "sms" | "whatsapp" = "sms") {
  const provider = config.otpProvider();
  if (provider === "none") throw new ServiceError(503, "otp_unavailable", "Login by SMS isn't available right now. Please try again later.");
  const prev = await repo.otps.get(phone);
  if (prev) {
    const wait = RESEND_SEC - Math.floor((now.getTime() - new Date(prev.sentAt).getTime()) / 1000);
    if (wait > 0) throw new ServiceError(429, "otp_cooldown", `Please wait ${wait}s before asking for another code`, { retryAfter: wait });
  }
  await rateLimit(`otp:phone:${phone}`, 5, 60 * 60_000, "Too many codes requested for this number. Try again in an hour.", now);
  await rateLimit(`otp:ip:${ip}`, 20, 60 * 60_000, "Too many codes requested. Try again later.", now);
  await rateLimit("otp:global", config.otpGlobalHourlyCap, 60 * 60_000, "Login by SMS is busy right now. Please try again in a few minutes.", now);

  const code = randomDigits(6);
  await repo.otps.put(phone, { codeHash: hashCode(phone, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(), attempts: 0, sentAt: now.toISOString() });
  // Development delivery: the code is logged and returned so the login screen can show it.
  if (provider === "dev") console.info(`[otp] ${channel} ${phone.slice(0, 2)}******${phone.slice(-2)} → ${code}`);
  return { sent: true, resendInSec: RESEND_SEC, channel, ...(provider === "dev" ? { devCode: code } : {}) };
}

export async function verifyOtp(phone: string, code: string, ip: string, now = new Date()): Promise<{ user: User; isNew: boolean }> {
  await rateLimit(`otp-verify:ip:${ip}`, 30, 15 * 60_000, "Too many attempts. Try again in a few minutes.", now);
  const rec = await repo.otps.get(phone);
  if (!rec || new Date(rec.expiresAt).getTime() < now.getTime()) throw badRequest("That code has expired. Ask for a new one.", "otp_expired");
  // Use up an attempt atomically *before* comparing, so parallel guesses can't exceed the limit.
  if (!(await repo.otps.reserveAttempt(phone, MAX_ATTEMPTS))) {
    await repo.otps.remove(phone);
    throw badRequest("Too many wrong attempts. Ask for a new code.", "otp_locked");
  }
  if (!safeEqual(rec.codeHash, hashCode(phone, code))) {
    const last = rec.attempts + 1 >= MAX_ATTEMPTS;
    if (last) await repo.otps.remove(phone);
    throw badRequest(last ? "Too many wrong attempts. Ask for a new code." : "That code didn't match. Try again.", "otp_invalid");
  }
  await repo.otps.remove(phone);

  let user = await repo.users.byPhone(phone);
  if (!user) {
    user = await repo.users.insert({
      id: newId("u"),
      phone,
      name: null,
      gender: null,
      dob: null,
      cityId: null,
      interests: [],
      role: "user",
      saved: [],
      createdAt: now.toISOString(),
    });
  }
  await activateInvites(user);
  return { user, isNew: !user.name };
}
