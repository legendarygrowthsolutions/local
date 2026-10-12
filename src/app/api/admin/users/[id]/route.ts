import { UserRoleSchema } from "@/contracts";
import { body, requireAdmin, route } from "@/lib/api/handler";
import { setUserRole } from "@/services/admin";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const me = await requireAdmin();
  const { role } = await body(req, UserRoleSchema);
  return { user: await setUserRole(me, (await params).id, role) };
});
