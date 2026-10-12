"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-lg flex-col items-start justify-center gap-4 px-6">
      <h1 className="font-display text-4xl font-bold">Something broke</h1>
      <p className="text-muted">It&apos;s not you, it&apos;s us. Try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
