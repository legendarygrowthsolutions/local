"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** Mobile top bar with back button; on desktop it collapses into the page heading area. */
export function BackBar({
  title,
  fallback = "/",
  right,
  className,
  transparent,
}: {
  title?: string;
  fallback?: string;
  right?: React.ReactNode;
  className?: string;
  transparent?: boolean;
}) {
  const router = useRouter();
  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center gap-2 px-2",
        transparent ? "bg-transparent" : "border-b border-line bg-ground/90 backdrop-blur-md",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
        className="grid size-10 place-items-center rounded-full bg-surface/90 text-ink hover:bg-field"
        aria-label="Go back"
      >
        <ChevronLeft className="size-5" />
      </button>
      {title && <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title}</h1>}
      {!title && <span className="flex-1" />}
      {right}
    </div>
  );
}
