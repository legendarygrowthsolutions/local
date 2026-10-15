import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SITE_NAME = "local.";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** The business behind the platform, as named in the terms, privacy policy and invoices. */
export const COMPANY = {
  legalName: "Legendary Growth Solutions LLP",
  city: "Nagpur",
  state: "Maharashtra",
  /** Contact for support and grievances. Set NEXT_PUBLIC_SUPPORT_EMAIL; defaults to support@ the site's domain. */
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? `support@${new URL(SITE_URL).hostname.replace(/^www\./, "")}`,
};
