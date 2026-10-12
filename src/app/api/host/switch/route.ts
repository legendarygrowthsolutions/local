import { z } from "zod";
import { cookies } from "next/headers";
import { body, route } from "@/lib/api/handler";
import { requireHostApi, HOST_COOKIE } from "@/lib/host-session";
import { badRequest } from "@/services/errors";

export const POST = route(async (req) => {
  const ctx = await requireHostApi();
  const { hostId } = await body(req, z.object({ hostId: z.string() }));
  if (!ctx.memberships.some((m) => m.host.id === hostId)) throw badRequest("Not a member of that host");
  (await cookies()).set(HOST_COOKIE, hostId, { path: "/", sameSite: "lax", httpOnly: true });
  return { ok: true };
});
