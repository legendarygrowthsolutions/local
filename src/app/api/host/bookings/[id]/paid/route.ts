import { MarkPaidSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { markPaidAtVenue } from "@/services/host-ops";

/** The guest of a pay-at-venue booking paid at the desk. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireHostApi();
  const { method } = await body(req, MarkPaidSchema);
  return markPaidAtVenue(ctx, (await params).id, method);
});
