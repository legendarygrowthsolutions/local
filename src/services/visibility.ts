import "server-only";
import { repo } from "@/repositories";

/** A listing or venue is public (viewable and bookable) only when it's live, its host is approved and its city is live. */
export async function isPublic(item: { status: string; hostId: string; cityId: string } | null | undefined): Promise<boolean> {
  if (!item || item.status !== "live") return false;
  const [host, city] = await Promise.all([repo.hosts.byId(item.hostId), repo.cities.byId(item.cityId)]);
  return host?.status === "approved" && !!city?.active;
}
