import { BlockInputSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { addBlock } from "@/services/host";

export const POST = route(async (req) => {
  const ctx = await requireHostApi();
  return { block: await addBlock(ctx, await body(req, BlockInputSchema)) };
});
