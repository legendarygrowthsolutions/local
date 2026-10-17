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

export const BookingSourceSchema = z.enum(["online", "host"]);
export type BookingSource = z.infer<typeof BookingSourceSchema>;
/** `online` = paid through the gateway; the rest are recorded by the host. */
export const PaymentMethodSchema = z.enum(["online", "cash", "upi", "card", "pay_later", "complimentary"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
/** Methods a host can record for money taken at the venue. */
export const OFFLINE_METHODS = ["cash", "upi", "card"] as const;

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
  /** Where the booking came from: the guest online, or the host's console (walk-in, phone, bulk). */
  source: BookingSourceSchema.optional(),
  /** How the money was (or will be) collected. Online bookings use the gateway; host bookings record cash, UPI, pay-later or complimentary. */
  paymentMethod: PaymentMethodSchema.nullable().optional(),
  /** Still to be collected at the venue (pay-later bookings, extensions and charges added after payment). Rupees. */
  amountDue: z.number().optional(),
  /** Host-only note (e.g. "regular, pays monthly"). Never shown to the guest. */
  notes: z.string().nullable().optional(),
  rescheduledCount: z.number().optional(),
  /** Original start, kept after the first move. */
  rescheduledFrom: z.string().nullable().optional(),
  /** Host team member who created a host booking. */
  createdBy: z.string().nullable().optional(),
  /** Links the bookings made by one bulk action. */
  groupId: z.string().nullable().optional(),
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

/** Test gateway: the pay screen chooses the outcome. Razorpay: the checkout handler's signed result. */
export const PayRequestSchema = z.union([
  z.object({
    method: z.enum(["upi", "card", "netbanking", "wallet"]),
    outcome: z.enum(["success", "failure"]),
  }),
  z.object({
    razorpayOrderId: z.string().max(64),
    razorpayPaymentId: z.string().max(64),
    razorpaySignature: z.string().max(128),
  }),
]);
export type PayRequest = z.infer<typeof PayRequestSchema>;
export type TestPayRequest = Extract<PayRequest, { outcome: string }>;

/** Moving a booking: a new slot for courts (same duration), or another date for multi-date listings. */
export const RescheduleRequestSchema = z.union([
  z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startMins: z.number().int().min(0).max(1440 * 2), resourceId: z.string().max(60).optional() }),
  z.object({ sessionId: z.string().max(60) }),
]);
export type RescheduleRequest = z.infer<typeof RescheduleRequestSchema>;
