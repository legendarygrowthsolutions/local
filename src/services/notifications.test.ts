import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/contracts";
import { repo } from "@/repositories";
import { makeUser, setupTestDb } from "@/test/db";
import { attendee, makeListing, makeVenue } from "@/test/fixtures";
import { addDays, todayIST } from "@/lib/time";
import { cancelBooking, holdBooking, payBooking } from "./bookings";
import { flushNotifications, notifyBooking } from "./notifications";
import { resolveHostContext } from "./host";
import { updateHostSettings } from "./host-settings";
import * as messaging from "@/lib/providers/messaging";

setupTestDb();
process.env.DEV = "1"; // dummy SMS + test gateway

const ctxFor = async (userId: string) => (await resolveHostContext((await repo.users.byId(userId)) as User))!;

afterEach(() => vi.restoreAllMocks());

describe("booking notifications", () => {
  it("messages the guest and the host team when a free booking is confirmed, once per recipient", async () => {
    const u = await makeUser({ notifications: { whatsapp: true, email: true, offers: false } });
    const { listing, tickets } = await makeListing({ listing: { templateId: "tpl_rsvp", hostId: "h_mumbai_5" }, tickets: [{ price: 0, qty: 50 }] });
    const b = await holdBooking(u.id, { kind: "listing", targetId: listing.id, tickets: [{ ticketTypeId: tickets[0].id, qty: 1 }], attendee: attendee() });
    expect(b.status).toBe("confirmed");
    await flushNotifications();
    const log = await repo.notifications.listByBooking(b.id);
    const guest = log.find((n) => n.audience === "guest")!;
    expect(guest).toMatchObject({ kind: "guest_confirmed", status: "sent", channel: "whatsapp", recipient: attendee().phone, provider: "dev" });
    expect(guest.body).toContain(b.code);
    // h_mumbai_5's owner (u_venue) and its manager hear about it.
    const team = log.filter((n) => n.audience === "host");
    expect(team.length).toBeGreaterThanOrEqual(1);
    expect(team.every((n) => n.kind === "host_new_booking" && n.status === "sent")).toBe(true);
    // A second call for the same event is a no-op.
    expect(await notifyBooking(b.id, "confirmed", { actor: "guest" })).toEqual([]);
    expect((await repo.notifications.listByBooking(b.id)).length).toBe(log.length);
  });

  it("uses SMS when the guest has switched WhatsApp off", async () => {
    const u = await makeUser({ notifications: { whatsapp: false, email: true, offers: false } });
    const { listing, tickets } = await makeListing({ tickets: [{ price: 200, qty: 10 }] });
    const b = await holdBooking(u.id, { kind: "listing", targetId: listing.id, tickets: [{ ticketTypeId: tickets[0].id, qty: 1 }], attendee: attendee() });
    await payBooking(u.id, b.id, { method: "upi", outcome: "success" });
    await flushNotifications();
    const guest = (await repo.notifications.listByBooking(b.id)).find((n) => n.audience === "guest")!;
    expect(guest).toMatchObject({ kind: "guest_confirmed", channel: "sms", status: "sent" });
  });

  it("respects the host's alert settings: event flags, quiet hours and extra numbers", async () => {
    const owner = await ctxFor("u_venue");
    await updateHostSettings(owner, { alerts: { enabled: true, newBooking: false, cancellation: true, reschedule: true, hostBookings: false, channel: "sms", toManagers: false, extraPhones: ["9000000001"], quietFromMins: null, quietToMins: null } });
    const u = await makeUser();
    const { venueId, resourceId } = await makeVenue("ntf1");
    const date = addDays(todayIST(), 2);
    const b = await holdBooking(u.id, { kind: "venue", targetId: venueId, slots: { resourceId, date, startMins: 600, endMins: 660 }, attendee: attendee() });
    await payBooking(u.id, b.id, { method: "upi", outcome: "success" });
    await flushNotifications();
    let log = await repo.notifications.listByBooking(b.id);
    expect(log.filter((n) => n.audience === "host")).toEqual([]); // newBooking off
    expect(log.filter((n) => n.audience === "guest").length).toBe(1);

    await cancelBooking(u.id, b.id);
    await flushNotifications();
    log = await repo.notifications.listByBooking(b.id);
    const team = log.filter((n) => n.audience === "host");
    expect(team.map((n) => n.recipient).sort()).toEqual([(await repo.hosts.byId("h_mumbai_5"))!.contactPhone, "9000000001"].sort());
    expect(team.every((n) => n.kind === "host_cancelled" && n.channel === "sms")).toBe(true);
    expect(log.find((n) => n.audience === "guest" && n.kind === "guest_cancelled")?.body).toContain("refunded");

    // Quiet hours cover the whole day: no team alerts, guest still told.
    await updateHostSettings(owner, { alerts: { ...(await import("./host-settings")).hostSettings(owner.host).alerts, newBooking: true, quietFromMins: 0, quietToMins: 1439 } });
    const b2 = await holdBooking(u.id, { kind: "venue", targetId: venueId, slots: { resourceId, date, startMins: 720, endMins: 780 }, attendee: attendee() });
    await payBooking(u.id, b2.id, { method: "upi", outcome: "success" });
    await flushNotifications();
    const log2 = await repo.notifications.listByBooking(b2.id);
    expect(log2.filter((n) => n.audience === "host")).toEqual([]);
    expect(log2.filter((n) => n.audience === "guest").length).toBe(1);
  });

  it("logs a failed send without breaking the booking", async () => {
    vi.spyOn(messaging, "deliverMessage").mockRejectedValue(new Error("provider down"));
    const u = await makeUser();
    const { listing, tickets } = await makeListing({ tickets: [{ price: 150, qty: 10 }] });
    const b = await holdBooking(u.id, { kind: "listing", targetId: listing.id, tickets: [{ ticketTypeId: tickets[0].id, qty: 1 }], attendee: attendee() });
    const r = await payBooking(u.id, b.id, { method: "upi", outcome: "success" });
    expect(r.outcome).toBe("success");
    await flushNotifications();
    const log = await repo.notifications.listByBooking(b.id);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((n) => n.status === "failed" && n.error === "provider down")).toBe(true);
    expect((await repo.bookings.byId(b.id))!.status).toBe("confirmed");
  });

  it("renders every kind with the booking's facts", () => {
    const v = { title: "Pickleball · Court 1", venue: "BT", when: "Sat, 18 Oct · 8 PM", code: "LCLABC123", customer: "Asha", amount: "₹600", due: "₹300", refund: "₹600 back", oldWhen: "Fri", count: "3" };
    for (const kind of Object.keys(messaging.TEMPLATE_VARS) as messaging.MessageKind[]) {
      const text = messaging.renderMessage(kind, v);
      expect(text).toContain("LCLABC123");
      expect(text.length).toBeLessThan(320);
    }
    expect(messaging.renderMessage("guest_confirmed", v)).toContain("(3 bookings)");
  });
});
