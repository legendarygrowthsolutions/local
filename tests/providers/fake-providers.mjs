// A local stand-in for the Razorpay and MSG91 HTTP APIs, used only by the provider E2E suite
// (playwright.providers.config.ts). It speaks the same request/response shapes the app uses and
// signs checkout results with the same HMAC scheme, so the app's real verification code runs.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";

const PORT = Number(process.env.FAKE_PROVIDERS_PORT ?? 3299);
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const SECRET = process.env.RAZORPAY_KEY_SECRET;
const MSG91_KEY = process.env.MSG91_AUTH_KEY;

const orders = new Map();
const payments = new Map();
const refunds = [];
const otps = new Map();
let n = 0;

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "content-type": type, "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
const basicOk = (req) => req.headers.authorization === "Basic " + Buffer.from(`${KEY_ID}:${SECRET}`).toString("base64");

// Stand-in for https://checkout.razorpay.com/v1/checkout.js: same constructor/options/handler contract.
const CHECKOUT_JS = `
(function () {
  var BASE = ${JSON.stringify(`http://localhost:${PORT}`)};
  function Razorpay(opts) { this.opts = opts; this.handlers = {}; }
  Razorpay.prototype.on = function (evt, cb) { this.handlers[evt] = cb; };
  Razorpay.prototype.open = function () {
    var self = this, o = this.opts;
    var el = document.createElement("div");
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Razorpay test checkout");
    el.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);display:grid;place-items:center;z-index:9999";
    el.innerHTML = '<div style="background:#fff;padding:24px;border-radius:16px;font:16px sans-serif;min-width:280px">' +
      '<p>' + o.name + ' · ₹' + (o.amount / 100) + '</p>' +
      '<button data-a="pay">Pay with UPI</button> <button data-a="fail">Decline</button> <button data-a="close">Close</button></div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute("data-a");
      if (!a) return;
      document.body.removeChild(el);
      if (a === "close") { o.modal && o.modal.ondismiss && o.modal.ondismiss(); return; }
      fetch(BASE + "/_checkout/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: o.order_id, key: o.key, outcome: a }) })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (a === "pay") o.handler(r);
          else self.handlers["payment.failed"] && self.handlers["payment.failed"]({ error: { description: "Payment declined by the bank (test)" } });
        });
    });
  };
  window.Razorpay = Razorpay;
})();`;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204, "");
  const raw = req.method === "GET" ? "" : await readBody(req);

  // --- inspection helpers for tests ---
  if (path === "/_health") return send(res, 200, { ok: true });
  if (path.startsWith("/_otp/")) return send(res, 200, { code: otps.get(path.slice(6)) ?? null });
  if (path === "/_state") return send(res, 200, { orders: [...orders.values()], payments: [...payments.values()], refunds });
  if (path === "/v1/checkout.js") return send(res, 200, CHECKOUT_JS, "application/javascript");

  // --- checkout sheet → "bank" ---
  if (path === "/_checkout/pay" && req.method === "POST") {
    const { order_id, key, outcome } = JSON.parse(raw);
    const order = orders.get(order_id);
    if (!order || key !== KEY_ID) return send(res, 400, { error: { description: "bad order" } });
    const id = `pay_fake${++n}`;
    payments.set(id, { id, entity: "payment", order_id, amount: order.amount, currency: "INR", status: outcome === "pay" ? "authorized" : "failed", method: "upi" });
    const signature = createHmac("sha256", SECRET).update(`${order_id}|${id}`).digest("hex");
    return send(res, 200, { razorpay_order_id: order_id, razorpay_payment_id: id, razorpay_signature: signature });
  }

  // --- Razorpay REST (subset) ---
  if (path.startsWith("/v1/")) {
    if (!basicOk(req)) return send(res, 401, { error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } });
    const body = raw ? JSON.parse(raw) : {};
    if (path === "/v1/orders" && req.method === "POST") {
      if (!Number.isInteger(body.amount) || body.amount < 100) return send(res, 400, { error: { description: "amount invalid" } });
      const id = `order_fake${++n}`;
      const o = { id, entity: "order", amount: body.amount, currency: body.currency, receipt: body.receipt, notes: body.notes, status: "created" };
      orders.set(id, o);
      return send(res, 200, o);
    }
    const m = /^\/v1\/payments\/([^/]+)(\/capture|\/refund)?$/.exec(path);
    if (m) {
      const p = payments.get(m[1]);
      if (!p) return send(res, 400, { error: { description: "The id provided does not exist" } });
      if (m[2] === "/capture") {
        if (p.status !== "authorized" || body.amount !== p.amount) return send(res, 400, { error: { description: "cannot capture" } });
        p.status = "captured";
        return send(res, 200, p);
      }
      if (m[2] === "/refund") {
        if (p.status !== "captured" || body.amount > p.amount) return send(res, 400, { error: { description: "cannot refund" } });
        const r = { id: `rfnd_fake${++n}`, entity: "refund", payment_id: p.id, amount: body.amount, status: "processed" };
        refunds.push(r);
        return send(res, 200, r);
      }
      return send(res, 200, p);
    }
  }

  // --- MSG91 flow API ---
  if (path === "/api/v5/flow" && req.method === "POST") {
    if (req.headers.authkey !== MSG91_KEY) return send(res, 401, { type: "error", message: "invalid authkey" });
    const body = JSON.parse(raw);
    for (const r of body.recipients ?? []) otps.set(String(r.mobiles).replace(/^91/, ""), r.otp);
    return send(res, 200, { type: "success", message: "queued" });
  }
  send(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`fake providers on ${PORT}`));
