import { OtpVerifySchema } from "@/contracts";
import { body, clientIp, route } from "@/lib/api/handler";
import { setSession } from "@/lib/session";
import { verifyOtp } from "@/services/auth";
import { toPublicUser } from "@/services/users";

export const POST = route(async (req) => {
  const { phone, code } = await body(req, OtpVerifySchema);
  const { user, isNew } = await verifyOtp(phone, code, clientIp(req));
  await setSession(user.id);
  return { user: toPublicUser(user), isNew };
});
