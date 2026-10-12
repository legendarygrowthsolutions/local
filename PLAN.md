# local. — Phase 1 Plan (UI with mock APIs)

> Working name **local.** (placeholder). This is a local-experiences web app for India: everything you can do in your city, all bookable in one place.
> References: District (Zomato), Playo, KheloMore.
> Wireframes: https://claude.ai/artifact/Tp9XMH2q4A2Peuniz4FXRd (22 screens across 7 rows)

---

## 1. Product scope

| Area | What it covers |
|---|---|
| **Verticals** | Events, meetups, workshops, exhibitions, competitions, sports venue bookings |
| **Listing modes** | Free listing (info only), free RSVP, paid tickets, slot booking, registration (competitions) |
| **Cities (v1)** | Mumbai, Pune, Nagpur. The cities list comes from the API, so adding a city needs no code change. |
| **Interfaces** | **User** (open signup) · **Host/Vendor** (needs approval) · **Superadmin** |
| **Phase 1** | UI only, with every screen reading from mock APIs (no hardcoded data), a dummy payment flow and seeded fixture data |
| **Phase 2** | Turso + Drizzle backend, real OTP, real payment gateway, KYC and payouts |

### Personas
- **User**: browses by city, books tickets or courts, and manages bookings.
- **Host**: an event organiser, venue owner (courts and turfs), workshop instructor or community lead. They create listings, run slots and check-ins, and see sales.
- **Superadmin**: approves hosts, moderates listings, defines the **booking journey templates**, and manages categories, cities, fees and homepage curation.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (latest stable), App Router, TypeScript** | Server rendering and ISR for SEO, route handlers for the mock API |
| Styling | **Tailwind CSS v4** + CSS variables for design tokens | Minimal, fast and themeable |
| Primitives | **shadcn/ui (Radix)** | Accessible dialogs, tabs, popovers. Fully owned code. |
| Motion | **Motion (framer-motion)** | Page transitions, shared-element card→detail, list stagger, micro-interactions |
| Bottom sheets | **vaul** | Native-feeling drawers on mobile (filters, city picker) |
| Carousels | **embla-carousel** | Lightweight and supports touch |
| Data fetching | **TanStack Query** (client) + server components calling the service layer | Caching, optimistic UI, skeletons |
| Client state | **Zustand** (city, booking draft/cart, auth session) | Small, persisted to `localStorage` |
| Forms | **react-hook-form + zod** | One zod schema shared by forms, the API and mocks |
| Dates | **date-fns** (+ `date-fns-tz`, Asia/Kolkata) | Slot maths |
| Icons | **lucide-react** | Consistent stroke icons |
| QR | `qrcode.react` | Ticket QR |
| DB (phase 2) | **Turso (libSQL) + Drizzle ORM** | The schema is drafted in §8 so the mock fixtures match it 1:1 |
| Testing | Vitest (slot engine, pricing) + Playwright (golden booking flows) | |

---

## 3. "No hardcoded data": the mock API architecture

Every screen gets its data through **one service layer**. In Phase 1 that layer is backed by JSON fixtures. In Phase 2 we swap in a Drizzle/Turso implementation and the UI does not change.

```
UI (server + client components)
   │
   ├── server components ──► services/*  (direct call, SEO-friendly, no HTTP hop)
   └── client components ──► /api/*  route handlers ──► services/*
                                                         │
                                         repositories/  (interface)
                                         ├── mock/   ← Phase 1: fixtures + in-memory store
                                         └── db/     ← Phase 2: Drizzle + Turso
```

- `src/mocks/fixtures/*.json` holds seed data: cities, areas, categories, hosts, venues, resources, listings, sessions, ticket types, slot rules, bookings and journey templates.
- `src/mocks/store.ts` is an in-memory store seeded from the fixtures and persisted to a cookie or localStorage per session. Bookings you make in the prototype show up in "My bookings", and host and admin actions such as approvals take effect.
- The mock repos add **artificial latency (200–600 ms)** and an **error toggle** (`?mock_error=1`) so skeletons and error states get built properly.
- `src/lib/api/` is a typed fetch client plus TanStack Query hooks (`useListings`, `useSlots`, `useCreateBooking`…).
- **Contracts** in `src/contracts/*.ts` are zod schemas shared by fixtures, route handlers and forms. These are the API spec we hand to Phase 2.

### Mock API surface (v1)
```
GET  /api/cities                         GET  /api/cities/:slug/areas
GET  /api/categories
GET  /api/home?city=mumbai               (curated rails, banners)
GET  /api/listings?city&category&date&price&area&sort&q&page
GET  /api/listings/:slug                 GET  /api/listings/:id/sessions
GET  /api/venues/:slug                   GET  /api/venues/:id/availability?sport&date&resource
POST /api/auth/otp/send                  POST /api/auth/otp/verify     (any 6 digits)
GET  /api/me    PATCH /api/me            (name, gender, dob, city, interests)
POST /api/bookings/hold                  (seat / slot hold with expiry)
POST /api/bookings/:id/pay               (dummy gateway: success | failure)
GET  /api/me/bookings                    POST /api/bookings/:id/cancel
POST /api/host/apply                     GET  /api/host/application
GET  /api/host/dashboard                 CRUD /api/host/listings, /api/host/resources
GET  /api/host/bookings                  POST /api/host/checkin
GET  /api/admin/host-applications        POST /api/admin/host-applications/:id/{approve|reject|request-changes}
CRUD /api/admin/journey-templates        CRUD /api/admin/categories, /cities
GET  /api/admin/listings?status=review   POST /api/admin/listings/:id/{approve|reject}
```

---

## 4. The booking journey engine (core design)

Different listings need different booking flows. Instead of building a separate flow for each type, every listing references a **Journey Template**, and the UI assembles the flow from the template's configuration.

### 4.1 Journey Template (owned by Superadmin)
```ts
JourneyTemplate {
  id, name, description, allowedCategories[]
  bookingMode: 'none' | 'rsvp' | 'ticketed' | 'slot' | 'registration'
  schedule:    'single' | 'multi_day' | 'recurring' | 'date_range' | 'open_hours'
  pricing:     'free' | 'paid' | 'both'
  ticketScope?: 'per_session' | 'pass' | 'both'          // multi-day / recurring
  steps: StepConfig[]        // ordered; each { type, required, config }
  rules: { seatHoldMins, waitlist, hostApprovalPerBooking, transferable,
           maxPerOrder, minPerOrder }
  fees:  { convenienceFeePct, convenienceFeeFlat, gstOnFeePct, absorbFeeAllowed }
  cancellation: { policy: 'none' | 'full_until' | 'partial', hoursBefore, refundPct }
}
```

**Step types** are the building blocks: `pick_session` (date or day), `pick_pass`, `pick_tickets` (tiers + qty), `pick_sport`, `pick_resource` (court), `pick_slots`, `team_details`, `attendee_form` (custom questions), `review`, `payment`, `confirmation`.

### 4.2 Seed templates
| Template | Steps |
|---|---|
| Info only (free listing) | detail → *Directions / Add to calendar / External link* |
| Free RSVP | detail → attendee_form → confirmation (optional host approval → "Requested") |
| Ticketed – single day | detail → pick_tickets → attendee_form? → review → payment → confirmation |
| Ticketed – multi-day | detail → pick_session \| pick_pass → pick_tickets → review → payment → confirmation |
| Recurring workshop | detail → pick_session (calendar) → pick_tickets → review → payment → confirmation |
| Timed-entry exhibition | detail → pick_session (date in range) → pick_slots (entry window) → pick_tickets → … |
| Court slots – hourly / 30 min | venue → pick_sport → pick_session (date) → pick_resource → pick_slots → review → payment → confirmation |
| Competition – teams | detail → pick division → team_details → review → payment → confirmation |

### 4.3 Slot engine (sports)
- **Resource** (court/turf) → `sport`, `indoor`, `surface`, `slotLengthMins` (30 | 60 | custom), `capacity`.
- **SlotRule** per resource or venue: weekday opening hours, `minDuration`, `maxDuration`, `bufferMins`, `advanceDays`, and price bands (`base`, `peak` with weekday/time windows, special-date overrides).
- **Availability** = generated slots − bookings − holds − host blocks (maintenance, walk-ins).
- UX: tap a start slot, then tap an end slot to extend across contiguous cells. "Any available court" picks the first free one automatically. Peak slots are marked.
- This is pure TypeScript in `src/lib/slots/`, fully unit-tested, and reused unchanged in Phase 2.

### 4.4 Booking state machine
`draft → held (expires) → pending_payment → confirmed | failed | expired → cancelled | refunded | checked_in`
The dummy gateway screen offers **Pay**, **Simulate success** and **Simulate failure** so every branch can be exercised in the UI.

---

## 5. Information architecture & routes (SEO-first)

```
/                               → redirects to /{city} (detected or chosen)
/{city}                         Home (rails, featured, categories)          [SSR/ISR, indexable]
/{city}/{category}              e.g. /mumbai/events, /pune/sports           [indexable]
/{city}/{category}/{sub}        e.g. /mumbai/sports/pickleball              [indexable]
/{city}/e/{slug}                Event / workshop / meetup detail            [indexable, JSON-LD Event]
/{city}/v/{slug}                Venue detail                                [indexable, JSON-LD SportsActivityLocation]
/{city}/search?q=               Search                                      [noindex]
/book/{listingId}/[step]        Booking flow                                [noindex]
/login, /onboarding             OTP → profile → city                        [noindex]
/me, /me/bookings, /me/bookings/{id}, /me/saved
/host/apply, /host (dashboard), /host/listings, /host/listings/new, /host/bookings, /host/slots, /host/checkin, /host/payouts
/admin, /admin/hosts, /admin/listings, /admin/templates, /admin/categories, /admin/cities, /admin/bookings, /admin/users
```

Route groups: `(public)`, `(auth)`, `(user)`, `(host)`, `(admin)`. Each gated area gets its own layout. Middleware does role checks against the mock session.

### SEO checklist
- City and category URLs are server-rendered with `generateMetadata` (title templates like *"Pickleball courts in Andheri, Mumbai | local."*).
- JSON-LD: `Event` (offers, location, organizer, eventStatus), `SportsActivityLocation`, `BreadcrumbList`, `Organization`.
- `sitemap.ts` per city/category/listing, `robots.ts`, canonical URLs, `lang="en-IN"` (English only in v1).
- Dynamic OG images via `next/og` for listings.
- `next/image` with AVIF/WebP, blurred placeholders, and LCP image priority.
- City footer link farm (see desktop wireframe) for internal linking.
- Core Web Vitals targets: LCP < 2.0 s on 4G, CLS < 0.05, INP < 200 ms.

---

## 6. Key UX flows

### 6.1 Auth & onboarding (wireframes 01–04)
1. Phone (+91) → **Get OTP** (also "Skip for now", so browsing works without login and login is only required at checkout).
2. 6-box OTP with auto-advance, paste support, Web OTP API auto-read, a 30 s resend timer and a WhatsApp fallback (UI only).
3. New users only: **Name, Gender (Male / Female / Other / Prefer not to say), DOB (DD/MM/YYYY)**, plus optional interests to personalise the home rails.
4. **City**: ask for geolocation, then pick the nearest supported city by haversine distance against the city centroids from `/api/cities` (no third-party geocoder needed). If permission is denied or times out, show a type-ahead search plus the Mumbai / Pune / Nagpur tiles. The chosen city is stored in a cookie so the server can redirect `/` → `/{city}`.

### 6.2 Discover (05–08)
- Home: city switcher, search, category tiles, featured carousel, quick filters (Today / Weekend / Free / Under ₹500), "Happening this weekend", "Play near you", and "Because you like X" rails, all driven by `/api/home`.
- Category listing: date strip, sub-category chips, filter sheet (when / price / area / sort), infinite scroll.
- Detail: hero gallery, key facts, host card, about, things to know, map, similar listings, and a sticky CTA whose label comes from the journey (*Book tickets / Book a slot / RSVP / Register / Get directions*).

### 6.3 Book (09–14)
- **Ticketed**: day or pass → tiers with steppers (sold out, few left, max per order) → review (hold timer, details, host's custom questions, coupon, fee + GST breakdown) → dummy payment → ticket with QR, calendar, directions, share and PDF.
- **Slots**: sport → date strip → court chips → slot grid (morning/afternoon/evening groups, peak markers, booked states) → review → pay → booking pass.

### 6.4 Account (15–16)
Upcoming / Past / Cancelled bookings, booking detail (QR, cancel per policy), saved items, interests, city, and the **Host on local.** entry point.

### 6.5 Host (17, 19, 20)
- **Apply**: host type → brand details → verification (PAN, bank, GST optional; required only for paid ticketing) → status tracker (*Submitted → In review → Approved / Changes requested*). Until approved, the host console stays locked behind the status screen.
- **Dashboard**: KPIs, listings table with sold/capacity and status (*Draft / In review / Live / Ended*).
- **Create listing wizard**: Basics → Location & media → **Booking setup (pick a journey template; configure courts and slot rules or ticket tiers)** → Pricing → Policies & custom form → Review & submit (goes to admin moderation).
- Also: bookings list, slot calendar (block or unblock), check-in scanner (camera QR, mocked), payouts (mocked, owner only), and team management (invite managers by phone; see §11.1).

### 6.6 Superadmin (21–22)
- Host applications queue with a detail panel, documents and Approve / Request changes / Reject.
- Listing moderation, journey template editor (schedule, pricing, ticket scope, ordered steps, rules, fees, cancellation), categories and tags, cities and areas, bookings and refunds, users, fees and payouts, homepage banners and curated rails.

---

## 7. Design system

- **Look**: calm, neutral interface with one brand colour. Colour comes from the content (event posters, venue photos), not the chrome.
  - **Neutrals (~85% of any screen)**: ground `#F7F7F4`, surface `#FFFFFF`, ink `#121A1B`, muted text `#536062`, hairlines `#E3E8E6`.
  - **Brand (~10%)**: peacock teal `#0B6E79` only for primary CTAs, selected states (dates, slots, chips, tiers), links, the active tab, category icons and the logo dot. Tint `#DDF1F2` for focus rings and soft selected backgrounds. (Violet was dropped on 2026-10-12 because it reads as an AI-made app.)
  - **Feature surface**: deep peacock `#0C2326` for the featured hero, payment amount, ticket header and the host promo card, giving contrast without adding a colour. On dark surfaces only, a gold spark `#E9B44C` (text `#2A1D02`) is used for hero shapes, the logo dot and chips, and a light teal `#7FD0D6` for overlines.
  - **Functional colours (tiny doses, meaning only)**: green `#0B6B3A` = free / open now; coral `#9E2A0E` on `#FFECE6` = urgency (few left, hold timer, selling fast); amber on `#FFF3C4` = test mode / warnings; red `#B42318` = destructive.
  - **No per-category colours.** Categories are told apart by icon and label (a small teal overline such as "WORKSHOP").
  - **Fallback art** for listings without images: muted tone-on-tone shapes (`#E2ECEA`, `#E8EDE6`, `#F2E9E4`, `#E6EAF1`, picked by listing id), so the grid looks calm until real photos arrive.
- **Type**: *Bricolage Grotesque* (display) + *DM Sans* (UI). Fluid type scale.
- **Shape**: 12–24 px radii, 1 px hairlines, almost no shadows, 44 px minimum touch targets.
- **Mobile-first**: bottom tab bar (Home / Explore / Bookings / Profile) under 768 px, top nav on desktop. Sticky bottom CTA bars on detail and booking screens. Sheets on mobile become dialogs on desktop.
- **Motion** (Motion + View Transitions):
  - shared-element card → detail hero
  - 150–250 ms ease-out for UI, spring for sheets
  - staggered list reveal, skeleton shimmer, count-up KPIs
  - slot selection "fill" animation, success checkmark draw, ticket slide-in
  - `prefers-reduced-motion` respected everywhere
- **States** for every list: loading skeleton, empty, error + retry, offline banner.

---

## 8. Data model (draft; Turso schema in Phase 2, fixtures in Phase 1)

```
cities(id, slug, name, state, lat, lng, active)
areas(id, city_id, slug, name)
categories(id, slug, name, parent_id, icon, sort)
users(id, phone, name, gender, dob, city_id, interests_json, role[user|host|admin], created_at)
host_profiles(id, user_id, type, brand_name, city_id, socials_json, kyc_status, status[pending|changes|approved|rejected], reviewed_by, notes)
host_documents(id, host_id, kind, url, status)
journey_templates(id, name, booking_mode, schedule, pricing, ticket_scope, steps_json, rules_json, fees_json, cancellation_json, active)
listings(id, host_id, city_id, area_id, category_id, template_id, slug, title, description, media_json,
         venue_id?, address, lat, lng, age_limit, languages, tags, status[draft|review|live|ended|rejected],
         overrides_json, featured_rank, created_at)
sessions(id, listing_id, starts_at, ends_at, capacity, label)          -- days / occurrences
ticket_types(id, listing_id, session_id?, name, description, price, qty, per_order_max, sale_start, sale_end, is_pass)
form_fields(id, listing_id, label, type, options_json, required)
venues(id, host_id, city_id, area_id, slug, name, amenities_json, hours_json, lat, lng)
resources(id, venue_id, name, sport, indoor, surface, slot_length_mins, capacity)
slot_rules(id, resource_id, weekday_mask, open, close, min_mins, max_mins, buffer_mins, advance_days, price_base, peak_json)
blocks(id, resource_id, starts_at, ends_at, reason)
bookings(id, user_id, listing_id, status, total, fees, tax, coupon_code, hold_expires_at, created_at)
booking_items(id, booking_id, ticket_type_id?, session_id?, resource_id?, starts_at?, ends_at?, qty, unit_price)
attendees(id, booking_id, name, phone, answers_json)
payments(id, booking_id, provider[mock|razorpay], status, ref, amount)
reviews(id, user_id, listing_id|venue_id, rating, text)
saved(user_id, listing_id)
coupons(id, code, type, value, rules_json)
```

---

## 9. Project structure

```
src/
  app/
    (public)/[city]/page.tsx, [category]/…, e/[slug]/, v/[slug]/, search/
    (auth)/login/, onboarding/
    (user)/me/…, book/[listingId]/[step]/
    (host)/host/…
    (admin)/admin/…
    api/…                      ← mock route handlers
    sitemap.ts, robots.ts, opengraph-image.tsx
  components/
    ui/                        ← shadcn primitives
    listing/ booking/ slots/ city/ auth/ host/ admin/ layout/
  features/booking/            ← journey renderer: step registry + per-step components
  lib/  api/ slots/ pricing/ seo/ motion/ utils/
  contracts/                   ← zod schemas (API spec)
  services/                    ← business logic
  repositories/ mock/ (db/ in phase 2)
  mocks/ fixtures/*.json, store.ts, latency.ts
  stores/                      ← zustand (city, session, booking draft)
```

---

## 10. Phase 1 milestones

| # | Milestone | Deliverables |
|---|---|---|
| M0 | **Foundations** | Next.js scaffold, Tailwind tokens, fonts, shadcn, Motion, layout shells (mobile tab bar / desktop nav), contracts, mock repo layer, fixture generator (~3 cities × 40 listings, 10 venues each, 15 hosts, demo bookings) |
| M1 | **Auth & city** | OTP screens, profile setup, geolocation city detection + fallback search, session + role mock, route guards |
| M2 | **Discover** | Home rails, category pages, filters sheet, search, event and venue detail, SEO metadata + JSON-LD + sitemap |
| M3 | **Booking engine** | Journey renderer, ticketed (single/multi-day/pass), RSVP, slots (30/60 min, multi-court), registration, review, dummy payment, confirmation + QR, hold timers |
| M4 | **User account** | Bookings list/detail, cancel flow, saved, profile edit |
| M5 | **Host console** | Apply + status, dashboard, listing wizard (all templates), courts & slot rules, bookings, slot calendar blocks, mock check-in |
| M6 | **Superadmin** | Host approvals, listing moderation, journey template editor, categories, cities, users, bookings |
| M7 | **Polish** | Motion pass, responsive QA (360 → 1440), a11y audit, Lighthouse ≥ 95 SEO / ≥ 90 perf, Playwright golden paths |

The user side (M1–M4) gets the most design attention, as you asked. Host and admin come after and reuse the same primitives.

---

## 11. Decisions (confirmed 2026-10-11)

| Topic | Decision |
|---|---|
| Brand | **local.** for now |
| Convenience fee | **Paid by the user**, shown as a separate line with GST on the fee (rate set per journey template) |
| Paid ticketing | **Verification first.** An approved host can publish free listings right away. Paid ticketing unlocks once KYC (PAN, bank, GST if applicable) is verified. |
| Login | Browsing is fully open. **Login is required only for booking and checkout** (the OTP sheet opens at the "Book" CTA and returns the user to the same step). |
| Languages | **English only** for v1 |
| Maps | **Google Maps** (Maps JS + Places for venue address autocomplete; static map on detail pages) |
| Reviews & ratings | **Not in v1.** Hide rating UI; keep the data model slot for later. |
| Host team | **Yes, two roles: Owner and Manager** (see §11.1) |

### 11.1 Host team roles
| Capability | Owner | Manager |
|---|---|---|
| Create / edit listings, courts, slot rules | ✓ | ✓ |
| View bookings & attendee lists | ✓ | ✓ |
| Check-in scanner | ✓ | ✓ |
| Block / unblock slots | ✓ | ✓ |
| Revenue, gross sales, payouts, bank/KYC | ✓ | ✗ (hidden: money columns and KPI tiles are not rendered) |
| Invite / remove team members | ✓ | ✗ |
| Host profile & settings | ✓ | ✗ |

Data model: `host_members(id, host_id, user_id, role[owner|manager], invited_by, status)`. The mock session carries `hostRole`, and the API strips monetary fields for managers (enforced server-side, not just hidden in the UI). Managers are invited by phone number and log in with OTP like any other user.

---

## 12. Build status

| Milestone | Status |
|---|---|
| M0 Foundations | ✅ Next.js 16 + Tailwind v4 tokens, contracts, repository/mock layer, deterministic fixture generator (3 cities · 108 listings · 30 venues · 122 courts) |
| M1 Auth & city | ✅ OTP login (Web OTP, resend timer, error state), profile setup, geolocation → nearest city with type-ahead fallback, login-at-checkout with return to the same step |
| M2 Discover | ✅ Home rails (personalised), category/sub-category explorer (date strip, filters sheet, infinite scroll), search, event + venue detail, metadata, JSON-LD, sitemap, robots, OG images |
| M3 Booking engine | ✅ Template-driven journeys: ticketed single / multi-day + season pass / recurring batches / timed entry / RSVP / team registration / court slots (30 & 60 min, any-court auto-pick, tap-to-extend), holds with timers, coupons, dummy gateway (success + failure), QR ticket, add-to-calendar |
| M4 User account | ✅ Profile, bookings (upcoming / past / cancelled), booking detail with policy-based cancellation and refunds, saved items, profile edit |
| M5 Host console | ✅ Apply (4 steps, docs, GSTIN check) + status tracker; dashboard; listing wizard for every journey template and court venues (paid types locked until KYC); listings with moderation states; bookings (filters, search, CSV, inline check-in); check-in scanner (mock camera + code entry); court calendar with blocks; payouts (weekly cycles); team invites; settings. Owner/manager split enforced server-side |
| M6 Superadmin | ✅ Overview (queues, ticket value, platform fees, by city); host applications with per-document verification driving KYC, approve / request changes / reject / suspend; listing moderation with automated checks, send-back notes, take-down and homepage featuring; journey template editor (reorder, rules, fees, cancellation, live validation + user-flow preview, usage warnings); categories; cities & areas (new cities go live without code); bookings search with support refunds; users and superadmin role. Prototype shortcuts from M5 removed |
| M7 Polish | ✅ Motion pass (card → detail cover morph via React `<ViewTransition>`, CSS scroll-driven rail reveal, count-up KPIs, offline banner, reduced motion everywhere); responsive QA 360 → 1440; axe a11y audit fixed (contrast token, decorative art, tap targets, heading order); Lighthouse mobile perf 95–99 / a11y, BP, SEO 100; Playwright golden paths (47 checks across 3 viewports) |
| Design alignment | ✅ 2026-10-12: all 22 screens rebuilt to the wireframe canvas. New to support them: profile photo, follow a host, notification preferences, attendee email + editable details on review, search kind tabs and price range, per-sport venue picker, poster date chips, week-over-week host KPIs, booking-journey cards in the listing editor (slot booking converts a listing into a venue), admin Payouts & fees and Homepage & banners, a help/terms/privacy page |
| UI QA pass | ✅ 2026-10-12: every route checked at 390 px and 1440 px for all roles (no crashes or sideways scroll). Fixed: city sheet on desktop (now a centred dialog; every `Sheet` is a drawer on phones and a dialog from 768 px up); desktop layouts for host apply (split pitch panel + form), login (art + sign-in card), city picker and onboarding (centred card); leftover violet in disabled buttons and decorative art; a stray 404 to the venue-availability API on event bookings. Nagpur's city tile is orange (Orange City). Account area (`/me/*`) gets a desktop sidebar (identity, sections, host link, log out) with pages filling the content column; booking detail is two columns. Booking summary shows a "from ₹X" hint until something is picked, instead of "Free" |

### Implementation notes
- **Cache Components is off for phase 1** (`next.config.ts`). The mock store is mutable and time-based, so pages render per request. Revisit when Turso lands.
- Booking route is `/book/{e|v}/{id}?step=select|details|review` (one page; steps live in the URL so the back button works), then `/book/pay/{bookingId}` and `/book/done/{bookingId}`.
- A failed dummy payment keeps the hold (`pending_payment`) so the user can retry until the timer runs out.
- Fixture dates are stored relative to an anchor day and shifted to "today" when the store loads, so the prototype never goes stale.
- Other people's court bookings are seeded deterministically (`src/mocks/occupancy.ts`) rather than stored as rows; real bookings made in the prototype are layered on top.
- Demo hosts get realistic booking rows generated at store load (`src/mocks/seed-host-bookings.ts`). They mirror inventory the fixtures already count as sold (ticket `sold`, seeded court occupancy), are flagged `seeded`, and are excluded from availability maths so nothing is double-counted.
- Edits to a **live** listing apply immediately in the prototype; dates, ticket types or courts that already have active bookings can't be removed.
- Host team invites activate when the invited number logs in with OTP.
- Journey template validation lives in `src/lib/journey-rules.ts` and runs in both the editor and the API. A template's booking mode is locked while listings use it.
- Suspending a host (rejecting an approved host) hides all their listings from discovery immediately; inactive cities return 404.
- Performance work in M7: variable fonts (one file per family), `LazyMotion` (`m` components, features loaded after hydration), city sheet and toaster loaded on demand, and no streaming skeleton on the city home (data is in memory, so the skeleton only delayed the real content).
- Real bug found by the E2E suite: stale slots stayed tappable while a new date loaded (and could revert the date). Fixed in `slot-select.tsx`.
- `/city` asks for location on load by design (requirement: default city from location permission); Lighthouse marks this down on that one non-indexed page.
