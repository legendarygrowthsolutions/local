import { ListingDecisionSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { decideListing } from "@/services/admin";

export const POST = route<{ id: string }>(async (req, { params }) => {
  await requireAdmin();
  const { decision, note } = await body(req, ListingDecisionSchema);
  await decideListing((await params).id, decision, note);
  return { ok: true };
});
