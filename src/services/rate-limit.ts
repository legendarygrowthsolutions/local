import "server-only";
import { repo } from "@/repositories";
import { ServiceError } from "./errors";

// Test suites log in many times from one machine; RATE_LIMIT_SCALE loosens every limit proportionally.
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);

/** Fixed-window limiter backed by the database (works across instances). Throws 429 when exceeded. */
export async function rateLimit(key: string, max: number, windowMs: number, message = "Too many attempts. Please wait a bit and try again.", now = new Date()) {
  const { count, resetAt } = await repo.rateLimits.hit(key, windowMs, now);
  if (count > max * SCALE) {
    const retryAfter = Math.max(1, Math.ceil((new Date(resetAt).getTime() - now.getTime()) / 1000));
    throw new ServiceError(429, "rate_limited", message, { retryAfter });
  }
}
