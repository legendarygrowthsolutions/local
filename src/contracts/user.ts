import { z } from "zod";

export const GenderSchema = z.enum(["male", "female", "other", "na"]);

export const UserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  name: z.string().nullable(),
  gender: GenderSchema.nullable(),
  dob: z.string().nullable(), // YYYY-MM-DD
  cityId: z.string().nullable(),
  interests: z.array(z.string()),
  role: z.enum(["user", "host", "admin"]),
  saved: z.array(z.string()),
  following: z.array(z.string()).optional(), // host ids
  notifications: z.object({ whatsapp: z.boolean(), email: z.boolean(), offers: z.boolean() }).optional(),
  avatar: z.string().nullable().optional(), // phase 1: small data URL; phase 2: uploaded file URL
  createdAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const PhoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

export const OtpSendSchema = z.object({ phone: PhoneSchema });
export const OtpVerifySchema = z.object({
  phone: PhoneSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

function isAdult(dob: string, minYears: number) {
  const d = new Date(dob + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - minYears, now.getUTCMonth(), now.getUTCDate()));
  return d <= cutoff && d.getUTCFullYear() > 1900;
}

export const ProfileSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(60),
  gender: GenderSchema,
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth")
    .refine((v) => isAdult(v, 13), "You need to be at least 13"),
  interests: z.array(z.string()).default([]),
});
export type ProfileInput = z.infer<typeof ProfileSchema>;

/** Client-downscaled JPEG/PNG/WebP; ~100 KB cap keeps the mock store small. */
export const AvatarSchema = z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, "Unsupported image").max(140_000, "Image is too large");

export const MePatchSchema = ProfileSchema.partial().extend({
  cityId: z.string().optional(),
  avatar: AvatarSchema.nullable().optional(),
  notifications: z.object({ whatsapp: z.boolean(), email: z.boolean(), offers: z.boolean() }).optional(),
});
