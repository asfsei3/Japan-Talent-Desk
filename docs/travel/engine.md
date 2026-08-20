# Travel Decision Engine — How It Works

Companion documents: `docs/data-sources.md`, `docs/cost-model.md`, `docs/competitive-analysis.md`

---

## 1. Pipeline

```text
free text
   ↓  parse-request.js          rule-based, JP + EN, no model call
structured TripRequest
   ↓  recommend.js              enumerate destination × route × hotel tier
configurations
   ↓  cost-model.js             True Trip Cost per configuration
costed configurations
   ↓  scoring.js                interest / budget / time / convenience / family / comfort / value
scored configurations
   ↓  recommend.js              best configuration per destination, then rank destinations
ranked destinations
   ↓  recommend.js              category winners (overall / budget / family / per interest)
   ↓  explain.js                grounded JP + EN explanation
   ↓  affiliate.js              booking hand-off links — LAST, never before ranking
result
```

The whole path is synchronous, local, and free. No third-party request is made while a user
waits, which is what holds the marginal cost of a query at ¥0.

## 2. Module map

| Module | Responsibility |
| --- | --- |
| `engine/data/origins.js` | Supported departure cities and their parsing aliases |
| `engine/data/destinations.js` | The curated destination dataset — the product's backbone |
| `engine/data/pricing-model.js` | Shared cost assumptions: fare policies, meal rates, occupancy |
| `engine/parse-request.js` | Free text → structured request, with stated assumptions |
| `engine/cost-model.js` | True Trip Cost for one configuration |
| `engine/scoring.js` | Score components and the adaptive weights |
| `engine/recommend.js` | Enumeration, ranking, category selection |
| `engine/explain.js` | Explanations generated from computed values |
| `engine/affiliate.js` | Booking links and affiliate configuration |
| `engine/share.js` | Save/share encoding, no database |
| `engine/index.js` | Public entry point: `planTrip`, `engineCapabilities` |

## 3. True Trip Cost

Total cost is the sum of six named components, all shown to the user:

| Component | Notes |
| --- | --- |
| Transport | Round trip, per fare policy for the mode, with child and infant bands |
| Accommodation | Rooms × nights × nightly rate, with family-room capacity and 添い寝無料 modelled |
| Meals | Per-person daily rate by age, less an included-breakfast credit |
| Local transport | Rental car (with vehicle sizing) or public transit, decided per request |
| Activities | Per-person day rate × activity level × active days |
| Contingency | 6% of subtotal, named rather than hidden |

Two modelling decisions do most of the work:

**Only air fares move with the season.** Japanese rail and bus fares are regulated and fixed
year-round. Applying a seasonal multiplier to a shinkansen fare would invent a price swing that
does not exist. This is why the engine can say September saves real money on Okinawa but makes
no difference to the cost of reaching Hakone.

**Family rooms and free child bedding change what is cheapest.** Japanese family rooms commonly
sleep four, and many properties let young children share bedding at no charge. Sizing rooms as
"party ÷ 2" would systematically overstate family-tier lodging and push every family into a
budget room that does not fit them.

## 4. Scoring

Seven components, each 0-100:

| Component | What it measures |
| --- | --- |
| `interest` | Match to the requested themes, adjusted for seasonal suitability |
| `budget` | Fit against the stated budget — full marks near it, steep penalty over it |
| `time` | Door-to-door travel as a share of the trip's available waking hours |
| `convenience` | Transfers, whether it works without a car, walking demand |
| `family` | Child-age fit, journey tolerance, meals, strollers, wet-weather options |
| `comfort` | Lodging tier quality, breakfast, whether the family fits in one room |
| `value` | Satisfaction per yen, normalised across the candidate set |

Weights adapt to the request: no children removes the family weight, no budget removes the
budget weight, and asking for easy travel shifts weight into convenience and time. Missing
components are dropped and their weight redistributed, so an unstated input lowers confidence
rather than the score. Weights always sum to 1, which is asserted in the test suite.

`comfort` exists specifically to satisfy the product requirement that the cheapest hotel is not
automatically the answer. Without it the engine always picked the budget tier, because nothing
represented what the extra money bought. There is a test asserting that a larger budget produces
a better lodging tier.

**Ranking never reads commission.** `scoring.js` and `recommend.js` have no access to affiliate
configuration, and `affiliate.js` runs only after ranking is fixed. A test asserts that results
are identical with and without an affiliate ID configured. This is the guard for Risk 4 in
`docs/competitive-analysis.md`.

## 5. Known limitations

Recorded plainly because a cost engine that hides its error bars is worse than one that has them.

1. **Every figure is a seed estimate, not a live price.** This is the single biggest limitation.
   The first fix is the Rakuten Travel API integration described in `docs/data-sources.md` §5.1.
2. **Ryokan half-board is not modelled.** Many onsen ryokan include dinner as well as breakfast
   (一泊二食). The engine credits only breakfast, so it overstates food spend at onsen
   destinations relative to city ones. Relative ranking *within* onsen destinations is unaffected
   because the bias is uniform, but onsen-versus-city comparisons are skewed against onsen. Fix:
   add a `dinnerIncludedRate` per hotel tier alongside `breakfastIncludedRate`.
3. **Travel times are hand-authored, not routed.** Door-to-door minutes are modelled per route.
   `docs/data-sources.md` §5.14 explains why Google Maps was rejected and what the alternative is.
4. **Three origins only.** Tokyo, Osaka, and Nagoya. The engine reports an unsupported origin
   rather than guessing a route, and a test asserts no destination is ever recommended without a
   real route from that origin.
5. **No real-time availability.** A recommended destination may be sold out.
6. **Booking link templates are unverified.** Every provider template is flagged
   `verificationStatus: "unverified"` and must be replaced with the affiliate-documented deep-link
   format before launch.
7. **No historical price data yet.** The data moat described in the product spec starts the day
   price logging starts, and it cannot be back-filled. Nothing logs prices today.

## 6. Extending it

**Adding a destination.** Add a record to `engine/data/destinations.js` with access routes for
each supported origin. The dataset integrity test enforces the record shape, that hotel tiers are
ordered cheapest to dearest, and that every referenced origin exists.

**Adding an origin.** Add it to `engine/data/origins.js` with parsing aliases, then add an access
route to every destination that should be reachable from it. Do not add the origin first — an
origin with no routes returns nothing useful.

**Swapping in a real price source.** `estimateTripCost` reads plain numbers from the destination
record. Replace those fields with values from a live source and the scoring layer is untouched.
Because of the ~1 rps Rakuten limit documented in `docs/data-sources.md` §4, the integration must
be a scheduled batch that refreshes cached price bands, never a per-request fan-out.

## 7. Running it

```bash
npm start                # serves the site and the engine API
npm test                 # 73 tests across parser, cost model, scoring, and pipeline
npm run seo              # regenerates the curated guide pages
```

| Endpoint | Purpose |
| --- | --- |
| `GET /travel/` | The decision UI |
| `GET /travel/guides/` | Generated guide pages |
| `POST /api/travel/plan` | `{ text, overrides }` → recommendations |
| `GET /api/travel/plan?t=` | Restore a shared trip from a token |
| `GET /api/travel/meta` | Supported origins, interests, and real coverage counts |
