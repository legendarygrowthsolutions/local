import type { Kysely } from "kysely";

/**
 * Initial schema. Written with Kysely's schema builder so the same migration runs on
 * SQLite (local), libSQL/Turso, Postgres and MySQL. Portability rules used throughout:
 * - timestamps are ISO-8601 TEXT (instants in UTC `Z`, local event times with `+05:30`)
 * - booleans are INTEGER 0/1
 * - money is INTEGER paise (never floats)
 * - structured blobs (steps, media, answers) are JSON in TEXT columns
 * - ids are app-generated TEXT
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Kysely<any>;

const txt = "varchar(255)" as const;

export async function up(db: Db) {
  await db.schema
    .createTable("cities")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("slug", txt, (c) => c.notNull().unique())
    .addColumn("name", txt, (c) => c.notNull())
    .addColumn("state", txt, (c) => c.notNull())
    .addColumn("lat", "double precision", (c) => c.notNull())
    .addColumn("lng", "double precision", (c) => c.notNull())
    .addColumn("active", "integer", (c) => c.notNull().defaultTo(1))
    .addColumn("tagline", "text", (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("areas")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("city_id", txt, (c) => c.notNull().references("cities.id"))
    .addColumn("slug", txt, (c) => c.notNull())
    .addColumn("name", txt, (c) => c.notNull())
    .addColumn("lat", "double precision", (c) => c.notNull())
    .addColumn("lng", "double precision", (c) => c.notNull())
    .execute();
  await db.schema.createIndex("areas_city_idx").on("areas").column("city_id").execute();

  await db.schema
    .createTable("categories")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("slug", txt, (c) => c.notNull())
    .addColumn("name", txt, (c) => c.notNull())
    .addColumn("singular", txt, (c) => c.notNull())
    .addColumn("parent_id", txt)
    .addColumn("icon", txt, (c) => c.notNull())
    .addColumn("sort", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("blurb", "text")
    .execute();

  await db.schema
    .createTable("journey_templates")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("name", txt, (c) => c.notNull())
    .addColumn("description", "text", (c) => c.notNull())
    .addColumn("allowed_categories", "text", (c) => c.notNull())
    .addColumn("booking_mode", txt, (c) => c.notNull())
    .addColumn("schedule", txt, (c) => c.notNull())
    .addColumn("pricing", txt, (c) => c.notNull())
    .addColumn("ticket_scope", txt)
    .addColumn("steps", "text", (c) => c.notNull())
    .addColumn("rules", "text", (c) => c.notNull())
    .addColumn("fees", "text", (c) => c.notNull())
    .addColumn("cancellation", "text", (c) => c.notNull())
    .addColumn("cta_label", txt, (c) => c.notNull())
    .addColumn("sort", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("active", "integer", (c) => c.notNull().defaultTo(1))
    .execute();

  await db.schema
    .createTable("users")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("phone", txt, (c) => c.notNull().unique())
    .addColumn("name", txt)
    .addColumn("gender", txt)
    .addColumn("dob", txt)
    .addColumn("city_id", txt)
    .addColumn("interests", "text", (c) => c.notNull())
    .addColumn("role", txt, (c) => c.notNull().defaultTo("user"))
    .addColumn("avatar", "text")
    .addColumn("notifications", "text")
    .addColumn("created_at", txt, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("user_saved")
    .addColumn("user_id", txt, (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("item_id", txt, (c) => c.notNull())
    .addColumn("created_at", txt, (c) => c.notNull())
    .addPrimaryKeyConstraint("user_saved_pk", ["user_id", "item_id"])
    .execute();

  await db.schema
    .createTable("user_following")
    .addColumn("user_id", txt, (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("host_id", txt, (c) => c.notNull())
    .addColumn("created_at", txt, (c) => c.notNull())
    .addPrimaryKeyConstraint("user_following_pk", ["user_id", "host_id"])
    .execute();

  await db.schema
    .createTable("hosts")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("user_id", txt)
    .addColumn("type", txt, (c) => c.notNull())
    .addColumn("brand_name", txt, (c) => c.notNull())
    .addColumn("city_id", txt, (c) => c.notNull())
    .addColumn("bio", "text", (c) => c.notNull())
    .addColumn("instagram", txt)
    .addColumn("kyc_status", txt, (c) => c.notNull())
    .addColumn("status", txt, (c) => c.notNull())
    .addColumn("since", txt, (c) => c.notNull())
    .addColumn("contact_name", txt, (c) => c.notNull())
    .addColumn("contact_phone", txt, (c) => c.notNull())
    .addColumn("email", txt)
    .addColumn("website", txt)
    .addColumn("gstin", txt)
    .addColumn("expected_per_month", txt, (c) => c.notNull())
    .addColumn("wants_paid", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("review_note", "text")
    .addColumn("submitted_at", txt, (c) => c.notNull())
    .execute();
  await db.schema.createIndex("hosts_user_idx").on("hosts").column("user_id").execute();

  await db.schema
    .createTable("host_documents")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("host_id", txt, (c) => c.notNull().references("hosts.id").onDelete("cascade"))
    .addColumn("kind", txt, (c) => c.notNull())
    .addColumn("file_name", txt, (c) => c.notNull())
    .addColumn("media_id", txt)
    .addColumn("status", txt, (c) => c.notNull())
    .addColumn("sort", "integer", (c) => c.notNull().defaultTo(0))
    .execute();
  await db.schema.createIndex("host_documents_host_idx").on("host_documents").column("host_id").execute();

  await db.schema
    .createTable("host_members")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("host_id", txt, (c) => c.notNull().references("hosts.id").onDelete("cascade"))
    .addColumn("user_id", txt)
    .addColumn("phone", txt, (c) => c.notNull())
    .addColumn("name", txt)
    .addColumn("role", txt, (c) => c.notNull())
    .addColumn("status", txt, (c) => c.notNull())
    .addColumn("invited_by", txt)
    .addColumn("created_at", txt, (c) => c.notNull())
    .execute();
  await db.schema.createIndex("host_members_host_idx").on("host_members").column("host_id").execute();
  await db.schema.createIndex("host_members_user_idx").on("host_members").column("user_id").execute();
  await db.schema.createIndex("host_members_phone_idx").on("host_members").column("phone").execute();

  await db.schema
    .createTable("listings")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("host_id", txt, (c) => c.notNull().references("hosts.id"))
    .addColumn("city_id", txt, (c) => c.notNull())
    .addColumn("area_id", txt, (c) => c.notNull())
    .addColumn("category_id", txt, (c) => c.notNull())
    .addColumn("subcategory_id", txt)
    .addColumn("template_id", txt, (c) => c.notNull())
    .addColumn("slug", txt, (c) => c.notNull())
    .addColumn("title", txt, (c) => c.notNull())
    .addColumn("summary", "text", (c) => c.notNull())
    .addColumn("description", "text", (c) => c.notNull())
    .addColumn("media", "text", (c) => c.notNull())
    .addColumn("venue_name", txt, (c) => c.notNull())
    .addColumn("address", "text", (c) => c.notNull())
    .addColumn("lat", "double precision", (c) => c.notNull())
    .addColumn("lng", "double precision", (c) => c.notNull())
    .addColumn("age_limit", txt, (c) => c.notNull())
    .addColumn("languages", "text", (c) => c.notNull())
    .addColumn("tags", "text", (c) => c.notNull())
    .addColumn("things_to_know", "text", (c) => c.notNull())
    .addColumn("external_url", "text")
    .addColumn("status", txt, (c) => c.notNull())
    .addColumn("featured_rank", "integer")
    .addColumn("form_fields", "text", (c) => c.notNull())
    .addColumn("created_at", txt, (c) => c.notNull())
    .addColumn("review_note", "text")
    .addUniqueConstraint("listings_city_slug_uq", ["city_id", "slug"])
    .execute();
  await db.schema.createIndex("listings_city_status_idx").on("listings").columns(["city_id", "status"]).execute();
  await db.schema.createIndex("listings_host_idx").on("listings").column("host_id").execute();

  await db.schema
    .createTable("listing_sessions")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("listing_id", txt, (c) => c.notNull().references("listings.id").onDelete("cascade"))
    .addColumn("starts_at", txt, (c) => c.notNull())
    .addColumn("ends_at", txt, (c) => c.notNull())
    .addColumn("capacity", "integer", (c) => c.notNull())
    .addColumn("sold", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("label", txt, (c) => c.notNull())
    .execute();
  await db.schema.createIndex("listing_sessions_listing_idx").on("listing_sessions").columns(["listing_id", "starts_at"]).execute();

  await db.schema
    .createTable("ticket_types")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("listing_id", txt, (c) => c.notNull().references("listings.id").onDelete("cascade"))
    .addColumn("session_id", txt)
    .addColumn("name", txt, (c) => c.notNull())
    .addColumn("description", "text", (c) => c.notNull())
    .addColumn("price", "integer", (c) => c.notNull())
    .addColumn("qty", "integer", (c) => c.notNull())
    .addColumn("sold", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("per_order_max", "integer", (c) => c.notNull())
    .addColumn("is_pass", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("sort", "integer", (c) => c.notNull().defaultTo(0))
    .execute();
  await db.schema.createIndex("ticket_types_listing_idx").on("ticket_types").column("listing_id").execute();

  await db.schema
    .createTable("venues")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("host_id", txt, (c) => c.notNull().references("hosts.id"))
    .addColumn("city_id", txt, (c) => c.notNull())
    .addColumn("area_id", txt, (c) => c.notNull())
    .addColumn("template_id", txt, (c) => c.notNull())
    .addColumn("slug", txt, (c) => c.notNull())
    .addColumn("name", txt, (c) => c.notNull())
    .addColumn("summary", "text", (c) => c.notNull())
    .addColumn("description", "text", (c) => c.notNull())
    .addColumn("media", "text", (c) => c.notNull())
    .addColumn("address", "text", (c) => c.notNull())
    .addColumn("lat", "double precision", (c) => c.notNull())
    .addColumn("lng", "double precision", (c) => c.notNull())
    .addColumn("amenities", "text", (c) => c.notNull())
    .addColumn("hours_label", txt, (c) => c.notNull())
    .addColumn("sports", "text", (c) => c.notNull())
    .addColumn("things_to_know", "text", (c) => c.notNull())
    .addColumn("featured_rank", "integer")
    .addColumn("status", txt, (c) => c.notNull())
    .addColumn("review_note", "text")
    .addUniqueConstraint("venues_city_slug_uq", ["city_id", "slug"])
    .execute();
  await db.schema.createIndex("venues_city_status_idx").on("venues").columns(["city_id", "status"]).execute();
  await db.schema.createIndex("venues_host_idx").on("venues").column("host_id").execute();

  await db.schema
    .createTable("resources")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("venue_id", txt, (c) => c.notNull().references("venues.id").onDelete("cascade"))
    .addColumn("name", txt, (c) => c.notNull())
    .addColumn("sport", txt, (c) => c.notNull())
    .addColumn("indoor", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("surface", txt, (c) => c.notNull())
    .addColumn("slot_length_mins", "integer", (c) => c.notNull())
    .addColumn("capacity", "integer", (c) => c.notNull())
    .addColumn("sort", "integer", (c) => c.notNull().defaultTo(0))
    .execute();
  await db.schema.createIndex("resources_venue_idx").on("resources").column("venue_id").execute();

  await db.schema
    .createTable("slot_rules")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("resource_id", txt, (c) => c.notNull().references("resources.id").onDelete("cascade"))
    .addColumn("open_mins", "integer", (c) => c.notNull())
    .addColumn("close_mins", "integer", (c) => c.notNull())
    .addColumn("min_mins", "integer", (c) => c.notNull())
    .addColumn("max_mins", "integer", (c) => c.notNull())
    .addColumn("buffer_mins", "integer", (c) => c.notNull())
    .addColumn("advance_days", "integer", (c) => c.notNull())
    .addColumn("price_base", "integer", (c) => c.notNull())
    .addColumn("price_peak", "integer", (c) => c.notNull())
    .addColumn("peak", "text", (c) => c.notNull())
    .execute();
  await db.schema.createIndex("slot_rules_resource_idx").on("slot_rules").column("resource_id").execute();

  await db.schema
    .createTable("blocks")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("resource_id", txt, (c) => c.notNull().references("resources.id").onDelete("cascade"))
    .addColumn("starts_at", txt, (c) => c.notNull())
    .addColumn("ends_at", txt, (c) => c.notNull())
    .addColumn("reason", txt, (c) => c.notNull())
    .execute();
  await db.schema.createIndex("blocks_resource_idx").on("blocks").columns(["resource_id", "starts_at"]).execute();

  await db.schema
    .createTable("coupons")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("code", txt, (c) => c.notNull().unique())
    .addColumn("type", txt, (c) => c.notNull())
    .addColumn("value", "double precision", (c) => c.notNull())
    .addColumn("max_discount", "double precision", (c) => c.notNull())
    .addColumn("description", txt, (c) => c.notNull())
    .addColumn("per_user_limit", "integer")
    .addColumn("first_booking_only", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("min_subtotal", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("valid_until", txt)
    .addColumn("active", "integer", (c) => c.notNull().defaultTo(1))
    .execute();

  await db.schema
    .createTable("bookings")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("code", txt, (c) => c.notNull().unique())
    .addColumn("user_id", txt, (c) => c.notNull())
    .addColumn("kind", txt, (c) => c.notNull())
    .addColumn("listing_id", txt)
    .addColumn("venue_id", txt)
    .addColumn("city_id", txt, (c) => c.notNull())
    .addColumn("title", txt, (c) => c.notNull())
    .addColumn("venue_name", txt, (c) => c.notNull())
    .addColumn("status", txt, (c) => c.notNull())
    .addColumn("subtotal", "integer", (c) => c.notNull())
    .addColumn("discount", "integer", (c) => c.notNull())
    .addColumn("convenience_fee", "integer", (c) => c.notNull())
    .addColumn("gst_on_fee", "integer", (c) => c.notNull())
    .addColumn("total", "integer", (c) => c.notNull())
    .addColumn("coupon_code", txt)
    .addColumn("attendee", "text")
    .addColumn("starts_at", txt, (c) => c.notNull())
    .addColumn("ends_at", txt, (c) => c.notNull())
    .addColumn("hold_expires_at", txt)
    .addColumn("created_at", txt, (c) => c.notNull())
    .addColumn("payment_ref", txt)
    .addColumn("seeded", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("checked_in_at", txt)
    .execute();
  await db.schema.createIndex("bookings_user_idx").on("bookings").columns(["user_id", "created_at"]).execute();
  await db.schema.createIndex("bookings_listing_idx").on("bookings").column("listing_id").execute();
  await db.schema.createIndex("bookings_venue_idx").on("bookings").column("venue_id").execute();
  await db.schema.createIndex("bookings_hold_idx").on("bookings").columns(["status", "hold_expires_at"]).execute();
  await db.schema.createIndex("bookings_created_idx").on("bookings").column("created_at").execute();
  await db.schema.createIndex("bookings_coupon_idx").on("bookings").columns(["user_id", "coupon_code"]).execute();

  await db.schema
    .createTable("booking_items")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("booking_id", txt, (c) => c.notNull().references("bookings.id").onDelete("cascade"))
    .addColumn("line", "integer", (c) => c.notNull())
    .addColumn("ticket_type_id", txt)
    .addColumn("session_id", txt)
    .addColumn("resource_id", txt)
    .addColumn("starts_at", txt)
    .addColumn("ends_at", txt)
    .addColumn("label", txt, (c) => c.notNull())
    .addColumn("qty", "integer", (c) => c.notNull())
    .addColumn("unit_price", "integer", (c) => c.notNull())
    .execute();
  await db.schema.createIndex("booking_items_booking_idx").on("booking_items").column("booking_id").execute();
  await db.schema.createIndex("booking_items_resource_idx").on("booking_items").columns(["resource_id", "starts_at"]).execute();
  await db.schema.createIndex("booking_items_ticket_idx").on("booking_items").column("ticket_type_id").execute();
  await db.schema.createIndex("booking_items_session_idx").on("booking_items").column("session_id").execute();

  await db.schema
    .createTable("payments")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("booking_id", txt, (c) => c.notNull().references("bookings.id").onDelete("cascade"))
    .addColumn("provider", txt, (c) => c.notNull())
    .addColumn("method", txt, (c) => c.notNull())
    .addColumn("status", txt, (c) => c.notNull())
    .addColumn("amount", "integer", (c) => c.notNull())
    .addColumn("ref", txt, (c) => c.notNull())
    .addColumn("created_at", txt, (c) => c.notNull())
    .execute();
  await db.schema.createIndex("payments_booking_idx").on("payments").column("booking_id").execute();

  // --- auth & platform ---
  await db.schema
    .createTable("otp_codes")
    .addColumn("phone", txt, (c) => c.primaryKey())
    .addColumn("code_hash", txt, (c) => c.notNull())
    .addColumn("expires_at", txt, (c) => c.notNull())
    .addColumn("attempts", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("sent_at", txt, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("auth_sessions")
    .addColumn("id", txt, (c) => c.primaryKey()) // sha-256 of the cookie token; the token itself is never stored
    .addColumn("user_id", txt, (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("created_at", txt, (c) => c.notNull())
    .addColumn("expires_at", txt, (c) => c.notNull())
    .execute();
  await db.schema.createIndex("auth_sessions_user_idx").on("auth_sessions").column("user_id").execute();

  await db.schema
    .createTable("rate_limits")
    .addColumn("key", txt, (c) => c.primaryKey())
    .addColumn("count", "integer", (c) => c.notNull())
    .addColumn("reset_at", txt, (c) => c.notNull())
    .execute();

  // Uploaded images (listing photos, avatars). Base64 in TEXT keeps this portable across dialects;
  // swap for object storage by changing the media repository only.
  await db.schema
    .createTable("media")
    .addColumn("id", txt, (c) => c.primaryKey())
    .addColumn("owner_id", txt, (c) => c.notNull())
    .addColumn("content_type", txt, (c) => c.notNull())
    .addColumn("private", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("bytes", "integer", (c) => c.notNull())
    .addColumn("data", "text", (c) => c.notNull())
    .addColumn("created_at", txt, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("listing_views")
    .addColumn("target_id", txt, (c) => c.notNull())
    .addColumn("day", txt, (c) => c.notNull())
    .addColumn("count", "integer", (c) => c.notNull().defaultTo(0))
    .addPrimaryKeyConstraint("listing_views_pk", ["target_id", "day"])
    .execute();
}

export async function down(db: Db) {
  for (const t of [
    "listing_views", "media", "rate_limits", "auth_sessions", "otp_codes", "payments", "booking_items", "bookings", "coupons", "blocks",
    "slot_rules", "resources", "venues", "ticket_types", "listing_sessions", "listings", "host_members", "host_documents", "hosts",
    "user_following", "user_saved", "users", "journey_templates", "categories", "areas", "cities",
  ]) {
    await db.schema.dropTable(t).ifExists().execute();
  }
}
