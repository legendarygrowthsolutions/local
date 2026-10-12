import { CityInputSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { saveCity } from "@/services/admin";

export const POST = route(async (req) => {
  await requireAdmin();
  return { city: await saveCity(await body(req, CityInputSchema)) };
});
