import type { JourneyTemplate, Listing, StepType } from "@/contracts";

export type ScreenId = "select" | "details" | "review";

export interface Screen {
  id: ScreenId;
  title: string;
  steps: StepType[];
}

const SELECT_STEPS: StepType[] = ["pick_session", "pick_pass", "pick_tickets", "pick_sport", "pick_resource", "pick_slots"];
const DETAIL_STEPS: StepType[] = ["attendee_form", "team_details"];

/**
 * Turn a journey template's ordered steps into screens. Contiguous selection steps share
 * one screen (as in the wireframes), detail steps share another, then review.
 * Payment and confirmation are their own routes (/book/pay, /book/done).
 */
export function buildScreens(tpl: JourneyTemplate, listing?: Pick<Listing, "formFields"> | null): Screen[] {
  const screens: Screen[] = [];
  const select = tpl.steps.filter((s) => SELECT_STEPS.includes(s.type)).map((s) => s.type);
  const hasReview = tpl.steps.some((s) => s.type === "review");
  // With a review screen, name/phone/email and optional host questions are edited there (wireframe 12);
  // a separate details screen is only needed when the hold itself needs answers (required questions, team forms).
  const fields = listing?.formFields ?? [];
  const details = tpl.steps
    .filter((s) => DETAIL_STEPS.includes(s.type))
    .filter((s) => (s.required && (s.type === "team_details" || !hasReview)) || (hasReview ? fields.some((f) => f.required) : fields.length > 0))
    .map((s) => s.type);

  if (select.length || tpl.bookingMode === "rsvp") {
    screens.push({
      id: "select",
      title: tpl.bookingMode === "slot" ? "Pick a slot" : tpl.bookingMode === "registration" ? "Choose a division" : tpl.bookingMode === "rsvp" ? "RSVP" : "Choose tickets",
      steps: select,
    });
  }
  if (details.length) {
    screens.push({ id: "details", title: details.includes("team_details") ? "Team details" : "Your details", steps: details });
  }
  if (hasReview) screens.push({ id: "review", title: "Review booking", steps: ["review"] });
  return screens;
}

export const hasStep = (tpl: JourneyTemplate, t: StepType) => tpl.steps.some((s) => s.type === t);
