import "server-only";
import type { User } from "@/contracts";
import { repo } from "@/repositories";
import { badRequest, notFound } from "./errors";
import { storeImage } from "./media";

/** Booking updates always go by SMS; these are the extras. */
export const DEFAULT_NOTIFICATIONS = { whatsapp: true, email: true, offers: false };

export type PublicUser = Pick<User, "id" | "phone" | "name" | "gender" | "dob" | "cityId" | "interests" | "role" | "saved" | "avatar"> & { following: string[]; notifications: NonNullable<User["notifications"]> };

export function toPublicUser(u: User): PublicUser {
  const { id, phone, name, gender, dob, cityId, interests, role, saved, avatar, following } = u;
  return { id, phone, name, gender, dob, cityId, interests, role, saved, avatar: avatar ?? null, following: following ?? [], notifications: u.notifications ?? DEFAULT_NOTIFICATIONS };
}

export async function updateMe(id: string, patch: Partial<Pick<User, "name" | "gender" | "dob" | "cityId" | "interests" | "avatar" | "notifications">>) {
  if (patch.avatar) patch = { ...patch, avatar: await storeImage(id, patch.avatar) };
  if (patch.cityId && !(await repo.cities.byId(patch.cityId))) throw badRequest("Unknown city");
  const u = await repo.users.update(id, patch);
  if (!u) throw notFound("User not found");
  return toPublicUser(u);
}

export async function toggleSaved(id: string, itemId: string) {
  const u = await repo.users.byId(id);
  if (!u) throw notFound("User not found");
  const removing = u.saved.includes(itemId);
  if (!removing) {
    if (u.saved.length >= 500) throw badRequest("Your saved list is full. Remove a few first.");
    const [l, v] = await Promise.all([repo.listings.byId(itemId), repo.venues.byId(itemId)]);
    if (!l && !v) throw notFound("Nothing to save");
  }
  const saved = removing ? u.saved.filter((x) => x !== itemId) : [...u.saved, itemId];
  await repo.users.update(id, { saved });
  return { saved, isSaved: saved.includes(itemId) };
}

export async function toggleFollow(id: string, hostId: string) {
  const [u, host] = await Promise.all([repo.users.byId(id), repo.hosts.byId(hostId)]);
  if (!u) throw notFound("User not found");
  if (!host) throw notFound("Host not found");
  const cur = u.following ?? [];
  const following = cur.includes(hostId) ? cur.filter((x) => x !== hostId) : [...cur, hostId];
  await repo.users.update(id, { following });
  return { following, isFollowing: following.includes(hostId) };
}
