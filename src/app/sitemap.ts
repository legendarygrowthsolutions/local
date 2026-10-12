import type { MetadataRoute } from "next";
import { allIndexablePaths } from "@/services/discover";
import { abs } from "@/lib/seo";

// Built from the database on request (builds don't need a database); it's one cheap query.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await allIndexablePaths();
  return paths.map((p) => ({ url: abs(p.path), changeFrequency: "daily", priority: p.priority }));
}
