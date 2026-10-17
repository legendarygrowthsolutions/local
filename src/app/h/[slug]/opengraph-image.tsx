import { ImageResponse } from "next/og";
import { getHostProfile } from "@/services/discover";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Host on local.";

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getHostProfile(slug).catch(() => null);
  const line = p
    ? [p.events.length ? `${p.events.length} upcoming` : null, p.venues.length ? `${p.venues.length} ${p.venues.length === 1 ? "venue" : "venues"}` : null, p.cities.map((c) => c.name).join(" & ") || null]
        .filter(Boolean)
        .join(" · ")
    : "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0C2326", color: "#fff", position: "relative" }}>
        <div style={{ position: "absolute", right: -120, top: -160, width: 560, height: 560, borderRadius: 9999, background: "#E9B44C", opacity: 0.45, filter: "blur(80px)" }} />
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>
          local<span style={{ color: "#E9B44C" }}>.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: "#7FD0D6", fontWeight: 700 }}>{p ? "Book with" : "local."}</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, maxWidth: 1000 }}>{p?.host.brandName ?? "Things to do near you"}</div>
          <div style={{ fontSize: 32, color: "#A9C3C4" }}>{line}</div>
        </div>
      </div>
    ),
    size,
  );
}
