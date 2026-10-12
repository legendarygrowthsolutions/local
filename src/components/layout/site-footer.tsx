import Link from "next/link";
import type { Category, City } from "@/contracts";

/** City × category links for internal linking (PLAN §5 SEO), laid out as wireframe 18's footer. Desktop only: phones have the tab bar. */
export function SiteFooter({ cities, categories }: { cities: City[]; categories: Category[]; current?: string }) {
  const top = categories.filter((c) => c.parentId === null);
  const link = "text-[13px] leading-8 text-muted hover:text-ink";
  return (
    <footer className="mt-16 border-t border-line bg-surface max-md:hidden">
      <div className="mx-auto grid max-w-[1280px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-6 px-8 py-9">
        {cities.map((c) => (
          <div key={c.id} className="flex flex-col">
            <p className="mb-1.5 text-sm font-bold">{c.name}</p>
            {top.map((cat) => (
              <Link key={cat.id} href={`/${c.slug}/${cat.slug}`} className={link}>
                {cat.name} in {c.name}
              </Link>
            ))}
          </div>
        ))}
        <div className="flex flex-col">
          <p className="mb-1.5 text-sm font-bold">Company</p>
          <Link href="/host/apply" className={link}>
            Host with us
          </Link>
          <Link href="/legal#help" className={link}>
            Help
          </Link>
          <Link href="/legal#terms" className={link}>
            Terms
          </Link>
          <Link href="/legal#privacy" className={link}>
            Privacy
          </Link>
          <p className="mt-4 text-xs text-subtle">© {new Date().getFullYear()} local. · Prototype with sample data</p>
        </div>
      </div>
    </footer>
  );
}
