"use client";

import { useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import type { Area, City } from "@/contracts";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAdminAction } from "./use-admin-action";

type Row = City & { listings: number; hosts: number; areas: (Area & { usage: number })[] };
type CityDraft = { id?: string; name: string; slug: string; state: string; lat: string; lng: string; tagline: string; active: boolean };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const input = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-brand";

export function CityManager({ cities }: { cities: Row[] }) {
  const [draft, setDraft] = useState<CityDraft | null>(null);
  const [areaDraft, setAreaDraft] = useState<Record<string, { name: string; lat: string; lng: string }>>({});
  const saveCity = useAdminAction<CityDraft>((d) => ({ url: d.id ? `/api/admin/cities/${d.id}` : "/api/admin/cities", method: d.id ? "PUT" : "POST", body: { name: d.name, slug: d.slug, state: d.state, lat: Number(d.lat), lng: Number(d.lng), tagline: d.tagline, active: d.active } }), { success: "City saved" });
  const toggle = useAdminAction<Row>((c) => ({ url: `/api/admin/cities/${c.id}`, method: "PUT", body: { name: c.name, slug: c.slug, state: c.state, lat: c.lat, lng: c.lng, tagline: c.tagline, active: !c.active } }), { success: (c) => (c.active ? `${c.name} hidden from users` : `${c.name} is live`) });
  const addArea = useAdminAction<{ cityId: string; name: string; lat: number; lng: number }>((a) => ({ url: "/api/admin/areas", body: a }), { success: "Area added" });
  const delArea = useAdminAction<string>((id) => ({ url: `/api/admin/areas/${id}`, method: "DELETE" }), { success: "Area removed" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ name: "", slug: "", state: "", lat: "", lng: "", tagline: "", active: false })}>
          <Plus className="size-4" /> Add city
        </Button>
      </div>
      {cities.map((c) => {
        const ad = areaDraft[c.id] ?? { name: "", lat: String(c.lat), lng: String(c.lng) };
        return (
          <section key={c.id} className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-field font-display text-lg font-bold">{c.name[0]}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  {c.name}
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", c.active ? "bg-free-tint text-free" : "bg-field text-muted")}>{c.active ? "Live" : "Hidden"}</span>
                </p>
                <p className="text-xs text-muted">
                  /{c.slug} · {c.state} · {c.lat.toFixed(3)}, {c.lng.toFixed(3)} · {c.listings} live listings · {c.hosts} hosts
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setDraft({ id: c.id, name: c.name, slug: c.slug, state: c.state, lat: String(c.lat), lng: String(c.lng), tagline: c.tagline, active: c.active })}>
                Edit
              </Button>
              <Button size="sm" variant={c.active ? "ghost" : "soft"} loading={toggle.isPending && toggle.variables?.id === c.id} onClick={() => toggle.mutate(c)}>
                {c.active ? "Hide" : "Go live"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.areas.map((a) => (
                <span key={a.id} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong pl-3 pr-1 text-xs font-semibold">
                  <MapPin className="size-3 text-brand" /> {a.name} <span className="text-subtle">{a.usage}</span>
                  <button type="button" disabled={a.usage > 0} onClick={() => delArea.mutate(a.id)} className="grid size-6 place-items-center rounded-full hover:bg-danger-tint hover:text-danger disabled:opacity-30" aria-label={`Remove ${a.name}`} title={a.usage ? "In use" : "Remove"}>
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_120px_120px_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!ad.name.trim()) return;
                addArea.mutate({ cityId: c.id, name: ad.name.trim(), lat: Number(ad.lat), lng: Number(ad.lng) }, { onSuccess: () => setAreaDraft({ ...areaDraft, [c.id]: { name: "", lat: String(c.lat), lng: String(c.lng) } }) });
              }}
            >
              <input className={cn(input, "col-span-2 h-10 sm:col-span-1")} placeholder="New area, e.g. Chembur" value={ad.name} onChange={(e) => setAreaDraft({ ...areaDraft, [c.id]: { ...ad, name: e.target.value } })} aria-label={`New area in ${c.name}`} />
              <input className={cn(input, "h-10")} inputMode="decimal" value={ad.lat} onChange={(e) => setAreaDraft({ ...areaDraft, [c.id]: { ...ad, lat: e.target.value } })} aria-label="Latitude" />
              <input className={cn(input, "h-10")} inputMode="decimal" value={ad.lng} onChange={(e) => setAreaDraft({ ...areaDraft, [c.id]: { ...ad, lng: e.target.value } })} aria-label="Longitude" />
              <Button type="submit" variant="secondary" className="col-span-2 h-10 sm:col-span-1" loading={addArea.isPending && addArea.variables?.cityId === c.id}>
                Add area
              </Button>
            </form>
          </section>
        );
      })}
      <Sheet
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? `Edit ${draft.name}` : "Add a city"}
        description={draft?.id ? undefined : "Start hidden, add areas, then go live."}
        footer={
          draft && (
            <Button size="lg" block loading={saveCity.isPending} disabled={!draft.name || !draft.slug || !draft.state || !draft.lat || !draft.lng} onClick={() => saveCity.mutate(draft, { onSuccess: () => setDraft(null) })}>
              Save city
            </Button>
          )
        }
      >
        {draft && (
          <div className="flex flex-col gap-4 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Name</span>
                <input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.id ? draft.slug : slugify(e.target.value) })} placeholder="e.g. Bengaluru" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">URL slug</span>
                <input className={input} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">State</span>
              <input className={input} value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} placeholder="e.g. Karnataka" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Latitude</span>
                <input className={input} inputMode="decimal" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} placeholder="12.9716" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Longitude</span>
                <input className={input} inputMode="decimal" value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: e.target.value })} placeholder="77.5946" />
              </label>
            </div>
            <p className="-mt-2 text-xs text-muted">The city centre: used to pick the nearest city from a user&apos;s location.</p>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Tagline</span>
              <input className={input} value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} placeholder="Shown in the city picker" />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Live for users
            </label>
          </div>
        )}
      </Sheet>
    </div>
  );
}
