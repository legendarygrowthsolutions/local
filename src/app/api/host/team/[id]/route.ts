import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { removeMember } from "@/services/host";

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  await removeMember(await requireHostApi(), (await params).id);
  return { ok: true };
});
