import { route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { hostBookings } from "@/services/host";

export const GET = route(async (req) => {
  const p = req.nextUrl.searchParams;
  return hostBookings(await requireHostApi(), {
    when: (p.get("when") as "today" | "upcoming" | "past") ?? undefined,
    target: p.get("target") ?? undefined,
    q: p.get("q") ?? undefined,
  });
});
