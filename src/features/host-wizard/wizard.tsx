"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronLeft, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { ListingInputSchema, type EventListingInput, type ListingInput, type VenueInput } from "@/contracts";
import { useSaveListing } from "@/lib/api/host-hooks";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Cover } from "@/components/ui/cover";
import { formatINR } from "@/lib/pricing";
import { formatDate, formatMins } from "@/lib/time";
import { cn } from "@/lib/utils";
import { isEvent, newEvent, newVenue } from "./defaults";
import { BookingModes } from "./booking-setup";
import { EventBasics, EventLocation, EventPolicies, EventSetup, EventTickets } from "./steps-event";
import { VenueBasics, VenueCourts, VenueLocation, VenuePolicies, VenuePricing } from "./steps-venue";
import type { StepId, WizardCatalog, WizardHost } from "./types";

// Wireframe 20 step names; events and venues share them.
const STEP_LABEL: Record<StepId, string> = {
  kind: "Booking type",
  basics: "Basics",
  location: "Location & media",
  setup: "Booking setup",
  tickets: "Pricing",
  courts: "Booking setup",
  pricing: "Pricing",
  policies: "Policies & form",
  review: "Review & submit",
};
const STEP_HEADING: Partial<Record<StepId, { title: string; sub: string }>> = {
  setup: { title: "How do people book?", sub: "Pick a booking journey. Templates are managed by the admin team." },
  courts: { title: "How do people book?", sub: "Pick a booking journey. Templates are managed by the admin team." },
};
const STEP_FIELDS: Record<StepId, string[]> = {
  kind: [],
  basics: ["title", "categoryId", "subcategoryId", "summary", "description", "ageLimit", "languages", "name"],
  location: ["areaId", "venueName", "address", "media", "amenities"],
  setup: ["templateId", "sessions"],
  tickets: ["tickets"],
  courts: ["courts", "openMins", "closeMins", "advanceDays", "maxMins", "bufferMins"],
  pricing: [],
  policies: ["thingsToKnow", "formFields", "externalUrl"],
  review: [],
};

function stepsFor(input: ListingInput, catalog: WizardCatalog): StepId[] {
  if (!isEvent(input)) return ["basics", "location", "courts", "pricing", "policies", "review"];
  const tpl = catalog.templates.find((t) => t.id === input.templateId);
  const skipTickets = tpl && (tpl.bookingMode === "rsvp" || tpl.bookingMode === "none");
  return ["basics", "location", "setup", ...(skipTickets ? [] : (["tickets"] as StepId[])), "policies", "review"];
}

/** Template-level rules the zod schema can't express (mirrors services/host.ts). */
function extraErrors(input: ListingInput, catalog: WizardCatalog): Record<string, string> {
  const e: Record<string, string> = {};
  if (input.kind === "venue") {
    if (input.closeMins <= input.openMins) e.closeMins = "Closing time must be after opening time";
    return e;
  }
  const tpl = catalog.templates.find((t) => t.id === input.templateId);
  if (!tpl) return e;
  const n = input.sessions.length;
  if (tpl.schedule === "single" && n !== 1) e.sessions = "This booking type has exactly one date";
  if ((tpl.schedule === "multi_day" || tpl.schedule === "recurring") && n < 2) e.sessions = "Add at least two dates";
  if (tpl.schedule === "date_range" && n < 1) e.sessions = "Add at least one entry window";
  if ((tpl.bookingMode === "ticketed" || tpl.bookingMode === "registration") && input.tickets.length === 0) e.tickets = tpl.bookingMode === "registration" ? "Add at least one division" : "Add at least one ticket type";
  return e;
}

const DRAFT_KEY = "lcl-host-listing-draft";

export function ListingWizard({
  catalog,
  host,
  id,
  initial,
  status,
  pendingReview = false,
  revisionNote = null,
}: {
  catalog: WizardCatalog;
  host: WizardHost;
  id?: string;
  initial?: ListingInput;
  status?: string;
  /** A material edit to this live listing is waiting for review (the editor shows that edit). */
  pendingReview?: boolean;
  /** Why the last edit to this live listing was declined. */
  revisionNote?: string | null;
}) {
  const router = useRouter();
  const [input, setInput] = useState<ListingInput>(initial ?? (host.type === "venue" ? newVenue() : newEvent()));
  const steps = useMemo(() => stepsFor(input, catalog), [input, catalog]);
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [decided, setDecided] = useState(false);
  const savedDraft = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(DRAFT_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const showRestore = !id && !decided && !!savedDraft;
  const save = useSaveListing(id);
  const top = useRef<HTMLDivElement>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Local autosave for new listings (starts once the host edits or decides on a saved draft).
  useEffect(() => {
    if (id || !decided) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(input));
    } catch {}
  }, [input, id, decided]);

  const set = (p: Partial<ListingInput>) => {
    setDecided(true);
    if (!id) setSavedAt(Date.now()); // the autosave effect writes it locally
    setInput((x) => ({ ...x, ...p }) as ListingInput);
  };

  const allErrors = (inp: ListingInput) => {
    const res = ListingInputSchema.safeParse(inp);
    const errs: Record<string, string> = {};
    if (!res.success) for (const i of res.error.issues) errs[String(i.path[0])] ??= i.message;
    return { ...errs, ...extraErrors(inp, catalog) };
  };

  const go = (i: number) => {
    setStepIdx(i);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const next = () => {
    const errs = allErrors(input);
    const mine = Object.fromEntries(Object.entries(errs).filter(([k]) => STEP_FIELDS[step].includes(k)));
    setErrors(mine);
    if (Object.keys(mine).length) return;
    go(stepIdx + 1);
  };

  const submit = (submitForReview: boolean) => {
    if (submitForReview) {
      const errs = allErrors(input);
      setErrors(errs);
      if (Object.keys(errs).length) return toast.error("A few things need fixing first");
    }
    save.mutate(
      { input, submit: submitForReview },
      {
        onSuccess: (r) => {
          if (!id) localStorage.removeItem(DRAFT_KEY);
          toast.success(
            r.pendingReview
              ? "Changes sent for review. Your listing stays live as it is until they're approved."
              : r.status === "review"
                ? "Sent for review — we usually approve within a day"
                : r.status === "live"
                  ? "Changes are live"
                  : "Draft saved",
          );
          router.push("/host/listings");
          router.refresh();
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save"),
      },
    );
  };

  const isLive = status === "live";
  const name = (isEvent(input) ? input.title : (input as VenueInput).name).trim();
  const title = id ? name || "Edit listing" : `New listing${name ? `: ${name}` : ""}`;

  const heading = STEP_HEADING[step] ?? { title: STEP_LABEL[step], sub: "" };
  const nextLabel = STEP_LABEL[steps[stepIdx + 1]];

  return (
    <div ref={top} className="min-h-dvh">
      {/* Editor bar (wireframe 20) */}
      <header className="sticky top-0 z-30 border-b border-[#e6e6e1] bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 md:px-8">
          <Link href="/host/listings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden /> Listings
          </Link>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</span>
          {!isLive && (
            <button type="button" onClick={() => submit(false)} disabled={save.isPending} className="text-[13px] text-muted hover:text-ink disabled:opacity-60">
              {save.isPending && !save.variables?.submit ? "Saving…" : savedAt ? `Draft saved · ${new Date(savedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Save draft"}
            </button>
          )}
          <Button variant="secondary" size="sm" className="h-10 rounded-[10px] px-4" onClick={() => go(steps.indexOf("review"))}>
            Preview
          </Button>
        </div>
      </header>
      {isLive && (pendingReview || revisionNote) && (
        <div role="status" className={cn("mx-4 mt-4 rounded-xl p-3.5 text-sm md:mx-8", pendingReview ? "bg-warn-tint text-ink" : "bg-danger-tint text-danger")}>
          {pendingReview
            ? "Your last changes are waiting for review. Guests still see the live version; you can keep editing and resubmit."
            : `Your last changes weren't approved: ${revisionNote}`}
        </div>
      )}

      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 md:px-8 md:py-7">
        {showRestore && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-tint px-4 py-3">
            <p className="flex-1 text-sm">You have an unsaved listing from earlier.</p>
            <Button
              size="sm"
              onClick={() => {
                try {
                  setInput(JSON.parse(savedDraft!));
                  setStepIdx(0);
                } catch {}
                setDecided(true);
              }}
            >
              Restore it
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                localStorage.removeItem(DRAFT_KEY);
                setDecided(true);
              }}
            >
              Start fresh
            </Button>
          </div>
        )}
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Steps" className="hidden flex-col gap-0.5 lg:flex">
            {steps.map((s, i) => {
              const done = i < stepIdx;
              const cur = i === stepIdx;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={i > stepIdx}
                  onClick={() => go(i)}
                  aria-current={cur ? "step" : undefined}
                  className={cn("flex min-h-[42px] items-center gap-2.5 rounded-xl text-left text-sm", cur ? "font-bold text-ink" : done ? "font-medium text-ink hover:bg-field" : "font-medium text-muted")}
                >
                  <span className={cn("grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] text-xs font-semibold", done ? "border-brand bg-brand text-white" : cur ? "border-ink text-ink" : "border-line-strong")}>
                    {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  {STEP_LABEL[s]}
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <p className="text-sm font-semibold text-brand lg:hidden">
                Step {stepIdx + 1} of {steps.length} · {STEP_LABEL[step]}
              </p>
              <h1 className="font-display text-[28px] font-bold leading-tight">{heading.title}</h1>
              {heading.sub && <p className="text-sm text-muted">{heading.sub}</p>}
              <div className="mt-3 flex gap-1 lg:hidden" aria-hidden>
                {steps.map((s, i) => (
                  <span key={s} className={cn("h-1 flex-1 rounded-full", i <= stepIdx ? "bg-brand" : "bg-line-strong")} />
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <m.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="flex flex-col gap-5">
                {(step === "setup" || step === "courts") && (
                  <BookingModes
                    input={input}
                    replace={(i) => {
                      setDecided(true);
                      if (!id) setSavedAt(Date.now());
                      setErrors({});
                      setInput(i);
                    }}
                    setEvent={set as (p: Partial<EventListingInput>) => void}
                    catalog={catalog}
                    host={host}
                    onNeedCategory={() => go(0)}
                  />
                )}
                {isEvent(input) ? (
                  <EventStep step={step} v={input} set={set as (p: Partial<EventListingInput>) => void} errors={errors} catalog={catalog} host={host} />
                ) : (
                  <VenueStep step={step} v={input} set={set as (p: Partial<VenueInput>) => void} errors={errors} catalog={catalog} host={host} />
                )}
                {step === "review" && <Review input={input} catalog={catalog} errors={errors} onJump={(s) => go(steps.indexOf(s))} isLive={isLive} />}
              </m.div>
            </AnimatePresence>

            <div className="sticky bottom-0 z-10 -mx-4 flex justify-between gap-3 border-t border-line bg-ground/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
              {stepIdx > 0 ? (
                <Button variant="secondary" size="lg" className="h-[46px] rounded-xl px-5" onClick={() => go(stepIdx - 1)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              {step === "review" ? (
                <Button size="lg" className="h-[46px] rounded-xl px-6 font-bold" onClick={() => submit(true)} loading={save.isPending && !!save.variables?.submit}>
                  {isLive ? "Save changes" : status === "review" ? "Update submission" : "Submit for review"}
                </Button>
              ) : (
                <Button size="lg" className="h-[46px] rounded-xl px-6 font-bold" onClick={next}>
                  <span className="md:hidden">Continue →</span>
                  <span className="hidden md:inline">Continue to {nextLabel?.toLowerCase()} →</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventStep(p: { step: StepId; v: EventListingInput; set: (p: Partial<EventListingInput>) => void; errors: Record<string, string>; catalog: WizardCatalog; host: WizardHost }) {
  switch (p.step) {
    case "basics":
      return <EventBasics {...p} />;
    case "location":
      return <EventLocation {...p} />;
    case "setup":
      return <EventSetup {...p} />;
    case "tickets":
      return <EventTickets {...p} />;
    case "policies":
      return <EventPolicies {...p} />;
    default:
      return null;
  }
}

function VenueStep(p: { step: StepId; v: VenueInput; set: (p: Partial<VenueInput>) => void; errors: Record<string, string>; catalog: WizardCatalog; host: WizardHost }) {
  switch (p.step) {
    case "basics":
      return <VenueBasics {...p} />;
    case "location":
      return <VenueLocation {...p} />;
    case "courts":
      return <VenueCourts {...p} />;
    case "pricing":
      return <VenuePricing {...p} />;
    case "policies":
      return <VenuePolicies {...p} />;
    default:
      return null;
  }
}

function Review({ input, catalog, errors, onJump, isLive }: { input: ListingInput; catalog: WizardCatalog; errors: Record<string, string>; onJump: (s: StepId) => void; isLive: boolean }) {
  const errKeys = Object.keys(errors);
  const stepOf = (k: string) => (Object.entries(STEP_FIELDS).find(([, f]) => f.includes(k))?.[0] ?? "basics") as StepId;
  const area = catalog.areas.find((a) => a.id === input.areaId);
  let rows: [string, string, StepId][] = [];
  let cardTitle = "";
  let cardWhen = "";
  let cardPrice = "";
  let cardIcon = "Sparkles";
  if (isEvent(input)) {
    const tpl = catalog.templates.find((t) => t.id === input.templateId);
    const cat = catalog.categories.find((c) => c.id === input.categoryId);
    const sub = cat?.children.find((s) => s.id === input.subcategoryId);
    const first = input.sessions[0];
    const prices = input.tickets.map((t) => t.price);
    cardTitle = input.title || "Untitled";
    cardIcon = sub?.icon ?? cat?.icon ?? "Sparkles";
    cardWhen = first ? `${formatDate(first.date)} · ${formatMins(first.startMins, { compact: true })}${input.sessions.length > 1 ? ` · ${input.sessions.length} dates` : ""}` : "No dates";
    cardPrice = tpl?.bookingMode === "rsvp" || tpl?.bookingMode === "none" || !prices.length || Math.max(...prices) === 0 ? "Free" : `${formatINR(Math.min(...prices))}${prices.length > 1 ? " onwards" : ""}`;
    rows = [
      ["Category", [cat?.name, sub?.name].filter(Boolean).join(" · ") || "—", "basics"],
      ["Where", `${input.venueName || "—"}, ${area?.name ?? "—"}`, "location"],
      ["Photos", input.media.length ? `${input.media.length} added` : "None — artwork will be generated", "location"],
      ["Booking type", tpl?.name ?? "—", "setup"],
      ["Dates", `${input.sessions.length} ${input.sessions.length === 1 ? "date" : "dates"}`, "setup"],
      ...(tpl && (tpl.bookingMode === "ticketed" || tpl.bookingMode === "registration") ? ([["Tickets", input.tickets.map((t) => `${t.name} ${formatINR(t.price, { free: "Free" })}`).join(", ") || "—", "tickets"]] as [string, string, StepId][]) : []),
      ["Things to know", `${input.thingsToKnow.length} points`, "policies"],
      ["Questions", `${input.formFields.length}`, "policies"],
    ];
  } else {
    cardTitle = input.name || "Untitled venue";
    cardIcon = "Activity";
    cardWhen = `${input.courts.length} courts · ${formatMins(input.openMins, { compact: true })} – ${formatMins(input.closeMins, { compact: true })}`;
    cardPrice = `${formatINR(Math.min(...input.courts.map((c) => c.priceBase)))}/hr onwards`;
    rows = [
      ["Where", `${area?.name ?? "—"} · ${input.address || "—"}`, "location"],
      ["Courts", input.courts.map((c) => `${c.name} (${c.sport.replace("-", " ")}, ${c.slotLengthMins}m)`).join(", "), "courts"],
      ["Booking window", `${input.advanceDays} days ahead · up to ${input.maxMins / 60} h`, "courts"],
      ["Peak", [input.peakWeekdayEvenings && "weekday evenings", input.peakWeekends && "weekends"].filter(Boolean).join(", ") || "None", "pricing"],
      ["Amenities", input.amenities.join(", ") || "—", "location"],
    ];
  }
  return (
    <>
      {errKeys.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-[#f1c6bc] bg-danger-tint p-4">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <CircleAlert className="size-4" /> Fix these before submitting
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {errKeys.map((k) => (
              <li key={k}>
                <button type="button" onClick={() => onJump(stepOf(k))} className="text-left underline-offset-2 hover:underline">
                  {errors[k]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
        <dl className="divide-y divide-line rounded-[20px] border border-line bg-surface">
          {rows.map(([k, val, s]) => (
            <div key={k} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <dt className="shrink-0 text-muted">{k}</dt>
              <dd className="min-w-0 flex-1 text-right font-semibold">{val}</dd>
              <button type="button" onClick={() => onJump(s)} className="shrink-0 text-sm font-semibold text-brand">
                Edit
              </button>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Card preview</p>
          <div className="flex flex-col gap-3">
            <Cover media={input.media} tone={2} icon={cardIcon} alt="" className="aspect-[4/3] rounded-[20px]" sizes="280px" />
            <div className="flex flex-col gap-1 px-0.5">
              <p className="line-clamp-2 text-[17px] font-semibold leading-snug">{cardTitle}</p>
              <p className="truncate text-sm text-muted">
                {cardWhen} · {area?.name ?? "Area"}
              </p>
              <p className={cn("text-sm font-semibold", cardPrice === "Free" ? "text-free" : "")}>{cardPrice}</p>
            </div>
          </div>
        </div>
      </div>
      <p className="text-sm text-muted">
        {isLive
          ? "New dates, capacity, hours and notes apply straight away. Changes to what guests book (title, details, photos, location, prices, tickets or courts) are reviewed first; the live version stays up meanwhile."
          : "The local. team reviews new listings, usually within a day. You'll get a text when it's live."}
      </p>
    </>
  );
}
