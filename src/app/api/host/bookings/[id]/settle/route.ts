import { SettleDueSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { settleDue } from "@/services/host-ops";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireHostApi();
  return settleDue(ctx, (await params).id, await body(req, SettleDueSchema));
});
