# Travel Decision Engine — Competitive Analysis

Audit date: 2026-08-20
Companion documents: `docs/data-sources.md`, `docs/cost-model.md`

Accuracy note: entries are marked `VERIFIED 2026-08` where checked on the audit date and
`UNVERIFIED` where based on general knowledge. Two products named in the product spec could not
be confirmed and are recorded as such rather than described from guesswork — an invented
competitor profile is worse than an admitted gap.

---

## 1. The question this document answers

Not "who else is in travel" — that list is endless. The question is:

> **Who already answers "where should I go?" — as opposed to "book this thing I already chose"?**

Almost everyone in Japanese travel does the second. The market splits cleanly:

| Layer | What the user has already decided | Players |
| --- | --- | --- |
| **Booking** | Destination, dates, hotel | Rakuten Travel, Jalan, Yahoo Travel, Booking.com, Agoda |
| **Comparison** | Destination and dates | Travelko, Google Travel, Trip.com |
| **Itinerary generation** | Destination | AVA Travel, ChatGPT/Gemini, NAVITIME Travel |
| **Decision** | **Only budget, dates, and who is coming** | *Structurally underserved* |

Every incumbent requires the destination as an **input**. This product treats it as the
**output**. That is the entire strategic bet, and §6 examines whether it is a real gap or a
gap that exists because it is not worth filling.

---

## 2. Competitor profiles

### 2.1 Travelko (トラベルコ) — Open Door Inc. `UNVERIFIED` on current metrics

- **Positioning:** Japan's established travel metasearch — "compare across every travel site".
- **Features:** Cross-OTA hotel, flight, package, and bus comparison; price sorting; deal alerts.
- **Pricing to user:** Free.
- **Data sources:** OTA partner feeds and commercial agreements. No public API.
- **Monetisation:** Referral fees and advertising from listed OTAs.
- **Strengths:** Broad supply coverage; established brand; genuine price comparison; the
  partnership relationships this product would need years to build.
- **Weaknesses:** Requires a destination up front. Compares *prices for a chosen thing*, never
  *which thing to choose*. No family reasoning. No total-trip cost — hotel and flight are
  compared in separate silos, so the actual trip total is left to the user.
- **Target user:** Price-sensitive travellers who already know where they are going.
- **Potential moat:** Supply relationships and brand recall.
- **Relationship to us:** **Closest structural competitor, and firmly out of reach as a data
  source** (see `docs/data-sources.md` §5.6 — no API, so the only access route would be
  scraping, which is prohibited). Competitor only.

### 2.2 Rakuten Travel (楽天トラベル) `VERIFIED 2026-08` (API and affiliate)

- **Positioning:** Major domestic OTA inside the Rakuten economic zone.
- **Features:** Hotel/ryokan booking, packages, rental car, highway bus, point integration.
- **Pricing to user:** Free; monetised on booking margin.
- **Data sources:** Own inventory. Publishes seven Rakuten Travel APIs via Rakuten Web Service.
- **Monetisation:** Booking commission; the Rakuten points ecosystem drives loyalty.
- **Strengths:** Enormous domestic inventory; points loyalty is a genuine switching cost for
  Japanese consumers; **an unusually developer-friendly free API that emits affiliate URLs.**
- **Weaknesses:** Search UX assumes a known area. Cross-destination comparison is absent by
  design — it has no incentive to tell you Izu is better value than Okinawa.
- **Target user:** Rakuten ecosystem members booking domestic stays.
- **Potential moat:** Points, inventory, and brand.
- **Relationship to us:** **Partner and monetisation channel, not a competitor.** We send it
  bookings; it supplies data and pays commission. Its lack of cross-destination comparison is
  precisely the space we occupy.

### 2.3 Jalan (じゃらんnet) — Recruit `UNVERIFIED`

- **Positioning:** Major domestic OTA, strong in ryokan and regional travel.
- **Features:** Hotel/ryokan booking, plans, activities (じゃらん遊び体験), points.
- **Pricing to user:** Free.
- **Data sources:** Own inventory; Recruit WEB Service APIs.
- **Monetisation:** Booking commission; advertising.
- **Strengths:** Deep ryokan coverage; strong regional/onsen inventory; established activity
  marketplace.
- **Weaknesses:** Same as Rakuten — destination-first search, no total-trip optimisation.
- **Target user:** Domestic travellers, strong with onsen and ryokan intent.
- **Potential moat:** Ryokan supply relationships; Recruit's distribution.
- **Relationship to us:** Partner/monetisation channel (Phase 2).

### 2.4 Yahoo Travel — LY Corporation `UNVERIFIED`

- **Positioning:** OTA within the Yahoo/LINE/PayPay ecosystem.
- **Features:** Hotel booking with heavy PayPay point promotion.
- **Monetisation:** Commission; ecosystem lock-in.
- **Strengths:** PayPay point campaigns are a powerful acquisition lever in Japan; LINE reach.
- **Weaknesses:** Same destination-first limitation; discovery is promotion-led, not fit-led.
- **Target user:** PayPay/LINE users.
- **Potential moat:** Payment and messaging ecosystem.
- **Relationship to us:** Potential channel; possible LINE distribution lesson (see §5).

### 2.5 Booking.com / 2.6 Agoda

- **Positioning:** Global OTAs; Booking.com strong worldwide, Agoda strong across Asia.
- **Features:** Vast global inventory, flexible cancellation filters, reviews at scale.
- **Monetisation:** Commission; paid placement.
- **Strengths:** Global supply; sophisticated conversion optimisation; mature affiliate
  programmes.
- **Weaknesses:** Comparatively weak Japanese domestic ryokan coverage and Japanese-language
  nuance; no cross-destination decision support; both are partner-gated for API access.
- **Target user:** Outbound and inbound travellers.
- **Potential moat:** Global scale.
- **Relationship to us:** Irrelevant to a Japan-domestic MVP; relevant at the outbound stage.

### 2.7 Google Travel

- **Positioning:** Search-native travel discovery and comparison.
- **Features:** Flight and hotel search, price tracking, price history, *"Explore" — genuine
  budget-first destination discovery from a map*, trip planning.
- **Pricing to user:** Free.
- **Data sources:** Airline and OTA feeds at a scale nobody else can match.
- **Monetisation:** Ads and referrals.
- **Strengths:** **The one incumbent that actually does budget-first destination discovery.**
  Unbeatable data scale, price history, and distribution straight from search.
- **Weaknesses:** Flight-centric and weak on Japan domestic ground transport — shinkansen,
  limited express, and highway bus are where most Japanese domestic trips actually happen.
  No family reasoning, no ryokan nuance, no true trip cost including meals, local transport,
  and parking. Explore is a map of prices, not a recommendation with reasoning.
- **Target user:** Everyone; skewed to international travel.
- **Potential moat:** Data scale and distribution.
- **Relationship to us:** **The most serious competitor in this document.** Section 6 treats it
  as the primary risk rather than filing it under "weaknesses".

### 2.8 AVA Travel (アバトラベル) — AVA Intelligence `VERIFIED 2026-08`

- **Positioning:** Japanese AI travel planning — an AI builds your plan in under a minute.
- **Features:** AI itinerary generation from preferences, spot/hotel/restaurant/transport
  selection, map and route display, travel "しおり" (itinerary sheets). Available as app, web,
  and LINE. Service started March 2023; also sells 観光DX services.
- **Pricing to user:** Free tier; app-based.
- **Data sources:** Not publicly detailed. `UNVERIFIED`
- **Monetisation:** Believed affiliate/referral plus B2B 観光DX. `UNVERIFIED`
- **Strengths:** Real product with real users and good ratings; strong Japanese-language UX;
  multi-surface distribution including LINE; a genuine head start.
- **Weaknesses:** **It is an itinerary generator, not a decision engine.** It answers "what
  should I do in Kyoto", not "should it be Kyoto or Izu on ¥150,000 with two kids". Generated
  plans are hard to hold to a total budget, and generation-based products struggle to
  differentiate as general models improve.
- **Target user:** Travellers who have chosen a destination and want a plan.
- **Potential moat:** Brand, LINE distribution, 観光DX relationships.
- **Relationship to us:** **The closest Japanese competitor and the clearest positioning
  contrast** — and the direct evidence for the spec's instruction not to position as an "AI trip
  planner". That category already has a credible Japanese incumbent. The decision layer does not.

### 2.9 タビピタ (Tabipita) — **`UNVERIFIED — could not confirm`**

Named in the product spec. A targeted search on the audit date did not surface a confirmable
service profile. **No profile is recorded here rather than invent one.** Action: confirm the
correct name/URL from the spec author before treating it as a competitor.

### 2.10 Travel One — **`UNVERIFIED — could not confirm`**

Named in the product spec. Same situation as §2.9: the name is generic enough that search did
not produce a confident match. Action: obtain the URL from the spec author.

### 2.11 General AI assistants (ChatGPT, Gemini, Claude)

- **Positioning:** General assistants used ad hoc for travel planning.
- **Features:** Conversational planning; Gemini benefits from Google Maps grounding.
- **Pricing:** Free tiers plus subscriptions.
- **Strengths:** Zero acquisition cost for the user; already installed; improving continuously.
- **Weaknesses:** No verified pricing, no booking integration, no persistent preferences, and a
  strong tendency to state plausible-but-wrong fares. Cannot be trusted on "what will this
  actually cost".
- **Relationship to us:** **The real substitute for our target user.** A Japanese parent
  planning a trip is more likely to ask ChatGPT than to find a niche site. Beating "just ask an
  AI" requires being verifiably right about numbers — which is exactly why the engine computes
  costs deterministically instead of generating them.

### 2.12 NAVITIME Travel / 乗換案内 `UNVERIFIED`

- **Positioning:** Route and transit authority in Japan, extending into travel content.
- **Strengths:** **Best-in-market Japan ground transport data** — the exact dimension where
  Google is weakest and where our modelled times are weakest too.
- **Weaknesses:** Route-first, not decision-first; no budget optimisation across destinations.
- **Relationship to us:** Not a direct competitor, but the clearest demonstration that our
  travel-time modelling is a known weak point with a well-resourced incumbent nearby.

---

## 3. Feature comparison

| Capability | Travelko | Rakuten/Jalan | Google Travel | AVA Travel | ChatGPT | **This product** |
| --- | --- | --- | --- | --- | --- | --- |
| Destination as **output** | ✗ | ✗ | ~ (Explore) | ✗ | ~ | **✓** |
| Budget-first input | ✗ | ✗ | ✓ (flights) | ✗ | ~ | **✓** |
| **Total** trip cost incl. meals/local/parking | ✗ | ✗ | ✗ | ✗ | ✗ | **✓** |
| Japan ground transport modelled | ~ | ✗ | ✗ | ~ | ~ | **✓** |
| Family/child-age reasoning | ✗ | ✗ | ✗ | ~ | ~ | **✓** |
| Explains *why*, tied to numbers | ✗ | ✗ | ✗ | ~ | ~ (ungrounded) | **✓** |
| Live verified prices | ✓ | ✓ | ✓ | ~ | ✗ | **✗ (estimates)** |
| Actual booking | ✓ | ✓ | ~ | ~ | ✗ | **✗ (hand-off)** |
| Inventory / supply relationships | ✓ | ✓ | ✓ | ~ | ✗ | **✗** |

The bottom three rows are ours to lose. We are structurally weaker on live price accuracy,
booking, and supply — permanently, not temporarily. The strategy only works if the top six rows
matter more to the user *at the moment of deciding*. That is a testable claim, and §6 says how
to test it.

---

## 4. Where the gap actually is

Three findings, in order of confidence.

**1. The decision layer is genuinely unoccupied in Japan (high confidence).** Every Japanese
incumbent takes the destination as input. Google's Explore is the only budget-first discovery
tool, and it is flight-shaped — which makes it structurally poor for a Tokyo family weighing
Hakone against Okinawa, because most such trips involve shinkansen or driving.

**2. "True Trip Cost" is unoccupied everywhere (high confidence).** No competitor sums transport
+ hotel + meals + local transport + parking + activities into one comparable figure. Every one
of them compares a *component*. This is where a family's ¥150,000 actually goes, and the gap is
uniform across the entire market.

**3. Family reasoning is unoccupied (medium confidence).** Filters for "family rooms" exist
everywhere. Reasoning — that a 2-year-old makes a 6-hour journey with two transfers a bad idea
regardless of price, or that 添い寝無料 changes the real cost ranking — exists nowhere.
Confidence is medium because absence may reflect low demand, not oversight. §6.

---

## 5. What to learn from each

| From | Lesson |
| --- | --- |
| Rakuten | An open, affiliate-integrated API is a moat *for them* — it recruits distributors like us. Use it. |
| AVA Travel | LINE distribution is a real acquisition channel in Japan. Also: do not enter as an itinerary generator. |
| Yahoo Travel | Points and cashback move Japanese consumers more than better UX does. |
| Google Travel | Price *history* is a durable moat because it cannot be back-filled. Start logging on day one. |
| Travelko | Comparison alone is a commodity; the reasoning on top is the defensible part. |
| NAVITIME | Japan ground transport data is a real asset and our weakest dimension. |

The Google price-history lesson is the one with a deadline attached: historical data can only be
accumulated forward, so every month without logging is a month of moat permanently forgone.

---

## 6. Honest risks

Recording these because a competitive analysis that only finds encouraging gaps is not an
analysis.

**Risk 1 — Google closes the gap cheaply.** Google Travel Explore is one product decision away
from ground transport support in Japan. Mitigation: family reasoning and true trip cost are
harder for a global product to localise than shinkansen fares are. This is a real risk, not a
dismissible one.

**Risk 2 — the gap is empty because the market is small.** Nobody serves budget-first
destination discovery. The optimistic reading is oversight; the pessimistic reading is that most
travellers *already know* where they want to go and are choosing a hotel, not a destination.
**This is the single most important assumption in the product and it is currently untested.**
Mitigation: the founder test in spec §19 is the cheapest possible experiment — if the founder
does not use it before their own next family trip, the pessimistic reading is likely correct.

**Risk 3 — estimated prices erode trust.** Our numbers are modelled, not live. A user who is
told ~¥150,000 and finds ¥190,000 at the booking site will not return. Mitigations: present
ranges rather than point estimates, label estimates plainly, and prioritise the Rakuten
integration for the categories where error is largest. This risk is why `docs/data-sources.md`
ranks Rakuten as the first post-MVP integration.

**Risk 4 — affiliate misalignment.** We earn commission on bookings but claim to optimise for
the user. If commission ever influences ranking, the product becomes exactly the thing it was
built to replace. Mitigation: **scoring must never read commission rates.** Keep the affiliate
layer strictly downstream of ranking, enforce it in code review, and disclose the affiliate
relationship as Japanese ステマ規制 requires.

---

## 7. Positioning conclusion

Do **not** position as an AI trip planner. AVA Travel occupies that category in Japan already,
and general assistants are compressing it from below.

Position as the **decision** layer:

> 旅行の面倒な比較をAIが全部やって、最適な旅行を決める

with the concrete promise the comparison table supports:

> **予算と家族構成を入れるだけで、「移動・宿・食事・現地交通」を全部足した本当の総額で、
> 行き先ごと比較します。**

The defensible claim is not "AI plans your trip". It is **"we are the only one who tells you
what the whole trip actually costs, everywhere, and which one fits your family."**

---

## 8. Re-verification actions

- [ ] Obtain URLs for タビピタ and Travel One from the spec author (§2.9, §2.10)
- [ ] Confirm AVA Travel's monetisation and data sources
- [ ] Confirm Travelko's current OTA coverage and whether any partner API exists
- [ ] Re-test Google Travel Explore for Japan domestic ground transport support (Risk 1)
- [ ] Survey 5–10 target-ICP families on whether they choose destination or hotel first (Risk 2)
- [ ] Re-run this analysis before any significant roadmap commitment
