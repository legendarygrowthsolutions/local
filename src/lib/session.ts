import "server-only";
import { cookies } from "next/headers";
import { repo } from "@/repositories";

export const SESSION_COOKIE = "lcl_session";
export const CITY_COOKIE = "lcl_city";

/** Mock session: the cookie holds the user id. Phase 2 replaces this with signed sessions. */
export async function getSessionUser() {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return repo.users.byId(id);
}

export async function setSession(userId: string) {
  (await cookies()).set(SESSION_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getCityCookie() {
  return (await cookies()).get(CITY_COOKIE)?.value ?? null;
}
