import { OtpSendSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { sendOtp } from "@/services/auth";

export const POST = route(async (req) => {
  const { phone } = await body(req, OtpSendSchema);
  return sendOtp(phone);
});
