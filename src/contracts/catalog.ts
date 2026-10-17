import { z } from "zod";

export const CitySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  state: z.string(),
  lat: z.number(),
  lng: z.number(),
  active: z.boolean(),
  tagline: z.string(),
});
export type City = z.infer<typeof CitySchema>;

export const AreaSchema = z.object({
  id: z.string(),
  cityId: z.string(),
  slug: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type Area = z.infer<typeof AreaSchema>;

export const CategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  singular: z.string(),
  parentId: z.string().nullable(),
  icon: z.string(),
  sort: z.number(),
  blurb: z.string().optional(),
});
export type Category = z.infer<typeof CategorySchema>;

export const HostSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  type: z.enum(["organiser", "venue", "instructor", "community"]),
  /** Public handle: the host's page is /h/<slug>. Unique. */
  slug: z.string(),
  brandName: z.string(),
  cityId: z.string(),
  bio: z.string(),
  instagram: z.string().nullable(),
  kycStatus: z.enum(["none", "pending", "verified"]),
  status: z.enum(["pending", "changes", "approved", "rejected"]),
  since: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  gstin: z.string().nullable(),
  expectedPerMonth: z.string(),
  wantsPaid: z.boolean(),
  documents: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["pan", "bank", "gst", "id_proof"]),
      fileName: z.string(),
      /** Private upload; viewable by the host's owners and superadmins only. */
      mediaId: z.string().nullable().optional(),
      status: z.enum(["uploaded", "verified", "rejected"]),
    }),
  ),
  reviewNote: z.string().nullable(),
  submittedAt: z.string(),
  /** Owner-set operational settings (alerts, rescheduling, extras, permissions). Null = defaults. */
  settings: z.unknown().nullable().optional(),
});
export type Host = z.infer<typeof HostSchema>;
export type HostDocument = Host["documents"][number];
