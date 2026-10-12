import "server-only";
import { repo } from "@/repositories";
import type { Category } from "@/contracts";

export const getCities = () => repo.cities.list();
/** Public lookup: hidden (inactive) cities 404. */
export async function getCity(slug: string) {
  const c = await repo.cities.bySlug(slug);
  return c?.active ? c : null;
}
export const getAreas = (cityId: string) => repo.areas.listByCity(cityId);
export const getCategories = () => repo.categories.list();

export async function getTopCategories() {
  return (await repo.categories.list()).filter((c) => c.parentId === null);
}

export async function getCategoryTree() {
  const all = await repo.categories.list();
  return all
    .filter((c) => c.parentId === null)
    .map((c) => ({ ...c, children: all.filter((s) => s.parentId === c.id) }));
}

/** Resolve "/{city}/{category}" and "/{city}/{category}/{sub}" segments. */
export async function resolveCategory(slug: string, subSlug?: string): Promise<{ category: Category; sub: Category | null } | null> {
  const all = await repo.categories.list();
  const category = all.find((c) => c.parentId === null && c.slug === slug);
  if (!category) return null;
  if (!subSlug) return { category, sub: null };
  const sub = all.find((c) => c.parentId === category.id && c.slug === subSlug);
  return sub ? { category, sub } : null;
}
