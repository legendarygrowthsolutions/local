export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest supported city to a point; no third-party geocoder needed (PLAN §6.1). */
export function nearestCity<T extends { lat: number; lng: number }>(point: { lat: number; lng: number }, cities: T[]) {
  let best: { city: T; km: number } | null = null;
  for (const c of cities) {
    const km = haversineKm(point, c);
    if (!best || km < best.km) best = { city: c, km };
  }
  return best;
}

export function rememberCity(slug: string) {
  document.cookie = `lcl_city=${slug}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
