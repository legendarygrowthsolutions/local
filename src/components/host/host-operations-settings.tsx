"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { HostSettings } from "@/contracts";
import { useHostSettings, useUpdateHostSettings } from "@/lib/api/host-hooks";
import { Button } from "@/components/ui/button";
import { Field, Seg, Toggle, inputCls, timeOptions } from "./ops-ui";


type Section = keyof HostSettings;

/**
 * Operations settings (owner only). Each card saves on its own; the server fills defaults so a
 * partial patch is safe. Mirrors what KheloMore-style venue software exposes: who gets alerts,
 * what the team may record, how guests may move bookings, and the extras on sale.
 */
export function HostOperationsSettings({ initial, templateReschedule }: { initial: HostSettings; templateReschedule: { allowed: boolean; hoursBefore: number; maxTimes: number } | null }) {
  const { data: s = initial } = useHostSettings(initial);
  const update = useUpdateHostSettings();
  const save = <K extends Section>(key: K, value: HostSettings[K], done?: string) =>
    update.mutate({ [key]: value } as Partial<HostSettings>, { onSuccess: () => toast.success(done ?? "Saved"), onError: (e) => toast.error(e.message) });

  return (
    <div className="flex flex-col gap-6">
      <AlertsCard s={s.alerts} g={s.guestMessages} onSave={(a, g) => update.mutate({ alerts: a, guestMessages: g }, { onSuccess: () => toast.success("Messaging saved"), onError: (e) => toast.error(e.message) })} saving={update.isPending} />
      <HostBookingsCard s={s.hostBookings} c={s.cancellation} onSave={(hb, c) => update.mutate({ hostBookings: hb, cancellation: c }, { onSuccess: () => toast.success("Console permissions saved"), onError: (e) => toast.error(e.message) })} saving={update.isPending} />
      <RescheduleCard s={s.reschedule} tpl={templateReschedule} onSave={(v) => save("reschedule", v, "Rescheduling saved")} saving={update.isPending} />
      <ExtrasCard s={s.extras} onSave={(v) => save("extras", v, "Extras saved")} saving={update.isPending} />
    </div>
  );
}

const card = "flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-4 md:p-5";
const quietTimes = timeOptions(0, 1410, 30);

function AlertsCard({ s, g, onSave, saving }: { s: HostSettings["alerts"]; g: HostSettings["guestMessages"]; onSave: (a: HostSettings["alerts"], g: HostSettings["guestMessages"]) => void; saving: boolean }) {
  const [a, setA] = useState(s);
  const [gm, setG] = useState(g);
  const [phone, setPhone] = useState("");
  const quiet = a.quietFromMins !== null && a.quietToMins !== null;
  return (
    <section className={card}>
      <div>
        <h2 className="font-display text-lg font-bold">Booking alerts and guest messages</h2>
        <p className="text-sm text-muted">Instant WhatsApp or SMS to your team when something changes, and confirmations to guests.</p>
      </div>
      <div className="rounded-xl border border-line px-4">
        <Toggle label="Alert my team" sub="New bookings, cancellations and moves made by guests" on={a.enabled} set={(v) => setA({ ...a, enabled: v })} />
        <Toggle label="New bookings" on={a.newBooking} set={(v) => setA({ ...a, newBooking: v })} disabled={!a.enabled} />
        <Toggle label="Cancellations" on={a.cancellation} set={(v) => setA({ ...a, cancellation: v })} disabled={!a.enabled} />
        <Toggle label="Reschedules" on={a.reschedule} set={(v) => setA({ ...a, reschedule: v })} disabled={!a.enabled} />
        <Toggle label="Also for bookings my team records" sub="Walk-ins and bulk bookings from the console" on={a.hostBookings} set={(v) => setA({ ...a, hostBookings: v })} disabled={!a.enabled} />
        <Toggle label="Send to managers too" sub="Each manager gets alerts for the venues and events they can access" on={a.toManagers} set={(v) => setA({ ...a, toManagers: v })} disabled={!a.enabled} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Seg label="Channel" value={a.channel} onChange={(v) => setA({ ...a, channel: v })} options={[["whatsapp", "WhatsApp"], ["sms", "SMS"]]} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Quiet hours</span>
          <div className="flex items-center gap-2">
            <button type="button" role="switch" aria-checked={quiet} onClick={() => setA({ ...a, quietFromMins: quiet ? null : 23 * 60, quietToMins: quiet ? null : 7 * 60 })} className={`h-10 rounded-full border px-4 text-sm font-semibold ${quiet ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
              {quiet ? "On" : "Off"}
            </button>
            {quiet && (
              <>
                <select aria-label="Quiet from" className="h-10 rounded-xl border border-line-strong bg-surface px-2 text-sm" value={a.quietFromMins ?? 0} onChange={(e) => setA({ ...a, quietFromMins: Number(e.target.value) })}>
                  {quietTimes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <span className="text-sm text-muted">to</span>
                <select aria-label="Quiet until" className="h-10 rounded-xl border border-line-strong bg-surface px-2 text-sm" value={a.quietToMins ?? 0} onChange={(e) => setA({ ...a, quietToMins: Number(e.target.value) })}>
                  {quietTimes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </>
            )}
          </div>
          <span className="text-xs text-muted">Team alerts pause in quiet hours. Guests still get their confirmations.</span>
        </div>
      </div>
      <Field label="Extra numbers" hint="Front desk, coach or anyone else who should hear about bookings (up to 5).">
        <div className="flex flex-wrap gap-2">
          {a.extraPhones.map((p) => (
            <span key={p} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-field pl-3 pr-1.5 text-sm font-semibold">
              +91 {p}
              <button type="button" aria-label={`Remove ${p}`} onClick={() => setA({ ...a, extraPhones: a.extraPhones.filter((x) => x !== p) })} className="grid size-6 place-items-center rounded-full hover:bg-line">
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
          {a.extraPhones.length < 5 && (
            <span className="flex items-center gap-2">
              <input inputMode="numeric" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} className={`${inputCls} h-9 w-44 text-sm`} />
              <Button type="button" size="sm" variant="secondary" disabled={!/^[6-9]\d{9}$/.test(phone) || a.extraPhones.includes(phone)} onClick={() => (setA({ ...a, extraPhones: [...a.extraPhones, phone] }), setPhone(""))}>
                <Plus className="size-4" /> Add
              </Button>
            </span>
          )}
        </div>
      </Field>
      <div className="rounded-xl border border-line px-4">
        <Toggle label="Message guests" sub="Confirmations, changes and cancellations by WhatsApp or SMS (their choice). Only switch off if you tell them yourself." on={gm.enabled} set={(v) => setG({ ...gm, enabled: v })} />
        <Toggle label="Also for bookings my team records" sub="When a phone number is entered" on={gm.forHostBookings} set={(v) => setG({ ...gm, forHostBookings: v })} disabled={!gm.enabled} />
      </div>
      <Button className="w-fit" loading={saving} onClick={() => onSave(a, gm)}>
        Save messaging
      </Button>
    </section>
  );
}

function HostBookingsCard({ s, c, onSave, saving }: { s: HostSettings["hostBookings"]; c: HostSettings["cancellation"]; onSave: (hb: HostSettings["hostBookings"], c: HostSettings["cancellation"]) => void; saving: boolean }) {
  const [v, setV] = useState(s);
  const [cx, setC] = useState(c);
  const toggleMethod = (m: (typeof v.methods)[number]) => setV({ ...v, methods: v.methods.includes(m) ? v.methods.filter((x) => x !== m) : [...v.methods, m] });
  return (
    <section className={card}>
      <div>
        <h2 className="font-display text-lg font-bold">Bookings from the console</h2>
        <p className="text-sm text-muted">Walk-ins, phone bookings, bulk bookings and changes to bookings in progress. Money recorded here stays with you and isn&apos;t part of payouts.</p>
      </div>
      <div className="rounded-xl border border-line px-4">
        <Toggle label="Allow recording bookings" sub="From the court calendar and the bookings list" on={v.enabled} set={(x) => setV({ ...v, enabled: x })} />
      </div>
      <Field label="Payment methods the team can record">
        <div className="flex flex-wrap gap-2">
          {(["cash", "upi", "card", "pay_later", "complimentary"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={v.methods.includes(m)} onClick={() => toggleMethod(m)} className={`h-10 rounded-full border px-4 text-sm font-semibold ${v.methods.includes(m) ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
              {{ cash: "Cash", upi: "UPI", card: "Card", pay_later: "Pay later", complimentary: "Complimentary" }[m]}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Seg label="Who can record and change bookings" value={v.editBy} onChange={(x) => setV({ ...v, editBy: x })} options={[["all", "Owner and managers"], ["owner", "Owner only"]]} />
        <Seg label="Who can change prices" value={v.priceOverride} onChange={(x) => setV({ ...v, priceOverride: x })} options={[["owner", "Owner only"], ["all", "Owner and managers"]]} />
        <Field label="Days ahead the team can book" hint="Guests see the public window set on each venue; the team can go further for leagues and regulars.">
          <input type="number" min={1} max={365} className={inputCls} value={v.advanceDays} onChange={(e) => setV({ ...v, advanceDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />
        </Field>
        <Seg label="Refund when the team cancels an online booking" value={String(cx.hostCancelRefundPct) as "0" | "50" | "100"} onChange={(x) => setC({ hostCancelRefundPct: Number(x) as 0 | 50 | 100 })} options={[["100", "Full"], ["50", "Half"], ["0", "None"]]} />
      </div>
      <Button className="w-fit" loading={saving} disabled={!v.methods.length} onClick={() => onSave(v, cx)}>
        Save console permissions
      </Button>
    </section>
  );
}

function RescheduleCard({ s, tpl, onSave, saving }: { s: HostSettings["reschedule"]; tpl: { allowed: boolean; hoursBefore: number; maxTimes: number } | null; onSave: (v: HostSettings["reschedule"]) => void; saving: boolean }) {
  const [v, setV] = useState(s);
  const inherit = tpl ? (tpl.allowed ? `Allowed until ${tpl.hoursBefore} h before, up to ${tpl.maxTimes} ${tpl.maxTimes === 1 ? "time" : "times"}` : "Not allowed") : "Depends on the booking type";
  return (
    <section className={card}>
      <div>
        <h2 className="font-display text-lg font-bold">Guests moving their booking</h2>
        <p className="text-sm text-muted">Let guests pick another slot or date themselves instead of cancelling. A move never costs them more; a cheaper slot isn&apos;t refunded. Your team can always move bookings from the console.</p>
      </div>
      <Seg value={v.mode} onChange={(m) => setV({ ...v, mode: m })} options={[["inherit", `Platform default (${inherit})`], ["custom", "My own limits"], ["off", "Not allowed"]]} />
      {v.mode === "custom" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Moves close (hours before start)">
            <input type="number" min={0} max={336} className={inputCls} value={v.hoursBefore} onChange={(e) => setV({ ...v, hoursBefore: Math.max(0, Math.min(336, Number(e.target.value) || 0)) })} />
          </Field>
          <Field label="Moves per booking">
            <input type="number" min={1} max={10} className={inputCls} value={v.maxTimes} onChange={(e) => setV({ ...v, maxTimes: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />
          </Field>
        </div>
      )}
      <Button className="w-fit" loading={saving} onClick={() => onSave(v)}>
        Save rescheduling
      </Button>
    </section>
  );
}

function ExtrasCard({ s, onSave, saving }: { s: HostSettings["extras"]; onSave: (v: HostSettings["extras"]) => void; saving: boolean }) {
  const [list, setList] = useState(s);
  const [draft, setDraft] = useState({ name: "", price: "", per: "booking" as "booking" | "hour" });
  const add = () => {
    if (!draft.name.trim() || draft.price === "") return;
    setList([...list, { id: `x_${Date.now().toString(36)}`, name: draft.name.trim(), price: Number(draft.price), per: draft.per, active: true }]);
    setDraft({ name: "", price: "", per: "booking" });
  };
  return (
    <section className={card}>
      <div>
        <h2 className="font-display text-lg font-bold">Extras</h2>
        <p className="text-sm text-muted">Things your team can add to a booking: racket rental, lights, a coach, shuttles. Priced once per booking or per hour of court time.</p>
      </div>
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {list.map((x, i) => (
            <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <b>{x.name}</b> <span className="text-muted">· ₹{x.price} {x.per === "hour" ? "/ hour" : "/ booking"}</span>
              </span>
              <button type="button" onClick={() => setList(list.map((y, j) => (j === i ? { ...y, active: !y.active } : y)))} className={`rounded-full px-2.5 py-1 text-xs font-bold ${x.active ? "bg-free-tint text-free" : "bg-field text-muted"}`}>
                {x.active ? "On sale" : "Hidden"}
              </button>
              <button type="button" aria-label={`Remove ${x.name}`} onClick={() => setList(list.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-full hover:bg-field">
                <Trash2 className="size-4 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px_auto] sm:items-end">
        <Field label="Name">
          <input className={inputCls} placeholder="Racket rental" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Price ₹">
          <input type="number" min={0} className={inputCls} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
        </Field>
        <Field label="Charged">
          <select className={inputCls} value={draft.per} onChange={(e) => setDraft({ ...draft, per: e.target.value as "booking" | "hour" })}>
            <option value="booking">per booking</option>
            <option value="hour">per hour</option>
          </select>
        </Field>
        <Button type="button" variant="secondary" onClick={add} disabled={!draft.name.trim() || draft.price === "" || list.length >= 30}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      <Button className="w-fit" loading={saving} onClick={() => onSave(list)}>
        Save extras
      </Button>
    </section>
  );
}


