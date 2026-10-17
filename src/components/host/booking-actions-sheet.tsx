"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Banknote, CalendarClock, Clock, IndianRupee, MessageSquare, Plus, Trash2, UserX, XCircle } from "lucide-react";
import { useAddCharge, useExtendBooking, useHostBookingDetail, useHostCancel, useHostReschedule, useMarkNoShow, useMarkPaid, useRemoveCharge, useSchedule, useSetBookingNotes, useSettleDue, useUndoNoShow } from "@/lib/api/host-hooks";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/pricing";
import { addDays, formatDate, formatMins, formatRange, formatWhen, fromISO, todayIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import { BookingStatusPill, maskPhone } from "./bits";
import { Field, METHOD_LABEL, Seg, Toggle, inputCls } from "./ops-ui";

type Mode = "view" | "extend" | "charge" | "settle" | "cancel" | "move" | "notes" | "paid" | "no_show";

/** Everything the team can do with one booking: see it, extend it, add charges, collect, move, cancel. */
export function BookingActionsSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: d, isPending, error } = useHostBookingDetail(id);
  const [mode, setMode] = useState<Mode>("view");
  const close = () => {
    setMode("view");
    onClose();
  };
  const title = d ? d.booking.customer : "Booking";
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && close()} title={title} description={d ? `${d.booking.title} · ${formatWhen(d.booking.startsAt)}` : undefined}>
      {error ? (
        <p className="pb-4 text-sm text-danger">{error.message}</p>
      ) : isPending || !d || !id ? (
        <Skeleton className="mb-4 h-64 rounded-2xl" />
      ) : mode === "view" ? (
        <View d={d} setMode={setMode} />
      ) : mode === "extend" ? (
        <Extend id={id} d={d} done={() => setMode("view")} />
      ) : mode === "charge" ? (
        <Charge id={id} d={d} done={() => setMode("view")} />
      ) : mode === "settle" ? (
        <Settle id={id} d={d} done={() => setMode("view")} />
      ) : mode === "cancel" ? (
        <Cancel id={id} d={d} done={close} />
      ) : mode === "move" ? (
        <Move id={id} d={d} done={() => setMode("view")} />
      ) : mode === "paid" ? (
        <MarkPaid id={id} d={d} done={() => setMode("view")} />
      ) : mode === "no_show" ? (
        <NoShow id={id} d={d} done={() => setMode("view")} />
      ) : (
        <Notes id={id} d={d} done={() => setMode("view")} />
      )}
    </Sheet>
  );
}

type Detail = NonNullable<ReturnType<typeof useHostBookingDetail>["data"]>;

function View({ d, setMode }: { d: Detail; setMode: (m: Mode) => void }) {
  const b = d.booking;
  const remove = useRemoveCharge(b.id);
  const undo = useUndoNoShow(b.id);
  const unpaidAtVenue = d.payAtVenue && b.dueAtVenue;
  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <BookingStatusPill status={b.status} />
        <span className="rounded-full bg-field px-2.5 py-1 text-xs font-bold text-muted">{b.source === "host" ? "Recorded by team" : "Booked online"}</span>
        {d.payAtVenue ? (
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", unpaidAtVenue || b.status === "no_show" ? "bg-urgent-tint text-urgent" : "bg-free-tint text-free")}>
            {b.status === "no_show" ? "Pay at venue · never paid" : unpaidAtVenue ? "Pay at venue · unpaid" : b.status === "cancelled" ? "Pay at venue" : "Paid at venue"}
          </span>
        ) : (
          b.paymentMethod && <span className="rounded-full bg-field px-2.5 py-1 text-xs font-bold text-muted">{METHOD_LABEL[b.paymentMethod] ?? b.paymentMethod}</span>
        )}
        {d.guestNoShows > 0 && <span className="rounded-full bg-danger-tint px-2.5 py-1 text-xs font-bold text-danger">{d.guestNoShows} no-show{d.guestNoShows === 1 ? "" : "s"}</span>}
        {d.rescheduledCount > 0 && <span className="rounded-full bg-warn-tint px-2.5 py-1 text-xs font-bold text-warn">Moved {d.rescheduledCount}×</span>}
        <span className="ml-auto font-mono text-xs text-muted">{b.code}</span>
      </div>
      <p className="text-sm text-muted">
        {maskPhone(b.phone) || "No number"} · {formatDate(fromISO(b.startsAt).ymd)} · {formatRange(b.startsAt, b.endsAt)}
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line text-sm">
        {d.items.map((i) => (
          <li key={i.line} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate">
              {i.qty > 1 && `${i.qty} × `}
              {i.label}
            </span>
            {i.amount !== null && <span className="tabular-nums">{formatINR(i.amount)}</span>}
            {i.kind === "extra" && d.can.edit && (
              <button type="button" aria-label={`Remove ${i.label}`} onClick={() => remove.mutate(i.line, { onSuccess: () => toast.success("Charge removed"), onError: (e) => toast.error(e.message) })} className="grid size-8 place-items-center rounded-full hover:bg-field">
                <Trash2 className="size-4 text-muted" />
              </button>
            )}
          </li>
        ))}
        {d.price && (
          <li className="flex items-center justify-between px-3 py-2 font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(d.price.total, { free: "Free" })}</span>
          </li>
        )}
        {d.amountDue !== null && d.amountDue > 0 && (
          <li className="flex items-center justify-between bg-warn-tint px-3 py-2 font-bold text-warn">
            <span>Due at the venue</span>
            <span className="tabular-nums">{formatINR(d.amountDue)}</span>
          </li>
        )}
      </ul>
      {unpaidAtVenue && (
        <p className="rounded-xl bg-urgent-tint px-3 py-2.5 text-sm text-urgent">
          <b>Collect in cash before letting them in.</b> The guest agreed to pay on arrival; local. collected nothing and isn&apos;t responsible if they don&apos;t pay. Mark paid once you have the money, or a no-show if they never come.
        </p>
      )}
      {b.status === "no_show" && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-danger-tint px-3 py-2.5 text-sm text-danger">
          <span>Marked as a no-show. The guest has been told.</span>
          {d.can.undoNoShow && (
            <button type="button" className="shrink-0 font-bold underline" disabled={undo.isPending} onClick={() => undo.mutate(undefined, { onSuccess: () => toast.success("No-show undone"), onError: (e) => toast.error(e.message) })}>
              Undo
            </button>
          )}
        </div>
      )}
      {d.notes && <p className="rounded-xl bg-field px-3 py-2 text-sm">{d.notes}</p>}
      <div className="grid grid-cols-2 gap-2">
        {d.can.markPaid && <Action icon={Banknote} label="Mark as paid" onClick={() => setMode("paid")} primary />}
        {d.can.noShow && <Action icon={UserX} label="No-show" danger onClick={() => setMode("no_show")} />}
        {d.can.extend && <Action icon={Clock} label="Add time" onClick={() => setMode("extend")} />}
        {d.can.edit && <Action icon={Plus} label="Add a charge" onClick={() => setMode("charge")} />}
        {d.can.settle && !d.can.markPaid && <Action icon={IndianRupee} label="Collect due" onClick={() => setMode("settle")} />}
        {d.can.reschedule && <Action icon={CalendarClock} label="Move booking" onClick={() => setMode("move")} />}
        <Action icon={MessageSquare} label={d.notes ? "Edit notes" : "Add notes"} onClick={() => setMode("notes")} />
        {d.can.cancel && <Action icon={XCircle} label="Cancel booking" danger onClick={() => setMode("cancel")} />}
      </div>
      {(d.events.length > 0 || d.messages.length > 0) && (
        <details className="rounded-xl border border-line">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">History</summary>
          <ul className="divide-y divide-line text-[13px]">
            {d.events.map((e, i) => (
              <li key={i} className="px-3 py-2">
                <span className="text-muted">{formatWhen(e.at)} · {e.by}</span>
                <span className="block">{e.summary}</span>
              </li>
            ))}
            {d.messages.map((m, i) => (
              <li key={`m${i}`} className="px-3 py-2 text-muted">
                {formatWhen(m.at)} · {m.channel.toUpperCase()} to {m.audience === "guest" ? "guest" : "team"} {m.to} · {m.status}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Action({ icon: Icon, label, onClick, danger, primary }: { icon: typeof Clock; label: string; onClick: () => void; danger?: boolean; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex h-12 items-center gap-2 rounded-xl border px-3 text-sm font-semibold", danger ? "border-[#f1c6bc] text-danger hover:bg-danger-tint" : primary ? "border-brand bg-brand text-white hover:bg-brand-ink" : "border-line-strong hover:border-brand")}>
      <Icon className="size-4" /> {label}
    </button>
  );
}

const Back = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="w-fit text-sm font-semibold text-muted hover:text-ink">
    ← Back
  </button>
);

function Extend({ id, d, done }: { id: string; d: Detail; done: () => void }) {
  const curEnd = fromISO(d.booking.endsAt).mins;
  const options = d.extendOptions ?? [];
  const [endMins, setEnd] = useState(options[0]?.endMins ?? curEnd);
  const [collect, setCollect] = useState<string>("");
  const [price, setPrice] = useState("");
  const m = useExtendBooking(id);
  const methods = d.methods.filter((x) => x !== "pay_later" && x !== "complimentary");
  if (!options.length)
    return (
      <div className="flex flex-col gap-4 pb-4">
        <Back onClick={done} />
        <p className="text-sm text-muted">The court is taken right after this booking (or it&apos;s closing), so there&apos;s no time to add. Move the booking instead if the guest wants longer.</p>
      </div>
    );
  const chosen = options.find((o) => o.endMins === endMins);
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Back onClick={done} />
      <Field label="New end time" hint={`Currently ends ${formatMins(curEnd)}. Only free time after the booking is offered.`}>
        <select className={inputCls} value={endMins} onChange={(e) => setEnd(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o.endMins} value={o.endMins}>{formatMins(o.endMins)}{o.price !== null ? ` · +${formatINR(o.price)}` : ""}</option>
          ))}
        </select>
      </Field>
      {d.can.price && (
        <Field label="Charge for the extra time ₹" hint={chosen?.price !== null && chosen ? `Leave blank for the slot price (${formatINR(chosen.price)})` : "Leave blank for the slot price"}>
          <input type="number" min={0} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      )}
      <Seg label="Payment" value={collect} onChange={setCollect} options={[["", "Add to amount due"], ...methods.map((x) => [x, `${METHOD_LABEL[x]} now`] as [string, string])]} size="sm" />
      <Button size="lg" block loading={m.isPending} onClick={() => m.mutate({ endMins, price: price !== "" ? Number(price) : undefined, collect: collect ? { method: collect as "cash" } : undefined, notify: true }, { onSuccess: (r) => (toast.success(`Extended · ${formatINR(r.added)} ${collect ? "collected" : "added to due"}`), done()), onError: (e) => toast.error(e.message) })}>
        Extend booking
      </Button>
    </div>
  );
}

function Charge({ id, d, done }: { id: string; d: Detail; done: () => void }) {
  const [extraId, setExtra] = useState<string>(d.extras[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [qty, setQty] = useState(1);
  const [collect, setCollect] = useState<string>("");
  const m = useAddCharge(id);
  const custom = extraId === "";
  const methods = d.methods.filter((x) => x !== "pay_later" && x !== "complimentary");
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Back onClick={done} />
      {d.extras.length > 0 && (
        <Field label="Extra">
          <div className="flex flex-wrap gap-1.5">
            {d.extras.map((x) => (
              <button key={x.id} type="button" aria-pressed={extraId === x.id} onClick={() => setExtra(x.id)} className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${extraId === x.id ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
                {x.name} · ₹{x.price}{x.per === "hour" ? "/h" : ""}
              </button>
            ))}
            {d.can.price && (
              <button type="button" aria-pressed={custom} onClick={() => setExtra("")} className={`h-9 rounded-full border px-3 text-[13px] font-semibold ${custom ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
                Custom
              </button>
            )}
          </div>
        </Field>
      )}
      {custom &&
        (d.can.price ? (
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="What for">
              <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Floodlights" />
            </Field>
            <Field label="Amount ₹">
              <input type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-muted">No extras set up yet. Ask your owner to add them in Settings.</p>
        ))}
      <Field label="Quantity">
        <input type="number" min={1} max={50} className={`${inputCls} w-28`} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
      </Field>
      <Seg label="Payment" value={collect} onChange={setCollect} options={[["", "Add to amount due"], ...methods.map((x) => [x, `${METHOD_LABEL[x]} now`] as [string, string])]} size="sm" />
      <Button size="lg" block loading={m.isPending} disabled={custom && (!label.trim() || amount === "")} onClick={() => m.mutate({ extraId: extraId || undefined, label: custom ? label : undefined, amount: custom ? Number(amount) : undefined, qty, collect: collect ? { method: collect as "cash" } : undefined, notify: false }, { onSuccess: (r) => (toast.success(`${r.label} added · ${formatINR(r.amount)}`), done()), onError: (e) => toast.error(e.message) })}>
        Add charge
      </Button>
    </div>
  );
}

function Settle({ id, d, done }: { id: string; d: Detail; done: () => void }) {
  const methods = d.methods.filter((x) => x !== "pay_later" && x !== "complimentary");
  const [method, setMethod] = useState<string>(methods[0] ?? "cash");
  const [amount, setAmount] = useState(String(d.amountDue ?? ""));
  const m = useSettleDue(id);
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Back onClick={done} />
      <p className="text-sm">{d.amountDue !== null ? `${formatINR(d.amountDue)} is due on this booking.` : "An amount is due on this booking."}</p>
      <Seg label="Collected by" value={method} onChange={setMethod} options={methods.map((x) => [x, METHOD_LABEL[x]] as [string, string])} size="sm" />
      {d.amountDue !== null && (
        <Field label="Amount ₹" hint="Part payments are fine; the rest stays due.">
          <input type="number" min={0} max={d.amountDue} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      )}
      <Button size="lg" block loading={m.isPending} onClick={() => m.mutate({ method: method as "cash", amount: d.amountDue !== null && amount !== "" ? Number(amount) : undefined }, { onSuccess: (r) => (toast.success(`${formatINR(r.amount)} collected`), done()), onError: (e) => toast.error(e.message) })}>
        Mark as collected
      </Button>
    </div>
  );
}

function MarkPaid({ id, d, done }: { id: string; d: Detail; done: () => void }) {
  const [method, setMethod] = useState<"cash" | "upi" | "card">("cash");
  const m = useMarkPaid(id);
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Back onClick={done} />
      <p className="text-sm">{d.amountDue !== null ? `${formatINR(d.amountDue)} is due from this guest.` : "The guest agreed to pay the full ticket value at the venue."} Mark it paid once you have the money.</p>
      <Seg label="Paid by" value={method} onChange={setMethod} options={[["cash", "Cash"], ["upi", "UPI"], ["card", "Card"]]} size="sm" />
      <Button size="lg" block loading={m.isPending} onClick={() => m.mutate(method, { onSuccess: (r) => (toast.success(`${formatINR(r.amount)} collected`), done()), onError: (e) => toast.error(e.message) })}>
        Mark as paid
      </Button>
    </div>
  );
}

function NoShow({ id, d, done }: { id: string; d: Detail; done: () => void }) {
  const m = useMarkNoShow(id);
  const next = d.guestNoShows + 1;
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Back onClick={done} />
      <p className="text-sm">
        Mark <b>{d.booking.customer}</b> as a no-show for {formatWhen(d.booking.startsAt)}?{d.payAtVenue && d.booking.dueAtVenue ? " Nothing was collected for this booking." : ""}
      </p>
      <p className="text-sm text-muted">
        The guest is told by message. This will be no-show {next} on their record{next >= d.noShowLimit ? `, so they can no longer choose to pay at the venue anywhere on local.` : `; after ${d.noShowLimit} they can no longer pay at the venue.`} You can undo this from the booking.
      </p>
      <Button size="lg" block className="bg-danger hover:bg-[#9a1d14]" loading={m.isPending} onClick={() => m.mutate(undefined, { onSuccess: () => (toast.success("Marked as a no-show"), done()), onError: (e) => toast.error(e.message) })}>
        Mark as no-show
      </Button>
    </div>
  );
}

function Cancel({ id, d, done }: { id: string; d: Detail; done: () => void }) {
  const [pct, setPct] = useState<"0" | "50" | "100">(String(d.hostCancelRefundPct) as "0" | "50" | "100");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const m = useHostCancel(id);
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Back onClick={done} />
      {d.online ? (
        <Seg label="Refund of the ticket value" value={pct} onChange={setPct} options={[["100", "Full"], ["50", "Half"], ["0", "None"]]} size="sm" />
      ) : (
        <p className="text-sm text-muted">This was paid at the venue{d.amountDue ? " (part still due)" : ""}. Any refund is settled by hand; the booking is marked cancelled and the slot opens up.</p>
      )}
      <Field label="Reason (team only)">
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rain, double booking…" />
      </Field>
      <div className="rounded-xl border border-line px-4">
        <Toggle label="Tell the guest" on={notify} set={setNotify} />
      </div>
      <Button size="lg" block className="bg-danger hover:bg-[#9a1d14]" loading={m.isPending} onClick={() => m.mutate({ refundPct: d.online ? (Number(pct) as 0 | 50 | 100) : undefined, reason: reason || undefined, notify }, { onSuccess: (r) => (toast.success(r.refundAmount > 0 ? `Cancelled · ${formatINR(r.refundAmount)} refund started` : "Booking cancelled"), done()), onError: (e) => toast.error(e.message) })}>
        Cancel this booking
      </Button>
    </div>
  );
}

function Move({ id, d, done }: { id: string; d: Detail; done: () => void }) {
  const [date, setDate] = useState(fromISO(d.booking.startsAt).ymd);
  const cur = fromISO(d.booking.startsAt);
  const [startMins, setStart] = useState<number | null>(null);
  const [resourceId, setResource] = useState<string | undefined>();
  const { data: sched } = useSchedule(undefined, date);
  const m = useHostReschedule(id);
  const mins = (new Date(d.booking.endsAt).getTime() - new Date(d.booking.startsAt).getTime()) / 60_000;
  const courts = sched?.resources ?? [];
  const court = courts.find((r) => r.resource.id === resourceId) ?? courts[0];
  const dates = Array.from({ length: 30 }, (_, i) => addDays(todayIST(), i));
  const free = (r: (typeof courts)[number], s: number) => r.slots.filter((x) => x.startMins >= s && x.startMins < s + mins).every((x) => (x.status === "available" && !x.block && !x.booking) || (x.booking?.code === d.booking.code));
  if (d.booking.kind !== "venue")
    return (
      <div className="flex flex-col gap-4 pb-4">
        <Back onClick={done} />
        <p className="text-sm text-muted">Event bookings are moved from the guest&apos;s own booking page, or by cancelling and recording a new booking.</p>
      </div>
    );
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Back onClick={done} />
      <p className="text-sm text-muted">Now {formatWhen(d.booking.startsAt)} · {mins / 60} h. The guest keeps the price they paid.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <select className={inputCls} value={date} onChange={(e) => (setDate(e.target.value), setStart(null))}>
            {dates.map((x) => (
              <option key={x} value={x}>{formatDate(x)}</option>
            ))}
          </select>
        </Field>
        <Field label="Court">
          <select className={inputCls} value={court?.resource.id ?? ""} onChange={(e) => (setResource(e.target.value), setStart(null))}>
            {courts.map((r) => (
              <option key={r.resource.id} value={r.resource.id}>{r.resource.name} · {r.resource.sport.replace("-", " ")}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Start">
        <div className="flex flex-wrap gap-1.5">
          {court?.slots.filter((s) => !s.isPast).map((s) => {
            const ok = free(court, s.startMins);
            const isCur = cur.ymd === date && cur.mins === s.startMins && s.booking?.code === d.booking.code;
            return (
              <button key={s.startMins} type="button" disabled={!ok || isCur} aria-pressed={startMins === s.startMins} onClick={() => setStart(s.startMins)} className={`h-9 rounded-lg border px-2.5 text-[13px] font-semibold tabular-nums disabled:opacity-40 ${startMins === s.startMins ? "border-brand bg-brand text-white" : "border-line-strong"}`}>
                {formatMins(s.startMins, { compact: true })}
              </button>
            );
          })}
        </div>
      </Field>
      <Button size="lg" block loading={m.isPending} disabled={startMins === null || !court} onClick={() => m.mutate({ to: { date, startMins: startMins!, resourceId: court!.resource.id }, notify: true }, { onSuccess: () => (toast.success("Booking moved. The guest has been told."), done()), onError: (e) => toast.error(e.message) })}>
        Move booking
      </Button>
    </div>
  );
}

function Notes({ id, d, done }: { id: string; d: Detail; done: () => void }) {
  const [notes, setNotes] = useState(d.notes ?? "");
  const m = useSetBookingNotes(id);
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Back onClick={done} />
      <Field label="Notes (your team only)">
        <textarea className={`${inputCls} h-28 resize-none py-3`} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button size="lg" block loading={m.isPending} onClick={() => m.mutate(notes, { onSuccess: () => (toast.success("Notes saved"), done()), onError: (e) => toast.error(e.message) })}>
        Save notes
      </Button>
    </div>
  );
}
