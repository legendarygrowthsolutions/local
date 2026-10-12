"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ShareButton({ title, className }: { title: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Share"
      className={cn("grid size-11 place-items-center rounded-full border border-line bg-white/90 text-ink backdrop-blur hover:bg-white", className)}
      onClick={async () => {
        const url = window.location.href;
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
          } catch {}
          return;
        }
        await navigator.clipboard?.writeText(url);
        toast.success("Link copied");
      }}
    >
      <Share2 className="size-[18px]" />
    </button>
  );
}
