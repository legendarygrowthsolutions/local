import { csvResponse, route } from "@/lib/api/handler";
import { requireHostApi } from "@/lib/host-session";
import { hostReportCsv, type ReportRange } from "@/services/reports";

export const GET = route(async (req) => {
  const p = req.nextUrl.searchParams;
  const range = (["7d", "30d", "90d", "custom"].includes(p.get("range") ?? "") ? p.get("range") : "30d") as ReportRange;
  const csv = await hostReportCsv(await requireHostApi(), range, { from: p.get("from") ?? undefined, to: p.get("to") ?? undefined, target: p.get("target") || undefined });
  return csvResponse(csv, `report-${range}.csv`);
});
