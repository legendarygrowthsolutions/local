import { route } from "@/lib/api/handler";
import { searchListings, type PriceFilter, type SortKey } from "@/services/discover";
import { badRequest } from "@/services/errors";

export const GET = route(async (req) => {
  const p = req.nextUrl.searchParams;
  const city = p.get("city");
  if (!city) throw badRequest("city is required");
  return searchListings({
    city,
    category: p.get("category") ?? undefined,
    sub: p.get("sub") ?? undefined,
    when: p.get("when") ?? undefined,
    price: (p.get("price") as PriceFilter) ?? undefined,
    area: p.get("area") ?? undefined,
    sort: (p.get("sort") as SortKey) ?? undefined,
    q: p.get("q") ?? undefined,
    kind: p.get("kind") === "event" || p.get("kind") === "venue" ? (p.get("kind") as "event" | "venue") : undefined,
    min: num(p.get("min")),
    max: num(p.get("max")),
    page: Number(p.get("page") ?? 1),
    pageSize: Number(p.get("pageSize") ?? 12),
  });
});

function num(v: string | null) {
  const n = v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
