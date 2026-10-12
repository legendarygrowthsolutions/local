"use client";

import { useCallback, useState } from "react";
import type { City } from "@/contracts";
import { nearestCity } from "@/lib/geo";

export type DetectState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "found"; city: City; km: number }
  | { status: "far"; city: City; km: number }
  | { status: "denied" | "unavailable" | "timeout" };

/** Browser geolocation → nearest supported city. Over 150 km away counts as "not in a supported city yet". */
export function useDetectCity(cities: City[] | undefined) {
  const [state, setState] = useState<DetectState>({ status: "idle" });
  const detect = useCallback(() => {
    if (!cities?.length) return;
    if (!("geolocation" in navigator)) return setState({ status: "unavailable" });
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const best = nearestCity({ lat: pos.coords.latitude, lng: pos.coords.longitude }, cities);
        if (!best) return setState({ status: "unavailable" });
        setState({ status: best.km <= 150 ? "found" : "far", city: best.city, km: best.km });
      },
      (err) => setState({ status: err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable" }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60_000 },
    );
  }, [cities]);
  return { state, detect, reset: () => setState({ status: "idle" }) };
}
