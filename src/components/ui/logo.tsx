import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ href = "/", className, onDark }: { href?: string; className?: string; onDark?: boolean }) {
  return (
    <Link href={href} className={cn("font-display text-[26px] font-extrabold leading-none tracking-tight", onDark ? "text-white" : "text-ink", className)} aria-label="local. home">
      local<span className="text-brand">.</span>
    </Link>
  );
}
