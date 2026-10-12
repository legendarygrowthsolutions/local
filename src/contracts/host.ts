import { z } from "zod";
import { FormFieldSchema } from "./listing";
import { PhoneSchema } from "./user";

export const HostRoleSchema = z.enum(["owner", "manager"]);
export type HostRole = z.infer<typeof HostRoleSchema>;

export const HostMemberSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  userId: z.string().nullable(),
  phone: z.string(),
  name: z.string().nullable(),
  role: HostRoleSchema,
  status: z.enum(["active", "invited"]),
  invitedBy: z.string().nullable(),
  createdAt: z.string(),
});
export type HostMember = z.infer<typeof HostMemberSchema>;

/** POST /api/host/apply */
export const HostApplicationSchema = z
  .object({
    type: z.enum(["organiser", "venue", "instructor", "community"]),
    brandName: z.string().trim().min(2, "Enter your brand or organisation name").max(60),
    cityId: z.string().min(1, "Choose a city"),
    contactName: z.string().trim().min(2, "Enter a contact name"),
    email: z.string().trim().email("Enter a valid email").or(z.literal("")),
    instagram: z.string().trim().max(40),
    website: z.string().trim().max(120),
    bio: z.string().trim().min(20, "Tell people a little more (20+ characters)").max(500),
    expectedPerMonth: z.enum(["1–2", "3–5", "6–10", "10+"]),
    wantsPaid: z.boolean(),
    gstin: z.string().trim().max(15),
    documents: z
      .array(
        z.object({
          kind: z.enum(["pan", "bank", "gst", "id_proof"]),
          fileName: z.string().trim().min(1).max(120),
          /** New upload as a data URL (PDF, JPEG, PNG or WebP). */
          data: z.string().max(3_000_000).optional(),
          /** Keep a file uploaded with an earlier submission. */
          mediaId: z.string().max(60).optional(),
        }),
      )
      .max(4),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.documents.map((d) => d.kind)).size !== v.documents.length)
      ctx.addIssue({ code: "custom", path: ["documents"], message: "Upload one file per document" });
    if (v.wantsPaid) {
      for (const k of ["pan", "bank"] as const)
        if (!v.documents.some((d) => d.kind === k))
          ctx.addIssue({ code: "custom", path: ["documents"], message: `Upload your ${k === "pan" ? "PAN card" : "bank proof"} to sell tickets` });
    }
    if (v.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.gstin.toUpperCase()))
      ctx.addIssue({ code: "custom", path: ["gstin"], message: "That doesn't look like a valid GSTIN" });
  });
export type HostApplicationInput = z.infer<typeof HostApplicationSchema>;

export const InviteSchema = z.object({ phone: PhoneSchema, name: z.string().trim().max(60).optional() });

export const HostProfilePatchSchema = z.object({
  brandName: z.string().trim().min(2).max(60).optional(),
  bio: z.string().trim().min(20).max(500).optional(),
  instagram: z.string().trim().max(40).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
});

// ---------- Listing wizard payloads ----------

const minsSchema = z.number().int().min(0).max(1440 * 3);

export const SessionInputSchema = z
  .object({
    id: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    startMins: minsSchema,
    endMins: minsSchema,
    capacity: z.number().int().min(0).max(100000),
    label: z.string().trim().max(40),
  })
  .refine((s) => s.endMins > s.startMins, { message: "End time must be after start time", path: ["endMins"] });
export type SessionInput = z.infer<typeof SessionInputSchema>;

export const TicketInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name the ticket").max(40),
  description: z.string().trim().max(80),
  price: z.number().min(0).max(100000),
  qty: z.number().int().min(1).max(99999),
  perOrderMax: z.number().int().min(1).max(20),
  isPass: z.boolean(),
  /** Index into sessions for day-specific tickets; null = valid for any session */
  sessionIndex: z.number().int().nullable(),
});
export type TicketInput = z.infer<typeof TicketInputSchema>;

export const EventListingInputSchema = z.object({
  kind: z.literal("event"),
  title: z.string().trim().min(4, "Give it a title (4+ characters)").max(80),
  categoryId: z.string().min(1, "Choose a category"),
  subcategoryId: z.string().nullable(),
  summary: z.string().trim().min(10, "Add a one-line summary").max(140),
  description: z.string().trim().min(40, "Describe it in a bit more detail (40+ characters)").max(3000),
  ageLimit: z.string(),
  languages: z.array(z.string()).min(1, "Pick at least one language"),
  areaId: z.string().min(1, "Choose an area"),
  venueName: z.string().trim().min(2, "Where is it happening?").max(80),
  address: z.string().trim().min(8, "Add the full address").max(200),
  media: z.array(z.string().max(900_000)).max(4),
  templateId: z.string().min(1, "Choose how people book"),
  sessions: z.array(SessionInputSchema).min(1, "Add at least one date").max(60, "Up to 60 dates per listing"),
  tickets: z.array(TicketInputSchema).max(20, "Up to 20 ticket types"),
  thingsToKnow: z.array(z.string().trim().min(1).max(160)).max(10),
  formFields: z.array(FormFieldSchema).max(6),
  externalUrl: z.string().trim().max(200).nullable(),
});
export type EventListingInput = z.infer<typeof EventListingInputSchema>;

export const CourtInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name the court").max(30),
  sport: z.string().min(1),
  indoor: z.boolean(),
  surface: z.string().trim().max(30),
  slotLengthMins: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  priceBase: z.number().min(0).max(20000),
  pricePeak: z.number().min(0).max(20000),
});
export type CourtInput = z.infer<typeof CourtInputSchema>;

export const VenueInputSchema = z.object({
  kind: z.literal("venue"),
  name: z.string().trim().min(3, "Name your venue").max(80),
  summary: z.string().trim().min(10, "Add a one-line summary").max(140),
  description: z.string().trim().min(40, "Describe the venue (40+ characters)").max(3000),
  areaId: z.string().min(1, "Choose an area"),
  address: z.string().trim().min(8, "Add the full address").max(200),
  media: z.array(z.string().max(900_000)).max(4),
  amenities: z.array(z.string().max(40)).max(30),
  templateId: z.enum(["tpl_court_60", "tpl_court_30"]),
  courts: z.array(CourtInputSchema).min(1, "Add at least one court").max(30, "Up to 30 courts per venue"),
  openMins: z.number().int().min(0).max(1440),
  closeMins: z.number().int().min(0).max(1440),
  advanceDays: z.number().int().min(1).max(60),
  maxMins: z.number().int().min(30).max(480),
  bufferMins: z.number().int().min(0).max(60),
  peakWeekdayEvenings: z.boolean(),
  peakWeekends: z.boolean(),
  thingsToKnow: z.array(z.string().trim().min(1).max(160)).max(10),
});
export type VenueInput = z.infer<typeof VenueInputSchema>;

export const ListingInputSchema = z.discriminatedUnion("kind", [EventListingInputSchema, VenueInputSchema]);
export type ListingInput = z.infer<typeof ListingInputSchema>;

export const SaveListingSchema = z.object({ input: ListingInputSchema, submit: z.boolean() });

export const BlockInputSchema = z.object({
  resourceId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMins: z.number().int(),
  endMins: z.number().int(),
  reason: z.string().trim().min(1).max(40),
});

export const CheckInSchema = z.object({ code: z.string().trim().min(4).max(20) });
