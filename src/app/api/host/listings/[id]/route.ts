import { SaveListingSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { getListingInput, saveListing } from "@/services/host";

export const GET = route<{ id: string }>(async (_req, { params }) => getListingInput(await requireHostApi(), (await params).id));

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireHostApi();
  const { input, submit } = await body(req, SaveListingSchema, 4 * 1024 * 1024);
  return saveListing(ctx, input, submit, (await params).id);
});
