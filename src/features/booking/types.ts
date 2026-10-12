import type { ListingDetail, VenueDetail } from "@/contracts";

export type JourneyTarget = { kind: "e"; detail: ListingDetail } | { kind: "v"; detail: VenueDetail };

export const draftKey = (t: JourneyTarget) => `${t.kind}:${t.kind === "e" ? t.detail.listing.id : t.detail.venue.id}`;
