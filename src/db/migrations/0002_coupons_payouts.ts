import type { Kysely } from "kysely";

/**
 * Coupon management (start date, overall cap, city scope, audit times) and payout records:
 * the bank or UPI account a host is paid to, and a ledger of payouts made by hand.
 * Same portability rules as 0001 (money in paise, booleans 0/1, ISO text times).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>;
const txt = "varchar(255)" as const;

export async function up(db: Db) {
  // SQLite takes one column per ALTER TABLE.
  await db.schema.alterTable("coupons").addColumn("valid_from", txt).execute();
  await db.schema.alterTable("coupons").addColumn("total_limit", "integer").execute();
  await db.schema.alterTable("coupons").addColumn("city_id", txt).execute();
  await db.schema.alterTable("coupons").addColumn("created_at", txt).execute();
  await db.schema.alterTable("coupons").addColumn("updated_at", txt).execute();

  await db.schema
    .createTable("host_payout_accounts")
    .addColumn("host_id", txt, (c) => c.primaryKey())
    .addForeignKeyConstraint("host_payout_accounts_host_fk", ["host_id"], "hosts", ["id"], (cb) => cb.onDelete("cascade"))
    .addColumn("method", txt, (c) => c.notNull()) // bank | upi
    .addColumn("holder_name", txt, (c) => c.notNull())
    .addColumn("account_number", txt)
    .addColumn("ifsc", txt)
    .addColumn("bank_name", txt)
    .addColumn("upi_id", txt)
    .addColumn("updated_at", txt, (c) => c.notNull())
    .addColumn("updated_by", txt)
    .execute();

  await db.schema
    .createTable("payouts")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("host_id", txt, (c) => c.notNull())
    .addForeignKeyConstraint("payouts_host_fk", ["host_id"], "hosts", ["id"])
    .addColumn("cycle_from", txt, (c) => c.notNull())
    .addColumn("cycle_to", txt, (c) => c.notNull())
    .addColumn("bookings", "integer", (c) => c.notNull())
    // Statement at the time of recording, in paise: ticket sales, refunds, and what was actually sent.
    .addColumn("gross", "integer", (c) => c.notNull())
    .addColumn("refunds", "integer", (c) => c.notNull())
    .addColumn("deductions", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("adjustment", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("amount", "integer", (c) => c.notNull())
    .addColumn("method", txt, (c) => c.notNull()) // bank_transfer | upi | cheque | other
    .addColumn("reference", txt, (c) => c.notNull()) // UTR / transaction id / cheque number
    .addColumn("paid_on", txt, (c) => c.notNull()) // YYYY-MM-DD
    .addColumn("paid_to", txt, (c) => c.notNull()) // masked account at the time, for the record
    .addColumn("notes", "text")
    .addColumn("recorded_by", txt, (c) => c.notNull())
    .addColumn("created_at", txt, (c) => c.notNull())
    .addColumn("voided_at", txt)
    .addColumn("voided_by", txt)
    .addColumn("void_reason", "text")
    .execute();
  await db.schema.createIndex("payouts_host_cycle_idx").on("payouts").columns(["host_id", "cycle_from"]).execute();
}

export async function down(db: Db) {
  await db.schema.dropTable("payouts").ifExists().execute();
  await db.schema.dropTable("host_payout_accounts").ifExists().execute();
  for (const c of ["updated_at", "created_at", "city_id", "total_limit", "valid_from"]) await db.schema.alterTable("coupons").dropColumn(c).execute();
}
