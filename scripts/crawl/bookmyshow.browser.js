// BookMyShow (in.bookmyshow.com) — Nagpur events, plays and activities.
// BookMyShow sits behind Cloudflare, which blocks plain HTTP and automated (webdriver) browsers, so this
// runs inside an ordinary browser tab instead:
//   1. Open https://in.bookmyshow.com/explore/events-nagpur in your browser.
//   2. Open DevTools → Console, paste this whole file, press Enter. It takes 1–2 minutes.
//   3. It downloads bookmyshow.json; move it to src/db/seed/real/raw/bookmyshow.json and run `npm run crawl:build`.
(async () => {
  // Explore pages to harvest event links from. Many list national events too; detail pages are
  // filtered to Nagpur venues below.
  const EXPLORE = [
    "events-nagpur", "plays-nagpur", "sports-nagpur", "activities-nagpur", "comedy-shows-nagpur", "events/music-shows-Nagpur",
    "workshops-Nagpur", "book-reading-nagpur", "business-meetups-nagpur", "films-screening-nagpur", "poetry-storytelling-meetups-nagpur",
    "technology-conferences-nagpur", "kids-nagpur", "exhibitions-nagpur", "performances-nagpur", "events-today-nagpur",
    "events-tomorrow-nagpur", "events-this-weekend-nagpur", "theme-parks-nagpur", "water-parks-nagpur", "navratri-celebration-nagpur",
    "festivals-nagpur", "bowling-nagpur", "marathi-plays-nagpur", "hindi-plays-nagpur", "music-shows-nagpur", "open-mic-nagpur",
  ];

  /** Fetch each page same-origin and pull JSON-LD + the "About" text. */
  async function crawlInPage(explore) {
    const links = new Set();
    for (const u of explore) {
      try {
        const t = await (await fetch("/explore/" + u)).text();
        for (const m of t.matchAll(/\/(events|plays|activities|sports)\/([a-z0-9-]+)\/(ET\d{8}|et[a-z0-9]{8})/g)) links.add(`${m[1]}/${m[2]}/${m[3]}`);
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    const strip = (s) => (s || "").replace(/^Why book only on BookMyShow\?[\s\S]*?Enjoy added value when booking together\n?/, "").trim();
    const events = [];
    const attractions = [];
    for (const k of links) {
      await new Promise((r) => setTimeout(r, 250)); // be gentle; bursts get rate-limited
      const r = await fetch("/" + k);
      if (r.status !== 200) continue;
      const t = await r.text();
      const doc = new DOMParser().parseFromString(t, "text/html");
      const ld = [];
      for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const j = JSON.parse(s.textContent);
          ld.push(...(Array.isArray(j) ? j : [j]));
        } catch {}
      }
      const heads = [...doc.querySelectorAll("h1,h2,h3,h4,div,span")].filter((h) => h.childElementCount === 0 && /^About The (Event|Activity|Play|Show)$/i.test(h.textContent.trim()));
      let about = "";
      if (heads[0]) {
        let c = heads[0];
        for (let up = 0; up < 4 && about.length < 40; up++) {
          c = c.parentElement;
          const sib = c.nextElementSibling;
          if (!sib) continue;
          // Leaf blocks keep paragraph breaks, but text that sits directly in a mixed container would be lost.
          const leaves = [...sib.querySelectorAll("p,li,div")].filter((e) => e.childElementCount === 0).map((e) => e.textContent.trim()).filter(Boolean).join("\n");
          const all = sib.textContent.trim();
          about = leaves.replace(/\s/g, "").length >= all.replace(/\s/g, "").length * 0.9 ? leaves : all;
        }
      }
      const url = "https://in.bookmyshow.com/" + k;
      const evs = ld.filter((x) => x && x.location && x.startDate);
      if (evs.length) {
        if (!evs.some((e) => /nagpur/i.test(JSON.stringify(e.location)))) continue;
        const st = t.match(/"category":"([^"]*)","genre":"([^"]*)","tags":"([^"]*)","type":"([^"]*)","language":"([^"]*)","format":"([^"]*)","label":"([^"]*)"/);
        events.push({
          k, url, about: strip(about),
          meta: st ? { category: st[1], genre: st[2], tags: st[3], type: st[4], language: st[5], format: st[6], label: st[7] } : null,
          events: evs.map((e) => ({
            type: e["@type"], name: e.name, start: e.startDate, end: e.endDate, door: e.doorTime, duration: e.duration, lang: e.inLanguage,
            age: e.typicalAgeRange, img: e.image, status: e.eventStatus?.split("/").pop(),
            loc: { name: e.location?.name, addr: e.location?.address?.streetAddress, pin: e.location?.address?.postalCode, lat: e.location?.geo?.latitude, lng: e.location?.geo?.longitude },
            org: e.organizer?.name, performer: (Array.isArray(e.performer) ? e.performer : e.performer ? [e.performer] : []).map((p) => p.name),
            offers: (e.offers?.offers || []).map((f) => [f.name, +f.price, f.availability?.split("/").pop()]),
            low: e.offers?.lowPrice ?? e.offers?.price, high: e.offers?.highPrice,
          })),
        });
        continue;
      }
      // Theme and water parks are "AmusementPark" places rather than events.
      const park = ld.find((x) => x && /AmusementPark|TouristAttraction/.test(String(x["@type"])) && /nagpur/i.test(JSON.stringify(x.address ?? x.location ?? "")));
      if (park) {
        const img = [...new Set([...t.matchAll(/https:\/\/assets-in\.bmscdn\.com\/nmcms\/events\/banner\/[^"' )]+?\.(jpg|jpeg|png|webp)/g)].map((m) => m[0]))].slice(0, 2);
        attractions.push({ k, url, about: strip(about), ld: park, img });
      }
    }
    return { events, attractions };
  }

  if (!location.hostname.endsWith("bookmyshow.com")) throw new Error("Run this on an in.bookmyshow.com tab");
  const data = { source: "in.bookmyshow.com", crawledAt: new Date().toISOString(), ...(await crawlInPage(EXPLORE)) };
  console.log(`${data.events.length} events, ${data.attractions.length} attractions`);
  if (window.__crawlNoDownload) {
    window.__crawlResult = data;
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1) + "\n"], { type: "application/json" }));
  a.download = "bookmyshow.json";
  a.click();
})();
