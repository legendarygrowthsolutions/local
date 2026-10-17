import { HostSettingsPatchSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { hostSettings, updateHostSettings } from "@/services/host-settings";

export const GET = route(async () => {
  const ctx = await requireHostApi();
  return { settings: hostSettings(ctx.host) };
});

export const PATCH = route(async (req) => {
  const ctx = await requireHostApi();
  return { settings: await updateHostSettings(ctx, await body(req, HostSettingsPatchSchema)) };
});
