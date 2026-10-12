import { route } from "@/lib/api/handler";
import { getAvailability } from "@/services/availability";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const p = req.nextUrl.searchParams;
  return getAvailability(id, p.get("sport") ?? undefined, p.get("date") ?? undefined);
});
