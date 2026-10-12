import { CheckInSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { checkIn } from "@/services/host";

export const POST = route(async (req) => {
  const ctx = await requireHostApi();
  const { code } = await body(req, CheckInSchema);
  return checkIn(ctx, code);
});
