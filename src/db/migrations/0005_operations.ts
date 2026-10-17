import type { Kysely } from "kysely";

/**
 * Venue operations: host-recorded bookings (walk-ins, bulk), money collected at the venue, booking
 * edits and moves, a log of every notification sent, and per-host operational settings.
 * Same portability rules as 0001 (money in paise, booleans 0/1, ISO text times, JSON in text).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>;
const txt = "varchar(255)" as const;

export async function up(db: Db) {
  // Owner-set operational settings (alerts, rescheduling, extras, permissions), as JSON.
  await db.schema.alterTable("hosts").addColumn("settings", "text").execute();

  // Platform default for moving a booking, per journey template (JSON; null = not allowed).
  await db.schema.alterTable("journey_templates").addColumn("reschedule", "text").execute();

  // SQLite takes one column per ALTER TABLE.
  await db.schema.alterTable("bookings").addColumn("source", txt, (c) => c.notNull().defaultTo("online")).execute();
  await db.schema.alterTable("bookings").addColumn("payment_method", txt).execute();
  await db.schema.alterTable("bookings").addColumn("amount_due", "integer", (c) => c.notNull().defaultTo(0)).execute();
  await db.schema.alterTable("bookings").addColumn("notes", "text").execute();
  await db.schema.alterTable("bookings").addColumn("rescheduled_count", "integer", (c) => c.notNull().defaultTo(0)).execute();
  await db.schema.alterTable("bookings").addColumn("rescheduled_from", txt).execute();
  await db.schema.alterTable("bookings").addColumn("created_by", txt).execute();
  await db.schema.alterTable("bookings").addColumn("group_id", txt).execute();
  await db.schema.createIndex("bookings_group_idx").on("bookings").column("group_id").execute();

  // What changed on a booking after it was made, by whom (extensions, charges, moves, cancellations, settlements).
  await db.schema
    .createTable("booking_events")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("booking_id", txt, (c) => c.notNull())
    .addForeignKeyConstraint("booking_events_booking_fk", ["booking_id"], "bookings", ["id"], (cb) => cb.onDelete("cascade"))
    .addColumn("kind", txt, (c) => c.notNull())
    .addColumn("actor_user_id", txt)
    .addColumn("actor_role", txt, (c) => c.notNull()) // guest | host | admin | system
    .addColumn("data", "text") // JSON
    .addColumn("created_at", txt, (c) => c.notNull())
    .execute();
  await db.schema.createIndex("booking_events_booking_idx").on("booking_events").columns(["booking_id", "created_at"]).execute();

  // Every booking message attempted, one row per recipient. The unique key makes delivery idempotent:
  // a second attempt for the same booking, event and number is a no-op.
  await db.schema
    .createTable("notifications")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("booking_id", txt, (c) => c.notNull())
    .addForeignKeyConstraint("notifications_booking_fk", ["booking_id"], "bookings", ["id"], (cb) => cb.onDelete("cascade"))
    .addColumn("kind", txt, (c) => c.notNull())
    .addColumn("dedupe_key", txt, (c) => c.notNull())
    .addColumn("recipient", txt, (c) => c.notNull()) // 10-digit mobile
    .addColumn("audience", txt, (c) => c.notNull()) // guest | host
    .addColumn("channel", txt, (c) => c.notNull()) // sms | whatsapp
    .addColumn("status", txt, (c) => c.notNull()) // sent | failed | skipped
    .addColumn("provider", txt, (c) => c.notNull())
    .addColumn("provider_ref", txt)
    .addColumn("error", "text")
    .addColumn("body", "text")
    .addColumn("created_at", txt, (c) => c.notNull())
    .execute();
  await db.schema.createIndex("notifications_dedupe_uq").unique().on("notifications").columns(["booking_id", "dedupe_key", "recipient"]).execute();
  await db.schema.createIndex("notifications_booking_idx").on("notifications").columns(["booking_id", "created_at"]).execute();
}

export async function down(db: Db) {
  await db.schema.dropTable("notifications").ifExists().execute();
  await db.schema.dropTable("booking_events").ifExists().execute();
  await db.schema.dropIndex("bookings_group_idx").ifExists().execute();
  for (const c of ["group_id", "created_by", "rescheduled_from", "rescheduled_count", "notes", "amount_due", "payment_method", "source"]) await db.schema.alterTable("bookings").dropColumn(c).execute();
  await db.schema.alterTable("journey_templates").dropColumn("reschedule").execute();
  await db.schema.alterTable("hosts").dropColumn("settings").execute();
}
