"use client";

import { useState } from "react";
import { Plus, TicketPercent, Trash2 } from "lucide-react";
import type { AdminCouponRow } from "@/services/coupons";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatINR } from "@/lib/pricing";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAdminAction } from "./use-admin-action";

type Draft = {
  id?: string;
  used: boolean;
  code: string;
  description: string;
  type: "pct" | "flat";
  value: string;
  maxDiscount: string;
  minSubtotal: string;
  perUserLimit: string;
  totalLimit: string;
  firstBookingOnly: boolean;
  cityId: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
};

const input = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-brand";
const STATE: Record<AdminCouponRow["state"], { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-free-tint text-free" },
  scheduled: { label: "Scheduled", cls: "bg-tint text-brand-ink" },
  expired: { label: "Expired", cls: "bg-field text-muted" },
  paused: { label: "Paused", cls: "bg-field text-muted" },
  used_up: { label: "Fully used", cls: "bg-warn-tint text-warn" },
};

const blank: Draft = { used: false, code: "", description: "", type: "pct", value: "", maxDiscount: "", minSubtotal: "", perUserLimit: "1", totalLimit: "", firstBookingOnly: false, cityId: "", validFrom: "", validUntil: "", active: true };
const optInt = (s: string) => (s.trim() === "" ? null : Math.floor(Number(s)));

function discountLabel(c: Pick<AdminCouponRow, "type" | "value" | "maxDiscount">) {
  return c.type === "pct" ? `${c.value}% off, up to ${formatINR(c.maxDiscount)}` : `${formatINR(c.value)} off`;
}

function rules(c: AdminCouponRow) {
  return [
    c.minSubtotal ? `Orders from ${formatINR(c.minSubtotal)}` : null,
    c.firstBookingOnly ? "First booking only" : null,
    c.perUserLimit ? `${c.perUserLimit} per person` : "No limit per person",
    c.totalLimit ? `${c.totalLimit} in total` : null,
    c.cityName ?? "All cities",
  ].filter(Boolean) as string[];
}

export function CouponManager({ coupons, cities }: { coupons: AdminCouponRow[]; cities: { id: string; name: string }[] }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useAdminAction<Draft>(
    (d) => ({
      url: d.id ? `/api/admin/coupons/${d.id}` : "/api/admin/coupons",
      method: d.id ? "PUT" : "POST",
      body: {
        code: d.code,
        description: d.description,
        type: d.type,
        value: Number(d.value),
        maxDiscount: d.type === "pct" ? Number(d.maxDiscount || 0) : Number(d.value),
        minSubtotal: Number(d.minSubtotal || 0),
        perUserLimit: optInt(d.perUserLimit),
        totalLimit: optInt(d.totalLimit),
        firstBookingOnly: d.firstBookingOnly,
        cityId: d.cityId || null,
        validFrom: d.validFrom || null,
        validUntil: d.validUntil || null,
        active: d.active,
      },
    }),
    { success: (d) => `${d.code.toUpperCase()} saved` },
  );
  const toggle = useAdminAction<AdminCouponRow>(
    (c) => ({
      url: `/api/admin/coupons/${c.id}`,
      method: "PUT",
      body: {
        code: c.code, description: c.description, type: c.type, value: c.value, maxDiscount: c.maxDiscount, minSubtotal: c.minSubtotal, perUserLimit: c.perUserLimit,
        totalLimit: c.totalLimit, firstBookingOnly: c.firstBookingOnly, cityId: c.cityId, validFrom: c.validFrom, validUntil: c.validUntil, active: !c.active,
      },
    }),
    { success: (c) => (c.active ? `${c.code} paused` : `${c.code} switched on`) },
  );
  const remove = useAdminAction<AdminCouponRow>((c) => ({ url: `/api/admin/coupons/${c.id}`, method: "DELETE" }), { success: (c) => `${c.code} deleted` });

  const edit = (c: AdminCouponRow) =>
    setDraft({
      id: c.id,
      used: c.uses > 0,
      code: c.code,
      description: c.description,
      type: c.type,
      value: String(c.value),
      maxDiscount: c.type === "pct" ? String(c.maxDiscount) : "",
      minSubtotal: c.minSubtotal ? String(c.minSubtotal) : "",
      perUserLimit: c.perUserLimit ? String(c.perUserLimit) : "",
      totalLimit: c.totalLimit ? String(c.totalLimit) : "",
      firstBookingOnly: c.firstBookingOnly,
      cityId: c.cityId ?? "",
      validFrom: c.validFrom ?? "",
      validUntil: c.validUntil ?? "",
      active: c.active,
    });

  const valid =
    !!draft &&
    /^[A-Za-z0-9]{4,20}$/.test(draft.code) &&
    draft.description.trim().length >= 4 &&
    Number(draft.value) > 0 &&
    (draft.type === "flat" || (Number(draft.value) <= 100 && Number(draft.maxDiscount) > 0)) &&
    (!draft.validFrom || !draft.validUntil || draft.validUntil >= draft.validFrom);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ ...blank })}>
          <Plus className="size-4" /> New coupon
        </Button>
      </div>
      {coupons.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <TicketPercent className="size-8 text-brand" />
          <p className="font-semibold">No coupons yet</p>
          <p className="max-w-sm text-sm text-muted">Create a code for a launch offer, a partner or a first booking. You can limit it by city, dates and how often it can be used.</p>
        </div>
      ) : (
        <section className="overflow-x-auto rounded-2xl border border-[#e6e6e1] bg-surface">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {["Code", "Discount", "Rules", "Runs", "Used", ""].map((h, i) => (
                  <th key={i} className="border-b border-[#e6e6e1] px-4 py-2.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-bold">{c.code}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", STATE[c.state].cls)}>{STATE[c.state].label}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{c.description}</span>
                  </td>
                  <td className="px-4 py-3">{discountLabel(c)}</td>
                  <td className="px-4 py-3 text-xs leading-5 text-muted">
                    {rules(c).map((r) => (
                      <span key={r} className="block">
                        {r}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {c.validFrom ? formatDate(c.validFrom, true) : "Now"} to {c.validUntil ? formatDate(c.validUntil, true) : "no end date"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {c.uses}
                    {c.totalLimit ? ` / ${c.totalLimit}` : ""}
                    <span className="block text-xs text-muted">{formatINR(c.discountGiven)} given</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => edit(c)}>
                      Edit
                    </Button>
                    <Button size="sm" variant={c.active ? "ghost" : "soft"} className="ml-1" loading={toggle.isPending && toggle.variables?.id === c.id} onClick={() => toggle.mutate(c)}>
                      {c.active ? "Pause" : "Switch on"}
                    </Button>
                    {c.uses === 0 && (
                      <button
                        type="button"
                        onClick={() => remove.mutate(c)}
                        className="ml-1 inline-grid size-9 place-items-center rounded-lg align-middle text-muted hover:bg-danger-tint hover:text-danger"
                        aria-label={`Delete ${c.code}`}
                        title="Delete (only unused coupons)"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="text-xs text-subtle">Coupon discounts come out of the platform&apos;s share: hosts are always paid the full ticket value. A used coupon can&apos;t be deleted or renamed, so past bookings stay explainable. Pause it instead.</p>

      <Sheet
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? `Edit ${draft.code}` : "New coupon"}
        description="Checked when it's applied and again at payment."
        footer={
          draft && (
            <Button size="lg" block loading={save.isPending} disabled={!valid} onClick={() => save.mutate(draft, { onSuccess: () => setDraft(null) })}>
              Save coupon
            </Button>
          )
        }
      >
        {draft && (
          <div className="flex flex-col gap-4 pb-2">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Code</span>
                <input
                  className={cn(input, "font-mono uppercase")}
                  value={draft.code}
                  disabled={draft.used}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })}
                  placeholder="e.g. DIWALI25"
                />
                {draft.used && <span className="text-xs text-muted">Already used, so the code is fixed</span>}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">City</span>
                <select className={input} value={draft.cityId} onChange={(e) => setDraft({ ...draft, cityId: e.target.value })}>
                  <option value="">All cities</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Description</span>
              <input className={input} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Shown to the guest, e.g. 10% off, up to ₹200" />
            </label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-field p-1" role="radiogroup" aria-label="Discount type">
              {(["pct", "flat"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={draft.type === t}
                  onClick={() => setDraft({ ...draft, type: t })}
                  className={cn("h-10 rounded-lg text-sm font-semibold", draft.type === t ? "bg-surface shadow-[0_1px_2px_rgba(20,18,31,.08)]" : "text-muted")}
                >
                  {t === "pct" ? "Percentage" : "Fixed amount"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">{draft.type === "pct" ? "Percent off" : "Amount off (₹)"}</span>
                <input className={input} inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder={draft.type === "pct" ? "10" : "100"} />
              </label>
              {draft.type === "pct" ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">Most it can take off (₹)</span>
                  <input className={input} inputMode="decimal" value={draft.maxDiscount} onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })} placeholder="200" />
                </label>
              ) : (
                <span />
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Min. order (₹)</span>
                <input className={input} inputMode="decimal" value={draft.minSubtotal} onChange={(e) => setDraft({ ...draft, minSubtotal: e.target.value })} placeholder="None" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Uses per person</span>
                <input className={input} inputMode="numeric" value={draft.perUserLimit} onChange={(e) => setDraft({ ...draft, perUserLimit: e.target.value.replace(/\D/g, "") })} placeholder="No limit" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Total uses</span>
                <input className={input} inputMode="numeric" value={draft.totalLimit} onChange={(e) => setDraft({ ...draft, totalLimit: e.target.value.replace(/\D/g, "") })} placeholder="No limit" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Starts</span>
                <input className={input} type="date" value={draft.validFrom} onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Ends</span>
                <input className={input} type="date" min={draft.validFrom || undefined} value={draft.validUntil} onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })} />
              </label>
            </div>
            <p className="-mt-2 text-xs text-muted">Leave the dates empty to start now and never expire. Dates are in IST and include the whole day.</p>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={draft.firstBookingOnly} onChange={(e) => setDraft({ ...draft, firstBookingOnly: e.target.checked })} /> Only for a person&apos;s first booking
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Switched on
            </label>
          </div>
        )}
      </Sheet>
    </div>
  );
}
