import { requireAdminPage } from "@/lib/guards";
import Link from "next/link";
import { Plus } from "lucide-react";
import { listTemplates } from "@/services/admin";
import { getTopCategories } from "@/services/catalog";
import { AdminPage } from "@/components/admin/page-bits";
import { TemplateEditor } from "@/components/admin/template-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Journey templates" };

const MODE: Record<string, string> = { none: "Info only", rsvp: "RSVP", ticketed: "Tickets", slot: "Resources", registration: "Teams" };
const SCHEDULE: Record<string, string> = { single: "single day", multi_day: "multi-day", recurring: "weekly", date_range: "date range", open_hours: "open hours" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireAdminPage();
  const { id } = await searchParams;
  const [templates, cats] = await Promise.all([listTemplates(), getTopCategories()]);
  const isNew = id === "new";
  const selected = isNew ? null : (templates.find((t) => t.id === id) ?? templates[0]);
  return (
    <AdminPage
      title="Booking journey templates"
      sub="Hosts choose one of these when creating a listing. Admins can override per listing."
      wide
      action={
        <Button asChild>
          <Link href="/admin/templates?id=new">
            <Plus className="size-4" /> New template
          </Link>
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ul className={cn("flex flex-col gap-0.5 self-start rounded-2xl border border-[#e6e6e1] bg-surface p-2", id && "max-lg:hidden")}>
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/templates?id=${t.id}`} scroll={false} className={cn("flex flex-col gap-0.5 rounded-xl px-3.5 py-3 text-sm transition-colors", selected?.id === t.id ? "bg-tint font-bold shadow-[inset_4px_0_0_var(--color-brand)]" : "hover:bg-field/60")}>
                <span className="flex items-center gap-2">
                  {t.name}
                  {!t.active && <span className="rounded bg-field px-1.5 text-[10px] font-bold text-muted">OFF</span>}
                </span>
                <span className="text-xs font-normal text-muted">
                  {MODE[t.bookingMode]} · {SCHEDULE[t.schedule]} · {t.usage} listings
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className={cn(!id && "max-lg:hidden")}>
          <Link href="/admin/templates" className="mb-3 inline-block text-sm font-semibold text-muted lg:hidden">
            ← All templates
          </Link>
          <TemplateEditor
            key={selected?.id ?? "new"}
            id={selected?.id}
            initial={selected ?? undefined}
            usage={selected ? { total: selected.usage, live: selected.liveUsage } : { total: 0, live: 0 }}
            categories={cats.map((c) => ({ slug: c.slug, name: c.name }))}
          />
        </div>
      </div>
    </AdminPage>
  );
}
