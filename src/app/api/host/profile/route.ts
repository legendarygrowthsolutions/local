import { HostProfilePatchSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { updateHostProfile } from "@/services/host";

export const PATCH = route(async (req) => {
  const ctx = await requireHostApi();
  return { host: await updateHostProfile(ctx, await body(req, HostProfilePatchSchema)) };
});
