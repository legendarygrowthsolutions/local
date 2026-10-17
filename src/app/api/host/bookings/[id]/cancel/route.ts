import { HostCancelSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { cancelByHost } from "@/services/host-ops";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireHostApi();
  return cancelByHost(ctx, (await params).id, await body(req, HostCancelSchema));
});
