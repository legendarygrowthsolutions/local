# local. — phase 1 (UI on mock APIs)

Everything to do in your city: events, workshops, meetups, exhibitions, competitions and sports courts. See [PLAN.md](PLAN.md) for the full plan.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests: slot engine, pricing, journey template rules
npm run e2e        # production build + Playwright: golden paths, axe a11y scans, 360/412/1440px layout checks
npm run typecheck
npm run fixtures   # regenerate src/mocks/fixtures/*.json (deterministic)
```

## Trying it

- **Login:** any 10-digit mobile starting 6–9, then any 6-digit OTP. `000000` shows the wrong-code state.
  - Demo user with existing bookings: `9876543210`. A new number walks you through profile setup.
- **Host console** (`/host`):
  - `9000000002`: owner of Tidewater Collective (events)
  - `9000000003`: owner of Smash Arena (5 court venues, team, payouts)
  - `9000000004`: manager at Smash Arena (no revenue, payouts, team or settings)
  - Any other number can apply at `/host/apply`; the superadmin approves it.
- **Superadmin** (`/admin`): `9000000001`. Host approvals and document checks (KYC), listing moderation and featuring, journey templates, categories, cities and areas, bookings and refunds, users.
- **Payments** are a dummy gateway: "Pay" succeeds, "Simulate failure" exercises the failure path (your hold is kept).
- **Coupons:** `LOCAL10` (10% up to ₹200), `FIRST100` (₹100 off).
- **Error states:** add `?mock_error=1` to any `/api/*` call, or set a `mock_error=1` cookie to make every API call fail.
- Mock data lives in memory on the dev server; restart it (or regenerate fixtures) to reset bookings.

## Architecture

```
UI ──► server components call services/* directly (SSR, SEO)
   └─► client components call /api/* route handlers ──► services/*
services/* ──► repositories (interface) ──► mock/ (fixtures + in-memory store)   ← phase 2: Drizzle + Turso
```

| Path | What |
|---|---|
| `src/contracts` | zod schemas + DTO types — the API spec for phase 2 |
| `src/repositories` | data-access interface; `mock/` implementation |
| `src/services` | business logic (discovery, inventory, availability, bookings, auth) |
| `src/mocks` | fixtures, in-memory store (dates auto-shift to "today"), latency |
| `src/lib/slots` | slot engine (generation, peak pricing, tap-to-extend, validation) — unit tested |
| `src/lib/pricing` | convenience fee + GST, coupons — unit tested |
| `src/features/booking` | journey engine: screens are built from the listing's journey template |
| `src/features/host-wizard` | listing wizard for events (all templates) and court venues |
| `src/services/admin.ts` | superadmin: approvals, KYC, moderation, curation, templates, catalog, refunds, roles |
| `src/lib/journey-rules.ts` | validation that keeps every journey template runnable (unit tested against all seed templates) |
| `src/services/host.ts` | host context, roles (money stripped server-side for managers), listings, bookings, check-in, court schedule, payouts, team |
| `src/app` | routes: `/{city}`, `/{city}/{category}[/{sub}]`, `/{city}/e/{slug}`, `/{city}/v/{slug}`, `/{city}/search`, `/book/{e|v}/{id}?step=`, `/book/pay/{id}`, `/book/done/{id}`, `/me/*`, `/login`, `/onboarding`, `/city`, `/host/apply`, `/host`, `/host/listings[/new|/{id}/edit]`, `/host/bookings`, `/host/checkin`, `/host/slots`, `/host/payouts`, `/host/team`, `/host/settings`, `/admin`, `/admin/{hosts,listings,templates,categories,cities,bookings,users}` |

## Quality bar (M7)

- **E2E** (`tests/e2e`, Playwright, against a production build with mock latency off): ticket booking with login at checkout, onboarding, coupon and a failed-then-successful payment; court slot booking + cancellation; free RSVP; host apply → superadmin approval → wizard listing → moderation → live; owner/manager money split; discovery (card tap, search, city fallback).
- **Accessibility**: axe (WCAG 2.1 AA) on every public page and the signed-in user, host and admin areas, at 360px, 412px and 1440px — no serious or critical issues, no sideways scrolling.
- **Lighthouse** (mobile, simulated throttling): performance 95–99, accessibility / best practices / SEO 100 on home, category and detail pages; desktop 100 across the board; CLS 0. With real DevTools throttling the home page LCP is 1.6 s.
