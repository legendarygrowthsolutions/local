# local.

Everything to do in your city: events, workshops, meetups, exhibitions, competitions and sports courts. See [PLAN.md](PLAN.md) for the product plan.

## Run

```bash
npm install
npm run dev          # http://localhost:3000 — creates ./data/local.db with reference data on first run
npm run db:demo      # optional: load the demo dataset (fake users, hosts, listings, bookings) for local work
npm test             # unit + backend integration tests (each file gets its own temp SQLite database)
npm run test:postgres  # the same suite on Postgres (in-process PGlite), to keep the SQL portable
npm run test:libsql    # …on libSQL (Turso's engine, local file)
npm run test:mysql     # …on MySQL 8 (needs a server; TEST_MYSQL_URL, default mysql://root:test@127.0.0.1:33061)
npm run e2e          # production build + Playwright: golden paths, axe a11y, 360/412/1440px layouts
npm run e2e:providers  # the app wired to MSG91 + Razorpay, against a local stand-in of their HTTP APIs
npm run typecheck
```

### Database

The backend is plain SQL through [Kysely](https://kysely.dev), so it runs on any SQL database. Locally it's a SQLite file; point `DATABASE_URL` elsewhere and nothing else changes (see [.env.example](.env.example)).

```bash
npm run db:migrate   # apply pending migrations
npm run db:seed      # load reference data (launch city, areas, categories, journey templates) into an empty database
npm run db:demo      # reference data + the DEVELOPMENT demo dataset (refuses NODE_ENV=production)
npm run db:reset     # wipe, migrate, load reference data (`npm run db:reset -- --demo` for the demo dataset)
npm run db:schema    # regenerate db/schema.sql, a readable snapshot of the schema
npm run fixtures     # regenerate the seed fixtures in src/db/seed/fixtures (deterministic)
npm run crawl        # refresh Nagpur's real listings from District + KheloMore (BookMyShow: see scripts/crawl/README.md)
```

| `DATABASE_URL` | Driver |
|---|---|
| `file:./data/local.db` (default) | SQLite (`better-sqlite3`, bundled) |
| `postgres://…` | Postgres (`npm i pg`) |
| `mysql://…` | MySQL (`npm i mysql2`) |
| `libsql://…` + `DATABASE_AUTH_TOKEN` | Turso (`npm i @libsql/kysely-libsql @libsql/client`) |
| `libsql+file:./data/local.db` | libSQL's engine on a local file (same packages) |

The full test suite is verified on all four engines: SQLite, Postgres, MySQL 8 and libSQL.

When the server starts it applies pending migrations and, on a brand-new database, loads the reference data (`src/instrumentation.ts`; set `DB_AUTO_MIGRATE=0` to run both yourself).

**Production data:** a production database contains only the reference data (`src/db/seed/reference/`): Nagpur and its areas, the category tree and the journey templates. Users, hosts, listings, bookings and coupons only come from real people using the app. The demo dataset (`src/db/seed/fixtures`, plus the crawled Nagpur listings in `src/db/seed/real`) is for local development and the test suites only, and is never loaded automatically. Demo events are anchored to the day you seed, so run `npm run db:reset -- --demo` to bring them back around today.

## Trying it

On a fresh database, set `SUPERADMIN_PHONES` to your number and sign in: you're the superadmin. Hosts apply at `/host/apply`, and you approve them and their listings at `/admin`.

With the demo dataset loaded (`npm run db:demo`):

- **Login:** any 10-digit mobile starting 6–9. In development no SMS is sent: the code is shown on the login screen (tap it to sign in) and printed in the server log.
  - Demo user with bookings: `9876543210`. A new number walks you through profile setup.
- **Host console** (`/host`):
  - `9000000002`: owner of Tidewater Collective (events)
  - `9000000003`: owner of Smash Arena (5 court venues, team, payouts)
  - `9000000004`: manager at Smash Arena (no revenue, payouts, team or settings)
  - Any other number can apply at `/host/apply` (with real PAN / bank document uploads); the superadmin reviews it.
- **Superadmin** (`/admin`): `9000000001`.
- **Payments** run on the built-in test gateway: "Pay" succeeds and "Simulate failure" exercises the failure path (your hold is kept). Every attempt is recorded in `payments`.
- **Coupons:** `LOCAL10` (10% up to ₹200), `FIRST100` (₹100 off your first booking, once per account, orders from ₹200).
- **Check-in:** `/host/checkin` scans ticket QR codes with the camera (Chrome / Edge / Android) or takes the code typed in.

## Coupons and payouts

- **Coupons** (`/admin/coupons`): percentage or flat, with a cap, minimum order, per-person and overall limits, first-booking-only, a city, and start and end dates (IST, whole days). They are checked when applied and again at payment. A used coupon can't be renamed or deleted, only paused. The platform funds the discount, so hosts are paid the full ticket value.
- **Payouts** are sent by hand. Hosts add their bank account or UPI ID at `/host/payouts`. Each week, `/admin/payouts` lists what's owed per host: bookings made Monday to Sunday, ticket value less the refunded share, due the following Wednesday. Send the money, then record it with the method, UTR or reference, date paid, any TDS or adjustment, and a note. Records are never deleted: a wrong one is voided with a reason, and the week shows as due again. Both sides can download CSVs: all payout records, and the bookings behind any week.

## Architecture

```
UI ──► server components call services/* directly (SSR, SEO)
   └─► client components call /api/* route handlers ──► services/*
services/* ──► repositories (interface) ──► sql/ (Kysely) ──► SQLite | Postgres | MySQL | Turso
```

| Path | What |
|---|---|
| `src/db/migrations` | schema, written once with Kysely's schema builder so it runs on every dialect |
| `src/db/client.ts` | picks the dialect from `DATABASE_URL`; `withTransaction()` for atomic sections |
| `src/db/seed` | `reference/` + `seedReference`: the production seed (city, areas, categories, templates). `fixtures/`, `real/` + `seedDemo`: the dev/test demo dataset (demo hosts' sales, other players' court bookings, two weeks of views, Nagpur's crawled listings) |
| `scripts/crawl` | District / BookMyShow / KheloMore crawlers and the builder that turns them into `src/db/seed/real/nagpur.json` |
| `src/db/mappers.ts` | row ↔ domain: money in integer paise, booleans 0/1, JSON in TEXT, instants in UTC |
| `src/repositories` | data-access interface and its SQL implementation |
| `src/services` | business logic: discovery, inventory, availability, bookings, auth, host, admin, media |
| `src/contracts` | zod schemas + DTO types shared by forms, API and services |
| `src/lib/slots`, `src/lib/pricing`, `src/lib/journey-rules.ts` | slot engine, fees and coupons, journey template rules (unit tested) |
| `src/features/booking` | journey engine: screens are built from the listing's journey template |
| `src/features/host-wizard` | listing wizard for events (all templates) and court venues |

### Security

- **Sessions:** random 256-bit token in an httpOnly, SameSite=Lax cookie (Secure in production). Only its SHA-256 is stored; logout deletes it.
- **Login codes:** random 6 digits, stored as an HMAC (`AUTH_SECRET`), 5-minute expiry, single use, 5 attempts reserved atomically. Sends are limited per number (30 s cooldown, 5 per hour), per IP and globally; verifies per IP.
- **Requests:** every mutating API call must come from our own origin (CSRF); bodies are size-capped and validated with zod; errors never leak internals.
- **Access:** every route and page checks its role. Bookings are owner-only, host data is scoped to the host, managers never receive money fields, and admin pages verify the role themselves.
- **Inventory:** holds re-check availability inside a transaction, so concurrent buyers can't oversell. Each account can have at most 4 unpaid holds, one free place per date, and coupons are re-validated at payment.
- **Uploads:** images and documents are checked by their magic bytes. Listing photos are served from `/media/{id}` with immutable caching. KYC documents are private: only the uploader, owners of that host and superadmins can open them.
- **Headers:** CSP, frame blocking, nosniff, a strict referrer policy, a Permissions-Policy and HSTS in production.

### Dummy services (`DEV=1`)

Set `DEV=1` to run the whole app without any provider accounts: login codes are shown on screen instead of sent by SMS, and payments go through the simulated gateway (success or failure on demand). It overrides `OTP_PROVIDER` and `PAYMENT_PROVIDER`, works on production builds (the E2E suite runs this way), and logs a warning when it's on. Turn it off before real users arrive, because with it on anyone can sign in as anyone.

### Going live

1. Set `AUTH_SECRET`, a production `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` (canonical URLs, sitemap, OG images; read at build time), and `TRUSTED_IP_HEADER` if you're behind a proxy.
   - `SUPERADMIN_PHONES`: the mobile number(s) that become superadmin on sign-in. That's how the first admin gets in; promote others at `/admin/users`.
   - `NEXT_PUBLIC_SUPPORT_EMAIL`: the support and grievance address shown in the terms and privacy policy (`/legal`). Defaults to `support@` your domain. The legal copy names Legendary Growth Solutions LLP, Nagpur (`COMPANY` in `src/lib/utils.ts`), and is a draft for your lawyer to review.
   - Optional: `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` (Maps Embed API) shows a map on listing pages; without it they show the address and a directions link.
   - Leave `DEV` unset.
   - Deploy and start: migrations and the reference data load on first start. Never run `db:demo` against production.
2. **Login codes:** `OTP_PROVIDER=msg91` (India; needs a DLT-approved OTP template) or `twilio` (SMS, plus WhatsApp with an approved template). Both are built and tested against their APIs; they only need your account keys.
3. **Payments:** `PAYMENT_PROVIDER=razorpay` with your keys and webhook secret. Then point a Razorpay webhook at `/api/payments/razorpay/webhook`.
   - The server creates the order for the exact hold total.
   - It verifies the checkout signature, re-checks the payment with Razorpay and captures it.
   - The webhook confirms the booking if the guest closes the tab.
   - Money that arrives after a hold expired is refunded automatically.
   - Cancellations and support refunds go back through Razorpay.

Every variable is listed in `.env.example`. Until a provider is configured, production refuses to send codes or take payments rather than faking them.

## Quality bar

- **Backend integration tests** (`src/**/*.test.ts`, Vitest, on real SQLite, and again on Postgres via PGlite, MySQL 8 and libSQL): repository round-trips for every entity, auth (cooldowns, lockout, single use, rate limits), booking rules and concurrency (parallel holds never oversell), payments, coupons, cancellations, host roles and money stripping, check-in, moderation, discovery, uploads.
- **E2E** (`tests/e2e`, Playwright, production build on a fresh database): ticket booking with login at checkout (a wrong code, then the right one), onboarding, coupon, a failed and then a successful payment; court slot booking and cancellation; free RSVP; host apply → superadmin approval → wizard listing → moderation → live; owner/manager money split; discovery.
- **Provider suite** (`tests/providers`): the production app is configured for MSG91 and Razorpay and talks real HTTP to a local stand-in of both APIs (`tests/providers/fake-providers.mjs`). It covers:
  - login with the code delivered by SMS and never shown on screen;
  - Razorpay Checkout in the browser, declined then paid, with the payment captured;
  - a signed webhook confirming a booking whose guest never returned, a forged webhook refused, and a cancellation refunded through the gateway.

  Only live accounts aren't exercised; they need your keys.
- **Accessibility:** axe (WCAG 2.1 AA) on public, user, host and admin pages at 360, 412 and 1440 px. No serious or critical issues, and no sideways scrolling.
