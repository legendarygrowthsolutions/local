import { SaveListingSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { listHostListings, saveListing } from "@/services/host";

export const GET = route(async () => ({ items: await listHostListings(await requireHostApi()) }));

export const POST = route(async (req) => {
  const ctx = await requireHostApi();
  const { input, submit } = await body(req, SaveListingSchema, 4 * 1024 * 1024);
  return saveListing(ctx, input, submit);
});
