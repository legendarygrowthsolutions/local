import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** URL-safe random token (default 256 bits). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const hmac = (key: string, v: string) => createHmac("sha256", key).update(v).digest("hex");
export const randomDigits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");

/** Unguessable id with a readable prefix, e.g. `u_3fJ9…`. */
export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

/** Code from an unambiguous alphabet (no 0/O/1/I), e.g. booking codes read out at check-in. */
export function randomCode(len: number, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") {
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
