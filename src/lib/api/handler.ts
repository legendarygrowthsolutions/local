import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { forbidden, ServiceError, unauthorized } from "@/services/errors";
import { getSessionUser } from "@/lib/session";

type Ctx<P> = { params: Promise<P> };

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
/** Default request-body cap; routes that carry uploads pass a larger one. */
const MAX_BODY = 64 * 1024;

/**
 * CSRF guard for state-changing requests. Session cookies are SameSite=Lax; on top of that a
 * browser request must come from our own origin. (Non-browser clients send no Origin.)
 */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

/**
 * Client address for rate limiting. Behind a proxy/CDN set TRUSTED_IP_HEADER to the header it
 * overwrites (e.g. `cf-connecting-ip`, `x-real-ip`); otherwise we use the last X-Forwarded-For hop,
 * which is what the nearest proxy (or Next itself, from the socket) recorded.
 */
export function clientIp(req: NextRequest) {
  const trusted = process.env.TRUSTED_IP_HEADER;
  if (trusted) return req.headers.get(trusted)?.split(",")[0].trim() || "unknown";
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",").pop()!.trim().slice(0, 64);
  return "unknown";
}

/** Wraps a route handler: CSRF check and consistent JSON errors `{ error: { code, message } }`. */
export function route<P = Record<string, string>>(fn: (req: NextRequest, ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    if (!SAFE.has(req.method) && !sameOrigin(req)) {
      return NextResponse.json({ error: { code: "bad_origin", message: "Cross-site request blocked" } }, { status: 403 });
    }
    try {
      const data = await fn(req, ctx);
      if (data instanceof Response) return data;
      return NextResponse.json(data ?? { ok: true }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      if (e instanceof ServiceError) {
        const headers: Record<string, string> = {};
        if (e.status === 429 && typeof e.extra?.retryAfter === "number") headers["retry-after"] = String(e.extra.retryAfter);
        return NextResponse.json({ error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status, headers });
      }
      if (e instanceof ZodError)
        return NextResponse.json({ error: { code: "validation", message: e.issues[0]?.message ?? "Invalid input", issues: e.issues } }, { status: 422 });
      console.error(e);
      return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodType<T>, maxBytes = MAX_BODY): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new ServiceError(413, "too_large", "That's too large to upload. Try smaller photos.");
  const text = await req.text().catch(() => "");
  if (text.length > maxBytes) throw new ServiceError(413, "too_large", "That's too large to upload. Try smaller photos.");
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ServiceError(400, "bad_json", "Malformed request");
  }
  return schema.parse(json);
}

export async function requireUser() {
  const u = await getSessionUser();
  if (!u) throw unauthorized();
  return u;
}

export async function requireAdmin() {
  const u = await getSessionUser();
  if (!u) throw unauthorized();
  if (u.role !== "admin") throw forbidden("Superadmins only");
  return u;
}
