# Travel Decision Engine — Data Source Audit

Audit date: 2026-08-20
Owner: product
Status: pre-integration. **No paid API has been purchased. No commercial source is scraped.**

This document exists to satisfy the rule in the product spec: audit every external source
*before* implementing integrations, and do not build the system around a source that cannot
legally or commercially be accessed.

---

## 1. Acquisition rules (non-negotiable)

1. Do **not** scrape Travelko, Rakuten Travel, Yahoo Travel, Jalan, Booking.com, Agoda,
   airline sites, or any other commercial travel site.
2. Do **not** bypass CAPTCHA, `robots.txt`, authentication, rate limits, anti-bot systems,
   or any technical restriction.
3. Preference order: official API → affiliate API → affiliate feed → partner program →
   licensed dataset → public/open feed → permitted structured data.
4. If a source cannot be accessed under its own terms, **the product is not built around it.**
   It is either replaced by a modelled estimate or the feature is cut.

Rule 4 is the reason the MVP ships with a modelled cost engine rather than a live price
aggregator. See §4.

---

## 2. Verification legend

Terms, rate limits, and commission rates change without notice. Every commercial claim below
carries a status:

| Status | Meaning |
| --- | --- |
| `VERIFIED 2026-08` | Checked against the provider's own documentation on the audit date. |
| `UNVERIFIED` | Believed accurate from public knowledge; **must be re-checked at the terms URL before any integration work begins.** |
| `REQUIRES APPROVAL` | Access is gated behind an application the company has not submitted. |

Nothing in this document authorises an integration on its own. The gate for writing
integration code is: status `VERIFIED`, terms read in full, and the entry in
`docs/cost-model.md` updated.

---

## 3. Decision summary

| Layer | MVP decision | Source |
| --- | --- | --- |
| Destination knowledge | Own curated seed dataset | `engine/data/destinations.js` |
| Transport cost | Modelled estimate, published fare structures | Seed dataset + fare policy tables |
| Transport time | Modelled door-to-door, seed dataset | Seed dataset |
| Hotel price band | Modelled estimate at MVP; Rakuten Travel API at Phase 1.5 | Seed → Rakuten Web Service |
| Hotel booking links | Rakuten affiliate URL | Rakuten Affiliate |
| Flight booking links | Affiliate deep link via ASP | ValueCommerce / AccessTrade |
| Local transit feasibility | Modelled score, informed by open data | ODPT / GTFS-JP |
| Maps / routing | **None at MVP** (avoided on cost grounds) | — |
| LLM parsing | **None at MVP** (rule-based parser) | — |

Total external spend required to run the MVP: **¥0/month.** See `docs/cost-model.md`.

---

## 4. The finding that shaped the architecture

Rakuten Web Service limits each `applicationId` to roughly **one request per second**, returning
`429 Too Many Requests` past that, with account suspension for sustained abuse.
(`VERIFIED 2026-08`.)

The engine compares ~20 destinations per query. A live hotel lookup per destination per user
request would need 20+ sequential seconds and would breach the limit under any real concurrency.

**Consequence — this is a hard architectural constraint, not a tuning problem:**

- Destination-level price bands are **precomputed offline** by a scheduled batch job and served
  from cache. A nightly batch at 1 rps has a budget of ~86,000 calls/day, which is ample.
- Live API calls happen **only** for a single chosen destination's hotel shortlist, after the
  user has narrowed down — one destination, not twenty.
- The user-facing decision path never blocks on a third-party API.

This is why the engine is built around a `PriceSource` interface with a seed implementation:
the recommendation logic is identical whether a number came from the seed dataset or a live
API, so sources can be swapped in per-destination without touching the scoring layer.

---

## 5. Source audit

### 5.1 Rakuten Web Service — Rakuten Travel APIs — **ADOPT (Phase 1.5)**

- **Provider:** Rakuten Group, Inc.
- **Data available:** Hotel search by area/lat-lon/hotel number, vacancy search with real
  bookable rooms and rates, hotel detail, keyword search, area master, review scores.
- **API available?** Yes. REST/JSON, `applicationId` required. Seven Rakuten Travel endpoints.
  `VERIFIED 2026-08`
- **Affiliate program?** Yes, and unusually well integrated: passing `affiliateId` as a request
  parameter makes the API return a ready-made `affiliateUrl` in the response. Hotel booking,
  overseas stays, highway bus, and rental car are commissionable. `VERIFIED 2026-08`
- **Commercial use permitted?** Yes under the Rakuten Web Service terms, subject to the
  attribution and rate rules. Re-selling or bulk redistribution of the raw data is not.
  Re-read the terms in full before integration. `UNVERIFIED` on the specific caching clause —
  **must confirm the permitted cache duration before building the nightly batch in §4.**
- **Attribution required?** Yes. The Rakuten Web Service logo/credit must be displayed on any
  page presenting the data.
- **Rate limits:** ~1 request/sec per `applicationId`; `429` when exceeded; sustained excess
  risks suspension. Relaxation is possible for affiliates with demonstrated volume.
  `VERIFIED 2026-08`
- **Free tier:** Entirely free.
- **Estimated monthly cost:** ¥0.
- **Commission potential:** High. Domestic hotels are the single largest commissionable
  category for this product, and Rakuten Travel is a top-tier domestic OTA.
- **Implementation difficulty:** Low. Plain GET + JSON, no OAuth.
- **Terms URL:** https://webservice.rakuten.co.jp/documentation/vacant-hotel-search and the
  Rakuten Web Service terms of use linked from https://webservice.rakuten.co.jp/
- **Alternative source:** Jalan (§5.2), Yahoo Travel (§5.3), Booking.com (§5.4).

> **This is the highest-value source in the audit.** It is free, it is commercially usable,
> it returns real availability, and it emits its own affiliate links. It should be the first
> integration after the MVP proves the decision flow.

### 5.2 Recruit WEB Service — Jalan APIs — **DEFER (Phase 2)**

- **Provider:** Recruit Co., Ltd.
- **Data available:** Accommodation search, plan information, vacancy search, area master.
- **API available?** Yes, believed still operating as of 2025. Note Recruit has retired
  adjacent APIs before (the legacy Hot Pepper `api.hotpepper.jp` endpoint was shut down in
  Oct 2023), so treat continuity as a risk. `UNVERIFIED`
- **Affiliate program?** Yes, via Recruit's own affiliate arrangements and major ASPs.
  `UNVERIFIED`
- **Commercial use permitted?** Requires reading the current Recruit WEB Service terms.
  `UNVERIFIED`
- **Attribution required?** Yes, expected. `UNVERIFIED`
- **Rate limits:** Not confirmed. Assume conservative until measured.
- **Free tier:** Believed free with registration.
- **Estimated monthly cost:** ¥0.
- **Commission potential:** High — Jalan is a top-two domestic OTA.
- **Implementation difficulty:** Low–medium.
- **Terms URL:** https://webservice.recruit.co.jp/ and its FAQ at
  https://webservice.recruit.co.jp/faq.html
- **Alternative source:** Rakuten (§5.1).
- **Decision:** Do not build now. Rakuten alone gives adequate hotel coverage for a decision
  engine. Add Jalan only when price-band accuracy across two sources becomes the bottleneck.

### 5.3 Yahoo! Travel (Yahoo! Developer Network) — **DEFER**

- **Provider:** LY Corporation.
- **Data available:** Historically hotel search/vacancy.
- **API available?** Availability of the travel-specific endpoints has changed over time.
  `UNVERIFIED` — must be checked directly.
- **Affiliate program?** Yes, principally through ValueCommerce (a LY group ASP).
- **Commercial use permitted?** `UNVERIFIED`
- **Attribution required?** Expected yes.
- **Rate limits / free tier / cost:** `UNVERIFIED` / believed free / ¥0.
- **Commission potential:** Medium–high.
- **Implementation difficulty:** Low–medium.
- **Terms URL:** https://developer.yahoo.co.jp/
- **Alternative source:** Rakuten (§5.1).
- **Decision:** Not needed for MVP.

### 5.4 Booking.com — **REQUIRES APPROVAL (Phase 2, outbound only)**

- **Provider:** Booking.com B.V.
- **Data available:** Global hotel content, availability, pricing via the Demand API.
- **API available?** Yes, but the Demand API is partner-gated, not self-serve.
  `REQUIRES APPROVAL`
- **Affiliate program?** Yes, an established affiliate partner programme.
- **Commercial use permitted?** Only under an executed partner agreement.
- **Attribution required?** Per agreement.
- **Rate limits:** Per agreement.
- **Free tier:** Affiliate link generation is free; API access is gated.
- **Estimated monthly cost:** ¥0 for links; API terms negotiated.
- **Commission potential:** High, but weaker for Japan domestic than Rakuten/Jalan.
- **Implementation difficulty:** Medium — plus partner onboarding time.
- **Terms URL:** https://www.booking.com/affiliate-program/v2/index.html
- **Alternative source:** Rakuten (§5.1) for domestic; Agoda (§5.5) for Asia outbound.
- **Decision:** Irrelevant to a Japan-domestic MVP. Revisit at the "Japan outbound" stage.

### 5.5 Agoda Partners — **REQUIRES APPROVAL (Phase 3)**

- **Provider:** Agoda Company Pte. Ltd.
- **Data available:** Asia-weighted hotel inventory and pricing.
- **API available?** Partner-gated. `REQUIRES APPROVAL`
- **Affiliate program?** Yes.
- **Commercial use / attribution / rate limits:** Per agreement.
- **Free tier:** Link-level only.
- **Estimated monthly cost:** ¥0 at link level.
- **Commission potential:** Medium-high for the Asia expansion stage.
- **Implementation difficulty:** Medium.
- **Terms URL:** https://partners.agoda.com/
- **Alternative source:** Booking.com (§5.4).
- **Decision:** Out of scope until the Asia phase.

### 5.6 Travelko (トラベルコ) — **REJECT**

- **Provider:** Open Door Inc.
- **Data available:** Metasearch comparison across OTAs — precisely the data this product wants.
- **API available?** No public API.
- **Affiliate program?** Not in a form usable as a data source.
- **Commercial use permitted?** **No.** There is no permitted automated access path.
- **Decision:** **Explicitly rejected as a data source.** It is a metasearch competitor with no
  API, so the only way to obtain its data would be scraping, which rule 1 forbids. Travelko is
  treated purely as a competitor in `docs/competitive-analysis.md`, never as an input.
- **Alternative source:** Go to the underlying OTAs directly via their own APIs (§5.1–§5.3).

### 5.7 ANA / JAL / LCC carrier sites — **REJECT as data source**

- **Provider:** ANA, JAL, Peach, Jetstar Japan, Skymark, Solaseed, ADO, StarFlyer.
- **Data available:** Live domestic fares and availability.
- **API available?** **No public/self-serve fare API.** Carrier APIs are for GDS and contracted
  distribution partners. `VERIFIED 2026-08` (no public developer programme found)
- **Affiliate program?** Not directly from the carriers as a rule; ANA and JAL branded offers
  appear on Japanese ASPs (ValueCommerce, AccessTrade), and consolidators such as
  Airtrip / Travel-co run their own ASP offers.
- **Commercial use permitted?** Scraping carrier sites is forbidden by rule 1 and by their terms.
- **Decision:** **Flight prices are modelled, not fetched.** The seed dataset carries typical
  round-trip fare bands by route and month, and the UI labels them as estimates. Booking is
  handed off to an affiliate deep link where the user sees the real live price.
- **Alternative source:** Skyscanner/Travelpayouts/Amadeus/Duffel (§5.8) if live fares later
  prove necessary.

> This is the largest accuracy compromise in the MVP and it is a deliberate one. A decision
> engine needs fares that are *approximately right for comparison*, not exact. Exactness is
> deferred to the booking hand-off, where the provider shows the real price anyway.

### 5.8 Flight fare aggregators (Skyscanner / Travelpayouts / Amadeus / Duffel) — **DEFER**

- **Provider:** Various.
- **Data available:** Multi-carrier fare search, some with Japan domestic coverage.
- **API available?** Yes for all four; Skyscanner and Travelpayouts are affiliate-oriented,
  Amadeus has a self-serve tier, Duffel is a booking API. `UNVERIFIED` on current Japan
  domestic LCC coverage — **coverage must be tested before committing**, as Japan domestic is
  historically thin in global aggregators.
- **Affiliate program?** Skyscanner and Travelpayouts, yes.
- **Commercial use permitted?** Yes under their partner terms.
- **Attribution required?** Per agreement.
- **Rate limits:** Tiered; self-serve tiers are typically low.
- **Free tier:** Amadeus offers a limited free test tier; Travelpayouts is free to affiliates.
- **Estimated monthly cost:** ¥0 on free tiers, rising quickly with volume.
- **Commission potential:** Low per booking on flights; flights are a thin-margin category.
- **Implementation difficulty:** Medium.
- **Terms URL:** https://developers.amadeus.com/ , https://www.travelpayouts.com/ ,
  https://partners.skyscanner.net/
- **Decision:** Do not integrate until modelled fares are demonstrably the cause of bad
  recommendations. Flight commission is too thin to justify paid fare data early.

### 5.9 公共交通オープンデータセンター (ODPT) — **ADOPT (informative only)**

- **Provider:** 公共交通オープンデータ協議会 (Public Transportation Open Data Council).
- **Data available:** Rail and bus timetables, stations, routes, some real-time.
- **API available?** Yes, plus a CKAN data catalogue. Free developer registration.
  `VERIFIED 2026-08`
- **Affiliate program?** N/A.
- **Commercial use permitted?** **Per-dataset, not blanket.** Datasets carry CC0 or CC BY 4.0,
  and the Council explicitly warns that accuracy-critical uses (timetable and route guidance,
  paid or free) and commercial use require confirming each dataset's specific conditions.
  `VERIFIED 2026-08`
- **Attribution required?** Yes for CC BY 4.0 datasets; not for CC0.
- **Rate limits:** Per developer site terms.
- **Free tier:** Free with registration.
- **Estimated monthly cost:** ¥0.
- **Commission potential:** None (it is a quality input, not a revenue source).
- **Implementation difficulty:** Medium — GTFS-JP parsing is non-trivial.
- **Terms URL:** https://www.odpt.org/overview/ , https://ckan.odpt.org/dataset
- **Alternative source:** GTFS-JP feeds published by individual operators and municipalities.
- **Decision:** Use to *inform* the hand-authored local-transit convenience scores in the seed
  dataset. **Do not** present ODPT-derived times as authoritative journey guidance — that is
  exactly the accuracy-critical use the Council warns about, and this product does not need it.

### 5.10 GTFS-JP / 標準的なバス情報フォーマット — **ADOPT (informative only)**

- **Provider:** 国土交通省 standard; published by individual operators and municipalities.
- **Data available:** Bus stops, routes, timetables in GTFS-JP.
- **API available?** Static feed downloads rather than an API.
- **Affiliate program?** N/A.
- **Commercial use permitted?** Per-publisher licence; many are open, some are not.
  `UNVERIFIED` per feed.
- **Attribution required?** Usually yes.
- **Rate limits / free tier / cost:** N/A / free / ¥0.
- **Implementation difficulty:** Medium.
- **Terms URL:** https://gtfs-jp.org/
- **Decision:** Same posture as §5.9 — informs "can a family without a car actually get around
  here?" scoring, nothing more.

### 5.11 国土数値情報 / e-Stat / 観光庁統計 — **ADOPT**

- **Provider:** 国土交通省 / 総務省統計局 / 観光庁.
- **Data available:** Geography, municipal boundaries, tourist facility locations, accommodation
  statistics, visitor volumes and seasonality.
- **API available?** e-Stat has an API; 国土数値情報 is bulk download.
- **Affiliate program?** N/A.
- **Commercial use permitted?** Yes, generally under the government standard terms of use
  (compatible with CC BY 4.0). `UNVERIFIED` per dataset.
- **Attribution required?** Yes — source must be credited.
- **Rate limits:** e-Stat requires a free API key.
- **Free tier / cost:** Free / ¥0.
- **Implementation difficulty:** Low–medium.
- **Terms URL:** https://www.e-stat.go.jp/api/ , https://nlftp.mlit.go.jp/ksj/
- **Decision:** Good long-term input for seasonality and crowding signals in the moat dataset.
  Not required for MVP.

### 5.12 気象庁 (JMA) open data — **ADOPT (Phase 2)**

- **Provider:** 気象庁.
- **Data available:** Climate normals by observation point and month — directly useful for
  "is the beach actually swimmable in September?"
- **API available?** Published JSON endpoints and bulk climate statistics.
- **Commercial use permitted?** Yes, under JMA's terms, with attribution. `UNVERIFIED`
- **Attribution required?** Yes.
- **Free tier / cost:** Free / ¥0.
- **Implementation difficulty:** Low.
- **Terms URL:** https://www.jma.go.jp/jma/kishou/info/coment.html
- **Decision:** Seasonality is hand-authored in the seed dataset for MVP. Replace with JMA
  climate normals when the destination count grows past hand-maintainable.

### 5.13 OpenStreetMap / Wikidata / Wikivoyage — **ADOPT (careful attribution)**

- **Provider:** OSM Foundation / Wikimedia.
- **Data available:** POIs, station locations, destination descriptions.
- **API available?** Overpass API (OSM); Wikidata query service; Wikivoyage dumps.
- **Commercial use permitted?** Yes. OSM is ODbL; Wikidata is CC0; Wikivoyage is CC BY-SA.
- **Attribution required?** **Yes, and the licences differ in kind.** ODbL carries share-alike
  obligations on derived databases and CC BY-SA is a copyleft licence — neither can be quietly
  mixed into a proprietary dataset. Legal review required before any derived data ships.
- **Rate limits:** Overpass is shared infrastructure — heavy use requires self-hosting.
- **Free tier / cost:** Free / ¥0.
- **Implementation difficulty:** Low technically, **medium-high on licence hygiene.**
- **Terms URL:** https://www.openstreetmap.org/copyright , https://creativecommons.org/licenses/by-sa/4.0/
- **Decision:** Use Wikidata (CC0, no obligations) freely. Treat OSM and Wikivoyage as
  reference-only for hand-authoring until the share-alike question has been reviewed.

### 5.14 Google Maps Platform (Routes / Distance Matrix / Places) — **REJECT for MVP (cost)**

- **Provider:** Google.
- **Data available:** Door-to-door routing, transit directions, travel times, place details.
- **API available?** Yes, excellent quality.
- **Affiliate program?** N/A.
- **Commercial use permitted?** Yes, with strict caching and display restrictions — notably,
  results generally may not be stored long-term or displayed without a Google map.
- **Attribution required?** Yes, and display requirements are prescriptive.
- **Rate limits:** High.
- **Free tier:** A monthly credit exists, but a comparison engine touching ~20 destinations per
  query burns it fast.
- **Estimated monthly cost:** See `docs/cost-model.md` — this is the single largest cost risk in
  the whole product and the main reason to model travel times instead.
- **Implementation difficulty:** Low.
- **Terms URL:** https://developers.google.com/maps/terms
- **Alternative source:** Hand-authored door-to-door times in the seed dataset (chosen);
  ODPT/GTFS-JP for a self-hosted alternative later.
- **Decision:** **Rejected for MVP.** The caching restrictions are as much of a problem as the
  price: a decision engine wants to precompute and store travel times, which is the thing the
  terms restrict. Modelled times are good enough to rank destinations.

### 5.15 Affiliate networks (ValueCommerce / A8.net / AccessTrade / 楽天アフィリエイト) — **ADOPT (revenue layer)**

- **Provider:** ValueCommerce, Fan Communications (A8.net), Interspace (AccessTrade), Rakuten.
- **Data available:** None — these are the *monetisation* layer, not a data source.
- **API available?** Some offer link-generation and reporting APIs to approved affiliates.
- **Affiliate program?** This *is* the affiliate programme. Domestic hotels, flights/consolidators,
  rental cars, activities, insurance, eSIM, and tours are all available as offers.
- **Commercial use permitted?** Yes once the site is approved into each programme.
  `REQUIRES APPROVAL` — approval generally requires a live site with real content.
- **Attribution required?** Disclosure of affiliate relationships is required, and Japanese
  stealth-marketing rules (景品表示法 / ステマ規制, in force since Oct 2023) require clear
  advertising labelling. **This is a compliance requirement, not a nicety.**
- **Rate limits / free tier / cost:** N/A / free to join / ¥0.
- **Commission potential:** **This is the entire MVP revenue model.**
- **Implementation difficulty:** Low technically; the work is approval and disclosure.
- **Terms URL:** https://www.valuecommerce.ne.jp/ , https://www.a8.net/ ,
  https://www.accesstrade.ne.jp/ , https://affiliate.rakuten.co.jp/
- **Decision:** Adopt. Until approvals land, the engine emits **plain, untracked public search
  links**. Affiliate IDs are injected from environment configuration, so no code change is
  needed when approvals arrive, and **no fabricated tracking IDs ever ship.**

### 5.16 Own seed dataset — **ADOPT (MVP backbone)**

- **Provider:** This project.
- **Data available:** ~20 curated Japan domestic destinations: access routes and door-to-door
  times from Tokyo/Osaka/Nagoya, monthly price indices, hotel tier bands, meal indices, local
  transport profiles, activity rates, family suitability factors, advantages and cautions.
- **API available?** N/A — it is a local module.
- **Commercial use permitted?** Yes, it is ours.
- **Attribution required?** No.
- **Rate limits / free tier / cost:** None / N/A / ¥0.
- **Commission potential:** Indirect — it is what makes the recommendation worth clicking.
- **Implementation difficulty:** Low to build, **medium to keep fresh** — this is the real cost.
- **Decision:** Adopt as the MVP backbone.

**Honest statement of its limits.** Every number in the seed dataset is a *planning estimate*,
hand-authored from public fare structures and typical market rates. It is not live pricing and
must never be presented as such. Each record therefore carries explicit
`provenance: { class, lastReviewed, confidence }`, the UI labels outputs as estimates, and
`class: "seed-estimate"` is the value that a future `"partner-api"` replaces field by field.
The engine is designed so that swapping the source does not change the scoring logic.

---

## 6. Rejected sources, restated

| Source | Reason |
| --- | --- |
| Travelko | No public API. Data only obtainable by scraping. Competitor, not input. |
| Rakuten/Jalan/Yahoo **web pages** | APIs exist — use those. Never scrape the sites. |
| Booking.com / Agoda **web pages** | Partner APIs exist and are gated. Never scrape. |
| ANA / JAL / LCC **web pages** | No public fare API. Model fares instead; never scrape. |
| Google Maps Platform (MVP) | Cost and caching restrictions conflict with a precompute design. |
| Any source requiring CAPTCHA/bot bypass | Forbidden by rule 2, without exception. |

---

## 7. Re-verification checklist

Run before writing any integration code, and quarterly thereafter.

- [ ] Rakuten Web Service terms re-read; **permitted cache duration confirmed** (blocks the §4 batch design)
- [ ] Rakuten rate limit re-confirmed (assumed ~1 rps)
- [ ] Rakuten affiliate approval obtained; `RAKUTEN_AFFILIATE_ID` provisioned
- [ ] Recruit WEB Service (Jalan) confirmed still operating, terms read
- [ ] Yahoo! Developer Network travel endpoint availability confirmed
- [ ] ODPT per-dataset licences confirmed for each dataset actually used
- [ ] GTFS-JP per-publisher licences confirmed for each feed actually used
- [ ] OSM/Wikivoyage share-alike obligations legally reviewed before any derived data ships
- [ ] ASP approvals (ValueCommerce / A8 / AccessTrade) obtained
- [ ] Affiliate disclosure and ステマ規制 labelling present on every page carrying affiliate links
- [ ] `docs/cost-model.md` updated with any newly committed spend

---

## 8. Sources consulted

- https://webservice.rakuten.co.jp/documentation/vacant-hotel-search
- https://webservice.rakuten.co.jp/documentation/simple-hotel-search
- https://travel.rakuten.co.jp/webservice/
- https://travel.rakuten.co.jp/distributor/affiliate.html
- https://webservice.recruit.co.jp/
- https://webservice.recruit.co.jp/faq.html
- https://www.odpt.org/overview/
- https://ckan.odpt.org/dataset
- https://gtfs-jp.org/
- https://developers.google.com/maps/terms
