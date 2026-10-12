import { DocumentDecisionSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { decideDocument } from "@/services/admin";

export const POST = route<{ id: string; docId: string }>(async (req, { params }) => {
  await requireAdmin();
  const { id, docId } = await params;
  const { status } = await body(req, DocumentDecisionSchema);
  return { host: await decideDocument(id, docId, status) };
});
