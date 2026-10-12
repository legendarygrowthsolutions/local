import { z } from "zod";
import { body, requireUser, route } from "@/lib/api/handler";
import { toggleSaved } from "@/services/users";

export const POST = route(async (req) => {
  const u = await requireUser();
  const { id } = await body(req, z.object({ id: z.string().min(1).max(60) }));
  return toggleSaved(u.id, id);
});
