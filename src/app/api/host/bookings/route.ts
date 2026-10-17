import { HostBookingInputSchema } from "@/contracts";
import { body, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { hostBookings } from "@/services/host";
import { createHostBooking } from "@/services/host-ops";

export const GET = route(async (req) => {
  const p = req.nextUrl.searchParams;
  return hostBookings(await requireHostApi(), {
    when: (p.get("when") as "today" | "upcoming" | "past") ?? undefined,
    target: p.get("target") ?? undefined,
    q: p.get("q") ?? undefined,
    source: (p.get("source") as "online" | "host") || undefined,
    due: p.get("due") === "1",
  });
});

/** Record a booking made at the venue or over the phone. */
export const POST = route(async (req) => {
  const ctx = await requireHostApi();
  return { booking: await createHostBooking(ctx, await body(req, HostBookingInputSchema)) };
});
