import { z } from "zod";
import { JourneyTemplateSchema } from "./journey";

export const HostDecisionSchema = z.object({
  decision: z.enum(["approved", "changes", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

export const DocumentDecisionSchema = z.object({ status: z.enum(["verified", "rejected", "uploaded"]) });

export const ListingDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
  /** Decide the pending edit to a live listing rather than the listing itself. */
  revision: z.boolean().optional(),
});

export const FeatureSchema = z.object({ featured: z.boolean() });

export const TemplateInputSchema = JourneyTemplateSchema.omit({ id: true }).extend({
  name: z.string().trim().min(3, "Name the template").max(60),
  description: z.string().trim().min(8, "Describe when to use it").max(200),
  ctaLabel: z.string().trim().min(2, "Button label is required").max(24),
  allowedCategories: z.array(z.string()).min(1, "Allow at least one category"),
});
export type TemplateInput = z.infer<typeof TemplateInputSchema>;

export const CategoryInputSchema = z.object({
  name: z.string().trim().min(2, "Name it").max(40),
  singular: z.string().trim().max(40).optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only")
    .min(2)
    .max(40),
  parentId: z.string().nullable(),
  icon: z.string().min(1),
  blurb: z.string().trim().max(120).optional(),
  sort: z.number().int().optional(),
});
export type CategoryInput = z.infer<typeof CategoryInputSchema>;

export const CityInputSchema = z.object({
  name: z.string().trim().min(2).max(40),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only").min(2).max(40),
  state: z.string().trim().min(2).max(40),
  lat: z.number().min(6).max(38),
  lng: z.number().min(68).max(98),
  tagline: z.string().trim().max(60),
  active: z.boolean(),
});
export type CityInput = z.infer<typeof CityInputSchema>;

export const AreaInputSchema = z.object({
  cityId: z.string(),
  name: z.string().trim().min(2).max(40),
  lat: z.number().min(6).max(38),
  lng: z.number().min(68).max(98),
});

export const RefundSchema = z.object({ refundPct: z.union([z.literal(0), z.literal(50), z.literal(100)]), reason: z.string().trim().max(200).optional() });

export const UserRoleSchema = z.object({ role: z.enum(["user", "admin"]) });

// ---------- Coupons ----------
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31");

export const CouponInputSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,20}$/, "Use 4 to 20 letters or digits, no spaces"),
    description: z.string().trim().min(4, "Add a short description").max(120),
    type: z.enum(["pct", "flat"]),
    value: z.number().positive("Enter a discount above zero"),
    /** Cap on a percentage discount, in rupees. Ignored for flat coupons. */
    maxDiscount: z.number().min(0).max(100000),
    minSubtotal: z.number().min(0).max(1000000),
    perUserLimit: z.number().int().min(1).max(100).nullable(),
    totalLimit: z.number().int().min(1).max(1000000).nullable(),
    firstBookingOnly: z.boolean(),
    cityId: z.string().max(60).nullable(),
    /** Dates in IST, inclusive. */
    validFrom: ymd.nullable(),
    validUntil: ymd.nullable(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "pct" && v.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage can't be more than 100" });
    if (v.type === "pct" && v.maxDiscount <= 0) ctx.addIssue({ code: "custom", path: ["maxDiscount"], message: "Set the most a percentage coupon can take off" });
    if (v.type === "flat" && v.value > 100000) ctx.addIssue({ code: "custom", path: ["value"], message: "That discount is too large" });
    if (v.validFrom && v.validUntil && v.validUntil < v.validFrom) ctx.addIssue({ code: "custom", path: ["validUntil"], message: "The end date is before the start date" });
  });
export type CouponInput = z.infer<typeof CouponInputSchema>;

// ---------- Payouts ----------
const rupees = z.number().min(0).max(100000000);

export const PayoutInputSchema = z.object({
  hostId: z.string().max(60),
  cycleFrom: ymd,
  /** TDS or any other amount withheld, in rupees. */
  deductions: rupees,
  /** Manual correction (can be negative), in rupees. */
  adjustment: z.number().min(-100000000).max(100000000),
  method: z.enum(["bank_transfer", "upi", "cheque", "other"]),
  reference: z.string().trim().min(4, "Enter the UTR or transaction reference").max(60),
  paidOn: ymd,
  notes: z.string().trim().max(500).optional(),
});
export type PayoutInput = z.infer<typeof PayoutInputSchema>;

export const PayoutVoidSchema = z.object({ reason: z.string().trim().min(4, "Say why this record is being voided").max(300) });
