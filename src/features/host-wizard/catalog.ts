import "server-only";
import { repo } from "@/repositories";
import { getCategoryTree } from "@/services/catalog";
import type { HostContext } from "@/services/host";
import type { WizardCatalog, WizardHost } from "./types";

export async function wizardProps(ctx: HostContext): Promise<{ catalog: WizardCatalog; host: WizardHost }> {
  const [tree, areas, templates, city] = await Promise.all([getCategoryTree(), repo.areas.listByCity(ctx.host.cityId), repo.templates.list(), repo.cities.byId(ctx.host.cityId)]);
  return {
    catalog: {
      categories: tree,
      sports: tree.find((c) => c.slug === "sports")?.children ?? [],
      areas,
      templates: templates
        .filter((t) => t.active)
        .map(({ id, name, description, bookingMode, schedule, pricing, allowedCategories, ticketScope, cancellation, ctaLabel, rules }) => ({ id, name, description, bookingMode, schedule, pricing, allowedCategories, ticketScope, cancellation, ctaLabel, rules })),
    },
    host: { type: ctx.host.type, kycStatus: ctx.host.kycStatus, cityName: city?.name ?? "" },
  };
}
