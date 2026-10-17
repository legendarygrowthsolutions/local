import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { hostListingInventory } from "@/services/host-ops";
import { badRequest } from "@/services/errors";

export const GET = route(async (req) => {
  const ctx = await requireHostApi();
  const id = req.nextUrl.searchParams.get("listing");
  if (!id) throw badRequest("listing is required");
  return hostListingInventory(ctx, id);
});
