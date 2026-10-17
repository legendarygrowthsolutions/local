import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { markNoShow, undoNoShow } from "@/services/host-ops";

/** The guest never turned up (allowed once the booking has started). */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireHostApi();
  return markNoShow(ctx, (await params).id);
});

/** Marked by mistake. */
export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireHostApi();
  return undoNoShow(ctx, (await params).id);
});
