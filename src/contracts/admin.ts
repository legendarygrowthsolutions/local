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
