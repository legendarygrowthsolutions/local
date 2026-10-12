"use client";

import { useRouter } from "next/navigation";
import { ViewTransition } from "react";
import { ChevronLeft } from "lucide-react";
import { Cover } from "@/components/ui/cover";
import { coverTransitionName } from "@/lib/transitions";
import { SaveButton } from "./save-button";
import { ShareButton } from "./share-button";

/** Detail hero (wireframes 08 + 10): full-bleed cover with round white actions; the content sheet overlaps its bottom edge on phones. */
export function DetailHero({
  id,
  title,
  media,
  tone,
  icon,
  fallback,
  variant = 1,
  short,
}: {
  id: string;
  title: string;
  media: string[];
  tone: number;
  icon: string;
  fallback: string;
  variant?: number;
  /** Venue hero is shorter (230px) than the event hero (300px) on phones */
  short?: boolean;
}) {
  const router = useRouter();
  const round = "grid size-11 place-items-center rounded-full border-0 bg-white text-ink shadow-[0_1px_2px_rgba(20,18,31,.08)] hover:bg-white";
  return (
    <div className="relative">
      <ViewTransition name={coverTransitionName(id)} share="morph" default="none">
        <Cover media={media} tone={tone} icon={icon} alt={title} priority className={`${short ? "h-[230px]" : "h-[300px]"} w-full md:h-auto md:aspect-[16/8] md:rounded-[28px]`} sizes="(max-width: 768px) 100vw, 800px" variant={variant} />
      </ViewTransition>
      <div className="absolute inset-x-4 top-4 flex justify-between md:hidden">
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))} className={round} aria-label="Go back">
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex gap-2">
          <ShareButton title={title} className={round} />
          <SaveButton id={id} title={title} size="md" className={round} />
        </div>
      </div>
      {media.length > 1 && (
        <span className="absolute bottom-10 right-4 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-bold text-white backdrop-blur md:bottom-4">
          1 / {media.length}
        </span>
      )}
    </div>
  );
}
