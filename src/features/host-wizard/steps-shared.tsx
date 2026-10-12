"use client";

import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import type { FormField } from "@/contracts";
import { cn } from "@/lib/utils";
import { Card, Field, imageToDataUrl, inputCls } from "./fields";

export function MediaPicker({ media, onChange }: { media: string[]; onChange: (m: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Photos" sub="Up to 4. The first one is the cover. Landscape works best.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {media.map((src, i) => (
          <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-field">
            <Image src={src} alt={`Photo ${i + 1}`} fill className="object-cover" sizes="200px" unoptimized />
            {i === 0 && <span className="absolute left-2 top-2 rounded-md bg-ink/75 px-1.5 py-0.5 text-[11px] font-bold text-white">Cover</span>}
            <button type="button" onClick={() => onChange(media.filter((_, j) => j !== i))} className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-white/90" aria-label={`Remove photo ${i + 1}`}>
              <X className="size-4" />
            </button>
          </div>
        ))}
        {media.length < 4 && (
          <label className={cn("flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong text-sm font-semibold text-muted hover:border-brand hover:text-brand", busy && "opacity-50")}>
            <ImagePlus className="size-6" />
            {busy ? "Adding…" : "Add photo"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])].slice(0, 4 - media.length);
                if (!files.length) return;
                setBusy(true);
                try {
                  onChange([...media, ...(await Promise.all(files.map((f) => imageToDataUrl(f))))]);
                } catch {
                  toast.error("Couldn't read that image");
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-subtle">Prototype: photos are kept in memory on the dev server. Listings without photos get calm generated artwork.</p>
    </Card>
  );
}

export function LinesEditor({ lines, onChange, placeholder, max = 10 }: { lines: string[]; onChange: (l: string[]) => void; placeholder: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    onChange([...lines, draft.trim()]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-2">
      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl bg-field px-3 py-2.5 text-[15px]">
          <span className="size-1.5 shrink-0 rounded-full bg-brand" />
          <span className="flex-1">{l}</span>
          <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label={`Remove “${l}”`} className="grid size-7 place-items-center rounded-full hover:bg-white">
            <X className="size-4" />
          </button>
        </div>
      ))}
      {lines.length < max && (
        <div className="flex gap-2">
          <input className={inputCls} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
          <button type="button" onClick={add} className="h-12 shrink-0 rounded-xl border border-line-strong px-4 text-sm font-semibold hover:border-ink/30">
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export function QuestionsEditor({ fields, onChange }: { fields: FormField[]; onChange: (f: FormField[]) => void }) {
  const update = (i: number, p: Partial<FormField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div className="flex flex-col gap-3">
      {fields.map((f, i) => (
        <div key={f.id} className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <div className="flex gap-2">
            <input className={inputCls} value={f.label} placeholder="Question" onChange={(e) => update(i, { label: e.target.value })} aria-label="Question" />
            <select className={cn(inputCls, "w-36 shrink-0")} value={f.type} onChange={(e) => update(i, { type: e.target.value as FormField["type"], options: e.target.value === "select" ? f.options ?? ["Yes", "No"] : undefined })} aria-label="Answer type">
              <option value="text">Short text</option>
              <option value="select">Choice</option>
              <option value="number">Number</option>
              <option value="phone">Phone</option>
            </select>
            <button type="button" onClick={() => onChange(fields.filter((_, j) => j !== i))} className="grid size-12 shrink-0 place-items-center rounded-xl hover:bg-field" aria-label="Remove question">
              <Trash2 className="size-4" />
            </button>
          </div>
          {f.type === "select" && (
            <Field label="Choices" hint="Separate with commas">
              <input className={inputCls} value={(f.options ?? []).join(", ")} onChange={(e) => update(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} /> Required
          </label>
        </div>
      ))}
      {fields.length < 6 && (
        <button
          type="button"
          onClick={() => onChange([...fields, { id: `f_${Math.random().toString(36).slice(2, 7)}`, label: "", type: "text", required: false }])}
          className="inline-flex h-11 w-fit items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-4 text-sm font-semibold text-brand hover:border-brand"
        >
          <Plus className="size-4" /> Add a question
        </button>
      )}
    </div>
  );
}

export function ChipSelect({ options, value, onChange, multi }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(multi ? (on ? value.filter((x) => x !== o.id) : [...value, o.id]) : [o.id])}
            className={cn("h-10 rounded-full border px-4 text-sm font-semibold transition-colors", on ? "border-brand bg-brand text-white" : "border-line-strong bg-surface hover:border-ink/30")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
