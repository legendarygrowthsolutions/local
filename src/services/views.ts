import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { repo } from "@/repositories";
import { todayIST } from "@/lib/time";

const BOT = /bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|embedly/i;

/** Count a detail-page view for host analytics, after the response has been sent. Skips crawlers. */
export async function trackView(targetId: string) {
  const ua = (await headers()).get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return;
  after(() => repo.views.record(targetId, todayIST()).catch((e) => console.error("[views]", e)));
}
