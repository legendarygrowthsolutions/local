import { NextResponse } from "next/server";
import { ServiceError } from "@/services/errors";
import { handleRazorpayWebhook } from "@/services/payments";

/** Razorpay → us. Signed with RAZORPAY_WEBHOOK_SECRET; the raw body is what's signed. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });
  try {
    return NextResponse.json(await handleRazorpayWebhook(raw, req.headers.get("x-razorpay-signature")));
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.code }, { status: e.status });
    console.error("[razorpay webhook]", e);
    // 5xx makes Razorpay retry later.
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
