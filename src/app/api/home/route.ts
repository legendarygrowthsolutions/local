import { route } from "@/lib/api/handler";
import { getSessionUser } from "@/lib/session";
import { getHome } from "@/services/discover";
import { badRequest } from "@/services/errors";

export const GET = route(async (req) => {
  const city = req.nextUrl.searchParams.get("city");
  if (!city) throw badRequest("city is required");
  return getHome(city, await getSessionUser());
});
