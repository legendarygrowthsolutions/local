import "server-only";
import { ServiceError } from "@/services/errors";

export type OtpChannel = "sms" | "whatsapp";
export type SmsProvider = "dev" | "msg91" | "twilio" | "none";

const MESSAGE = (code: string) => {
  // Web OTP API format lets Android Chrome fill the code in automatically.
  const host = process.env.APP_HOST;
  return `${code} is your local. login code. It expires in 5 minutes.${host ? `\n\n@${host} #${code}` : ""}`;
};

async function post(url: string, init: RequestInit, provider: string) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    console.error(`[sms:${provider}] network`, e);
    throw new ServiceError(502, "sms_failed", "We couldn't send your code. Please try again.");
  }
  const text = await res.text();
  if (!res.ok) {
    console.error(`[sms:${provider}]`, res.status, text.slice(0, 300));
    throw new ServiceError(502, "sms_failed", "We couldn't send your code. Please try again.");
  }
  return text;
}

/**
 * MSG91 (India): sends through a DLT-registered OTP flow template that has an `##otp##` variable.
 * Env: MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID. WhatsApp isn't wired for MSG91, so it falls back to SMS.
 */
async function msg91(phone: string, code: string): Promise<OtpChannel> {
  const authKey = process.env.MSG91_AUTH_KEY!;
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID!;
  const text = await post(
    "https://control.msg91.com/api/v5/flow",
    { headers: { authkey: authKey, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ template_id: templateId, short_url: "0", recipients: [{ mobiles: `91${phone}`, otp: code }] }) },
    "msg91",
  );
  let type = "";
  try {
    type = (JSON.parse(text) as { type?: string }).type ?? "";
  } catch {}
  if (type && type !== "success") {
    console.error("[sms:msg91]", text.slice(0, 300));
    throw new ServiceError(502, "sms_failed", "We couldn't send your code. Please try again.");
  }
  return "sms";
}

/**
 * Twilio: SMS from TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID). WhatsApp needs an approved template:
 * TWILIO_WHATSAPP_FROM + TWILIO_WHATSAPP_CONTENT_SID (variable {{1}} = code); otherwise SMS is used.
 */
async function twilio(phone: string, code: string, channel: OtpChannel): Promise<OtpChannel> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const wa = channel === "whatsapp" && process.env.TWILIO_WHATSAPP_FROM && process.env.TWILIO_WHATSAPP_CONTENT_SID;
  const form = new URLSearchParams();
  if (wa) {
    form.set("To", `whatsapp:+91${phone}`);
    form.set("From", `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`);
    form.set("ContentSid", process.env.TWILIO_WHATSAPP_CONTENT_SID!);
    form.set("ContentVariables", JSON.stringify({ 1: code }));
  } else {
    form.set("To", `+91${phone}`);
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
    else form.set("From", process.env.TWILIO_FROM!);
    form.set("Body", MESSAGE(code));
  }
  await post(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
    { headers: { authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" }, body: form.toString() },
    "twilio",
  );
  return wa ? "whatsapp" : "sms";
}

/** Which provider is configured. A provider missing its credentials counts as none (and is logged once). */
let warned = false;
export function smsProvider(): SmsProvider {
  const isProd = process.env.NODE_ENV === "production";
  const p = process.env.OTP_PROVIDER ?? (isProd ? "none" : "dev");
  const missing = (keys: string[]) => keys.filter((k) => !process.env[k]);
  let need: string[] = [];
  if (p === "msg91") need = missing(["MSG91_AUTH_KEY", "MSG91_OTP_TEMPLATE_ID"]);
  else if (p === "twilio") need = missing(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]).concat(process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID ? [] : ["TWILIO_FROM"]);
  else if (p !== "dev") return "none";
  if (need.length) {
    if (!warned) console.error(`[sms] OTP_PROVIDER=${p} but ${need.join(", ")} not set; login codes are disabled`);
    warned = true;
    return "none";
  }
  return p as SmsProvider;
}

/** Deliver a login code. Returns the channel actually used. */
export async function deliverOtp(provider: SmsProvider, phone: string, code: string, channel: OtpChannel): Promise<OtpChannel> {
  if (provider === "msg91") return msg91(phone, code);
  if (provider === "twilio") return twilio(phone, code, channel);
  if (provider === "dev") {
    console.info(`[otp] ${channel} ${phone.slice(0, 2)}******${phone.slice(-2)} → ${code}`);
    return channel;
  }
  throw new ServiceError(503, "otp_unavailable", "Login by SMS isn't available right now. Please try again later.");
}
