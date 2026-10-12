import Link from "next/link";
import { cn } from "@/lib/utils";

export function AdminPage({ title, sub, action, children, wide }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn("mx-auto flex flex-col gap-6 px-4 py-6 md:px-8 md:py-8", wide ? "max-w-[1400px]" : "max-w-[1180px]")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-tight md:text-[30px]">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Segmented tabs (wireframe 21). Pass `href` per tab — server pages can't hand functions to links. */
export function Tabs({ tabs, active, className }: { tabs: { id: string; label: string; count?: number; href: string }[]; active: string; className?: string }) {
  return (
    <div className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-[#efefea] p-1", className)}>
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          scroll={false}
          aria-current={active === t.id ? "page" : undefined}
          className={cn("flex h-9 shrink-0 items-center rounded-[10px] px-3.5 text-sm font-semibold", active === t.id ? "bg-surface text-ink shadow-[0_1px_2px_rgba(20,18,31,.08)]" : "text-muted hover:text-ink")}
        >
          {t.label}
          {t.count !== undefined && active === t.id ? ` · ${t.count}` : ""}
        </Link>
      ))}
    </div>
  );
}
