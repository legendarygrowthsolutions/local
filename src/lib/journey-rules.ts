import type { StepType, TemplateInput } from "@/contracts";

const SLOT_STEPS: StepType[] = ["pick_sport", "pick_resource", "pick_slots"];

/** Keeps every template a journey the booking engine can actually run. */
export function templateErrors(t: TemplateInput): string[] {
  const e: string[] = [];
  const types = t.steps.map((s) => s.type);
  const has = (x: StepType) => types.includes(x);
  const idx = (x: StepType) => types.indexOf(x);
  if (new Set(types).size !== types.length) e.push("Each step can appear only once");
  if (t.bookingMode === "none") {
    if (types.length) e.push("Info-only templates have no booking steps");
    if (t.pricing !== "free") e.push("Info-only templates must be free");
    return e;
  }
  if (!has("confirmation")) e.push("Every booking journey ends with a confirmation step");
  else if (idx("confirmation") !== types.length - 1) e.push("Confirmation must be the last step");
  if (t.bookingMode === "slot") {
    for (const s of ["pick_resource", "pick_slots"] as StepType[]) if (!has(s)) e.push(`Slot bookings need “${s.replace("_", " ")}”`);
    if (t.schedule !== "open_hours") e.push("Slot bookings use the open-hours schedule");
    if (t.allowedCategories.some((c) => c !== "sports")) e.push("Slot bookings are for sports venues only");
  } else {
    if (SLOT_STEPS.some(has)) e.push("Sport, court and slot steps are only for slot bookings");
    if (t.schedule === "open_hours") e.push("Open hours is only for slot bookings");
    if (t.allowedCategories.includes("sports")) e.push("Sports venues use slot templates; pick other categories");
  }
  if (t.bookingMode === "ticketed" && !has("pick_tickets")) e.push("Ticketed journeys need a ticket step");
  if (t.bookingMode === "registration") {
    if (!has("pick_tickets")) e.push("Registrations need a division (ticket) step");
    if (!has("team_details")) e.push("Registrations need a team details step");
  }
  if (t.bookingMode === "rsvp") {
    if (t.pricing !== "free") e.push("RSVPs are free");
    if (has("payment")) e.push("RSVPs don't take payment");
    if (!has("attendee_form")) e.push("RSVPs need an attendee form");
  }
  if (has("pick_pass") && t.schedule !== "multi_day") e.push("Season passes only make sense for multi-day schedules");
  if (["multi_day", "recurring", "date_range"].includes(t.schedule) && t.bookingMode !== "rsvp" && !has("pick_session")) e.push("Multi-date schedules need a pick-date step");
  if (t.pricing !== "free" && t.bookingMode !== "rsvp") {
    if (!has("review")) e.push("Paid journeys need a review step");
    if (!has("payment")) e.push("Paid journeys need a payment step");
    if (has("review") && has("payment") && idx("payment") < idx("review")) e.push("Payment comes after review");
  }
  const lastSelect = Math.max(...(["pick_session", "pick_pass", "pick_tickets", ...SLOT_STEPS] as StepType[]).map(idx));
  const firstLater = Math.min(...(["attendee_form", "team_details", "review", "payment"] as StepType[]).map(idx).filter((i) => i >= 0));
  if (lastSelect >= 0 && Number.isFinite(firstLater) && lastSelect > firstLater) e.push("Selection steps come before details, review and payment");
  if (has("attendee_form") && has("review") && idx("attendee_form") > idx("review")) e.push("Attendee details come before review");
  if (t.rules.minPerOrder > t.rules.maxPerOrder) e.push("Minimum per order is above the maximum");
  if (t.cancellation.policy === "partial" && (t.cancellation.refundPct <= 0 || t.cancellation.refundPct >= 100)) e.push("Partial refunds are between 1 and 99%");
  return e;
}

