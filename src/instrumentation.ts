/**
 * Runs once when a server instance starts, before it takes requests: bring the database schema
 * up to date. Seeding stays a deliberate step (`npm run db:seed`), never automatic in production.
 * Set DB_AUTO_MIGRATE=0 to manage migrations out of band.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.DB_AUTO_MIGRATE === "0") return;
  const [{ rootDb }, { migrateToLatest }] = await Promise.all([import("./db/client"), import("./db/migrate")]);
  const applied = await migrateToLatest(rootDb());
  if (applied.length) console.info(`[db] migrated: ${applied.join(", ")}`);
}
