"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { BulkScheduleInput, HostSettings } from "@/contracts";
import { useBulkSchedule, type Schedule } from "@/lib/api/host-hooks";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { addDays, todayIST } from "@/lib/time";
import { Field, METHOD_LABEL, Seg, Toggle, inputCls, timeOptions } from "./ops-ui";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Book or block a time across a date range: a league, coaching batch, maintenance window or a regular's standing slot. */
export function BulkSheet({ open, onOpenChange, schedule, settings, isOwner }: { open: boolean; onOpenChange: (o: boolean) => void; schedule: Schedule; settings: HostSettings; isOwner: boolean }) {
  const [action, setAction] = useState<"block" | "book">("block");
  const [resourceIds, setRes] = useState<string[]>(schedule.resources.map((r) => r.resource.id));
  const [from, setFrom] = useState(todayIST());
  const [to, setTo] = useState(addDays(todayIST(), 27));
  const [weekdays, setWd] = useState<number[]>([]);
  const [startMins, setStart] = useState(18 * 60);
  const [endMins, setEnd] = useState(19 * 60);
  const [skip, setSkip] = useState(true);
  const [reason, setReason] = useState("Coaching");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<Exclude<BulkScheduleInput["paymentMethod"], undefined>>(settings.hostBookings.methods[0] ?? "cash");
  const [price, setPrice] = useState("");
  const [notify, setNotify] = useState(true);
  const run = useBulkSchedule();
  const canPrice = isOwner || settings.hostBookings.priceOverride === "all";
  const times = timeOptions(0, 1440, 30);
  const ready = resourceIds.length > 0 && endMins > startMins && to >= from && (action === "block" || (name.trim().length >= 2 && (phone === "" || /^[6-9]\d{9}$/.test(phone))));

  const submit = () =>
    run.mutate(
      {
        action,
        resourceIds,
        from,
        to,
        weekdays,
        startMins,
        endMins,
        skipConflicts: skip,
        reason: action === "block" ? reason : undefined,
        customer: action === "book" ? { name: name.trim(), phone: phone || undefined } : undefined,
        paymentMethod: action === "book" ? method : undefined,
        price: action === "book" && canPrice && price !== "" ? Number(price) : undefined,
        notify,
      },
      {
        onSuccess: (r) => {
          toast.success(`${r.created} ${action === "block" ? "blocks" : "bookings"} created${r.skipped.length ? `, ${r.skipped.length} skipped (already taken)` : ""}`);
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Bulk book or block"
      description="One time across many days and courts. Up to 200 slots at a time."
      footer={
        <Button size="lg" block loading={run.isPending} disabled={!ready} onClick={submit}>
          {action === "block" ? "Block these slots" : "Book these slots"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Seg value={action} onChange={setAction} options={[["block", "Block"], ["book", "Book for a guest"]]} size="sm" />
        <Field label="Courts">
          <div className="flex flex-wrap gap-1.5">
            {schedule.resources.map((r) => {
              const on = resourceIds.includes(r.resource.id);
              return (
                <button key={r.resource.id} type="button" aria-pressed={on} onClick={() => setRes(on ? resourceIds.filter((x) => x !== r.resource.id) : [...resourceIds, r.resource.id])} className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${on ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
                  {r.resource.name}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input type="date" className={inputCls} value={from} min={todayIST()} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Field label="Days" hint="None selected = every day">
          <div className="flex gap-1.5">
            {WD.map((d, i) => {
              const on = weekdays.includes(i);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => setWd(on ? weekdays.filter((x) => x !== i) : [...weekdays, i])} className={`h-9 flex-1 rounded-lg border text-[13px] font-semibold ${on ? "border-brand bg-tint text-brand-ink" : "border-line-strong"}`}>
                  {d}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <select className={inputCls} value={startMins} onChange={(e) => setStart(Number(e.target.value))}>
              {times.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="End">
            <select className={inputCls} value={endMins} onChange={(e) => setEnd(Number(e.target.value))}>
              {times.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>
        {action === "block" ? (
          <Field label="Reason">
            <div className="flex flex-wrap gap-2">
              {["Coaching", "Maintenance", "League", "Private event", "Closed"].map((r) => (
                <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${reason === r ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
                  {r}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Guest name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Mobile (optional)">
                <input className={inputCls} inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} />
              </Field>
            </div>
            <Seg label="Payment per slot" value={method} onChange={setMethod} options={settings.hostBookings.methods.map((m) => [m, METHOD_LABEL[m]] as [typeof m, string])} size="sm" />
            {canPrice && method !== "complimentary" && (
              <Field label="Price per slot ₹" hint="Leave blank for the court's own price (peak included)">
                <input type="number" min={0} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
            )}
            <div className="rounded-xl border border-line px-4">
              <Toggle label="Send one confirmation to the guest" on={notify} set={setNotify} />
            </div>
          </>
        )}
        <div className="rounded-xl border border-line px-4">
          <Toggle label="Skip slots that are already taken" sub="Off = stop and change nothing if any slot is taken" on={skip} set={setSkip} />
        </div>
      </div>
    </Sheet>
  );
}
