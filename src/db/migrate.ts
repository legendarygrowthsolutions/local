import { Migrator, type Migration } from "kysely/migration";
import type { Kysely } from "kysely";
import * as m0001 from "./migrations/0001_init";
import * as m0002 from "./migrations/0002_coupons_payouts";
import * as m0003 from "./migrations/0003_member_scope";
import * as m0004 from "./migrations/0004_host_slugs";
import * as m0005 from "./migrations/0005_operations";

/** Static list (no filesystem scan) so it works the same from scripts, tests and the bundled server. */
export const migrations: Record<string, Migration> = {
  "0001_init": m0001,
  "0002_coupons_payouts": m0002,
  "0003_member_scope": m0003,
  "0004_host_slugs": m0004,
  "0005_operations": m0005,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function migrateToLatest(db: Kysely<any>) {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return results?.filter((r) => r.status === "Success").map((r) => r.migrationName) ?? [];
}
