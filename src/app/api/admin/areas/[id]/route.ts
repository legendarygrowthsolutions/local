import { AreaInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { deleteArea, saveArea } from "@/services/admin";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  return { area: await saveArea(await body(req, AreaInputSchema), (await params).id) };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  await deleteArea((await params).id);
  return { ok: true };
});
