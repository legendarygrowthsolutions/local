import { CategoryInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { deleteCategory, saveCategory } from "@/services/admin";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  return { category: await saveCategory(await body(req, CategoryInputSchema), (await params).id) };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  await requireAdmin();
  await deleteCategory((await params).id);
  return { ok: true };
});
