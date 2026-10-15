# Nagpur crawl

Real listings for Nagpur, the only live city, come from three public sites. The crawl keeps two layers:

| Layer | Path | What it is |
| --- | --- | --- |
| Raw | `src/db/seed/real/raw/{district,bookmyshow,khelomore}.json` | What each site publishes, close to its own shape (schema.org JSON-LD, GraphQL results). |
| App fixtures | `src/db/seed/real/nagpur.json` | Hosts, listings, sessions, ticket types, venues, courts and slot rules in the app's contracts. Built from the raw files. |

`npm run db:reset` (or a fresh `npm run dev`) seeds `nagpur.json` alongside the demo data. Imported rows keep their real dates. They are never re-anchored, and the seeder adds no fake bookings or views to them. Mumbai and Pune are hidden (`active: false`); switch them back on from `/admin/cities`.

## Refreshing

```bash
npm run crawl            # District + KheloMore over HTTP, then rebuild nagpur.json
```

BookMyShow blocks plain HTTP and automated browsers, so it runs in a normal browser tab instead:

1. Open https://in.bookmyshow.com/explore/events-nagpur.
2. Paste `scripts/crawl/bookmyshow.browser.js` into DevTools → Console. It takes 1–2 minutes and downloads `bookmyshow.json`.
3. Move that file to `src/db/seed/real/raw/bookmyshow.json`, then run `npm run crawl:build`.

Then `npm run db:reset` to load it.

## What `build.mjs` decides

- **Category and template per listing.** The `MAP` in `build.mjs` is keyed by source URL. New events show up as `Unmapped` in the build output; add a line for each. Multi-date runs that a site only states in its description (garba nights Oct 11–19, water parks open daily) are written there as `run`.
- **Drops** anything that has already ended, KheloMore venues with no bookable courts (paintball, go-karting), and BookMyShow copies of events District also lists (Timezone, Ghar open mic).
- **Courts.** Each KheloMore court's weekday and weekend slot grid gives its opening hours, base hourly price, peak price and peak windows. Prices for 30-minute slots are doubled to hourly.
- **Areas.** The area named in the address wins. Otherwise the nearest neighbourhood is used, and anything more than 18 km out is filed under "Outskirts".
- **Hosts.** One per organiser on District and KheloMore events, and one per venue on BookMyShow, which doesn't name organisers. They are unclaimed (`userId: null`, KYC `none`).
- **Not known, so defaulted.** Capacity (500 per date) and ticket quantity (200 per tier; a tier that is sold out at the source is seeded as sold out). Ticket prices, names, dates, venues, descriptions, images, FAQs and terms are as published.

Images are hot-linked from the sources' CDNs (allowed in `next.config.ts` `images.remotePatterns`).
