import type { Kysely } from "kysely";
import { hostSlugFrom } from "../../lib/slug";

/**
 * Public host pages (`/h/<slug>`): every host gets a unique URL handle, defaulted from its brand name.
 * The column stays nullable in DDL (SQLite can't add NOT NULL without a default); the backfill below
 * and the service layer keep it filled.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>;
const txt = "varchar(255)" as const;

export async function up(db: Db) {
  await db.schema.alterTable("hosts").addColumn("slug", txt).execute();

  // Backfill in submission order so the earliest host keeps the plain handle. The CamelCasePlugin
  // returns `brandName`; a plain connection would return `brand_name`.
  const rows: { id: string; brandName?: string; brand_name?: string }[] = await db.selectFrom("hosts").select(["id", "brand_name"]).orderBy("submitted_at").execute();
  const used = new Set<string>();
  for (const r of rows) {
    const base = hostSlugFrom(r.brandName ?? r.brand_name ?? "");
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base.slice(0, 40 - String(i).length - 1)}-${i}`;
    used.add(slug);
    await db.updateTable("hosts").set({ slug }).where("id", "=", r.id).execute();
  }

  await db.schema.createIndex("hosts_slug_uq").unique().on("hosts").column("slug").execute();
}

export async function down(db: Db) {
  await db.schema.dropIndex("hosts_slug_uq").ifExists().execute();
  await db.schema.alterTable("hosts").dropColumn("slug").execute();
}
