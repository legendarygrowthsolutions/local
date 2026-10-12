import { z } from "zod";
import { body, requireUser, route } from "@/lib/api/handler";
import { toggleFollow } from "@/services/users";

export const POST = route(async (req) => {
  const u = await requireUser();
  const { hostId } = await body(req, z.object({ hostId: z.string() }));
  return toggleFollow(u.id, hostId);
});
