import { HostApplicationSchema } from "@/contracts";
import { body, requireUser, route } from "@/lib/api/handler";
import { applyAsHost } from "@/services/host";

export const POST = route(async (req) => {
  const u = await requireUser();
  return { host: await applyAsHost(u, await body(req, HostApplicationSchema)) };
});
