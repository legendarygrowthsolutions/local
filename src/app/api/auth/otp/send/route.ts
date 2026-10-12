import { OtpSendSchema } from "@/contracts";
import { body, clientIp, route } from "@/lib/api/handler";
import { sendOtp } from "@/services/auth";

export const POST = route(async (req) => {
  const { phone, channel } = await body(req, OtpSendSchema);
  return sendOtp(phone, clientIp(req), new Date(), channel);
});
