import { CategoryInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { saveCategory } from "@/services/admin";

export const POST = route(async (req) => {
  await requireAdmin();
  return { category: await saveCategory(await body(req, CategoryInputSchema)) };
});
