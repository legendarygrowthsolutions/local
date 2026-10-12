import { z } from "zod";

export const BookingModeSchema = z.enum(["none", "rsvp", "ticketed", "slot", "registration"]);
export type BookingMode = z.infer<typeof BookingModeSchema>;

export const StepTypeSchema = z.enum([
  "pick_session",
  "pick_pass",
  "pick_tickets",
  "pick_sport",
  "pick_resource",
  "pick_slots",
  "team_details",
  "attendee_form",
  "review",
  "payment",
  "confirmation",
]);
export type StepType = z.infer<typeof StepTypeSchema>;

export const StepConfigSchema = z.object({
  type: StepTypeSchema,
  required: z.boolean(),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type StepConfig = z.infer<typeof StepConfigSchema>;

export const JourneyTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  allowedCategories: z.array(z.string()),
  bookingMode: BookingModeSchema,
  schedule: z.enum(["single", "multi_day", "recurring", "date_range", "open_hours"]),
  pricing: z.enum(["free", "paid", "both"]),
  ticketScope: z.enum(["per_session", "pass", "both"]).nullable(),
  steps: z.array(StepConfigSchema),
  rules: z.object({
    seatHoldMins: z.number(),
    waitlist: z.boolean(),
    hostApprovalPerBooking: z.boolean(),
    transferable: z.boolean(),
    maxPerOrder: z.number(),
    minPerOrder: z.number(),
  }),
  fees: z.object({
    convenienceFeePct: z.number(),
    convenienceFeeFlat: z.number(),
    gstOnFeePct: z.number(),
    absorbFeeAllowed: z.boolean(),
  }),
  cancellation: z.object({
    policy: z.enum(["none", "full_until", "partial"]),
    hoursBefore: z.number(),
    refundPct: z.number(),
  }),
  ctaLabel: z.string(),
  active: z.boolean(),
});
export type JourneyTemplate = z.infer<typeof JourneyTemplateSchema>;
