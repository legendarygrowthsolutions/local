import { Migrator, type Migration } from "kysely/migration";
import type { Kysely } from "kysely";
import * as m0001 from "./migrations/0001_init";

/** Static list (no filesystem scan) so it works the same from scripts, tests and the bundled server. */
export const migrations: Record<string, Migration> = {
  "0001_init": m0001,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function migrateToLatest(db: Kysely<any>) {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return results?.filter((r) => r.status === "Success").map((r) => r.migrationName) ?? [];
}
