"use client";

import { useSyncExternalStore } from "react";
import { useDraftStore } from "@/stores/booking-draft";

/** True once the sessionStorage-backed draft store has rehydrated on the client. */
export function useDraftHydrated() {
  return useSyncExternalStore(
    (cb) => useDraftStore.persist.onFinishHydration(cb),
    () => useDraftStore.persist.hasHydrated(),
    () => false,
  );
}
