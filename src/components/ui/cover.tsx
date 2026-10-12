import Image from "next/image";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./icon";

const TONES = ["bg-tone-0", "bg-tone-1", "bg-tone-2", "bg-tone-3"];
const INKS = ["#C3D9D7", "#C5D1C1", "#DCC8BD", "#C3CCDC"];

/**
 * Listing artwork. Real photos when available; otherwise calm tone-on-tone
 * shapes picked by listing id (PLAN §7 "fallback art").
 */
export function Cover({
  media,
  tone,
  icon,
  alt,
  className,
  priority,
  sizes = "(max-width: 768px) 80vw, 320px",
  variant = 0,
}: {
  media: string[];
  tone: number;
  icon: string;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  variant?: number;
}) {
  if (media[0]) {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <Image src={media[0]} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  const ink = INKS[tone % 4];
  const v = (tone + variant) % 3;
  return (
    <div className={cn("relative overflow-hidden", TONES[tone % 4], className)} {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}>
      <svg className="absolute inset-0 size-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {v === 0 && (
          <>
            <circle cx="320" cy="60" r="120" fill={ink} opacity="0.55" />
            <circle cx="70" cy="290" r="90" fill={ink} opacity="0.35" />
          </>
        )}
        {v === 1 && (
          <>
            <rect x="-40" y="170" width="300" height="300" rx="150" fill={ink} opacity="0.45" />
            <rect x="250" y="-60" width="200" height="200" rx="40" transform="rotate(18 350 40)" fill={ink} opacity="0.4" />
          </>
        )}
        {v === 2 && (
          <>
            <path d="M0 220 C 100 160, 180 280, 400 190 L 400 300 L 0 300 Z" fill={ink} opacity="0.5" />
            <circle cx="300" cy="90" r="56" fill={ink} opacity="0.45" />
          </>
        )}
      </svg>
      <CategoryIcon name={icon} className="absolute bottom-[14%] left-[8%] size-[22%] max-h-16 max-w-16 text-ink/25" strokeWidth={1.5} />
    </div>
  );
}
