import "server-only";
import { repo } from "@/repositories";
import { newId } from "@/lib/crypto";
import { badRequest } from "./errors";

const MAX_BYTES = 600 * 1024;
const MEDIA_URL = /^\/media\/([A-Za-z0-9_-]{6,40})$/;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/** Magic-number check so a renamed file can't be served as an image. */
function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/**
 * Normalise images coming from forms: new uploads arrive as data URLs and are stored, returning
 * `/media/{id}`; already-stored `/media/{id}` URLs pass through. Anything else is rejected, so
 * pages only ever render our own image URLs.
 */
export async function storeImages(ownerId: string, list: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const src of list) {
    const known = MEDIA_URL.exec(src);
    if (known) {
      if (!(await repo.media.exists(known[1]))) throw badRequest("One of the photos is missing. Please add it again.");
      out.push(src);
      continue;
    }
    const m = DATA_URL.exec(src);
    if (!m) throw badRequest("Unsupported image. Use a JPEG, PNG or WebP photo.");
    const data = Buffer.from(m[2], "base64");
    if (data.length > MAX_BYTES) throw badRequest("That photo is too large");
    const type = sniff(data);
    if (!type) throw badRequest("Unsupported image. Use a JPEG, PNG or WebP photo.");
    const id = newId("img").replace("_", "");
    await repo.media.insert({ id, ownerId, contentType: type, data, createdAt: new Date().toISOString() });
    out.push(`/media/${id}`);
  }
  return out;
}

const DOC_URL = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_DOC_BYTES = 2 * 1024 * 1024;

/** Store a verification document privately; returns its media id. */
export async function storeDocument(ownerId: string, dataUrl: string): Promise<string> {
  const m = DOC_URL.exec(dataUrl);
  if (!m) throw badRequest("Upload documents as PDF, JPG or PNG");
  const data = Buffer.from(m[2], "base64");
  if (data.length > MAX_DOC_BYTES) throw badRequest("Documents must be under 2 MB");
  const type = data.subarray(0, 5).toString("latin1") === "%PDF-" ? "application/pdf" : sniff(data);
  if (!type) throw badRequest("Upload documents as PDF, JPG or PNG");
  const id = newId("doc").replace("_", "");
  await repo.media.insert({ id, ownerId, contentType: type, data, private: true, createdAt: new Date().toISOString() });
  return id;
}

export async function storeImage(ownerId: string, src: string) {
  return (await storeImages(ownerId, [src]))[0];
}
