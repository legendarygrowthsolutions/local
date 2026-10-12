"use client";

import { Heart } from "lucide-react";
import { m } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useMe, useToggleSaved } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

export function SaveButton({ id, title, className, size = "sm" }: { id: string; title: string; className?: string; size?: "sm" | "md" }) {
  const { data: me } = useMe();
  const toggle = useToggleSaved();
  const router = useRouter();
  const pathname = usePathname();
  const saved = !!me?.saved.includes(id);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!me) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
        toggle.mutate(id);
      }}
      className={cn(
        "grid place-items-center rounded-full bg-white/90 text-ink backdrop-blur transition-colors hover:bg-white",
        size === "sm" ? "size-9" : "size-11 border border-line",
        className,
      )}
    >
      <m.span key={String(saved)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 18 }}>
        <Heart className={cn("size-[18px]", saved && "fill-brand text-brand")} />
      </m.span>
    </button>
  );
}
