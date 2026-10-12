import { TemplateInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { listTemplates, saveTemplate } from "@/services/admin";

export const GET = route(async () => {
  await requireAdmin();
  return { items: await listTemplates() };
});

export const POST = route(async (req) => {
  await requireAdmin();
  return { template: await saveTemplate(await body(req, TemplateInputSchema)) };
});
