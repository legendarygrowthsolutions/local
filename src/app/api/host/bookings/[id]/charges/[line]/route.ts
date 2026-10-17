import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { removeCharge } from "@/services/host-ops";

export const DELETE = route<{ id: string; line: string }>(async (_req, { params }) => {
  const ctx = await requireHostApi();
  const p = await params;
  return removeCharge(ctx, p.id, Number(p.line));
});
