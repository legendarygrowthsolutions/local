"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig } from "motion/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { PublicUser } from "@/services/users";

// Non-critical UI: fetched after hydration.
const Toaster = dynamic(() => import("sonner").then((m) => m.Toaster), { ssr: false });
const loadFeatures = () => import("./motion-features").then((m) => m.default);
import { keys } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/client";
import { OfflineBanner } from "./ui/offline-banner";

export function Providers({ children, initialUser }: { children: React.ReactNode; initialUser: PublicUser | null }) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
          refetchOnWindowFocus: false,
        },
      },
    });
    qc.setQueryData(keys.me, initialUser);
    return qc;
  });
  return (
    <QueryClientProvider client={client}>
      <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 32 }}>
        <OfflineBanner />
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: { borderRadius: 14, border: "1px solid var(--color-line)", fontFamily: "var(--font-sans)", color: "var(--color-ink)" },
          }}
        />
      </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}
