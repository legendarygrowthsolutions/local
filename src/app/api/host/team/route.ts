import { InviteSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { inviteMember, listTeam, teamTargets } from "@/services/host";

export const GET = route(async () => {
  const ctx = await requireHostApi();
  const [items, targets] = await Promise.all([listTeam(ctx), teamTargets(ctx)]);
  return { items, targets };
});

export const POST = route(async (req) => {
  const ctx = await requireHostApi();
  const { phone, name, scope } = await body(req, InviteSchema);
  return { member: await inviteMember(ctx, phone, name, scope) };
});
