import { z } from "zod";

export const SessionSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  startsAt: z.string(), // ISO with +05:30
  endsAt: z.string(),
  capacity: z.number(),
  /** Seats sold outside this system (e.g. on another channel); bookings are counted separately. */
  sold: z.number().optional(),
  label: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

export const TicketTypeSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  sessionId: z.string().nullable(), // null = valid for any session
  name: z.string(),
  description: z.string(),
  price: z.number(), // rupees
  qty: z.number(),
  sold: z.number(),
  perOrderMax: z.number(),
  isPass: z.boolean(),
});
export type TicketType = z.infer<typeof TicketTypeSchema>;

export const FormFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["text", "select", "phone", "number"]),
  options: z.array(z.string()).optional(),
  required: z.boolean(),
});
export type FormField = z.infer<typeof FormFieldSchema>;

export const ListingSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  cityId: z.string(),
  areaId: z.string(),
  categoryId: z.string(),
  subcategoryId: z.string().nullable(),
  templateId: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  description: z.string(),
  media: z.array(z.string()),
  venueName: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  ageLimit: z.string(),
  languages: z.array(z.string()),
  tags: z.array(z.string()),
  thingsToKnow: z.array(z.string()),
  externalUrl: z.string().nullable(),
  status: z.enum(["draft", "review", "live", "ended", "rejected"]),
  featuredRank: z.number().nullable(),
  formFields: z.array(FormFieldSchema),
  createdAt: z.string(),
  reviewNote: z.string().nullable().optional(),
});
export type Listing = z.infer<typeof ListingSchema>;

export const ResourceSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  sport: z.string(), // subcategory slug
  indoor: z.boolean(),
  surface: z.string(),
  slotLengthMins: z.number(),
  capacity: z.number(),
});
export type Resource = z.infer<typeof ResourceSchema>;

export const PeakWindowSchema = z.object({
  days: z.array(z.number()), // 0 = Sunday
  fromMins: z.number(),
  toMins: z.number(),
});

export const SlotRuleSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  openMins: z.number(), // minutes from midnight IST
  closeMins: z.number(),
  minMins: z.number(),
  maxMins: z.number(),
  bufferMins: z.number(),
  advanceDays: z.number(),
  priceBase: z.number(), // per hour
  pricePeak: z.number(), // per hour
  peak: z.array(PeakWindowSchema),
});
export type SlotRule = z.infer<typeof SlotRuleSchema>;

export const BlockSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  reason: z.string(),
});
export type Block = z.infer<typeof BlockSchema>;

export const VenueSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  cityId: z.string(),
  areaId: z.string(),
  templateId: z.string(),
  slug: z.string(),
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  media: z.array(z.string()),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  amenities: z.array(z.string()),
  hoursLabel: z.string(),
  sports: z.array(z.string()), // subcategory slugs
  thingsToKnow: z.array(z.string()),
  featuredRank: z.number().nullable(),
  status: z.enum(["draft", "review", "live", "rejected"]),
  reviewNote: z.string().nullable().optional(),
});
export type Venue = z.infer<typeof VenueSchema>;
