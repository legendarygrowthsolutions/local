import { MemberPatchSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { removeMember, setMemberScope } from "@/services/host";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireHostApi();
  const { scope } = await body(req, MemberPatchSchema);
  return { member: await setMemberScope(ctx, (await params).id, scope) };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  await removeMember(await requireHostApi(), (await params).id);
  return { ok: true };
});
