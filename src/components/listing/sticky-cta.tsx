import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mobile sticky bottom bar on detail pages (wireframes 08 + 10): "Starts from" over a big price, CTA on the right. */
export function StickyCta({ title, price, href, label, disabled, external }: { title: string; price: React.ReactNode; href: string; label: string; disabled?: boolean; external?: boolean }) {
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface md:hidden">
      <div className="flex min-h-[92px] items-center justify-between gap-4 px-5 pb-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{title}</p>
          <p className="truncate font-display text-2xl font-extrabold leading-tight">{price}</p>
        </div>
        <Link
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          aria-disabled={disabled}
          className={cn(
            "inline-flex h-[54px] flex-none items-center justify-center rounded-2xl bg-brand px-7 text-base font-bold text-white transition-colors hover:bg-brand-hover",
            disabled && "pointer-events-none bg-line-strong text-muted",
          )}
        >
          {label}
        </Link>
      </div>
    </div>
  );
}
