# local.

Everything to do in your city: events, workshops, meetups, exhibitions, competitions and sports courts. See [PLAN.md](PLAN.md) for the product plan.

## Run

```bash
npm install
npm run dev          # http://localhost:3000 — creates and seeds ./data/local.db on first run
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
npm run db:seed      # seed the demo dataset (only into an empty database)
npm run db:reset     # wipe, migrate and seed again (dates re-anchor to today)
npm run db:schema    # regenerate db/schema.sql, a readable snapshot of the schema
npm run fixtures     # regenerate the seed fixtures in src/db/seed/fixtures (deterministic)
```

| `DATABASE_URL` | Driver |
|---|---|
| `file:./data/local.db` (default) | SQLite (`better-sqlite3`, bundled) |
| `postgres://…` | Postgres (`npm i pg`) |
| `mysql://…` | MySQL (`npm i mysql2`) |
| `libsql://…` + `DATABASE_AUTH_TOKEN` | Turso (`npm i @libsql/kysely-libsql @libsql/client`) |
| `libsql+file:./data/local.db` | libSQL's engine on a local file (same packages) |

The full test suite is verified on all four engines: SQLite, Postgres, MySQL 8 and libSQL.

The server applies pending migrations itself when it starts (`src/instrumentation.ts`; set `DB_AUTO_MIGRATE=0` to run them yourself). Seeding is always a deliberate step. Seeded events are anchored to the day you seed, so run `npm run db:reset` to bring the demo data back around today.

## Trying it

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
| `src/db/seed` | fixtures + seeder (demo hosts' sales, other players' court bookings, two weeks of views) |
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

### Going live

1. Set `AUTH_SECRET`, a production `DATABASE_URL`, and `TRUSTED_IP_HEADER` if you're behind a proxy.
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
