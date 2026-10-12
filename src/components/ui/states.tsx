"use client";

import { RotateCcw, SearchX, WifiOff } from "lucide-react";
import { Button } from "./button";
import { ApiError } from "@/lib/api/client";

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-tint text-brand">{icon ?? <SearchX className="size-5" />}</div>
      <div>
        <p className="font-display text-lg font-bold">{title}</p>
        {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.code === "offline";
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-urgent-tint text-urgent">
        {offline ? <WifiOff className="size-5" /> : <RotateCcw className="size-5" />}
      </div>
      <div>
        <p className="font-display text-lg font-bold">{offline ? "You're offline" : "Couldn't load this"}</p>
        <p className="mt-1 text-sm text-muted">{error instanceof Error ? error.message : "Something went wrong."}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
