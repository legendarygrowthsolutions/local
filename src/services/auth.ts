import "server-only";
import type { User } from "@/contracts";
import { repo } from "@/repositories";
import { badRequest } from "./errors";
import { activateInvites } from "./host";

/** Mock OTP: any 6 digits work except 000000, which simulates a wrong code. */
export async function sendOtp(phone: string) {
  await repo.otps.put(phone, "any", 5 * 60_000);
  return { sent: true, resendInSec: 30, channel: "sms" as const };
}

export async function verifyOtp(phone: string, code: string): Promise<{ user: User; isNew: boolean }> {
  if (code === "000000") throw badRequest("That code didn't match. Try again.", "otp_invalid");
  await repo.otps.take(phone);
  let user = await repo.users.byPhone(phone);
  if (!user) {
    user = await repo.users.insert({
      id: "u_" + Math.random().toString(36).slice(2, 10),
      phone,
      name: null,
      gender: null,
      dob: null,
      cityId: null,
      interests: [],
      role: "user",
      saved: [],
      createdAt: new Date().toISOString(),
    });
  }
  await activateInvites(user);
  return { user, isNew: !user.name };
}
