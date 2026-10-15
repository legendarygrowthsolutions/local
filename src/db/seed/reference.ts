import type { Area, Category, City, JourneyTemplate } from "@/contracts";
import type { Db } from "../client";
import * as M from "../mappers";

import cities from "./reference/cities.json";
import areas from "./reference/areas.json";
import categories from "./reference/categories.json";
import templates from "./reference/templates.json";

/**
 * Reference data every environment needs before anyone can use the app: the launch city and its
 * areas, the category tree and the journey templates. No users, hosts, listings or bookings —
 * those only ever come from real people. Superadmins edit all of this later from /admin.
 */
export const reference = {
  cities: cities as City[],
  areas: areas as Area[],
  categories: categories as Category[],
  templates: templates as unknown as JourneyTemplate[],
};

/**
 * Load the reference data into a fresh database (no cities yet); a no-op otherwise, so it's safe on
 * every start and never brings back something an admin deleted. Inserts only ids that are missing,
 * so it can also run under the demo seed. Returns how many rows it added.
 */
export async function seedReference(db: Db) {
  let added = 0;
  await db.transaction().execute(async (trx) => {
    if (await trx.selectFrom("cities").select("id").limit(1).executeTakeFirst()) return;
    const missing = async <T extends { id: string }>(table: "cities" | "areas" | "categories" | "journeyTemplates", rows: T[]) => {
      const have = new Set((await trx.selectFrom(table).select("id").execute()).map((r) => r.id));
      return rows.filter((r) => !have.has(r.id));
    };
    const c = await missing("cities", reference.cities);
    if (c.length) await trx.insertInto("cities").values(c.map(M.cityToRow)).execute();
    const a = await missing("areas", reference.areas);
    if (a.length) await trx.insertInto("areas").values(a.map(M.areaToRow)).execute();
    const cat = await missing("categories", reference.categories);
    if (cat.length) await trx.insertInto("categories").values(cat.map(M.categoryToRow)).execute();
    const order = new Map(reference.templates.map((t, i) => [t.id, i]));
    const t = await missing("journeyTemplates", reference.templates);
    if (t.length) await trx.insertInto("journeyTemplates").values(t.map((x) => M.templateToRow(x, order.get(x.id)))).execute();
    added = c.length + a.length + cat.length + t.length;
  });
  return added;
}
