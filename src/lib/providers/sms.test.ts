import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverOtp, smsProvider } from "./sms";

const ENV = ["OTP_PROVIDER", "MSG91_AUTH_KEY", "MSG91_OTP_TEMPLATE_ID", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "TWILIO_WHATSAPP_FROM", "TWILIO_WHATSAPP_CONTENT_SID", "APP_HOST"];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV) delete process.env[k];
});
const capture = (status = 200, body = '{"type":"success"}') => {
  const f = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", f);
  return f;
};

describe("SMS provider selection", () => {
  it("is off when the chosen provider has no credentials", () => {
    process.env.OTP_PROVIDER = "msg91";
    expect(smsProvider()).toBe("none");
    Object.assign(process.env, { MSG91_AUTH_KEY: "k", MSG91_OTP_TEMPLATE_ID: "t" });
    expect(smsProvider()).toBe("msg91");
    process.env.OTP_PROVIDER = "twilio";
    expect(smsProvider()).toBe("none");
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+15550001111" });
    expect(smsProvider()).toBe("twilio");
    process.env.OTP_PROVIDER = "carrier-pigeon";
    expect(smsProvider()).toBe("none");
  });
});

describe("MSG91", () => {
  it("sends through the DLT flow template with the code as a variable", async () => {
    Object.assign(process.env, { MSG91_AUTH_KEY: "auth-key", MSG91_OTP_TEMPLATE_ID: "tpl-1" });
    const f = capture();
    expect(await deliverOtp("msg91", "9876543210", "123456", "whatsapp")).toBe("sms");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://control.msg91.com/api/v5/flow");
    expect(init.headers).toMatchObject({ authkey: "auth-key" });
    expect(JSON.parse(String(init.body))).toEqual({ template_id: "tpl-1", short_url: "0", recipients: [{ mobiles: "919876543210", otp: "123456" }] });
  });
  it("turns provider errors into a retryable 502", async () => {
    Object.assign(process.env, { MSG91_AUTH_KEY: "k", MSG91_OTP_TEMPLATE_ID: "t" });
    capture(200, '{"type":"error","message":"template not approved"}');
    await expect(deliverOtp("msg91", "9876543210", "123456", "sms")).rejects.toMatchObject({ status: 502, code: "sms_failed" });
    capture(500, "oops");
    await expect(deliverOtp("msg91", "9876543210", "123456", "sms")).rejects.toMatchObject({ status: 502 });
  });
});

describe("Twilio", () => {
  it("sends an SMS with a Web OTP line", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+15550001111", APP_HOST: "local.example" });
    const f = capture(201, "{}");
    expect(await deliverOtp("twilio", "9876543210", "654321", "sms")).toBe("sms");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("To")).toBe("+919876543210");
    expect(form.get("From")).toBe("+15550001111");
    expect(form.get("Body")).toContain("654321");
    expect(form.get("Body")).toContain("@local.example #654321");
  });
  it("uses the approved WhatsApp template when configured, SMS otherwise", async () => {
    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+15550001111" });
    capture(201, "{}");
    expect(await deliverOtp("twilio", "9876543210", "111222", "whatsapp")).toBe("sms");
    Object.assign(process.env, { TWILIO_WHATSAPP_FROM: "+15550002222", TWILIO_WHATSAPP_CONTENT_SID: "HX1" });
    const f = capture(201, "{}");
    expect(await deliverOtp("twilio", "9876543210", "111222", "whatsapp")).toBe("whatsapp");
    const form = new URLSearchParams(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(form.get("To")).toBe("whatsapp:+919876543210");
    expect(form.get("ContentSid")).toBe("HX1");
    expect(JSON.parse(form.get("ContentVariables")!)).toEqual({ 1: "111222" });
  });
});

describe("over real HTTP (local stub servers)", () => {
  it("MSG91 and Twilio requests arrive with the right auth and payload", async () => {
    const { createServer } = await import("node:http");
    const seen: { url: string; headers: Record<string, unknown>; body: string }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push({ url: req.url!, headers: req.headers, body });
        res.writeHead(req.url!.includes("Messages.json") ? 201 : 200, { "content-type": "application/json" });
        res.end(req.url!.includes("flow") ? '{"type":"success"}' : '{"sid":"SM1"}');
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      Object.assign(process.env, {
        MSG91_AUTH_KEY: "k1", MSG91_OTP_TEMPLATE_ID: "t1", MSG91_API_BASE: base,
        TWILIO_ACCOUNT_SID: "AC9", TWILIO_AUTH_TOKEN: "tok9", TWILIO_FROM: "+15550009999", TWILIO_API_BASE: base,
      });
      expect(await deliverOtp("msg91", "9123456789", "424242", "sms")).toBe("sms");
      expect(await deliverOtp("twilio", "9123456789", "434343", "sms")).toBe("sms");
      expect(seen[0]).toMatchObject({ url: "/api/v5/flow", headers: { authkey: "k1" } });
      expect(JSON.parse(seen[0].body).recipients).toEqual([{ mobiles: "919123456789", otp: "424242" }]);
      expect(seen[1].url).toBe("/2010-04-01/Accounts/AC9/Messages.json");
      expect(seen[1].headers.authorization).toBe("Basic " + Buffer.from("AC9:tok9").toString("base64"));
      expect(new URLSearchParams(seen[1].body).get("To")).toBe("+919123456789");
    } finally {
      server.close();
      delete process.env.MSG91_API_BASE;
      delete process.env.TWILIO_API_BASE;
    }
  });
});
