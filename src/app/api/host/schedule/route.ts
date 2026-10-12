import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { venueSchedule } from "@/services/host";

export const GET = route(async (req) => {
  const p = req.nextUrl.searchParams;
  return { schedule: await venueSchedule(await requireHostApi(), p.get("venue") ?? undefined, p.get("date") ?? undefined) };
});
