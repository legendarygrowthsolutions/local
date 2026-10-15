/**
 * Runs once when a server instance starts, before it takes requests: bring the database schema
 * up to date and, on a brand-new database, load the reference data (launch city, areas,
 * categories, journey templates). Never loads demo content. Set DB_AUTO_MIGRATE=0 to manage
 * migrations and seeding out of band (`npm run db:migrate && npm run db:seed`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.DB_AUTO_MIGRATE === "0") return;
  const [{ rootDb }, { migrateToLatest }, { seedReference }] = await Promise.all([import("./db/client"), import("./db/migrate"), import("./db/seed/reference")]);
  const applied = await migrateToLatest(rootDb());
  if (applied.length) console.info(`[db] migrated: ${applied.join(", ")}`);
  const seeded = await seedReference(rootDb());
  if (seeded) console.info(`[db] loaded ${seeded} reference rows into a new database`);
}
