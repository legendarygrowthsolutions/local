import { HostDecisionSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { decideHost } from "@/services/admin";

export const POST = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { decision, note } = await body(req, HostDecisionSchema);
  return { host: await decideHost((await params).id, decision, note) };
});
