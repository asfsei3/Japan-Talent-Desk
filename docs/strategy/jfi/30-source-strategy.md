# JFI Source Strategy

Last updated: 2026-08-20
Status: Current working source-of-truth. Living document. Revised for `01-strategy-v1.md`.

## Japanese sources are primary supply

`01-strategy-v1.md` §5 makes this the central claim of the business: *the language advantage is
the actual moat*. Japanese-only sources that European clubs cannot read are not colour on top of
European reporting — they are the supply no competitor can trivially copy.

That inverts the natural reading of the tier table below. Tier is about **how much confidence a
claim can carry**. It is not about how valuable a source is. A Japanese tier-3 outlet quoting a
player directly is the single most valuable input this product receives, and it will never
produce a `confirmed` event. Both statements are true and the system must hold them at once.

Three consequences, all of which are implementation constraints:

1. **Japanese event vocabulary must be as complete as the English.** The prefilter's Japanese
   keyword set needs at minimum: 移籍, 完全移籍, 期限付き移籍, レンタル, 契約延長, 契約更新, 負傷,
   離脱, 復帰, 手術, 全治, 先発, 途中出場, 招集, 関心, オファー, 獲得, 退団, 加入. An English-heavy
   keyword list makes Japanese sources score low, which routes the moat straight into
   `prefiltered_out`.
2. **The trusted-source bonus must not rank English tier-2 above Japanese tier-3 on
   Japanese-player stories.** `config.prefilter.trustedSourceBonus` is 10 points and, applied by
   tier alone, systematically favours BBC over SOCCER KING on exactly the stories where SOCCER
   KING is better. If the scoring does that, it needs an offsetting Japanese-source relevance
   bonus, with a comment saying why.
3. **Feed encoding is a live hazard.** Some Japanese feeds still serve EUC-JP or Shift_JIS.
   `src/lib/http.js` decodes unconditionally as UTF-8 (`new TextDecoder("utf-8")`), and the
   `response.text()` fallback path does the same. A Shift_JIS feed will not fail loudly — it will
   produce mojibake that passes as a title, hashes cleanly, and lands in the database. Detect the
   charset from the `content-type` header or the XML declaration and decode accordingly. Filed as
   a defect against `src/lib/http.js`, which this document does not own.

## The one thing to fix first

**Every feed URL in `data/seeds/sources.json` is UNVERIFIED.** The seed was written on a host with
no network access. No URL has ever returned a byte. Three of the eight enabled sources carry an
explicit "verify before enabling" note in `licence_note`; the other five are equally unproven.

Before anything runs in production:

```
npm run jfi -- sources:check
```

on a networked host. `checkSources()` returns `{ checked, ok, failed, disabled, results }`. Any
source that does not return parseable items must be disabled or corrected. Treat a green
`sources:check` as a release gate, not a diagnostic.

**Second gate: zero official club feeds are enabled.** Of the 17 seeded sources, three are
official club feeds (Brighton, Celtic, Feyenoord) and all three are `enabled: 0`. Only a tier-1
source can produce a `confirmed` event. The system as seeded is structurally incapable of ever
stating a fact. That is the highest-priority source gap in Phase 1, ahead of adding volume.

## The tier system

Four tiers, defined in `config.SOURCE_TIERS`. A tier sets two things: a weight in the transfer
signal, and a hard ceiling on the confidence any claim from that source can reach.

| Tier | Label | `weight` | `maxConfidence` | Seeded reliability prior |
| --- | --- | --- | --- | --- |
| 1 | Official | 1.00 | `confirmed` | 92 |
| 2 | Tier-1 reporting | 0.80 | `strongly_reported` | 78 |
| 3 | Credible media | 0.55 | `reported` | 58 |
| 4 | Aggregator / social | 0.25 | `rumored` | 35 |

"Tier-1 reporting" for tier 2 is the transfer-journalism sense of the phrase — the outlets and
named reporters whose transfer claims resolve correctly most of the time. It is not tier 1.
The naming collision is inherited from the industry and is worth being careful about in writing.

### Tier 1 — Official

Club sites, league sites, national federations. `kind` in
`official_club | official_league | federation`.

**May establish:** completed transfers, signed contracts and renewals, squad registration,
official injury statements, national-team call-ups and withdrawals, departures, retirements.
A tier-1 source stating a completed action yields `confirmed`.

**May not establish:** anything about a player the club does not employ. Brighton's site is
tier 1 for Mitoma and tier 4 for a player they are linked with. **Tier is per claim, not per
source row.** `persist.js` must apply the club-scoping check; a club's own transfer-interest
statement about someone else's player is a `rumored` claim at best, and usually a media
rewrite of one.

**Also may not establish:** anything negative about the club's own interests. Official sources
do not report unrest, a manager under pressure, or a player refusing a renewal. Absence of an
official statement is never evidence.

Currently enabled: `jfa-official` only. That covers national-team events for the tracked roster
and nothing else.

### Tier 2 — Tier-1 reporting

Outlets and named reporters with a track record on transfers. Seeded: BBC Sport, The Guardian,
Sky Sports.

**May establish:** `strongly_reported` when two or more *independent* tier-2 sources agree.
A single tier-2 source yields `reported`.

**May not establish:** `confirmed`. Ever. No volume of tier-2 reporting promotes a claim to fact.
A deal is done when the club says so.

The seeded tier-2 set is a real weakness: three general British outlets. Their Japanese-player
coverage is thin, and BBC/Guardian/Sky agreeing is weakly independent — they read each other.
The Phase 2 backlog below is mostly about fixing this.

### Tier 3 — Credible media

Established outlets without a transfer-breaking track record, and the Japanese sports press.
Seeded: SOCCER KING, FOOTBALL ZONE, ゲキサカ, Number Web, ESPN.

**May establish:** `reported` with two or more independent tier-3 sources. `rumored` from one.

**May not establish:** `strongly_reported` or above, regardless of count.

The Japanese tier-3 outlets are the most valuable sources in the register and the ones most
likely to be mis-weighted. They are tier 3 for *transfer* claims because much of their European
transfer content is translation of European reporting. They are effectively tier 2 for
Japan-side claims — a player's own comments to a Japanese outlet, J.League club context,
national-team framing, youth and university football. Two options were considered:

- Split each outlet into two source rows with different tiers. Rejected: doubles the register
  and the tier still would not track the claim.
- **Chosen:** keep one row at tier 3 and let `persist.js` apply a per-claim adjustment — a claim
  sourced to a Japanese outlet's own reporting (a direct quote, a J.League matter) may reach
  `reported` from a single source. A claim that is visibly derivative may not. Detection rule
  below.

### Tier 4 — Aggregator / social

Aggregators, syndication hubs, social accounts. Seeded: Goal.com Japan.

**May establish:** `unverified`. Only. Even a hundred of them.

**May not establish:** anything else, and critically **may never count towards independence**.
This is the rule that prevents the most common failure mode in this product category: one
journalist's tweet, republished by twelve aggregators, rendered as "twelve sources report".

Tier 4 is still worth collecting. It is a fast, cheap early-warning tripwire — an aggregator
usually surfaces a story before a tier-2 outlet writes it up — and it is the raw material for
the media-attention signal. It just never contributes confidence.

## The independence rule

Two sources are independent when **all** of these hold:

1. Different `source_id`.
2. Different registrable domain. `theguardian.com` and `guardian.co.uk` are one source.
3. Neither has `kind = 'aggregator'`.
4. Neither article is *derivative* of the other.

Rule 4 is the one that needs code. A Japanese outlet reporting "according to Sky Sports" is not
a second source; it is the same source in another language. The detection heuristic:

- Maintain a list of outlet names and reporter names in `data/seeds/` — `Sky Sports`, `スカイスポーツ`,
  `BBC`, `Fabrizio Romano`, `L'Équipe`, and so on, with their romanised and katakana forms.
- If an article's `title` or `excerpt` names an outlet or reporter other than its own source, mark
  the resulting `event_sources` row derivative and exclude it from `independent_source_count`.
  It still counts towards `source_count` and towards media attention.

This is a recall-imperfect heuristic — an outlet that launders a source without attribution slips
through. It is still the single highest-value 50 lines in the confidence path, because the
Japanese-media-rewrites-European-media pattern is the dominant one for this exact player set.

Related resolution rule, from the same failure family: **an ambiguous alias never resolves alone.**
`ito` is a `surname` alias on both Hiroki Ito and Junya Ito. When `buildEntityIndex()` flags an
alias `ambiguous`, a match on that alias alone must not produce an `article_entities` row at
full score. It resolves only when the same text also contains a disambiguator — the player's
given name, their club, their position, or the kanji form. Otherwise the article goes to
`review_queue` with reason `ambiguous_entity`. Guessing here produces a wrong player on a
published page, which is the worst single failure this product can have.

## How `reliability_score` is learned

`sources.reliability_score` starts at the tier prior and moves with resolved outcomes.

### What counts as a resolvable claim

Only **outcome-bearing subtypes** enter the ledger:

| Enters the ledger | Does not |
| --- | --- |
| `transfer:bid`, `transfer:agreement`, `transfer:medical`, `transfer:completed` | `transfer:interest` |
| `contract:renewal`, `contract:expiry` | `club_situation:*` |
| `injury:out` with a stated return window | `media:*`, `social:*` |

"Club X is interested in Player Y" is unfalsifiable and must never score a source. Almost every
club is vaguely interested in almost every player. Scoring interest claims rewards volume, which
is exactly backwards.

### How an outcome is determined

Two paths, both automatable:

- **Positive resolution.** A tier-1 source confirms the completed action. Every source that
  reported that action towards that club is credited. Sources that reported a *different*
  destination for the same player in the same window are debited.
- **Negative resolution.** The relevant transfer window closes with the player at the same club,
  or the stated return date passes without a return. Every source that reported an imminent move
  or a specific return date is debited.

Negative resolution requires window dates. Those live in `data/seeds/` as reference data keyed by
country code — not a table, until something queries them (`20-data-model.md`).

A human can also resolve an item directly from `review_queue`, which is the escape hatch for
everything the two rules above miss.

### The formula

A raw correct/total ratio is worthless at low n — one lucky report would put a source at 100.
Smooth towards the tier prior:

```
reliability_score = round( 100 * (reports_correct + k * p0) / (reports_total + k) )

  p0 = tier prior / 100      (1: 0.92, 2: 0.78, 3: 0.58, 4: 0.35)
  k  = 12                    (prior strength)
```

`k = 12` is an assumption. It means a source needs roughly a dozen resolved reports before its
own record outweighs its tier. Validate it once ~50 resolutions exist across the register: plot
score against subsequent hit rate and pick the `k` that minimises error. Until then, do not
present `reliability_score` to a customer as a measured figure — it is mostly the prior.

### What the score does and does not do

- **Does:** feed the `sourceQuality` component of the transfer signal (weight 22 of 100).
- **Does:** rank the review queue, so a low-reliability source's claims surface earlier.
- **Does not:** change the confidence ceiling. That is tier-driven, full stop. A tier-3 outlet
  with a reliability of 88 still cannot produce `strongly_reported`.
- **Does not:** promote a tier automatically. A source at reliability ≥ 80 over ≥ 30 resolutions
  becomes a `review_queue` item of type `source` proposing promotion. A human decides. Automatic
  tier promotion would let a source that got lucky during one window start minting confidence.

## Minimum viable source set for MVP

Fourteen sources. Enough to produce a real daily brief, and specifically enough to reach every
rung of the confidence ladder.

| # | Source | Tier | Role | Status |
| --- | --- | --- | --- | --- |
| 1 | JFA | 1 | National-team call-ups, withdrawals, injury statements | seeded, enabled |
| 2 | J.League official | 1 | J1 context, domestic moves, the return-to-Japan path | seeded, disabled — verify feed |
| 3–10 | Official club feeds ×8 | 1 | **The only route to `confirmed`** | 3 seeded, all disabled |
| 11 | BBC Sport Football | 2 | Independence partner, EU cross-check | seeded, enabled |
| 12 | The Guardian Football | 2 | Independence partner | seeded, enabled |
| 13 | SOCCER KING | 3 | Highest-volume Japanese coverage of players abroad | seeded, enabled |
| 14 | FOOTBALL ZONE | 3 | Second Japanese outlet — independence within Japan | seeded, enabled |

Plus `jfi-fixtures` (`provider: fixture`), which is the offline test source and must never be
enabled in production.

The eight club feeds are chosen by tracked-player concentration, not by club size. The seeded
roster of 31 players spans 27 clubs, and only four hold more than one: Stade de Reims (2),
Celtic (2), Sint-Truiden (2), Kashima Antlers (2). So the ordering is: those four first, then
the highest-visibility singles — Brighton, Bayern Munich, Liverpool, Real Sociedad. Verify each
with `sources:check` before committing; several top-flight clubs have dropped RSS entirely, in
which case the club drops down the list rather than justifying a scraper.

The 27-clubs-for-31-players spread is itself a finding: club-feed coverage has a long tail and
will never be complete. Tier-1 confirmation will always be partial, which is another reason the
product's language is "availability should be verified directly" rather than a claim of
completeness.

Explicitly **not** in the MVP set: Sky Sports (verify the feed URL first — it is the least
certain of the seeded three), ESPN (broad, low Japanese-player yield), ゲキサカ and Number Web
(valuable but low event yield per fetch — Phase 2), Goal.com Japan (tier 4, adds no confidence
and adds cost).

MVP volume estimate: 8 enabled sources × ~25 items per fetch × 8 fetches/day, with heavy overlap
and ETag suppression, lands around 120–250 raw articles/day. That is the 100–500 band in
`50-cost-model.md`. Assumption; measure it in week 2 and replace this line with the real number.

## Phase 2 source backlog, prioritised

Ordered by intelligence gained per unit of effort and cost. Items 1–4 are the ones that change
what the product can say.

| # | Add | Tier | Unlocks | Cost / risk |
| --- | --- | --- | --- | --- |
| 1 | **Remaining official club feeds** — every club employing a tracked player | 1 | `confirmed` events across the whole roster, not eight clubs. Removes the structural gap above. | Free. ~25 feeds to verify. Some clubs have no feed; accept the gap rather than scraping. |
| 2 | **Named Japanese transfer reporters** with their own feeds or newsletters | 2 | Real tier-2 Japanese reporting. Today there is none — every Japanese source is tier 3. This is the missing rung. | Free–low. Requires editorial judgement on who qualifies; each addition is a `review_queue` decision with a written rationale. |
| 3 | **Continental outlets for the leagues the roster actually plays in** — DE, FR, NL, BE, SCT, PT | 2–3 | Genuine independence. Three British outlets are not three sources for a Bundesliga story. Also first-language reporting, which is earlier and more specific than the English rewrite. | Free. Adds a language dimension to the excerpt/classify path — the LLM handles it, the derivative-detection list needs each language's outlet names. |
| 4 | **Transfer-window reference data** per country | — | Negative resolution for the reliability ledger. Without it, sources are only ever credited, never debited. | Free. A JSON file in `data/seeds/`. |
| 5 | **J1/J2 club official feeds** for clubs that sell to Europe | 1 | The pre-export pipeline. Catches players before European media notices — the earliest possible signal and the one a club would actually pay for. | Free. ~20 feeds. |
| 6 | **University and youth football** (ゲキサカ, JFA youth) | 3 | Long-horizon discovery. Aligns with `docs/outbound/policy.md`'s U25 focus. | Free. Low event yield per fetch; run these at daily cadence, not hourly. |
| 7 | **Number Web and long-form Japanese features** | 3 | Player-side openness to Europe, motivation, family context — the "player-side signal" the transfer signal weights at 10 and currently has no input for. | Free. Very low event yield. Worth it for one component. |
| 8 | **A news API** (see `40-api-costs.md`) | varies | Recall on outlets without feeds, and backfill. | Paid. Commercial-use terms are the gating question, not price. Do not add before item 3 — breadth without independence is noise. |
| 9 | **Social accounts** — club, player, federation | 4 | Attention signal and the `japanSocialAudience` metric. | Paid and restrictive. See `40-api-costs.md`. |
| 10 | **Search interest** | — | `japanSearchInterest`, 16 of the Japan Market Score's 100 weight. | Paid or unavailable at a workable price. The score publishes provisional without it. |

Deliberately absent from this list: scraping anything that does not publish a feed. Blueprint §32
forbids building the business on unauthorised scraping, `config.http.respectRobots` defaults true,
and `sources.robots_allowed` is checked before every fetch. A club with no feed is a gap in the
data, not a target.

## Source hygiene rules

- **Every new source needs `commercial_use` set before `enabled = 1`.** `unknown` is the default
  and it means "not cleared". A source at `restricted` may be collected for internal signal and
  never quoted in a B2B deliverable or a licensed feed. This flag is what makes the data-licensing
  line in `80-product-ideas.md` legally possible.
- **`consecutive_errors >= 3` disables the source and raises an alert.** See `60-automation-plan.md`.
- **Re-run `sources:check` weekly.** Feed URLs rot silently; a CMS migration turns a working feed
  into a 200-response HTML page. The check must assert parseable items, not HTTP 200.
- **Never enable `jfi-fixtures` outside tests.** It is `provider: 'fixture'` with
  `feed_url: 'fixtures/'` and `homepage: 'https://example.invalid/fixtures'`.
- **Record why a source was added.** Use `licence_note`. Six months on, nobody remembers whether
  an outlet was tier 2 for a reason or by accident.
