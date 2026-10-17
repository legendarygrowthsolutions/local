import type { Kysely } from "kysely";

/**
 * Per-member access scope. A host (brand) can run several venues and events, and a manager may be
 * responsible for only some of them. `scope` is a JSON array of listing / venue ids the member can
 * see and run; NULL means the whole host (owners are always NULL).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>;

export async function up(db: Db) {
  await db.schema.alterTable("host_members").addColumn("scope", "text").execute();
}

export async function down(db: Db) {
  await db.schema.alterTable("host_members").dropColumn("scope").execute();
}
