import { describe, expect, it, vi } from "vitest";
import { repo } from "@/repositories";
import { setupTestDb } from "@/test/db";
import { sendOtp, verifyOtp } from "./auth";
import { ServiceError } from "./errors";

setupTestDb();
vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

let seq = 0;
/** Unique phone + IP per test so rate-limit windows don't leak between tests. */
const fresh = () => {
  seq++;
  return { phone: `81${String(seq).padStart(8, "0")}`, ip: `10.0.0.${seq}` };
};
const sec = (t: Date, s: number) => new Date(t.getTime() + s * 1000);

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServiceError) return { status: e.status, code: e.code, extra: e.extra };
    throw e;
  }
  return null;
}

describe("sendOtp", () => {
  it("returns a 6-digit dev code and stores only a hash", async () => {
    const { phone, ip } = fresh();
    const r = await sendOtp(phone, ip);
    expect(r).toMatchObject({ sent: true, resendInSec: 30, channel: "sms", devCode: expect.stringMatching(/^\d{6}$/) });
    const rec = (await repo.otps.get(phone))!;
    expect(rec.attempts).toBe(0);
    expect(rec.codeHash).not.toContain(r.devCode!);
    expect(rec.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("enforces a 30s resend cooldown", async () => {
    const { phone, ip } = fresh();
    const t0 = new Date();
    await sendOtp(phone, ip, t0);
    expect(await code(sendOtp(phone, ip, sec(t0, 10)))).toMatchObject({ status: 429, code: "otp_cooldown", extra: { retryAfter: 20 } });
    await expect(sendOtp(phone, ip, sec(t0, 30))).resolves.toMatchObject({ sent: true });
  });

  it("limits a number to 5 codes per hour", async () => {
    const { phone, ip } = fresh();
    const t0 = new Date();
    for (let i = 0; i < 5; i++) await sendOtp(phone, ip, sec(t0, i * 31));
    expect(await code(sendOtp(phone, ip, sec(t0, 5 * 31)))).toMatchObject({ status: 429, code: "rate_limited" });
    // A new window opens after an hour.
    await expect(sendOtp(phone, ip, sec(t0, 3601))).resolves.toMatchObject({ sent: true });
  });

  it("limits an IP to 20 codes per hour across numbers", async () => {
    const ip = "10.9.9.9";
    const t0 = new Date();
    for (let i = 0; i < 20; i++) await sendOtp(`82${String(i).padStart(8, "0")}`, ip, t0);
    expect(await code(sendOtp("8299999999", ip, t0))).toMatchObject({ status: 429, code: "rate_limited" });
  });
});

describe("verifyOtp", () => {
  it("creates a new user on first verify (isNew) and the code is single-use", async () => {
    const { phone, ip } = fresh();
    const t0 = new Date();
    const { devCode } = await sendOtp(phone, ip, t0);
    expect(await repo.users.byPhone(phone)).toBeNull();
    const r = await verifyOtp(phone, devCode!, ip, sec(t0, 5));
    expect(r.isNew).toBe(true);
    expect(r.user).toMatchObject({ phone, name: null, role: "user", saved: [] });
    expect(await repo.users.byPhone(phone)).toMatchObject({ id: r.user.id });
    expect(await code(verifyOtp(phone, devCode!, ip, sec(t0, 6)))).toMatchObject({ status: 400, code: "otp_expired" });
  });

  it("logs an existing user in (not new)", async () => {
    const ip = "10.1.2.3";
    const { devCode } = await sendOtp("9876543210", ip);
    const r = await verifyOtp("9876543210", devCode!, ip);
    expect(r).toMatchObject({ isNew: false, user: { id: "u_demo" } });
  });

  it("counts wrong guesses and locks after 5 (even the right code fails afterwards)", async () => {
    const { phone, ip } = fresh();
    const { devCode } = await sendOtp(phone, ip);
    const wrong = devCode === "000000" ? "111111" : "000000";
    for (let i = 1; i <= 4; i++) {
      expect(await code(verifyOtp(phone, wrong, ip))).toMatchObject({ status: 400, code: "otp_invalid" });
      expect((await repo.otps.get(phone))!.attempts).toBe(i);
    }
    expect(await code(verifyOtp(phone, wrong, ip))).toMatchObject({ status: 400, code: "otp_invalid" });
    expect(await repo.otps.get(phone)).toBeNull();
    expect(await code(verifyOtp(phone, devCode!, ip))).toMatchObject({ status: 400, code: "otp_expired" });
    expect(await repo.users.byPhone(phone)).toBeNull();
  });

  it("concurrent wrong guesses can't exceed the attempt budget", async () => {
    const { phone, ip } = fresh();
    const { devCode } = await sendOtp(phone, ip);
    const wrong = devCode === "000000" ? "111111" : "000000";
    const results = await Promise.all(Array.from({ length: 8 }, () => code(verifyOtp(phone, wrong, ip))));
    expect(results.every((r) => r?.status === 400)).toBe(true);
    expect(await code(verifyOtp(phone, devCode!, ip))).toMatchObject({ code: "otp_expired" });
  });

  it("rejects an expired code", async () => {
    const { phone, ip } = fresh();
    const t0 = new Date();
    const { devCode } = await sendOtp(phone, ip, t0);
    expect(await code(verifyOtp(phone, devCode!, ip, sec(t0, 5 * 60 + 1)))).toMatchObject({ status: 400, code: "otp_expired" });
  });

  it("a resend invalidates the previous code", async () => {
    const { phone, ip } = fresh();
    const t0 = new Date();
    const first = (await sendOtp(phone, ip, t0)).devCode!;
    const second = (await sendOtp(phone, ip, sec(t0, 31))).devCode!;
    if (first !== second) expect(await code(verifyOtp(phone, first, ip, sec(t0, 32)))).toMatchObject({ code: "otp_invalid" });
    await expect(verifyOtp(phone, second, ip, sec(t0, 33))).resolves.toMatchObject({ isNew: true });
  });

  it("limits verify attempts per IP (30 / 15 min)", async () => {
    const ip = "10.7.7.7";
    const t0 = new Date();
    for (let i = 0; i < 30; i++) expect(await code(verifyOtp("8300000000", "123456", ip, t0))).toMatchObject({ code: "otp_expired" });
    expect(await code(verifyOtp("8300000000", "123456", ip, t0))).toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("activates pending team invites for the phone on login", async () => {
    // Seed: 9000000005 is invited as a manager at Smash Arena (h_mumbai_5).
    const ip = "10.3.3.3";
    const { devCode } = await sendOtp("9000000005", ip);
    const { user } = await verifyOtp("9000000005", devCode!, ip);
    const ms = await repo.members.listByUser(user.id);
    expect(ms).toEqual([expect.objectContaining({ hostId: "h_mumbai_5", role: "manager", status: "active", userId: user.id })]);
    expect(await repo.members.invitesForPhone("9000000005")).toEqual([]);
  });
});

describe("real SMS delivery", () => {
  it("never returns the code, and a failed send leaves no code or cooldown behind", async () => {
    const { vi } = await import("vitest");
    Object.assign(process.env, { OTP_PROVIDER: "msg91", MSG91_AUTH_KEY: "k", MSG91_OTP_TEMPLATE_ID: "t" });
    try {
      vi.stubGlobal("fetch", vi.fn(async () => new Response('{"type":"success"}', { status: 200 })));
      const ok = await sendOtp("9811100001", "10.9.9.1");
      expect(ok).toMatchObject({ sent: true, channel: "sms" });
      expect(ok).not.toHaveProperty("devCode");

      vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
      await expect(sendOtp("9811100002", "10.9.9.1")).rejects.toMatchObject({ status: 502 });
      expect(await repo.otps.get("9811100002")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      process.env.OTP_PROVIDER = "dev";
      delete process.env.MSG91_AUTH_KEY;
      delete process.env.MSG91_OTP_TEMPLATE_ID;
    }
  });
});
