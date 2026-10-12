import { InviteSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { inviteMember, listTeam } from "@/services/host";

export const GET = route(async () => ({ items: await listTeam(await requireHostApi()) }));

export const POST = route(async (req) => {
  const ctx = await requireHostApi();
  const { phone, name } = await body(req, InviteSchema);
  return { member: await inviteMember(ctx, phone, name) };
});
