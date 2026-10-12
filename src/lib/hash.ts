/** FNV-1a → [0,1). Deterministic, for stable cosmetic choices (placeholder art tone) and seed data. */
export function hash01(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}
