import { z } from "zod";
import { body, requireUser, route } from "@/lib/api/handler";
import { applyCoupon } from "@/services/bookings";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const u = await requireUser();
  const { code } = await body(req, z.object({ code: z.string().trim().min(1).nullable() }));
  return { booking: await applyCoupon(u.id, (await params).id, code) };
});
