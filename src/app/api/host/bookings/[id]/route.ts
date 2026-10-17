import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { hostBookingDetail } from "@/services/host-ops";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireHostApi();
  return { detail: await hostBookingDetail(ctx, (await params).id) };
});
