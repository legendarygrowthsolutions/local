import { CityInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { saveCity } from "@/services/admin";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  return { city: await saveCity(await body(req, CityInputSchema), (await params).id) };
});
