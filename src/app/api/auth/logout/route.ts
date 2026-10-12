import { route } from "@/lib/api/handler";
import { clearSession } from "@/lib/session";

export const POST = route(async () => {
  await clearSession();
  return { ok: true };
});
