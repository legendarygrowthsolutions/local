import { repo } from "@/repositories";
import { getSessionUser } from "@/lib/session";

/**
 * Private host verification documents. Visible to superadmins, the person who uploaded the file,
 * and owners of the host it belongs to. Never cached by shared caches.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new Response("Please log in", { status: 401 });
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return new Response("Not found", { status: 404 });
  const m = await repo.media.get(id);
  if (!m || !m.private) return new Response("Not found", { status: 404 });
  let allowed = user.role === "admin" || m.ownerId === user.id;
  if (!allowed) {
    const hostId = await repo.hosts.hostIdForDocumentMedia(id);
    allowed = !!hostId && (await repo.members.listByUser(user.id)).some((x) => x.hostId === hostId && x.role === "owner");
  }
  if (!allowed) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(m.data), {
    headers: {
      "content-type": m.contentType,
      "content-disposition": "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
