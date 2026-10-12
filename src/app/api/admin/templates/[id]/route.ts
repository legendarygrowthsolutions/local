import { TemplateInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { saveTemplate } from "@/services/admin";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  return { template: await saveTemplate(await body(req, TemplateInputSchema), (await params).id) };
});
