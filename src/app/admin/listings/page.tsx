import Link from "next/link";
import { listModeration, type ModerationTab } from "@/services/admin";
import { AdminPage, Tabs } from "@/components/admin/page-bits";
import { ModerationDetail } from "@/components/admin/moderation-detail";
import { EmptyState } from "@/components/ui/states";
import { Cover } from "@/components/ui/cover";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

export const metadata = { title: "Listing moderation" };

export default async function ListingsModeration({ searchParams }: { searchParams: Promise<{ tab?: string; id?: string; city?: string }> }) {
  const sp = await searchParams;
  const tab = (["review", "live", "rejected"].includes(sp.tab ?? "") ? sp.tab : "review") as ModerationTab;
  const { counts, items, total, cities } = await listModeration(tab, sp.city || undefined);
  const selected = items.find((x) => x.id === sp.id) ?? items[0];
  const href = (p: { tab?: string; id?: string; city?: string | null }) => {
    const q = new URLSearchParams({ tab: p.tab ?? tab });
    const city = p.city === null ? undefined : p.city ?? sp.city;
    if (city) q.set("city", city);
    if (p.id) q.set("id", p.id);
    return `/admin/listings?${q}`;
  };
  return (
    <AdminPage title="Listing moderation" sub="Every new listing is checked before it goes live. Live listings can be featured on the city home page." wide>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          active={tab}
          tabs={[
            { id: "review", label: "In review", count: counts.review, href: href({ tab: "review" }) },
            { id: "live", label: "Live", count: counts.live, href: href({ tab: "live" }) },
            { id: "rejected", label: "Sent back", count: counts.rejected, href: href({ tab: "rejected" }) },
          ]}
        />
        <div className="flex gap-1.5">
          <Link href={href({ city: null })} className={cn("h-9 rounded-full border px-3.5 text-sm font-semibold leading-9", !sp.city ? "border-brand bg-brand text-white" : "border-line-strong")}>
            All cities
          </Link>
          {cities.map((c) => (
            <Link key={c.id} href={href({ city: c.id })} className={cn("h-9 rounded-full border px-3.5 text-sm font-semibold leading-9", sp.city === c.id ? "border-brand bg-brand text-white" : "border-line-strong")}>
              {c.name}
            </Link>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState title={tab === "review" ? "Review queue is clear" : "Nothing here"} body={tab === "review" ? "New listings from hosts land here." : undefined} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <div className={cn("flex flex-col gap-2 self-start", sp.id && "max-lg:hidden")}>
            <ul className="divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface">
              {items.map((x) => (
                <li key={x.id}>
                  <Link href={href({ id: x.id })} scroll={false} className={cn("flex items-center gap-3 px-3 py-3 transition-colors", x.id === selected?.id ? "bg-tint shadow-[inset_4px_0_0_var(--color-brand)]" : "hover:bg-field/60")}>
                    <Cover media={x.media} tone={x.title.length % 4} icon={x.kind === "venue" ? "Activity" : "Ticket"} alt="" className="size-12 shrink-0 rounded-xl" sizes="48px" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate font-semibold">
                        {x.featured && <Star className="size-3.5 shrink-0 fill-brand text-brand" aria-label="Featured" />}
                        <span className="truncate">{x.title}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {x.hostName} · {x.cityName} · {x.templateName}
                      </span>
                    </span>
                    {tab === "review" && x.checks.some((c) => !c.ok) && <span className="size-2 shrink-0 rounded-full bg-warn" title="Some checks need attention" />}
                  </Link>
                </li>
              ))}
            </ul>
            {total > items.length && <p className="px-1 text-xs text-muted">Showing {items.length} of {total}. Filter by city to narrow it down.</p>}
          </div>
          {selected && (
            <div className={cn(!sp.id && "max-lg:hidden")}>
              <Link href={href({})} className="mb-3 inline-block text-sm font-semibold text-muted lg:hidden">
                ← All listings
              </Link>
              <ModerationDetail key={selected.id + selected.status + selected.featured} row={selected} />
            </div>
          )}
        </div>
      )}
    </AdminPage>
  );
}
