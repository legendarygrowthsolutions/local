import { z } from "zod";

export const BookingStatusSchema = z.enum([
  "held",
  "pending_payment",
  "requested",
  "confirmed",
  "failed",
  "expired",
  "cancelled",
  "refunded",
  "checked_in",
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const BookingItemSchema = z.object({
  ticketTypeId: z.string().nullable(),
  sessionId: z.string().nullable(),
  resourceId: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  label: z.string(),
  qty: z.number(),
  unitPrice: z.number(),
});
export type BookingItem = z.infer<typeof BookingItemSchema>;

export const PriceBreakdownSchema = z.object({
  subtotal: z.number(),
  discount: z.number(),
  convenienceFee: z.number(),
  gstOnFee: z.number(),
  total: z.number(),
});
export type PriceBreakdown = z.infer<typeof PriceBreakdownSchema>;

export const AttendeeSchema = z.object({
  name: z.string().trim().max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  /** Where e-tickets go (optional; SMS/WhatsApp always use the phone) */
  email: z.string().max(120).email("Enter a valid email").or(z.literal("")).optional(),
  answers: z.record(z.string().max(40), z.string().max(300)).refine((a) => Object.keys(a).length <= 12, "Too many answers"),
});

export const BookingSchema = z.object({
  id: z.string(),
  code: z.string(),
  userId: z.string(),
  kind: z.enum(["listing", "venue"]),
  listingId: z.string().nullable(),
  venueId: z.string().nullable(),
  cityId: z.string(),
  title: z.string(),
  venueName: z.string(),
  status: BookingStatusSchema,
  items: z.array(BookingItemSchema),
  price: PriceBreakdownSchema,
  couponCode: z.string().nullable(),
  attendee: AttendeeSchema.nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  holdExpiresAt: z.string().nullable(),
  createdAt: z.string(),
  paymentRef: z.string().nullable(),
  /** Mirrors fixture "sold" counts / seeded court occupancy; excluded from inventory maths. */
  seeded: z.boolean().optional(),
  checkedInAt: z.string().nullable().optional(),
});
export type Booking = z.infer<typeof BookingSchema>;

/** Request body for POST /api/bookings/hold */
export const HoldRequestSchema = z.object({
  kind: z.enum(["listing", "venue"]),
  targetId: z.string().max(60),
  sessionId: z.string().max(60).nullable().optional(),
  tickets: z
    .array(z.object({ ticketTypeId: z.string().max(60), qty: z.number().int().min(1).max(50) }))
    .max(20)
    .optional(),
  slots: z
    .object({
      resourceId: z.string().max(60),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      startMins: z.number().int(),
      endMins: z.number().int(),
    })
    .optional(),
  attendee: AttendeeSchema.optional(),
  couponCode: z.string().max(30).optional(),
});
export type HoldRequest = z.infer<typeof HoldRequestSchema>;

export const PayRequestSchema = z.object({
  method: z.enum(["upi", "card", "netbanking", "wallet"]),
  outcome: z.enum(["success", "failure"]),
});
export type PayRequest = z.infer<typeof PayRequestSchema>;
