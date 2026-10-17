import "server-only";
import { ServiceError } from "@/services/errors";
import { NO_SHOW_LIMIT } from "@/contracts";
import { smsProvider, type OtpChannel, type SmsProvider } from "./sms";

/**
 * Transactional booking messages (confirmations, changes, cancellations, team alerts) over the same
 * providers as login codes. Each kind has a plain-text body for SMS and an ordered variable list for
 * approved WhatsApp / DLT templates:
 *   MSG91_TEMPLATES            JSON { "<kind>": "<flow template id>" }  — DLT needs one per kind; kinds without one are skipped
 *   TWILIO_WHATSAPP_TEMPLATES  JSON { "<kind>": "<content sid>" }       — variables {{1}}, {{2}}… in TEMPLATE_VARS order; otherwise SMS text
 * The dev provider logs the text and reports it as sent.
 */

export type MessageKind =
  | "guest_confirmed"
  | "guest_cancelled"
  | "guest_rescheduled"
  | "guest_updated"
  | "guest_no_show"
  | "host_new_booking"
  | "host_cancelled"
  | "host_rescheduled";

export interface MessageVars {
  title: string;
  venue: string;
  when: string;
  code: string;
  customer?: string;
  amount?: string;
  due?: string;
  refund?: string;
  change?: string;
  oldWhen?: string;
  count?: string;
}

/** Variable order for numbered template placeholders. */
export const TEMPLATE_VARS: Record<MessageKind, (keyof MessageVars)[]> = {
  guest_confirmed: ["title", "when", "venue", "code", "due", "count"],
  guest_cancelled: ["title", "when", "code", "refund"],
  guest_rescheduled: ["title", "when", "venue", "code"],
  guest_updated: ["title", "when", "code", "change", "due"],
  guest_no_show: ["title", "when", "code"],
  host_new_booking: ["venue", "customer", "title", "when", "amount", "code", "count"],
  host_cancelled: ["venue", "customer", "title", "when", "code"],
  host_rescheduled: ["venue", "customer", "title", "when", "oldWhen", "code"],
};

const SIGN = " - local.";

export function renderMessage(kind: MessageKind, v: MessageVars): string {
  const due = v.due ? ` ${v.due} is due at the venue.` : "";
  const multi = v.count && Number(v.count) > 1 ? ` (${v.count} bookings)` : "";
  switch (kind) {
    case "guest_confirmed":
      return `Booked! ${v.title}${multi} on ${v.when} at ${v.venue}. Booking ID ${v.code}.${due} Show the code when you arrive.${SIGN}`;
    case "guest_cancelled":
      return `Your booking ${v.code} (${v.title}, ${v.when}) is cancelled.${v.refund ? ` ${v.refund}` : ""}${SIGN}`;
    case "guest_rescheduled":
      return `Your booking ${v.code} (${v.title}) has moved to ${v.when} at ${v.venue}. Same code, see you there.${SIGN}`;
    case "guest_updated":
      return `Update to booking ${v.code} (${v.title}, ${v.when}): ${v.change ?? "details changed"}.${due}${SIGN}`;
    case "guest_no_show":
      return `You were marked as a no-show for ${v.title} on ${v.when} (booking ${v.code}). After ${NO_SHOW_LIMIT} no-shows, pay at venue is switched off for your account. Contact the host if this is a mistake.${SIGN}`;
    case "host_new_booking":
      return `New booking at ${v.venue}${multi}: ${v.customer ?? "Guest"}, ${v.title}, ${v.when}${v.amount ? `, ${v.amount}` : ""}. Code ${v.code}.${SIGN}`;
    case "host_cancelled":
      return `Cancelled at ${v.venue}: ${v.customer ?? "Guest"}, ${v.title}, ${v.when}. Code ${v.code}. The slot is open again.${SIGN}`;
    case "host_rescheduled":
      return `Moved at ${v.venue}: ${v.customer ?? "Guest"}, ${v.title}, now ${v.when} (was ${v.oldWhen ?? "earlier"}). Code ${v.code}.${SIGN}`;
  }
}

function templates(env: string | undefined): Record<string, string> {
  if (!env) return {};
  try {
    const o = JSON.parse(env) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string" && v)) as Record<string, string>;
  } catch {
    console.error("[messaging] template map is not valid JSON");
    return {};
  }
}

async function post(url: string, init: RequestInit, provider: string) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new ServiceError(502, "message_failed", `${provider}: ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new ServiceError(502, "message_failed", `${provider} ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

export interface Delivery {
  status: "sent" | "skipped";
  channel: OtpChannel;
  provider: SmsProvider;
  ref: string | null;
  /** Why it was skipped (no provider, no template). */
  reason?: string;
  body: string;
}

/**
 * Send one booking message. Throws ServiceError(502) when the provider refused; returns `skipped`
 * when nothing can be sent (no provider in production, or MSG91 without a DLT template for this kind).
 */
export async function deliverMessage(phone: string, kind: MessageKind, vars: MessageVars, channel: OtpChannel, provider = smsProvider()): Promise<Delivery> {
  const body = renderMessage(kind, vars);
  const ordered = TEMPLATE_VARS[kind].map((k) => vars[k] ?? "");
  if (provider === "dev") {
    console.info(`[msg] ${channel} ${phone.slice(0, 2)}******${phone.slice(-2)} ${kind}: ${body}`);
    return { status: "sent", channel, provider, ref: `dev_${Date.now().toString(36)}`, body };
  }
  if (provider === "msg91") {
    const tpl = templates(process.env.MSG91_TEMPLATES)[kind];
    if (!tpl) return { status: "skipped", channel: "sms", provider, ref: null, reason: `no MSG91 template for ${kind}`, body };
    const text = await post(
      `${process.env.MSG91_API_BASE ?? "https://control.msg91.com"}/api/v5/flow`,
      {
        headers: { authkey: process.env.MSG91_AUTH_KEY!, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ template_id: tpl, short_url: "0", recipients: [{ mobiles: `91${phone}`, ...Object.fromEntries(TEMPLATE_VARS[kind].map((k, i) => [k, ordered[i]])) }] }),
      },
      "msg91",
    );
    let parsed: { type?: string; message?: string } = {};
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {}
    if (parsed.type && parsed.type !== "success") throw new ServiceError(502, "message_failed", `msg91: ${text.slice(0, 200)}`);
    return { status: "sent", channel: "sms", provider, ref: parsed.message ?? null, body };
  }
  if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const waTpl = channel === "whatsapp" && process.env.TWILIO_WHATSAPP_FROM ? templates(process.env.TWILIO_WHATSAPP_TEMPLATES)[kind] : undefined;
    const form = new URLSearchParams();
    if (waTpl) {
      form.set("To", `whatsapp:+91${phone}`);
      form.set("From", `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`);
      form.set("ContentSid", waTpl);
      form.set("ContentVariables", JSON.stringify(Object.fromEntries(ordered.map((v, i) => [String(i + 1), v]))));
    } else {
      form.set("To", `+91${phone}`);
      if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
      else form.set("From", process.env.TWILIO_FROM!);
      form.set("Body", body);
    }
    const text = await post(
      `${process.env.TWILIO_API_BASE ?? "https://api.twilio.com"}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      { headers: { authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" }, body: form.toString() },
      "twilio",
    );
    let ref: string | null = null;
    try {
      ref = (JSON.parse(text) as { sid?: string }).sid ?? null;
    } catch {}
    return { status: "sent", channel: waTpl ? "whatsapp" : "sms", provider, ref, body };
  }
  return { status: "skipped", channel, provider, ref: null, reason: "no messaging provider configured", body };
}
