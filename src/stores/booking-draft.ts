"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface Draft {
  sessionId?: string | null;
  passMode?: boolean;
  tickets: Record<string, number>;
  date?: string;
  sport?: string;
  resourceId?: string | "any";
  sel?: { startMins: number; endMins: number; resourceId: string } | null;
  attendee?: { name: string; phone: string; email?: string; answers: Record<string, string> };
  screen?: string;
  bookingId?: string | null;
}

const empty: Draft = { tickets: {} };

interface DraftState {
  drafts: Record<string, Draft>;
  get: (key: string) => Draft;
  patch: (key: string, p: Partial<Draft>) => void;
  clear: (key: string) => void;
}

/** Booking draft, kept in sessionStorage so it survives the login detour mid-checkout. */
export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      drafts: {},
      get: (key) => get().drafts[key] ?? empty,
      patch: (key, p) => set((s) => ({ drafts: { ...s.drafts, [key]: { ...(s.drafts[key] ?? empty), ...p } } })),
      clear: (key) =>
        set((s) => {
          const d = { ...s.drafts };
          delete d[key];
          return { drafts: d };
        }),
    }),
    { name: "lcl-booking-drafts", storage: createJSONStorage(() => sessionStorage) },
  ),
);

export function useDraft(key: string) {
  const draft = useDraftStore((s) => s.drafts[key]) ?? empty;
  const patch = useDraftStore((s) => s.patch);
  const clear = useDraftStore((s) => s.clear);
  return { draft, patch: (p: Partial<Draft>) => patch(key, p), clear: () => clear(key) };
}
