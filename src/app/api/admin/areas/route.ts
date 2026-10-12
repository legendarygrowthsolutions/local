import { AreaInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { saveArea } from "@/services/admin";

export const POST = route(async (req) => {
  await requireAdmin();
  return { area: await saveArea(await body(req, AreaInputSchema)) };
});
