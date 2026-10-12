import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { repo } from "@/repositories";
import { config } from "./config";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "lcl_session";
export const CITY_COOKIE = "lcl_city";

const SESSION_DAYS = 30;
const DAY = 86_400_000;

/**
 * Sessions are opaque random tokens in an httpOnly cookie; the database stores only their SHA-256,
 * so a leaked database can't be replayed as live sessions. Sliding 30-day expiry.
 */
export const getSessionUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length < 32 || token.length > 128) return null;
  const id = sha256(token);
  const now = new Date();
  const s = await repo.authSessions.get(id, now.toISOString());
  if (!s) return null;
  // Extend at most once a day to avoid a write per request.
  if (new Date(s.expiresAt).getTime() - now.getTime() < (SESSION_DAYS - 1) * DAY) {
    await repo.authSessions.touch(id, new Date(now.getTime() + SESSION_DAYS * DAY).toISOString());
  }
  return repo.users.byId(s.userId);
});

export async function setSession(userId: string) {
  const token = randomToken();
  const now = new Date();
  await repo.authSessions.create({ id: sha256(token), userId, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY).toISOString() });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await repo.authSessions.remove(sha256(token));
  jar.delete(SESSION_COOKIE);
}

export async function getCityCookie() {
  return (await cookies()).get(CITY_COOKIE)?.value ?? null;
}
