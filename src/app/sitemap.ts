import type { MetadataRoute } from "next";
import { allIndexablePaths } from "@/services/discover";
import { abs } from "@/lib/seo";

// Listings change as hosts publish; refresh hourly rather than freezing at build time.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await allIndexablePaths();
  return paths.map((p) => ({ url: abs(p.path), changeFrequency: "daily", priority: p.priority }));
}
