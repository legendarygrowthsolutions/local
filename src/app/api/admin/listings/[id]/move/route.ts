import { z } from "zod";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { moveFeatured } from "@/services/admin";

export const POST = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { dir } = await body(req, z.object({ dir: z.union([z.literal(-1), z.literal(1)]) }));
  await moveFeatured((await params).id, dir);
  return { ok: true };
});
