"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { Booking, HoldRequest } from "@/contracts";
import { useAvailability, useHold, useMe, useUpdateAttendee } from "@/lib/api/hooks";
import { useDraft } from "@/stores/booking-draft";
import { Button } from "@/components/ui/button";
import { Cover } from "@/components/ui/cover";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR } from "@/lib/pricing";
import { formatDate, formatMins, formatRange, fromISO } from "@/lib/time";
import { cn } from "@/lib/utils";
import { buildScreens, type ScreenId } from "./screens";
import { selectionSummary, TicketSelect } from "./ticket-select";
import { SlotSelect, slotSummary } from "./slot-select";
import { DetailsForm, detailsErrors } from "./details-form";
import { Review, reviewDetailsErrors } from "./review";
import { HoldChip } from "./hold-timer";
import { draftKey, type JourneyTarget } from "./types";
import { useDraftHydrated } from "./use-hydrated";

export function Journey({ target }: { target: JourneyTarget }) {
  const hydrated = useDraftHydrated();
  if (!hydrated) return <JourneySkeleton />;
  return <JourneyInner target={target} />;
}

function JourneyInner({ target }: { target: JourneyTarget }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const key = draftKey(target);
  const { draft, patch, clear } = useDraft(key);
  const tpl = target.detail.template;
  const listing = target.kind === "e" ? target.detail.listing : null;
  const screens = useMemo(() => buildScreens(tpl, listing), [tpl, listing]);
  const requested = (params.get("step") as ScreenId | null) ?? screens[0].id;
  const [showErrors, setShowErrors] = useState(false);
  const [held, setHeld] = useState<{ booking: Booking | null; busy: boolean }>({ booking: null, busy: false });
  const confirmFree = useHold();
  const saveAttendee = useUpdateAttendee(held.booking?.id ?? "");

  // Slot availability (shared cache with SlotSelect) for the summary.
  const venueId = target.kind === "v" ? target.detail.venue.id : "";
  const sport = target.kind === "v" ? (draft.sport && target.detail.venue.sports.includes(draft.sport) ? draft.sport : target.detail.venue.sports[0]) : undefined;
  const avail = useAvailability(venueId, sport, draft.date);

  // ----- selection state -----
  const ticketSel = target.kind === "e" ? selectionSummary(target.detail, draft) : null;
  const slotSel = target.kind === "v" ? slotSummary(target.detail, draft, avail.data && avail.data.sport === sport ? avail.data : undefined) : null;
  const hasSelection = target.kind === "e" ? (ticketSel?.qty ?? 0) > 0 : !!slotSel;
  const attendee = draft.attendee ?? { name: me?.name ?? "", phone: me?.phone ?? "", answers: {} };
  const fields = listing?.formFields ?? [];
  const detailsOk = Object.keys(detailsErrors(fields, attendee)).length === 0;
  // Review edits who it's for when there's no separate details screen (wireframe 12).
  const reviewEditsDetails = !screens.some((s) => s.id === "details");
  const reviewFields = fields.filter((f) => !f.required);

  // Guard: you can't land on a later screen without a selection.
  const idx = Math.max(0, screens.findIndex((s) => s.id === requested));
  const current = !hasSelection && idx > 0 ? screens[0] : screens[idx];
  const stepNo = screens.indexOf(current) + 1;

  // Venue page's sport picker deep-links here with ?sport=
  useEffect(() => {
    const s = params.get("sport");
    if (target.kind === "v" && s && s !== draft.sport && target.detail.venue.sports.includes(s)) patch({ sport: s, resourceId: "any", sel: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (current.id === "details" && !draft.attendee && me) patch({ attendee: { name: me.name ?? "", phone: me.phone, answers: {} } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, me]);

  const go = (id: ScreenId) => {
    setShowErrors(false);
    router.push(`${pathname}?step=${id}`, { scroll: true });
  };

  const request = (): HoldRequest => {
    const att = draft.attendee ?? (me ? { name: me.name ?? "", phone: me.phone, answers: {} } : undefined);
    if (target.kind === "v") {
      return { kind: "venue", targetId: target.detail.venue.id, slots: { resourceId: draft.sel!.resourceId, date: avail.data!.date, startMins: draft.sel!.startMins, endMins: draft.sel!.endMins }, attendee: att };
    }
    return {
      kind: "listing",
      targetId: target.detail.listing.id,
      sessionId: draft.passMode ? null : draft.sessionId ?? null,
      tickets: Object.entries(draft.tickets)
        .filter(([, q]) => q > 0)
        .map(([ticketTypeId, qty]) => ({ ticketTypeId, qty })),
      attendee: att,
    };
  };

  const next = () => {
    const i = screens.indexOf(current);
    const nextScreen = screens[i + 1];
    if (current.id === "details" && !detailsOk) return setShowErrors(true);
    if (!me) {
      // Login only at checkout (decision 2026-10-11); come back to the same step.
      const resume = nextScreen?.id ?? current.id;
      return router.push(`/login?next=${encodeURIComponent(`${pathname}?step=${resume}`)}`);
    }
    if (nextScreen) return go(nextScreen.id);
    // No review screen (free RSVP): confirm straight away.
    confirmFree.mutate(request(), {
      onSuccess: (b) => {
        clear();
        router.replace(`/book/done/${b.id}`);
      },
    });
  };

  const back = () => {
    if (stepNo > 1) router.back();
    else router.push(target.detail.card.href);
  };

  // ----- CTA + summary text -----
  let summary: React.ReactNode = null;
  let total: number | null = null;
  if (target.kind === "e" && ticketSel) {
    total = ticketSel.subtotal;
    summary = ticketSel.qty > 0 ? `${ticketSel.qty} ${tpl.bookingMode === "registration" ? "team" : tpl.bookingMode === "rsvp" ? (ticketSel.qty > 1 ? "people" : "person") : ticketSel.qty > 1 ? "tickets" : "ticket"}` : "Nothing selected yet";
  } else if (target.kind === "v") {
    total = slotSel?.price ?? 0;
    summary =
      slotSel && draft.sel && avail.data
        ? `${slotSel.resource.name} · ${formatDate(avail.data.date).replace(",", "")} · ${formatMins(draft.sel.startMins, { compact: true })}–${formatMins(draft.sel.endMins, { compact: true })}`
        : "Pick a time slot";
  }
  // Before anything is picked, show the starting price as a hint instead of a "Free" / ₹0 total.
  const priceFrom = target.detail.card.priceFrom;
  const hint = current.id !== "review" && !hasSelection ? (priceFrom ? `from ${formatINR(priceFrom)}` : "Free entry") : null;
  let ctaLabel = "Continue";
  let ctaDisabled = !hasSelection;
  let ctaLoading = confirmFree.isPending;
  let onCta = next;
  if (current.id === "review") {
    total = held.booking?.price.total ?? null;
    summary = held.booking ? "Total payable" : "Holding your spot…";
    ctaLabel = held.booking ? (held.booking.price.total > 0 ? `Proceed to pay ${formatINR(held.booking.price.total)}` : "Confirm") : "Proceed to pay";
    ctaDisabled = !held.booking;
    ctaLoading = held.busy || saveAttendee.isPending;
    onCta = () => {
      if (!held.booking) return;
      const id = held.booking.id;
      if (!reviewEditsDetails) return router.push(`/book/pay/${id}`);
      if (Object.keys(reviewDetailsErrors(reviewFields, attendee)).length) return setShowErrors(true);
      saveAttendee.mutate(attendee, { onSuccess: () => router.push(`/book/pay/${id}`) });
    };
  } else if (!screens[screens.indexOf(current) + 1]) {
    ctaLabel = tpl.bookingMode === "rsvp" ? "Confirm RSVP" : "Confirm";
  }
  if (!me && current.id === "select") ctaLabel = `${ctaLabel} · log in`;
  const stepper = [
    tpl.bookingMode === "slot" ? "Slot" : tpl.bookingMode === "registration" ? "Division" : tpl.bookingMode === "rsvp" ? "RSVP" : "Tickets",
    ...(screens.some((x) => x.id === "details" || x.id === "review") ? ["Details"] : []),
    tpl.pricing === "free" ? "Done" : "Payment",
  ];
  const stepperAt = current.id === "select" ? 0 : 1;

  const policy =
    tpl.cancellation.policy === "none"
      ? "Non-refundable."
      : tpl.cancellation.policy === "full_until"
        ? `Free cancellation up to ${tpl.cancellation.hoursBefore} hours before the start. Fees are non-refundable.`
        : `${tpl.cancellation.refundPct}% refund up to ${tpl.cancellation.hoursBefore} hours before the start.`;

  const title = target.kind === "e" ? target.detail.listing.title : target.detail.venue.name;
  const firstSession = target.kind === "e" ? ticketSel?.session ?? target.detail.sessions[0] : null;

  const headerSub =
    target.kind === "e"
      ? [target.detail.listing.venueName, target.detail.sessions.length > 1 ? target.detail.card.whenLabel : firstSession ? formatDate(fromISO(firstSession.startsAt).ymd) : null].filter(Boolean).join(" · ")
      : target.detail.area.name;
  const headerTitle =
    target.kind === "v" ? `${target.detail.sports.find((x) => x.slug === sport)?.name ?? "Courts"} · ${target.detail.venue.name}` : title;
  const onReview = current.id === "review";

  return (
    <div className="min-h-dvh pb-32 md:pb-16">
      {/* Phone header (wireframes 09, 11, 12) */}
      <div className="sticky top-0 z-30 bg-ground/95 px-5 pb-1 pt-4 backdrop-blur-md md:hidden">
        <div className="flex h-11 items-center gap-1.5">
          <button type="button" onClick={back} className="-ml-2.5 grid size-11 flex-none place-items-center" aria-label="Back">
            <ChevronLeft className="size-[22px]" strokeWidth={1.8} />
          </button>
          {onReview ? (
            <>
              <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-extrabold">{current.title}</h1>
              <HoldChip expiresAt={held.booking?.holdExpiresAt} />
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-bold">{headerTitle}</h1>
              <p className="truncate text-xs text-muted">{headerSub}</p>
            </div>
          )}
        </div>
        {!onReview && target.kind === "e" && <Stepper labels={stepper} at={stepperAt} className="mt-3.5" />}
      </div>
      {/* Desktop header */}
      <div className="hidden border-b border-line bg-surface md:block">
        <div className="mx-auto flex h-[72px] max-w-[1100px] items-center gap-6 px-8">
          <Logo href={target.detail.card.href.split("/").slice(0, 2).join("/")} />
          <Stepper labels={stepper} at={stepperAt} className="max-w-md flex-1" />
          <Link href={target.detail.card.href} className="ml-auto text-sm font-semibold text-muted hover:text-ink">
            Cancel
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1100px] gap-10 px-5 pt-4 md:grid-cols-[minmax(0,1fr)_360px] md:px-8 md:pt-10">
        <div className="min-w-0">
          <div className="mb-6 hidden items-center justify-between gap-4 md:flex">
            <h1 className="font-display text-3xl font-extrabold">{onReview ? current.title : headerTitle}</h1>
            {onReview && <HoldChip expiresAt={held.booking?.holdExpiresAt} />}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={current.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              {current.id === "select" &&
                (target.kind === "e" ? <TicketSelect d={target.detail} draft={draft} patch={patch} policy={policy} /> : <SlotSelect d={target.detail} draft={draft} patch={patch} />)}
              {current.id === "details" && (
                <DetailsForm fields={fields} attendee={attendee} onChange={(a) => patch({ attendee: a })} team={current.steps.includes("team_details")} showErrors={showErrors} />
              )}
              {current.id === "review" && (
                <Review
                  request={request()}
                  card={target.detail.card}
                  onHeld={(b) => patch({ bookingId: b.id })}
                  onBack={() => router.replace(`${pathname}?step=select`)}
                  policy={policy}
                  onState={(booking, busy) => setHeld({ booking, busy })}
                  details={reviewEditsDetails ? { attendee, onChange: (a) => patch({ attendee: a }), fields: reviewFields, showErrors } : undefined}
                />
              )}
              {(confirmFree.error || saveAttendee.error) && <p className="mt-4 text-sm text-danger">{(confirmFree.error ?? saveAttendee.error)!.message}</p>}
            </m.div>
          </AnimatePresence>
        </div>

        {/* Desktop summary */}
        <aside className="hidden md:block">
          <div className="sticky top-8 flex flex-col gap-5 rounded-[24px] border border-line bg-surface p-5">
            <div className="flex gap-3">
              <Cover media={target.detail.card.media} tone={target.detail.card.tone} icon={target.detail.card.icon} alt="" className="size-16 shrink-0 rounded-xl" sizes="64px" />
              <div className="min-w-0">
                <p className="line-clamp-2 font-semibold leading-snug">{title}</p>
                <p className="truncate text-sm text-muted">{target.kind === "e" ? `${target.detail.listing.venueName}, ${target.detail.area.name}` : target.detail.area.name}</p>
              </div>
            </div>
            {firstSession && !draft.passMode && (
              <p className="rounded-xl bg-field px-3 py-2 text-sm">
                {formatDate(fromISO(firstSession.startsAt).ymd)} · {formatRange(firstSession.startsAt, firstSession.endsAt)}
              </p>
            )}
            {target.kind === "v" && avail.data && <p className="rounded-xl bg-field px-3 py-2 text-sm">{formatDate(avail.data.date)}</p>}
            {current.id !== "review" && target.kind === "e" && ticketSel && ticketSel.lines.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {ticketSel.lines.map((l) => (
                  <li key={l.t.id} className="flex justify-between gap-2">
                    <span>
                      {l.qty} × {l.t.name}
                    </span>
                    <span className="tabular-nums">{formatINR(l.qty * l.t.price, { free: "Free" })}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-sm text-muted">{summary}</span>
              {hint ? <span className="text-sm font-semibold text-muted">{hint}</span> : <span className="font-display text-2xl font-extrabold">{total === null ? "-" : formatINR(total, { free: "Free" })}</span>}
            </div>
            <Button size="lg" block disabled={ctaDisabled} loading={ctaLoading} onClick={onCta} className="font-bold">
              {ctaLabel}
            </Button>
            {!hint && current.id !== "review" && total !== null && total > 0 && <p className="-mt-2 text-center text-xs text-muted">Convenience fee and GST shown at review</p>}
          </div>
        </aside>
      </div>

      {/* Phone bottom bar: summary + total + CTA, or one wide button on review */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface md:hidden">
        <div className="flex min-h-[92px] items-center gap-4 px-5 pb-2">
          {!onReview && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted">{summary}</p>
              {hint ? <p className="truncate text-[15px] font-semibold leading-tight text-muted">{hint}</p> : <p className="truncate font-display text-2xl font-extrabold leading-tight">{total === null ? "-" : formatINR(total, { free: "Free" })}</p>}
            </div>
          )}
          <Button size="lg" disabled={ctaDisabled} loading={ctaLoading} onClick={onCta} className={cn("font-bold", onReview ? "flex-1" : "px-8")}>
            {ctaLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** "Tickets ━ Details ━ Payment": labels and bars fill up to the current step (wireframe 09). */
function Stepper({ labels, at, className }: { labels: string[]; at: number; className?: string }) {
  return (
    <ol className={cn("flex items-center gap-1.5 text-xs font-bold", className)} aria-label="Booking steps">
      {labels.map((l, i) => (
        <li key={l} className={cn("flex items-center gap-1.5", i < labels.length - 1 && "flex-1")} aria-current={i === at ? "step" : undefined}>
          <span className={i <= at ? "text-brand" : "text-subtle"}>{l}</span>
          {i < labels.length - 1 && <span className={cn("h-[3px] flex-1 rounded-full", i <= at ? "bg-brand" : "bg-line-strong")} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function JourneySkeleton() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 pt-20 md:px-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </div>
  );
}
