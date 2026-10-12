import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { mockLatency } from "@/mocks/latency";
import { ServiceError, unauthorized } from "@/services/errors";
import { getSessionUser } from "@/lib/session";

type Ctx<P> = { params: Promise<P> };

/**
 * Wraps a mock route handler: artificial latency, `?mock_error=1` failure toggle,
 * and consistent JSON errors `{ error: { code, message } }`.
 */
export function route<P = Record<string, string>>(fn: (req: NextRequest, ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    await mockLatency();
    if (req.nextUrl.searchParams.get("mock_error") === "1" || req.cookies.get("mock_error")?.value === "1") {
      return NextResponse.json({ error: { code: "mock_error", message: "Simulated server error" } }, { status: 500 });
    }
    try {
      const data = await fn(req, ctx);
      if (data instanceof Response) return data;
      return NextResponse.json(data ?? { ok: true });
    } catch (e) {
      if (e instanceof ServiceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json({ error: { code: "validation", message: e.issues[0]?.message ?? "Invalid input", issues: e.issues } }, { status: 422 });
      console.error(e);
      return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const json = await req.json().catch(() => ({}));
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
  if (u.role !== "admin") throw new ServiceError(403, "forbidden", "Superadmins only");
  return u;
}
