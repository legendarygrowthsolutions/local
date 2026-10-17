import type { HostProfile, ListingDetail, VenueDetail } from "@/contracts";
import { SITE_NAME, SITE_URL } from "@/lib/utils";

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const abs = (path: string) => new URL(path, SITE_URL).toString();

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

export function organization() {
  return { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: SITE_URL };
}

export function eventJsonLd(d: ListingDetail) {
  const s = d.sessions[0];
  const offers = d.ticketTypes.map((t) => ({
    "@type": "Offer",
    name: t.name,
    price: t.price,
    priceCurrency: "INR",
    availability: t.remaining > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    url: abs(d.card.href),
  }));
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: d.listing.title,
    description: d.listing.summary,
    startDate: s?.startsAt,
    endDate: d.sessions[d.sessions.length - 1]?.endsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: d.listing.venueName,
      address: { "@type": "PostalAddress", streetAddress: d.listing.address, addressLocality: d.city.name, addressRegion: d.city.state, addressCountry: "IN" },
      geo: { "@type": "GeoCoordinates", latitude: d.listing.lat, longitude: d.listing.lng },
    },
    organizer: { "@type": "Organization", name: d.host.brandName },
    isAccessibleForFree: d.card.priceFrom === null,
    offers: offers.length ? offers : undefined,
    url: abs(d.card.href),
  };
}

export function venueJsonLd(d: VenueDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: d.venue.name,
    description: d.venue.summary,
    address: { "@type": "PostalAddress", streetAddress: d.venue.address, addressLocality: d.city.name, addressRegion: d.city.state, addressCountry: "IN" },
    geo: { "@type": "GeoCoordinates", latitude: d.venue.lat, longitude: d.venue.lng },
    openingHours: "Mo-Su 06:00-23:00",
    priceRange: `₹${d.priceFrom}+ per hour`,
    amenityFeature: d.venue.amenities.map((a) => ({ "@type": "LocationFeatureSpecification", name: a, value: true })),
    url: abs(d.card.href),
  };
}

export function hostJsonLd(p: HostProfile) {
  const sameAs = [p.host.instagram ? `https://www.instagram.com/${p.host.instagram.replace(/^@/, "")}` : null, p.host.website].filter((x): x is string => !!x);
  return {
    "@context": "https://schema.org",
    "@type": p.host.type === "venue" ? "SportsActivityLocation" : "Organization",
    name: p.host.brandName,
    description: p.host.bio,
    url: abs(`/h/${p.host.slug}`),
    ...(sameAs.length ? { sameAs } : {}),
    ...(p.cities[0] ? { address: { "@type": "PostalAddress", addressLocality: p.cities[0].name, addressRegion: p.cities[0].state, addressCountry: "IN" } } : {}),
  };
}
