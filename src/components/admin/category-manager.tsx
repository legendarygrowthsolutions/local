"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Category } from "@/contracts";
import { CategoryIcon, ICON_NAMES } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAdminAction } from "./use-admin-action";

type Node = Category & { usage: number; children: (Category & { usage: number })[] };
type Draft = { id?: string; name: string; singular: string; slug: string; parentId: string | null; icon: string; blurb: string };

const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const input = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-brand";

export function CategoryManager({ tree }: { tree: Node[] }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const save = useAdminAction<Draft>((d) => ({ url: d.id ? `/api/admin/categories/${d.id}` : "/api/admin/categories", method: d.id ? "PUT" : "POST", body: { name: d.name, singular: d.singular || undefined, slug: d.slug, parentId: d.parentId, icon: d.icon, blurb: d.blurb || undefined } }), { success: "Category saved" });
  const del = useAdminAction<string>((id) => ({ url: `/api/admin/categories/${id}`, method: "DELETE" }), { success: "Category deleted" });

  const open = (d: Draft, existing = false) => {
    setSlugTouched(existing);
    setDraft(d);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => open({ name: "", singular: "", slug: "", parentId: null, icon: "Sparkles", blurb: "" })}>
          <Plus className="size-4" /> Top-level category
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tree.map((c) => (
          <section key={c.id} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-tint text-brand">
                <CategoryIcon name={c.icon} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted">
                  /{c.slug} · {c.usage} listings
                </p>
              </div>
              <button type="button" onClick={() => open({ id: c.id, name: c.name, singular: c.singular, slug: c.slug, parentId: null, icon: c.icon, blurb: c.blurb ?? "" }, true)} className="grid size-8 place-items-center rounded-lg hover:bg-field" aria-label={`Edit ${c.name}`}>
                <Pencil className="size-4" />
              </button>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {c.children.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => open({ id: s.id, name: s.name, singular: s.singular, slug: s.slug, parentId: c.id, icon: s.icon, blurb: "" }, true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-xs font-semibold hover:border-brand">
                    <CategoryIcon name={s.icon} className="size-3.5 text-brand" /> {s.name} <span className="text-subtle">{s.usage}</span>
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => open({ name: "", singular: "", slug: "", parentId: c.id, icon: c.icon, blurb: "" })} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-xs font-semibold text-brand hover:border-brand">
                  <Plus className="size-3" /> Add
                </button>
              </li>
            </ul>
          </section>
        ))}
      </div>
      <Sheet
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? `Edit ${draft.name}` : draft?.parentId ? "New sub-category" : "New category"}
        description={draft?.parentId ? `Under ${tree.find((c) => c.id === draft.parentId)?.name}` : undefined}
        footer={
          draft && (
            <div className="flex gap-2">
              {draft.id && (
                <Button
                  variant="danger"
                  size="lg"
                  loading={del.isPending}
                  onClick={() => del.mutate(draft.id!, { onSuccess: () => setDraft(null) })}
                  aria-label="Delete category"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
              <Button size="lg" block loading={save.isPending} disabled={!draft.name.trim() || !draft.slug} onClick={() => save.mutate(draft, { onSuccess: () => setDraft(null) })}>
                Save
              </Button>
            </div>
          )
        }
      >
        {draft && (
          <div className="flex flex-col gap-4 pb-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Name</span>
              <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: slugTouched ? draft.slug : slugify(e.target.value) })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">URL slug</span>
                <input className={input} value={draft.slug} onChange={(e) => (setSlugTouched(true), setDraft({ ...draft, slug: slugify(e.target.value) }))} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Singular label</span>
                <input className={input} value={draft.singular} placeholder={draft.name} onChange={(e) => setDraft({ ...draft, singular: e.target.value })} />
              </label>
            </div>
            {!draft.parentId && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Blurb</span>
                <input className={input} value={draft.blurb} onChange={(e) => setDraft({ ...draft, blurb: e.target.value })} placeholder="Shown under the category heading" />
              </label>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Icon</span>
              <div className="grid grid-cols-8 gap-1.5">
                {ICON_NAMES.map((n) => (
                  <button key={n} type="button" onClick={() => setDraft({ ...draft, icon: n })} className={cn("grid aspect-square place-items-center rounded-lg border", draft.icon === n ? "border-brand bg-tint text-brand" : "border-line hover:border-line-strong")} aria-label={n} aria-pressed={draft.icon === n}>
                    <CategoryIcon name={n} className="size-4" />
                  </button>
                ))}
              </div>
            </div>
            {draft.id && <p className="text-xs text-muted">Changing a slug changes its URL. Categories in use can&apos;t be deleted.</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
