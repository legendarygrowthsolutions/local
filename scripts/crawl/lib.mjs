// Shared helpers for the Nagpur crawlers (see scripts/crawl/README.md).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const RAW_DIR = join(ROOT, "src/db/seed/real/raw");
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getText(url, headers = {}) {
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-IN", ...headers } });
  return { status: res.status, text: res.status === 200 ? await res.text() : "" };
}

/** Every JSON-LD object on a page, with top-level arrays flattened. */
export function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      out.push(...(Array.isArray(j) ? j : [j]));
    } catch {
      // Malformed blocks are skipped; the page usually has a second copy.
    }
  }
  return out;
}

export function writeRaw(name, data) {
  mkdirSync(RAW_DIR, { recursive: true });
  const file = join(RAW_DIR, name);
  writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
  console.log(`wrote ${file}`);
}

export const mentionsNagpur = (v) => JSON.stringify(v ?? "").toLowerCase().includes("nagpur");
