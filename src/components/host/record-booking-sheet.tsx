"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { HostBookingInput, HostSettings } from "@/contracts";
import { useCreateHostBooking, useHostListingInventory, useHostListings, useSchedule } from "@/lib/api/host-hooks";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/pricing";
import { addDays, formatDate, formatMins, formatWhen, todayIST } from "@/lib/time";
import { Field, METHOD_LABEL, Seg, Toggle, inputCls } from "./ops-ui";

export interface RecordPreset {
  venueId?: string;
  resourceId?: string;
  date?: string;
  startMins?: number;
}

/**
 * Record a booking the team took at the desk or on the phone. Courts: pick venue, court, date and
 * a start slot, then how many slots. Events: pick the listing, date and tickets. The server prices
 * it; the owner (or managers, if allowed) can type a different price.
 */
export function RecordBookingSheet(props: { open: boolean; onOpenChange: (o: boolean) => void; preset?: RecordPreset | null; settings: HostSettings; isOwner: boolean }) {
  // Remount the form each time it opens so it starts from the preset (the tapped slot) with no stale state.
  return <RecordForm key={`${props.open}:${JSON.stringify(props.preset ?? null)}`} {...props} />;
}

function RecordForm({ open, onOpenChange, preset, settings, isOwner }: { open: boolean; onOpenChange: (o: boolean) => void; preset?: RecordPreset | null; settings: HostSettings; isOwner: boolean }) {
  const [kind, setKind] = useState<"venue" | "listing">("venue");
  const [venue, setVenue] = useState<string | undefined>(preset?.venueId);
  const [date, setDate] = useState<string>(preset?.date ?? todayIST());
  const [resourceId, setResourceId] = useState<string | undefined>(preset?.resourceId);
  const [startMins, setStartMins] = useState<number | undefined>(preset?.startMins);
  const [slots, setSlots] = useState(1);
  const [listingId, setListingId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [tickets, setTickets] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<HostBookingInput["paymentMethod"]>(settings.hostBookings.methods[0] ?? "cash");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const create = useCreateHostBooking();
  const canPrice = isOwner || settings.hostBookings.priceOverride === "all";

  const { data: sched } = useSchedule(venue, date);
  const { data: listings } = useHostListings();
  const events = (listings ?? []).filter((l) => l.kind === "event" && l.status === "live");
  const venues = sched?.venues ?? [];
  const { data: inv } = useHostListingInventory(kind === "listing" && listingId ? listingId : null);
  const res = sched?.resources.find((r) => r.resource.id === resourceId) ?? sched?.resources[0];
  const starts = useMemo(() => (res ? res.slots.filter((s) => !s.isPast && !s.block && s.status === "available") : []), [res]);
  const slotLen = res?.resource.slotLengthMins ?? 60;
  const chosen = res && startMins !== undefined ? res.slots.filter((s) => s.startMins >= startMins && s.startMins < startMins + slots * slotLen) : [];
  const chosenOk = chosen.length === slots && chosen.every((s) => s.status === "available" && !s.block && !s.booking);
  const computed = kind === "venue" ? (chosen.every((s) => s.price !== null) ? chosen.reduce((a, s) => a + (s.price ?? 0), 0) : null) : inv ? Object.entries(tickets).reduce((a, [id, q]) => a + q * (inv.tickets.find((t) => t.id === id)?.price ?? 0), 0) : null;
  const dates = Array.from({ length: Math.min(settings.hostBookings.advanceDays, 60) }, (_, i) => addDays(todayIST(), i));
  const endMins = startMins !== undefined ? startMins + slots * slotLen : undefined;

  const submit = () => {
    const customer = { name: name.trim(), phone: phone || undefined };
    const items: HostBookingInput["items"] =
      kind === "venue"
        ? { kind: "venue", resourceId: res!.resource.id, date, startMins: startMins!, endMins: endMins! }
        : { kind: "listing", listingId, sessionId: sessionId || null, tickets: Object.entries(tickets).filter(([, q]) => q > 0).map(([ticketTypeId, qty]) => ({ ticketTypeId, qty })) };
    create.mutate(
      { items, customer, paymentMethod: method, price: canPrice && price !== "" ? Number(price) : undefined, notes: notes || undefined, notify },
      {
        onSuccess: (r) => {
          toast.success(`Booked · ${r.booking.code}`);
          onOpenChange(false);
          setName("");
          setPhone("");
          setPrice("");
          setNotes("");
          setTickets({});
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };
  const ready = name.trim().length >= 2 && (phone === "" || /^[6-9]\d{9}$/.test(phone)) && (kind === "venue" ? !!res && startMins !== undefined && chosenOk : !!listingId && Object.values(tickets).some((q) => q > 0));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Record a booking"
      description="A walk-in, a phone booking or a regular. The guest gets a confirmation if you enter a number."
      footer={
        <Button size="lg" block loading={create.isPending} disabled={!ready} onClick={submit}>
          {ready && computed !== null && method !== "complimentary" ? `Record · ${formatINR(price !== "" ? Number(price) : computed)}` : "Record booking"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {events.length > 0 && venues.length > 0 && <Seg value={kind} onChange={setKind} options={[["venue", "Court"], ["listing", "Event tickets"]]} size="sm" />}
        {kind === "venue" ? (
          <>
            {venues.length > 1 && (
              <Field label="Venue">
                <select className={inputCls} value={sched?.venueId ?? ""} onChange={(e) => (setVenue(e.target.value), setResourceId(undefined), setStartMins(undefined))}>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Court">
                <select className={inputCls} value={res?.resource.id ?? ""} onChange={(e) => (setResourceId(e.target.value), setStartMins(undefined))}>
                  {sched?.resources.map((r) => (
                    <option key={r.resource.id} value={r.resource.id}>{r.resource.name} · {r.resource.sport.replace("-", " ")}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <select className={inputCls} value={date} onChange={(e) => (setDate(e.target.value), setStartMins(undefined))}>
                  {dates.map((d) => (
                    <option key={d} value={d}>{formatDate(d)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Start">
              {starts.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {starts.map((s) => (
                    <button key={s.startMins} type="button" aria-pressed={startMins === s.startMins} onClick={() => setStartMins(s.startMins)} className={`h-9 rounded-lg border px-2.5 text-[13px] font-semibold tabular-nums ${startMins === s.startMins ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
                      {formatMins(s.startMins, { compact: true })}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No free slots left on this day.</p>
              )}
            </Field>
            <Field label={`Duration (${slotLen}-min slots)`}>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" aria-pressed={slots === n} onClick={() => setSlots(n)} className={`h-10 flex-1 rounded-xl border text-sm font-semibold ${slots === n ? "border-brand bg-tint text-brand-ink" : "border-line-strong"}`}>
                    {(n * slotLen) / 60 >= 1 ? `${(n * slotLen) / 60} h` : `${n * slotLen} min`}
                  </button>
                ))}
              </div>
              {startMins !== undefined && endMins !== undefined && <span className={`text-xs ${chosenOk ? "text-muted" : "text-danger"}`}>{formatMins(startMins)} – {formatMins(endMins)}{chosenOk ? "" : " · part of this range is taken"}</span>}
            </Field>
          </>
        ) : (
          <>
            <Field label="Event">
              <select className={inputCls} value={listingId} onChange={(e) => (setListingId(e.target.value), setSessionId(""), setTickets({}))}>
                <option value="">Choose an event</option>
                {events.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </Field>
            {inv && inv.sessions.length > 1 && (
              <Field label="Date">
                <select className={inputCls} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                  {inv.sessions.map((s) => (
                    <option key={s.id} value={s.id}>{formatWhen(s.startsAt)} · {s.remaining} left</option>
                  ))}
                </select>
              </Field>
            )}
            {inv && (
              <Field label="Tickets">
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {inv.tickets.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <b>{t.name}</b>
                        <span className="block text-xs text-muted">{t.price !== null ? formatINR(t.price, { free: "Free" }) : ""} · {t.remaining} left</span>
                      </span>
                      <input type="number" min={0} max={t.remaining} aria-label={`${t.name} quantity`} className={`${inputCls} h-9 w-20 text-center`} value={tickets[t.id] ?? 0} onChange={(e) => setTickets({ ...tickets, [t.id]: Math.max(0, Math.min(t.remaining, Number(e.target.value) || 0)) })} />
                    </li>
                  ))}
                </ul>
              </Field>
            )}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Guest name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Who's playing?" />
          </Field>
          <Field label="Mobile (optional)" hint={phone && !/^[6-9]\d{9}$/.test(phone) ? "10 digits" : undefined}>
            <input className={inputCls} inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="For their confirmation" />
          </Field>
        </div>
        <Seg label="Payment" value={method} onChange={setMethod} options={settings.hostBookings.methods.map((m) => [m, METHOD_LABEL[m]] as [typeof m, string])} size="sm" />
        {canPrice && method !== "complimentary" && (
          <Field label="Price ₹" hint={computed !== null ? `Slot price ${formatINR(computed)}. Leave blank to use it.` : undefined}>
            <input type="number" min={0} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder={computed !== null ? String(computed) : ""} />
          </Field>
        )}
        <Field label="Notes (team only)">
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Regular, pays monthly" />
        </Field>
        <div className="rounded-xl border border-line px-4">
          <Toggle label="Send confirmation" sub="To the guest's number and, if your alerts include console bookings, your team" on={notify} set={setNotify} />
        </div>
      </div>
    </Sheet>
  );
}
