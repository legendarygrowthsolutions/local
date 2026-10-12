import type { ListingCard } from "@/contracts";

export function featuredMeta(c: ListingCard) {
  return [c.whenLabel, c.areaName, c.priceFrom === null ? "Free" : `from ${c.priceLabel.replace(" onwards", "")}`].filter(Boolean).join(" · ");
}
