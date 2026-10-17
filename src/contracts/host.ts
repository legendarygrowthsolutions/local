import { z } from "zod";
import { HOST_SLUG_HINT, HOST_SLUG_RE } from "@/lib/slug";
import { FormFieldSchema } from "./listing";
import { PhoneSchema } from "./user";
import { OFFLINE_METHODS, PaymentMethodSchema } from "./booking";

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
  /** Listing / venue ids this member can see and run; null = the whole host. Owners are always null. */
  scope: z.array(z.string()).nullable(),
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

/** Which of the host's venues and events a member can access; null = everything. */
export const MemberScopeSchema = z.array(z.string().max(60)).max(200).nullable();
export const InviteSchema = z.object({ phone: PhoneSchema, name: z.string().trim().max(60).optional(), scope: MemberScopeSchema.optional() });
export const MemberPatchSchema = z.object({ scope: MemberScopeSchema });

export const HostProfilePatchSchema = z.object({
  brandName: z.string().trim().min(2).max(60).optional(),
  bio: z.string().trim().min(20).max(500).optional(),
  instagram: z.string().trim().max(40).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
  /** Public page handle (/h/<slug>). */
  slug: z.string().trim().toLowerCase().regex(HOST_SLUG_RE, `Use ${HOST_SLUG_HINT}`).optional(),
});

/** Where a host's payouts are sent. Kept apart from the public host profile. */
export const PayoutAccountInputSchema = z
  .object({
    method: z.enum(["bank", "upi"]),
    holderName: z.string().trim().min(2, "Enter the account holder's name").max(80),
    accountNumber: z.string().trim().max(20).optional(),
    ifsc: z.string().trim().toUpperCase().max(11).optional(),
    bankName: z.string().trim().max(60).optional(),
    upiId: z.string().trim().max(60).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.method === "bank") {
      if (!/^\d{9,18}$/.test(v.accountNumber ?? "")) ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "Enter a 9 to 18 digit account number" });
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc ?? "")) ctx.addIssue({ code: "custom", path: ["ifsc"], message: "Enter a valid IFSC, like HDFC0001234" });
      if (!v.bankName) ctx.addIssue({ code: "custom", path: ["bankName"], message: "Enter the bank's name" });
    } else if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(v.upiId ?? "")) ctx.addIssue({ code: "custom", path: ["upiId"], message: "Enter a valid UPI ID, like name@okbank" });
  });
export type PayoutAccountInput = z.infer<typeof PayoutAccountInputSchema>;

export interface PayoutAccount {
  method: "bank" | "upi";
  holderName: string;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
  upiId: string | null;
  updatedAt: string;
}

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

// ---------- Operations: settings, host bookings, bulk actions, edits ----------

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const minsOfDay = z.number().int().min(0).max(1440 * 2);

/** Extras a host can add to a booking (equipment, lights, coaching). Prices in rupees. */
export const HostExtraSchema = z.object({
  id: z.string().max(40),
  name: z.string().trim().min(1, "Name the extra").max(40),
  price: z.number().min(0).max(100000),
  /** Per booking (one-off) or per slot hour. */
  per: z.enum(["booking", "hour"]).default("booking"),
  active: z.boolean().default(true),
});
export type HostExtra = z.infer<typeof HostExtraSchema>;

/**
 * Owner-configurable operations. Every field has a default, so a host with no saved settings
 * behaves sensibly; `HostSettingsSchema.parse({})` yields the defaults.
 */
export const HostSettingsSchema = z.object({
  alerts: z
    .object({
      /** Message the team when a guest books, cancels or moves a booking. */
      enabled: z.boolean().default(true),
      newBooking: z.boolean().default(true),
      cancellation: z.boolean().default(true),
      reschedule: z.boolean().default(true),
      /** Also alert for bookings the team itself records (walk-ins, bulk). Off by default: they already know. */
      hostBookings: z.boolean().default(false),
      channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
      /** Who gets them, besides the owner's contact number. */
      toManagers: z.boolean().default(true),
      /** Extra numbers (front desk, coach). */
      extraPhones: z.array(PhoneSchema).max(5).default([]),
      /** No alerts between these hours (IST, minutes from midnight); null = always. Bookings made overnight are still confirmed to the guest. */
      quietFromMins: z.number().int().min(0).max(1440).nullable().default(null),
      quietToMins: z.number().int().min(0).max(1440).nullable().default(null),
    })
    .prefault({}),
  guestMessages: z
    .object({
      /** Confirmations, changes and cancellations to the guest. Only switch off if you tell them yourself. */
      enabled: z.boolean().default(true),
      /** Also message guests for bookings the team records at the venue (when a phone number is given). */
      forHostBookings: z.boolean().default(true),
    })
    .prefault({}),
  reschedule: z
    .object({
      /** inherit = the booking type's platform default; off = never; custom = the values below. */
      mode: z.enum(["inherit", "off", "custom"]).default("inherit"),
      hoursBefore: z.number().min(0).max(336).default(4),
      maxTimes: z.number().int().min(1).max(10).default(2),
    })
    .prefault({}),
  hostBookings: z
    .object({
      /** Record walk-in and phone bookings from the console. */
      enabled: z.boolean().default(true),
      /** Payment methods the team may record. */
      methods: z.array(PaymentMethodSchema.exclude(["online"])).min(1).default(["cash", "upi", "pay_later"]),
      /** Who may change the price of a host booking or extension: owner only, or managers too. */
      priceOverride: z.enum(["owner", "all"]).default("owner"),
      /** Who may record bookings, extend them, add charges and cancel: owner only, or managers too. */
      editBy: z.enum(["owner", "all"]).default("all"),
      /** Hosts may book this many days ahead, beyond the public window. */
      advanceDays: z.number().int().min(1).max(365).default(90),
    })
    .prefault({}),
  extras: z.array(HostExtraSchema).max(30).default([]),
  payAtVenue: z
    .object({
      /**
       * Let guests book online and pay in cash when they arrive. The platform collects nothing for
       * these bookings and takes no responsibility if the guest doesn't pay or doesn't turn up.
       */
      enabled: z.boolean().default(false),
    })
    .prefault({}),
  cancellation: z
    .object({
      /** Refund of the ticket value when the host cancels an online booking (always at least what the guest's own policy would give). */
      hostCancelRefundPct: z.union([z.literal(0), z.literal(50), z.literal(100)]).default(100),
    })
    .prefault({}),
});
export type HostSettings = z.infer<typeof HostSettingsSchema>;
/** Partial update: each section replaces the saved one. */
export const HostSettingsPatchSchema = HostSettingsSchema.partial();

const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter the guest's name").max(80),
  /** Optional for walk-ins: without it the booking can't be messaged or found by the guest. */
  phone: PhoneSchema.optional().or(z.literal("")),
});

export const HostBookingItemsSchema = z.union([
  z.object({ kind: z.literal("venue"), resourceId: z.string().max(60), date: ymdSchema, startMins: minsOfDay, endMins: minsOfDay }),
  z.object({ kind: z.literal("listing"), listingId: z.string().max(60), sessionId: z.string().max(60).nullable().optional(), tickets: z.array(z.object({ ticketTypeId: z.string().max(60), qty: z.number().int().min(1).max(100) })).min(1).max(20) }),
]);

/** POST /api/host/bookings — a booking recorded by the team (walk-in, phone, regular). */
export const HostBookingInputSchema = z.object({
  items: HostBookingItemsSchema,
  customer: customerSchema,
  paymentMethod: PaymentMethodSchema.exclude(["online"]),
  /** Override the computed ticket value (rupees). Needs the price-override permission. */
  price: z.number().min(0).max(1000000).optional(),
  notes: z.string().trim().max(300).optional(),
  /** Message the guest (if a phone was given) and the team according to settings. */
  notify: z.boolean().default(true),
});
export type HostBookingInput = z.infer<typeof HostBookingInputSchema>;

/** POST /api/host/bulk — book or block many slots at once. */
export const BulkScheduleInputSchema = z
  .object({
    action: z.enum(["block", "book"]),
    resourceIds: z.array(z.string().max(60)).min(1).max(30),
    from: ymdSchema,
    to: ymdSchema,
    /** 0 = Sunday … 6 = Saturday. Empty = every day. */
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    startMins: minsOfDay,
    endMins: minsOfDay,
    /** Skip slots that are already taken instead of failing the whole run. */
    skipConflicts: z.boolean().default(true),
    reason: z.string().trim().max(40).optional(),
    customer: customerSchema.optional(),
    paymentMethod: PaymentMethodSchema.exclude(["online"]).optional(),
    /** Price per occurrence (rupees), overriding the slot price. Needs the price-override permission. */
    price: z.number().min(0).max(1000000).optional(),
    notes: z.string().trim().max(300).optional(),
    notify: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.endMins <= v.startMins) ctx.addIssue({ code: "custom", path: ["endMins"], message: "End time must be after start time" });
    if (v.to < v.from) ctx.addIssue({ code: "custom", path: ["to"], message: "End date must be on or after the start date" });
    if (v.action === "book") {
      if (!v.customer) ctx.addIssue({ code: "custom", path: ["customer"], message: "Who is this for?" });
      if (!v.paymentMethod) ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "How are they paying?" });
    }
  });
export type BulkScheduleInput = z.infer<typeof BulkScheduleInputSchema>;

/** Money recorded against a booking by the team. */
const collectSchema = z.object({ method: PaymentMethodSchema.exclude(["online", "pay_later"]) }).optional();

/** POST /api/host/bookings/[id]/extend — add time to a court booking. */
export const ExtendBookingSchema = z.object({
  endMins: minsOfDay,
  /** Override the price of the added time (rupees). Needs the price-override permission. */
  price: z.number().min(0).max(1000000).optional(),
  /** Record the extra as paid now (cash/UPI/card); otherwise it's added to the amount due. */
  collect: collectSchema,
  notify: z.boolean().default(true),
});
export type ExtendBookingInput = z.infer<typeof ExtendBookingSchema>;

/** POST /api/host/bookings/[id]/charges — add an extra or a custom charge. */
export const AddChargeSchema = z
  .object({
    extraId: z.string().max(40).optional(),
    label: z.string().trim().max(60).optional(),
    amount: z.number().min(0).max(1000000).optional(),
    qty: z.number().int().min(1).max(50).default(1),
    collect: collectSchema,
    notify: z.boolean().default(false),
  })
  .refine((v) => v.extraId || (v.label && v.amount !== undefined), { message: "Pick an extra or enter a label and amount" });
export type AddChargeInput = z.infer<typeof AddChargeSchema>;

/** POST /api/host/bookings/[id]/settle — mark the amount due as collected. */
export const SettleDueSchema = z.object({ method: PaymentMethodSchema.exclude(["online", "pay_later"]), amount: z.number().min(0).max(1000000).optional() });

/** POST /api/host/bookings/[id]/cancel */
export const HostCancelSchema = z.object({
  /** Refund share of the ticket value for online payments; offline money is settled by hand. Owner only; defaults to the host's setting. */
  refundPct: z.union([z.literal(0), z.literal(50), z.literal(100)]).optional(),
  reason: z.string().trim().max(200).optional(),
  notify: z.boolean().default(true),
});

/** POST /api/host/bookings/[id]/reschedule — the team moves a booking (policy limits don't apply to the host). */
export const HostRescheduleSchema = z.object({
  to: z.union([z.object({ date: ymdSchema, startMins: minsOfDay, resourceId: z.string().max(60).optional() }), z.object({ sessionId: z.string().max(60) })]),
  notify: z.boolean().default(true),
});

/** POST /api/host/bookings/[id]/paid — a pay-at-venue booking settled at the desk. */
export const MarkPaidSchema = z.object({ method: z.enum(OFFLINE_METHODS).default("cash") });

export const BookingNotesSchema = z.object({ notes: z.string().trim().max(300) });
