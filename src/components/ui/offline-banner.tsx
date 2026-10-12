"use client";

import { AnimatePresence, m } from "motion/react";
import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** PLAN §7 states: offline banner. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <AnimatePresence>
      {!online && (
        <m.div
          role="status"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-ink px-4 py-2 text-sm font-semibold text-white"
        >
          <WifiOff className="size-4" /> You&apos;re offline. We&apos;ll reconnect automatically.
        </m.div>
      )}
    </AnimatePresence>
  );
}
