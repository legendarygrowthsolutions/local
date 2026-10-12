import "server-only";
import { repo } from "@/repositories";

/** A listing or venue is public (viewable and bookable) only when it's live and its host is approved. */
export async function isPublic(item: { status: string; hostId: string } | null | undefined): Promise<boolean> {
  if (!item || item.status !== "live") return false;
  return (await repo.hosts.byId(item.hostId))?.status === "approved";
}
