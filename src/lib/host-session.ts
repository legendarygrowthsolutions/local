import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "./session";
import { resolveHostContext, type HostContext } from "@/services/host";
import { unauthorized } from "@/services/errors";
import { ServiceError } from "@/services/errors";

export const HOST_COOKIE = "lcl_host";

export async function getHostContext(): Promise<HostContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return resolveHostContext(user, (await cookies()).get(HOST_COOKIE)?.value);
}

/** For API routes: 401 without a session, 403 without a host membership. */
export async function requireHostApi(): Promise<HostContext> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  const ctx = await resolveHostContext(user, (await cookies()).get(HOST_COOKIE)?.value);
  if (!ctx) throw new ServiceError(403, "not_host", "You're not part of a host team");
  return ctx;
}

/** For pages: send people to login / apply / status as appropriate. */
export async function requireHostPage(path: string, opts: { owner?: boolean } = {}): Promise<HostContext> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  const ctx = await resolveHostContext(user, (await cookies()).get(HOST_COOKIE)?.value);
  if (!ctx) redirect("/host/apply");
  if (ctx.host.status !== "approved") redirect("/host/apply");
  if (opts.owner && !ctx.isOwner) redirect("/host?denied=1");
  return ctx;
}
