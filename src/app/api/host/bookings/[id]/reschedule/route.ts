import { HostRescheduleSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { rescheduleByHost } from "@/services/host-ops";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireHostApi();
  return rescheduleByHost(ctx, (await params).id, await body(req, HostRescheduleSchema));
});
