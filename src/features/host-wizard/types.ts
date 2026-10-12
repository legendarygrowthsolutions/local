import type { Area, Category, JourneyTemplate } from "@/contracts";

export interface WizardCatalog {
  categories: (Category & { children: Category[] })[];
  sports: Category[];
  areas: Area[];
  templates: Pick<JourneyTemplate, "id" | "name" | "description" | "bookingMode" | "schedule" | "pricing" | "allowedCategories" | "ticketScope" | "cancellation" | "ctaLabel" | "rules">[];
}

export interface WizardHost {
  type: string;
  kycStatus: string;
  cityName: string;
}

export type StepId = "kind" | "basics" | "location" | "setup" | "tickets" | "courts" | "pricing" | "policies" | "review";
