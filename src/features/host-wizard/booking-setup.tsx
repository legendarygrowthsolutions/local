"use client";

import { Check } from "lucide-react";
import type { EventListingInput, ListingInput } from "@/contracts";
import { cn } from "@/lib/utils";
import { eventToVenue, isEvent, venueToEvent } from "./defaults";
import { applyTemplate } from "./steps-event";
import type { WizardCatalog, WizardHost } from "./types";

const MODES = [
  { mode: "none", name: "Info only", body: "Free listing, no booking. Directions + external link." },
  { mode: "rsvp", name: "Free RSVP", body: "Register with optional approval & cap." },
  { mode: "ticketed", name: "Ticketed", body: "Tiers, single / multi-day, passes." },
  { mode: "slot", name: "Slot booking", body: "Courts / resources with time slots." },
  { mode: "registration", name: "Registration", body: "Competitions: teams, divisions, entry fee." },
] as const;

/**
 * Top of "Booking setup" (wireframe 20): the five booking journeys. Slot booking turns the listing
 * into a court venue (and back), keeping the name, description, area, address and photos.
 */
export function BookingModes({
  input,
  replace,
  setEvent,
  catalog,
  host,
  onNeedCategory,
}: {
  input: ListingInput;
  replace: (i: ListingInput) => void;
  setEvent: (p: Partial<EventListingInput>) => void;
  catalog: WizardCatalog;
  host: WizardHost;
  onNeedCategory: () => void;
}) {
  const locked = host.kycStatus !== "verified";
  const event = isEvent(input) ? input : null;
  const cat = event ? catalog.categories.find((c) => c.id === event.categoryId) : null;
  const current = event ? catalog.templates.find((t) => t.id === event.templateId)?.bookingMode : "slot";
  const firstFor = (mode: string) => {
    const options = catalog.templates.filter((t) => t.bookingMode === mode && cat && t.allowedCategories.includes(cat.slug));
    return options.find((t) => !(t.pricing === "paid" && locked)) ?? null;
  };

  const pick = (mode: string) => {
    if (mode === "slot") {
      if (event) replace(eventToVenue(event));
      return;
    }
    const base = event ?? venueToEvent(input as Exclude<ListingInput, EventListingInput>);
    const baseCat = catalog.categories.find((c) => c.id === base.categoryId);
    if (!baseCat) {
      if (!event) replace(base);
      return onNeedCategory();
    }
    const tpl = catalog.templates.filter((t) => t.bookingMode === mode && t.allowedCategories.includes(baseCat.slug)).find((t) => !(t.pricing === "paid" && locked));
    if (!tpl) return;
    if (event) setEvent(applyTemplate(event, tpl, locked));
    else replace({ ...base, ...applyTemplate(base, tpl, locked) });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5" role="radiogroup" aria-label="Booking journey">
        {MODES.map((m) => {
          const on = current === m.mode;
          const unavailable = m.mode !== "slot" && !!event && !!cat && !firstFor(m.mode);
          return (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={unavailable}
              onClick={() => pick(m.mode)}
              className={cn(
                "flex flex-col gap-1.5 rounded-[14px] border-[1.5px] bg-surface p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                on ? "border-brand bg-tint" : "border-[#e6e6e1] hover:border-line-strong",
              )}
            >
              <b className={cn("flex items-center gap-1 text-sm", on && "text-brand-ink")}>
                {m.name}
                {on && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
              </b>
              <small className="text-xs leading-[1.35] text-muted">{unavailable ? `Not offered for ${cat?.name.toLowerCase()}` : m.body}</small>
            </button>
          );
        })}
      </div>
      {event && !cat && <p className="text-sm text-danger">Choose a category in Basics first. The booking types depend on it.</p>}
      {locked && <p className="text-xs text-muted">You can use paid booking types once your PAN and bank details are verified.</p>}
    </div>
  );
}
