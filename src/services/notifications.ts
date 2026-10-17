import "server-only";
import type { Booking, Host, HostMember } from "@/contracts";
import { repo } from "@/repositories";
import type { NotificationRecord } from "@/repositories/types";
import { newId } from "@/lib/crypto";
import { deliverMessage, type MessageKind, type MessageVars } from "@/lib/providers/messaging";
import { smsProvider } from "@/lib/providers/sms";
import { formatINR } from "@/lib/pricing";
import { formatWhen, istParts } from "@/lib/time";
import { hostSettings } from "./host-settings";
import { DEFAULT_NOTIFICATIONS } from "./users";

/**
 * Booking messages to guests and host teams. Called after the booking write has committed and never
 * awaited by the request that triggered it: a provider outage can't break a booking. Every attempt
 * is logged in `notifications`, and the (booking, event, recipient) key makes a repeat call a no-op.
 *
 * Who hears what is configurable at three levels: the guest's notification preferences (WhatsApp or
 * SMS), the host's settings (which events, who on the team, quiet hours) and the platform's provider
 * configuration (templates per kind).
 */

export type BookingEventName = "confirmed" | "cancelled" | "rescheduled" | "updated";

export interface NotifyOptions {
  /** Who caused it; the team isn't alerted about its own actions unless its settings say so. */
  actor: "guest" | "host" | "admin" | "system";
  /** Distinguishes repeatable events (a second move, a second charge). Defaults to the event name. */
  dedupe?: string;
  /** For `updated`: one line saying what changed. */
  change?: string;
  refundAmount?: number;
  oldStartsAt?: string;
  /** Bookings created together (bulk): one message for the batch. */
  count?: number;
  guest?: boolean;
  host?: boolean;
}

const GUEST_KIND: Record<BookingEventName, MessageKind> = { confirmed: "guest_confirmed", cancelled: "guest_cancelled", rescheduled: "guest_rescheduled", updated: "guest_updated" };
const HOST_KIND: Partial<Record<BookingEventName, MessageKind>> = { confirmed: "host_new_booking", cancelled: "host_cancelled", rescheduled: "host_rescheduled" };

const isMobile = (p: string | null | undefined): p is string => !!p && /^[6-9]\d{9}$/.test(p);

/** Pending sends, so tests (and graceful shutdown) can wait for them. */
const pending = new Set<Promise<unknown>>();
export function flushNotifications() {
  return Promise.allSettled([...pending]);
}

/** Fire and forget: errors are logged, never thrown into the request. */
export function queueNotification(bookingId: string, event: BookingEventName, opts: NotifyOptions) {
  const p = notifyBooking(bookingId, event, opts).catch((e) => console.error("[notify]", bookingId, event, e));
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
}

async function hostFor(b: Booking): Promise<{ host: Host; targetId: string } | null> {
  const targetId = b.listingId ?? b.venueId;
  if (!targetId) return null;
  const hostId = b.listingId ? (await repo.listings.byId(b.listingId))?.hostId : (await repo.venues.byId(b.venueId!))?.hostId;
  const host = hostId ? await repo.hosts.byId(hostId) : null;
  return host ? { host, targetId } : null;
}

function inQuietHours(from: number | null, to: number | null, now: Date) {
  if (from === null || to === null || from === to) return false;
  const m = istParts(now).mins;
  return from < to ? m >= from && m < to : m >= from || m < to;
}

function teamRecipients(host: Host, members: HostMember[], targetId: string, now: Date) {
  const s = hostSettings(host).alerts;
  if (!s.enabled || inQuietHours(s.quietFromMins, s.quietToMins, now)) return [];
  const phones = new Set<string>();
  if (isMobile(host.contactPhone)) phones.add(host.contactPhone);
  if (s.toManagers)
    for (const m of members) if (m.status === "active" && (m.scope === null || m.scope.includes(targetId)) && isMobile(m.phone)) phones.add(m.phone);
  for (const p of s.extraPhones) if (isMobile(p)) phones.add(p);
  return [...phones];
}

export async function notifyBooking(bookingId: string, event: BookingEventName, opts: NotifyOptions, now = new Date()): Promise<NotificationRecord[]> {
  const b = await repo.bookings.byId(bookingId);
  if (!b) return [];
  const ctx = await hostFor(b);
  if (!ctx) return [];
  const { host, targetId } = ctx;
  const settings = hostSettings(host);
  const user = await repo.users.byId(b.userId);
  const dedupe = opts.dedupe ?? event;
  const count = opts.count ?? 1;
  const vars: MessageVars = {
    title: b.title,
    venue: b.venueName,
    when: formatWhen(b.startsAt, now),
    code: b.code,
    customer: b.attendee?.name ?? user?.name ?? "Guest",
    amount: b.price.total > 0 ? formatINR(b.price.subtotal - b.price.discount) : "free",
    due: (b.amountDue ?? 0) > 0 ? formatINR(b.amountDue!) : undefined,
    refund: opts.refundAmount && opts.refundAmount > 0 ? `${formatINR(opts.refundAmount)} will be refunded to your original payment method in 5-7 days.` : undefined,
    change: opts.change,
    oldWhen: opts.oldStartsAt ? formatWhen(opts.oldStartsAt, now) : undefined,
    count: String(count),
  };

  const jobs: { kind: MessageKind; recipient: string; audience: "guest" | "host"; channel: "sms" | "whatsapp" }[] = [];

  // Guest: the number on the booking, else the account's. Walk-ins without a number get nothing.
  const guestWanted = (opts.guest ?? true) && settings.guestMessages.enabled && (b.source !== "host" || settings.guestMessages.forHostBookings);
  const guestPhone = isMobile(b.attendee?.phone) ? b.attendee!.phone : isMobile(user?.phone) ? user!.phone : null;
  if (guestWanted && guestPhone) {
    const prefs = user?.notifications ?? DEFAULT_NOTIFICATIONS;
    jobs.push({ kind: GUEST_KIND[event], recipient: guestPhone, audience: "guest", channel: prefs.whatsapp ? "whatsapp" : "sms" });
  }

  // Team: per the host's alert settings.
  const hostKind = HOST_KIND[event];
  const flag = event === "confirmed" ? settings.alerts.newBooking : event === "cancelled" ? settings.alerts.cancellation : event === "rescheduled" ? settings.alerts.reschedule : false;
  const ownAction = opts.actor === "host" && !settings.alerts.hostBookings;
  if ((opts.host ?? true) && hostKind && flag && !ownAction) {
    const members = await repo.members.listByHost(host.id);
    for (const phone of teamRecipients(host, members, targetId, now)) {
      if (phone === guestPhone) continue;
      jobs.push({ kind: hostKind, recipient: phone, audience: "host", channel: settings.alerts.channel });
    }
  }

  const provider = smsProvider();
  const out: NotificationRecord[] = [];
  for (const job of jobs) {
    const rec: NotificationRecord = {
      id: newId("ntf"),
      bookingId: b.id,
      kind: job.kind,
      dedupeKey: `${dedupe}:${job.audience}`,
      recipient: job.recipient,
      audience: job.audience,
      channel: job.channel,
      status: "skipped",
      provider,
      providerRef: null,
      error: "pending",
      body: null,
      createdAt: now.toISOString(),
    };
    // Claim the (booking, event, number) slot first so a concurrent or repeated call sends nothing twice.
    if (!(await repo.notifications.tryInsert(rec))) continue;
    try {
      const d = await deliverMessage(job.recipient, job.kind, vars, job.channel, provider);
      Object.assign(rec, { status: d.status, channel: d.channel, provider: d.provider, providerRef: d.ref, body: d.body, error: d.reason ?? null });
    } catch (e) {
      Object.assign(rec, { status: "failed", error: String((e as Error).message).slice(0, 300) });
      console.error("[notify] send failed", b.code, job.kind, job.recipient.slice(-4), (e as Error).message);
    }
    await repo.notifications.update(rec.id, { status: rec.status, channel: rec.channel, provider: rec.provider, providerRef: rec.providerRef, body: rec.body, error: rec.error });
    out.push(rec);
  }
  return out;
}
