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

export const ReschedulePolicySchema = z.object({
  allowed: z.boolean(),
  /** Moves close this many hours before the start. */
  hoursBefore: z.number().min(0).max(336),
  /** How many times one booking can be moved. */
  maxTimes: z.number().int().min(1).max(10),
});
export type ReschedulePolicy = z.infer<typeof ReschedulePolicySchema>;
export const DEFAULT_RESCHEDULE: ReschedulePolicy = { allowed: false, hoursBefore: 24, maxTimes: 1 };

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
  /**
   * Platform default for moving a booking to another slot or date (hosts can switch it off or
   * tighten it in their settings). A move never costs more than the original; any difference the
   * other way isn't refunded.
   */
  reschedule: ReschedulePolicySchema.default(DEFAULT_RESCHEDULE),
  ctaLabel: z.string(),
  active: z.boolean(),
});
export type JourneyTemplate = z.infer<typeof JourneyTemplateSchema>;
