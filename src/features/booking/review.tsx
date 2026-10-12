"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { ShieldCheck, Tag, X } from "lucide-react";
import type { Booking, FormField, HoldRequest, ListingCard } from "@/contracts";
import type { Draft } from "@/stores/booking-draft";
import { useApplyCoupon, useHold } from "@/lib/api/hooks";
import { Button } from "@/components/ui/button";
import { Cover } from "@/components/ui/cover";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/pricing";
import { formatDate, fromISO } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useCountdown } from "./hold-timer";
import { PriceBreakdown } from "./price-breakdown";

type Attendee = NonNullable<Draft["attendee"]>;

export function reviewDetailsErrors(fields: FormField[], a: Attendee) {
  const errs: Record<string, string> = {};
  if (!a.name || a.name.trim().length < 2) errs.name = "Enter a name";
  if (!/^[6-9]\d{9}$/.test(a.phone)) errs.phone = "Enter a valid number";
  if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) errs.email = "Enter a valid email";
  for (const f of fields) if (f.required && !a.answers?.[f.id]) errs[f.id] = `${f.label} is required`;
  return errs;
}

/**
 * Wireframe 12. Creates (or reuses) the hold, then shows the order, the editable "Your details" card,
 * a coupon field and the price breakdown. Free orders come back confirmed and skip straight to the ticket.
 */
export function Review({
  request,
  card,
  onHeld,
  onBack,
  policy,
  onState,
  details,
}: {
  request: HoldRequest;
  card: ListingCard;
  onHeld: (b: Booking) => void;
  onBack: () => void;
  policy: string;
  onState: (b: Booking | null, busy: boolean) => void;
  /** When set, name/phone/email and optional host questions are edited here. */
  details?: { attendee: Attendee; onChange: (a: Attendee) => void; fields: FormField[]; showErrors: boolean };
}) {
  const hold = useHold();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const started = useRef(false);
  const coupon = useApplyCoupon(booking?.id ?? "");
  const [code, setCode] = useState("");
  const left = useCountdown(booking?.holdExpiresAt);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    hold.mutate(request, {
      onSuccess: (b) => {
        if (b.status === "confirmed" || b.status === "requested") return router.replace(`/book/done/${b.id}`);
        setBooking(b);
        onHeld(b);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onState(left === 0 ? null : booking, hold.isPending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, hold.isPending, left === 0]);

  if (hold.error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-[18px] border border-line bg-surface p-5">
        <p className="font-display text-xl font-bold">That didn&apos;t go through</p>
        <p className="text-muted">{hold.error.message}</p>
        <Button variant="secondary" onClick={onBack}>
          Change selection
        </Button>
      </div>
    );
  }
  if (!booking) {
    return (
      <div className="flex flex-col gap-3.5" aria-busy>
        <Skeleton className="h-[88px] rounded-[18px]" />
        <Skeleton className="h-56 rounded-[18px]" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-36 rounded-[18px]" />
      </div>
    );
  }

  const qtyLine = booking.items.map((it) => `${it.qty > 1 ? `${it.qty} × ` : ""}${it.label}`).join(", ");
  const errs = details?.showErrors ? reviewDetailsErrors(details.fields, details.attendee) : {};
  const set = (p: Partial<Attendee>) => details?.onChange({ ...details.attendee, ...p });
  const field = "h-[46px] w-full rounded-xl border-[1.5px] bg-surface px-3 text-[15px] outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_4px_var(--color-tint)]";
  const itemsLabel =
    booking.items.length === 1 && booking.items[0].qty > 1
      ? `${booking.kind === "venue" ? "Slot" : "Tickets"} (${booking.items[0].qty} × ${formatINR(booking.items[0].unitPrice)})`
      : booking.kind === "venue"
        ? "Court booking"
        : booking.items.length === 1 && booking.items[0].qty === 1
          ? booking.items[0].label
          : "Tickets";

  return (
    <div className="flex flex-col gap-3.5">
      {left === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-[18px] bg-urgent-tint p-4 text-urgent">
          <p className="text-sm font-semibold">Your hold ran out and the spots were released.</p>
          <Button size="sm" variant="secondary" onClick={onBack}>
            Pick again
          </Button>
        </div>
      )}

      <section className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3.5">
        <Cover media={card.media} tone={card.tone} icon={card.icon} alt="" sizes="58px" className="size-[58px] flex-none rounded-[14px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-[15px] font-bold leading-snug">{booking.title}</h2>
          <p className="truncate text-[13px] text-muted">
            {formatDate(fromISO(booking.startsAt).ymd)} · {booking.venueName}
          </p>
          <p className="truncate text-[13px] font-semibold">{qtyLine}</p>
        </div>
        <button type="button" onClick={onBack} className="flex-none text-[13px] font-bold text-brand">
          Edit
        </button>
      </section>

      {details ? (
        <section className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-surface p-3.5">
          <h2 className="font-display text-[17px] font-extrabold">Your details</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <Field id="rv-name" label="Name" error={errs.name}>
              <input id="rv-name" value={details.attendee.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" className={cn(field, errs.name ? "border-danger" : "border-line-strong")} />
            </Field>
            <Field id="rv-phone" label="Phone" error={errs.phone}>
              <input
                id="rv-phone"
                value={details.attendee.phone}
                inputMode="numeric"
                autoComplete="tel-national"
                onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                className={cn(field, errs.phone ? "border-danger" : "border-line-strong")}
              />
            </Field>
          </div>
          <Field id="rv-email" label="Email for tickets" error={errs.email}>
            <input
              id="rv-email"
              type="email"
              value={details.attendee.email ?? ""}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(e) => set({ email: e.target.value.trim() })}
              className={cn(field, errs.email ? "border-danger" : "border-line-strong")}
            />
          </Field>
          {details.fields.map((f) => (
            <Field key={f.id} id={`rv-${f.id}`} label={`Host asks: ${f.label}`} error={errs[f.id]}>
              {f.type === "select" && f.options?.length ? (
                <select
                  id={`rv-${f.id}`}
                  value={details.attendee.answers[f.id] ?? ""}
                  onChange={(e) => set({ answers: { ...details.attendee.answers, [f.id]: e.target.value } })}
                  className={cn(field, "border-line-strong")}
                >
                  <option value="">{f.required ? "Choose one" : "Skip"}</option>
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`rv-${f.id}`}
                  value={details.attendee.answers[f.id] ?? ""}
                  inputMode={f.type === "number" || f.type === "phone" ? "numeric" : undefined}
                  placeholder={f.options?.join(" / ")}
                  onChange={(e) => set({ answers: { ...details.attendee.answers, [f.id]: e.target.value } })}
                  className={cn(field, errs[f.id] ? "border-danger" : "border-line-strong")}
                />
              )}
            </Field>
          ))}
        </section>
      ) : (
        booking.attendee && (
          <p className="rounded-[18px] border border-line bg-surface p-3.5 text-sm text-muted">
            For <b className="text-ink">{booking.attendee.name}</b> · +91 {booking.attendee.phone}
          </p>
        )
      )}

      <section className="flex flex-col gap-2">
        {booking.couponCode ? (
          <div className="flex items-center gap-3 rounded-xl border border-free/30 bg-free-tint px-3.5 py-3">
            <Tag className="size-5 text-free" aria-hidden />
            <p className="flex-1 text-sm">
              <b>{booking.couponCode}</b> applied · you save {formatINR(booking.price.discount)}
            </p>
            <button type="button" aria-label="Remove coupon" onClick={() => coupon.mutate(null, { onSuccess: setBooking })} className="grid size-8 place-items-center rounded-full hover:bg-white/60">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) coupon.mutate(code.trim(), { onSuccess: (b) => (setBooking(b), setCode("")) });
            }}
          >
            <label className="flex-1">
              <span className="sr-only">Coupon code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Coupon code (try LOCAL10)"
                className={cn(field, "border-line-strong uppercase placeholder:normal-case")}
              />
            </label>
            <button type="submit" disabled={coupon.isPending} className="h-[46px] flex-none rounded-xl border-[1.5px] border-ink bg-surface px-[18px] font-bold disabled:opacity-60">
              Apply
            </button>
          </form>
        )}
        <AnimatePresence>
          {coupon.error && (
            <m.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-danger">
              {coupon.error.message}
            </m.p>
          )}
        </AnimatePresence>
      </section>

      <section className="rounded-[18px] border border-line bg-surface p-3.5">
        <PriceBreakdown price={booking.price} coupon={booking.couponCode} itemsLabel={itemsLabel} />
      </section>

      <p className="flex gap-2 text-[13px] text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {policy}
      </p>
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-ink-2">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
