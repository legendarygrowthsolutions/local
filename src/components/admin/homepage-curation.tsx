"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Cover } from "@/components/ui/cover";
import { useAdminAction } from "./use-admin-action";

type Row = { id: string; title: string; category: string; when: string; rank: number | null; media: string[] };

export function HomepageCuration({ featured, candidates }: { featured: Row[]; candidates: Row[] }) {
  const feature = useAdminAction<{ id: string; featured: boolean }>((v) => ({ url: `/api/admin/listings/${v.id}/feature`, body: { featured: v.featured } }), {
    success: (v) => (v.featured ? "Added to the homepage" : "Removed from the homepage"),
  });
  const move = useAdminAction<{ id: string; dir: -1 | 1 }>((v) => ({ url: `/api/admin/listings/${v.id}/move`, body: { dir: v.dir } }));
  const busy = feature.isPending || move.isPending;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <section className="rounded-2xl border border-[#e6e6e1] bg-surface p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Featured now</h2>
        {featured.length === 0 ? (
          <p className="text-sm text-muted">Nothing featured — the home page falls back to what&apos;s on this weekend.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {featured.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <span className="w-6 text-center font-display text-lg font-bold text-muted">{i + 1}</span>
                <Cover media={r.media} tone={i % 4} icon="Sparkles" alt="" sizes="56px" className="size-14 flex-none rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {i === 0 ? "Main banner" : i <= 2 ? "Side card" : "Carousel"} · {r.category} · {r.when}
                  </span>
                </span>
                <span className="flex gap-1">
                  <IconBtn label={`Move ${r.title} up`} disabled={busy || i === 0} onClick={() => move.mutate({ id: r.id, dir: -1 })}>
                    <ArrowUp className="size-4" />
                  </IconBtn>
                  <IconBtn label={`Move ${r.title} down`} disabled={busy || i === featured.length - 1} onClick={() => move.mutate({ id: r.id, dir: 1 })}>
                    <ArrowDown className="size-4" />
                  </IconBtn>
                  <IconBtn label={`Remove ${r.title} from the homepage`} disabled={busy} onClick={() => feature.mutate({ id: r.id, featured: false })}>
                    <X className="size-4" />
                  </IconBtn>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="self-start rounded-2xl border border-[#e6e6e1] bg-surface p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Live and upcoming</h2>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted">Every upcoming event is already featured.</p>
        ) : (
          <ul className="flex max-h-[560px] flex-col divide-y divide-line overflow-y-auto">
            {candidates.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {r.category} · {r.when}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy || featured.length >= 8}
                  onClick={() => feature.mutate({ id: r.id, featured: true })}
                  className="inline-flex h-9 flex-none items-center gap-1 rounded-lg border border-line-strong px-3 text-[13px] font-semibold hover:border-ink/30 disabled:opacity-40"
                >
                  <Plus className="size-3.5" aria-hidden /> Feature
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid size-9 place-items-center rounded-lg hover:bg-field disabled:opacity-30">
      {children}
    </button>
  );
}
