import { MePatchSchema } from "@/contracts";
import { body, requireUser, route } from "@/lib/api/handler";
import { getSessionUser } from "@/lib/session";
import { toPublicUser, updateMe } from "@/services/users";

export const GET = route(async () => {
  const u = await getSessionUser();
  return { user: u ? toPublicUser(u) : null };
});

export const PATCH = route(async (req) => {
  const u = await requireUser();
  const patch = await body(req, MePatchSchema, 400 * 1024);
  return { user: await updateMe(u.id, patch) };
});
