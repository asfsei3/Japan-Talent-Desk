# JFI Data Model

Last updated: 2026-08-20
Status: Current working source-of-truth. Living document. `src/db/schema.sql` is canonical; this
file explains it and is normative for the `dedupe_key` rules, which are not expressible in SQL.

## The four design rules

The schema header states four rules. They are load-bearing, not decoration.

### 1. Every published claim is traceable to a source row

`events` never stands alone. Every event has one or more `event_sources` rows carrying `url`,
`title`, `published_at`, `detected_at` and `tier`. `events.source_count` and
`independent_source_count` are denormalised counts of that table, recomputed on every merge.

Consequence: an event with zero `event_sources` rows is a bug, not an unsourced event. The
product cannot render it, and `persist.js` must never create one. This is what makes the
B2B claim in `docs/reports/report-principles.md` — contract and availability treated as
verification items — mechanically true rather than an editorial promise.

### 2. Raw article text is never stored in full

`articles.excerpt` holds `text.toExcerpt(...)` output — a short factual summary. There is no
`body` column and adding one is out of bounds. `articles.title` and `articles.url` are stored
because a headline plus a link is the ordinary, expected use of a syndicated feed.

Consequence for the LLM: the classifier sees `title + excerpt`, not the article. Extraction
quality is capped by excerpt quality. This is a deliberate trade of recall for legal safety.
See `85-risks.md`.

### 3. The model is market-agnostic

This is the rule with the longest shadow, so it gets its own section below.

### 4. Scores are stored with their inputs

`signals.inputs` is JSON: `component -> { raw, normalized, weight, points }`. `signals.coverage`
is the share of total weight backed by a real measurement. A UI that shows a Japan Market Score
of 71 can always answer "from what?" without recomputation.

Consequence: an LLM may never write to `signals`. `computeJapanMarketScore()` reads `metrics`
rows and does arithmetic. If a metric is missing it is excluded and coverage drops; it is never
estimated. Below `config.japanMarketScore.minCoverage` (0.6) the score publishes as provisional.

## Why market-agnostic, concretely

Japan is a filter, never a column. The alternative — `players.japan_social_followers`,
`clubs.japan_audience`, `is_japanese` — would work today and would have to be unpicked
entirely at the Korea step. Blueprint §37 puts Korea, Australia, China, Iran and Saudi Arabia
on the roadmap; the schema treats that as a data load.

The mechanism is three columns and one table:

| Carrier | Where | What it does |
| --- | --- | --- |
| `countries.market_priority` | reference | `1` = Japan, `2` = Korea/Australia, `3` = China/Saudi/Iran, `0` = not a target market. The *only* place Japan's primacy is encoded. |
| `metrics.market` | measurement | `'JP'` today. `jp_social_followers` for market `'KR'` is a row, not a column. |
| `market_impact_studies.market` | impact | Before/after studies are per market. Same player, two markets, two rows. |
| `leagues.jp_visibility` | reference | **The exception.** Named for Japan and scoped 0–100. |

`leagues.jp_visibility` is the one place the rule is broken. It is a Japan-specific column on a
market-agnostic table, and expansion will need `league_market_visibility(league_id, market,
score)` instead. Recorded here rather than fixed now: Phase 1 has one market, and a premature
join table costs more than the eventual migration. Revisit when `countries.market_priority = 2`
work starts. Same applies to `players.nationality` being used as a de-facto Japan filter — that
is legitimate (nationality is a real attribute), but any query that says
`WHERE nationality = 'JP'` should say `WHERE nationality IN (SELECT code FROM countries WHERE
market_priority = 1)` instead.

Expansion to Korea is then: insert country rows (already present), insert leagues, insert clubs,
insert players with aliases in Hangul, insert sources, and set `market_priority`. No migration.

## Entity relationships

```
                         ┌───────────┐
                         │ countries │  code PK · market_priority
                         └─────┬─────┘
                 ┌─────────────┼──────────────┐
                 ▼             ▼              ▼
           ┌──────────┐   ┌────────┐   ┌───────────┐
           │ leagues  │◄──┤ clubs  │   │  sources  │  tier · reliability_score
           └────┬─────┘   └───┬────┘   └─────┬─────┘  commercial_use · robots_allowed
                │             │              │
                │             │              ▼
                │             │        ┌──────────┐
                │             │        │ articles │  url_hash U · content_hash · simhash
                │             │        └────┬─────┘  relevance_score · status · duplicate_of
                │             │             │
                │             │             ▼
                │             │      ┌────────────────┐
                │             │      │ article_entities│  (article, type, id) U
                │             │      └────────┬───────┘
                ▼             ▼               │
           ┌─────────────────────┐            │
           │      players        │◄───────────┘  entity_type='player'
           │  slug U · tracked   │
           │  data_status        │
           └──┬───────┬──────┬───┘
              │       │      │
              ▼       │      │
      ┌──────────────┐│      │        ┌──────────────┐
      │player_aliases││      │        │ club_aliases │
      │ alias_norm ix ││      │        │ alias_norm ix│
      └──────────────┘│      │        └──────────────┘
                      │      │
        ┌─────────────┘      └───────────────┬──────────────────┐
        ▼                                    ▼                  ▼
  ┌──────────┐                        ┌───────────┐     ┌───────────────┐
  │  events  │  dedupe_key U          │  signals  │     │    metrics    │
  │  type    │  confidence(_rank)     │ (type,id, │     │ (type,id,key, │
  │  subtype │  importance 1-5        │  sigtype)U│     │  market,date)U│
  │  payload │  superseded_by ──┐     └─────┬─────┘     └───────────────┘
  └────┬─────┘  status          │           │                   │
       │        ◄───────────────┘           ▼                   ▼
       ▼                              ┌──────────────┐   ┌────────────────────┐
  ┌───────────────┐                   │signal_history│   │market_impact_studies│
  │ event_sources │  (event,url) U    │ (…,as_of)  U │   │ before/after · market│
  │ tier · weight │                   └──────────────┘   └──────────┬─────────┘
  └───────────────┘                                                 │ benchmarks
       │                                              ┌─────────────▼────────────┐
       │                                              │  commercial_estimates    │
       │                                              │  low/high · band · basis │
       │                                              │  (type,id,club,mkt,key) U│
       │                                              └──────────────────────────┘
       │
       ▼
  ┌──────────┐        ┌──────────────┐        ┌───────────────┐
  │ changes  │───────►│ social_drafts│        │ review_queue  │  (type,id,reason) U
  │dedupe_key│  U     │ draft→posted │        │ status·priority│
  │as_of_date│        └──────────────┘        └───────────────┘
  └──────────┘

  operations:  job_runs · cost_ledger (date,provider,op,model) U · llm_cache (key PK)
  distribution: newsletter_issues (issue_date U) · watchlists ─◄ watchlist_items
  meta:        schema_meta
```

`U` = unique constraint. `ix` = index. Arrows are foreign keys except where labelled.

Note `article_entities` and `signals`/`metrics`/`changes` use a `(entity_type, entity_id)` pair
rather than a real foreign key. That is a deliberate polymorphic reference: the same table has
to carry player, club and league rows. Cost: no referential integrity on those pairs. Mitigation:
`entity_type` is a closed set (`player | club | league`) and writes go through one function per
table.

## Tables by group

### Reference entities

| Table | Purpose | Non-obvious columns |
| --- | --- | --- |
| `countries` | ISO alpha-2 reference and the market-priority ladder. | `market_priority` — see above. `SCT` is used for Scotland, which is not ISO alpha-2. Deliberate: football's country model is not ISO's. |
| `leagues` | League reference with a Japan-visibility weight. | `tier` — 1 = top flight. `jp_visibility` 0–100, an input to the Japan Market Score's `leagueVisibilityInJapan` component. Currently hand-set in `reference.json`; should become a measured metric. |
| `clubs` | Club reference. | `data_status` — `seed_unverified` until a human confirms. Every seeded club is currently `seed_unverified`. |
| `players` | The tracked-player roster. | `tracked` — the collection filter; an untracked player still resolves in articles but does not generate signals. `contract_confidence` — a confidence key, not a boolean; seeded as `unverified` because contract dates from static rosters go stale. `data_status` — same as clubs. `market_value_source` — provenance for a number the product does not compute itself. |
| `player_aliases` / `club_aliases` | The multilingual matching surface. | `alias_norm` — normalised form, the actual index key. `lang` — `en \| ja \| kana \| romaji`. `kind` — `name \| surname \| nickname \| misspelling`; `surname` is the dangerous one, see below. |

The alias tables are the highest-leverage part of the schema. Entity resolution over Japanese
names in European media is the hard problem this product exists to solve, and it is solved by
having every string a source might use, in every script, indexed. `buildPlayerAliases()`
generates reversed-name variants and romaji variants (macron/no-macron) automatically, and
takes curated aliases at a 3-character minimum so real short surnames survive normalisation.

That 3-character minimum is correct and it creates the schema's sharpest hazard. `alias_norm =
'ito'` with `kind = 'surname'` now exists on **two different players**: Hiroki Ito (伊藤洋輝) and
Junya Ito (伊東純也). Different people, different clubs, different positions, different kanji
surnames — 伊藤 and 伊東 — collapsed to one romanised string. A third player, Ryotaro Ito
(伊藤涼太郎), shares Hiroki's kanji but not the bare alias. `Suzuki` has the same shape: it is a
curated alias on Zion Suzuki (鈴木彩艶) only, while Yuito Suzuki (鈴木唯人) and Yuma Suzuki (鈴木優磨)
are also tracked — so an unqualified `Suzuki` resolves confidently to the wrong player.

The schema supports the fix and does not enforce it. `buildEntityIndex()` returns an `ambiguous`
flag per alias entry, and `article_entities.score` exists so a weak match can be recorded without
being trusted. The resolution rule belongs in `resolve.js`, is stated in `30-source-strategy.md`,
and is carried as a live risk in `85-risks.md`. Note the inversion it implies: the Japanese-language
sources are *less* ambiguous than the English ones, because 伊藤 and 伊東 are simply different
strings. That is the language-arbitrage advantage stated as a data property.

### Sources and collection

| Table | Purpose | Non-obvious columns |
| --- | --- | --- |
| `sources` | The source register. Tier, licence, health, learned reliability. | `provider` — per-row adapter selection (`rss`, `fixture`). `tier` 1–4, drives `SOURCE_TIERS` weight and confidence ceiling. `reliability_score` 0–100, learned; see `30-source-strategy.md`. `reports_total/correct/wrong` — the outcome ledger behind it. `commercial_use` — `allowed \| link_only \| restricted \| unknown`; gates what can be republished and what can be licensed onward. `robots_allowed` / `robots_checked_at` — cached robots.txt verdict. `consecutive_errors` — the alerting trigger. `etag` / `last_modified` — conditional-request cache; the main bandwidth and politeness control. |
| `articles` | Collected item metadata. | `title_ja` / `summary_ja` — see "The `_ja` columns" below. `url_hash` UNIQUE — exact-duplicate key over the canonicalised URL (tracking params stripped, `www.` removed, trailing slash removed), so the same story shared through three campaigns is one row. `content_hash` — exact body-summary duplicate across different URLs. `simhash` — 64-bit near-duplicate key; two articles within Hamming distance 3 are the same wire story rewritten. `relevance_score` / `relevance_reason` — the prefilter verdict, stored so a rejection is explainable. `duplicate_of` — self-reference to the surviving row. `status` — `new \| prefiltered_out \| classified \| duplicate \| error`. |
| `article_entities` | Resolved mentions. | `match_field` — `title \| excerpt`; title matches are worth 1.25× in the prefilter. `score` — per-match confidence, so an ambiguous surname match can be recorded without being trusted. |

### Events

`events` is the core intelligence object and the thing blueprint §39 calls the moat.

| Column | Purpose |
| --- | --- |
| `dedupe_key` | UNIQUE. Identity of the claim, not of the report. Rules below. |
| `type` / `subtype` | `type` from `EVENT_TYPES` (closed set). `subtype` is the lifecycle stage — `interest`, `bid`, `agreement`, `medical`, `completed`, `renewal`, `expiry`, `out`, `return`. |
| `player_id`, `club_id`, `from_club_id`, `to_club_id` | A transfer needs direction; a contract event needs only the club. Both `from_` and `to_` may be null while a rumour is vague. |
| `confidence` + `confidence_rank` | The key and its integer rank, denormalised so `ORDER BY` and `WHERE rank >= 4` work without a join or a CASE. |
| `importance` | 1–5, arithmetic. `>= config.review.autoQueueImportance` (4) always reaches a human. |
| `source_count` / `independent_source_count` | Denormalised from `event_sources`. Independence is what promotes `reported` to `strongly_reported`. |
| `best_source_tier` | The minimum (best) tier across sources. Caps `confidence` via `SOURCE_TIERS[tier].maxConfidence`. |
| `payload` | JSON of extracted structured facts. Free-form by design: fee, contract length, injury type and expected return vary by event type and should not each become a column. Anything queried often enough to need an index has earned promotion to a column. |
| `status` + `superseded_by` | `active \| superseded \| rejected \| pending_review`. Supersession is how a rumour lifecycle is recorded without deleting history. |
| `review_required`, `reviewed_at`, `reviewed_by` | Human audit trail on the event itself, separate from the queue row. |

`events.headline_ja` / `summary_ja` carry the Japanese rendering — see below.

`event_sources.weight` is `SOURCE_TIERS[tier].weight` at insert time, snapshotted rather than
joined. Reliability learning changes source weights over time; a signal computed last month
should stay reproducible.

### The `_ja` columns

`articles.title_ja` / `summary_ja`, `events.headline_ja` / `summary_ja`, and
`changes.headline_ja` / `detail_ja` carry the Japanese rendering of the product's own text.

The schema comment states the rule and it is a legal one, not a stylistic one: these are
**generated summaries of extracted facts, not translations of the source article**. A translation
of a copyrighted article is a derivative work and is exactly what rule 2 exists to prevent.
A Japanese sentence describing an event that JFI extracted, sourced and linked is JFI's own text.

Consequences:

- Generate `_ja` from the *event*, not from `articles.excerpt`. The input is the structured
  `payload` plus `headline`, never the source prose.
- Never populate `articles.title_ja` by translating `articles.title` verbatim. Summarise the
  fact the headline asserts.
- These columns are nullable and stay null when generation is skipped. A missing Japanese
  rendering is a rendering fallback, not an error.
- They are LLM output, so they are text, never a score. Rule 4 is untouched.
- Cost: this is an extra generation per published item. `50-cost-model.md` folds it into the
  extraction and brief calls by asking for both languages in one structured response, which is
  materially cheaper than a second call.

### Signals, scores and history

| Table | Purpose | Non-obvious columns |
| --- | --- | --- |
| `signals` | Current value per (entity, signal_type). One row, overwritten. | `coverage` — share of weight backed by real data. `inputs` — JSON breakdown, rule 4. |
| `signal_history` | One snapshot per entity/type/day. | `as_of_date` in JST. This table is what makes Transfer Momentum possible: `getMomentum()` is a lookup of today versus `as_of_date - windowDays`, not a recomputation. |
| `metrics` | Every measured input, from any provider, for any market. | `provider` — `manual`, or a provider slug once social/search APIs are wired. `market` — `'JP'` today. `as_of_date` + `captured_at` — when it was true versus when we saw it. |
| `market_impact_studies` | Before/after acquisition impact per player × club × metric × window. | `window_days` — 90 default; the same signing can be studied at 30/90/365. `delta_pct` stored, not computed on read, because `before_value` may later be corrected and the historical figure should not silently change. `confidence` — these are observational studies, not experiments. |
| `commercial_estimates` | Forward-looking Japan commercial impact for a player × club pairing. | `low` / `high` — **a range, never a point**. `band` — `LOW \| MEDIUM \| HIGH \| VERY_HIGH`, the primary published form. `basis` — JSON naming which `market_impact_studies` benchmarks and which `metrics` produced the range; NOT NULL, so an estimate without a stated basis cannot be inserted. `confidence` defaults `unverified`. |

`commercial_estimates` is where blueprint §17 ("what could happen in Japan if Club X signs Player
Y?") lands, and the column design is the answer to why that question is dangerous. There is no
`value` column. The publishable output is `band` plus `basis`; `low`/`high` exist so a range can
be shown once enough `market_impact_studies` rows make one defensible. NOT NULL on `basis` means
the schema itself refuses an unexplained number — the same guarantee rule 4 gives `signals`.

Wording constraint from `docs/strategy/positioning.md`: an estimate is rendered as observed
comparator ranges with named drivers, never as a forecast for the specific deal, and never with
"guaranteed" or an unsupported comparison. See `85-risks.md`.

`metrics` refusing to guess is the whole point. A Japan Market Score with coverage 0.42 is
published as provisional with the missing components named. It is not published as a number
with a confident face on it.

### Change detection

`changes` powers "What Changed Today?" — the blueprint's killer UX and, per §43, the reason the
product exists.

| Column | Purpose |
| --- | --- |
| `change_type` | `signal_band \| new_event \| confidence_up \| club_linked \| contract \| injury \| performance` |
| `before_value` / `after_value` | Rendered directly: `MEDIUM → HIGH`. Strings, because a band and a club name are both valid. |
| `importance` | Ranks the daily brief and gates social drafting. |
| `as_of_date` | JST business day. Index `(as_of_date DESC, importance DESC)` is the daily-brief query. |
| `dedupe_key` | UNIQUE. Idempotency. Rules below. |

### Human review, operations, cost

| Table | Purpose | Non-obvious columns |
| --- | --- | --- |
| `review_queue` | The only human interface into the pipeline. | UNIQUE `(item_type, item_id, reason)` — the same item can be queued for two different reasons but not twice for one. `status` — `open \| approved \| rejected \| merged \| edited \| marked_unverified`, matching blueprint §26. `resolved_at` — the measurement basis for human-minutes/day, see `60-automation-plan.md`. |
| `job_runs` | Every run of every job, CLI or scheduled. | `stats` JSON — the returned object from the pipeline function. `status` — `running \| ok \| partial \| error`; a row stuck in `running` is itself an alert. |
| `cost_ledger` | Daily spend by provider × operation × model. | UNIQUE `(as_of_date, provider, operation, model)` — one row per bucket per day, incremented. `input_units` / `output_units` — tokens for LLMs, requests for HTTP APIs, deliberately generic. Feeds blueprint §30's cost-per-1,000-articles reporting. |
| `llm_cache` | Response cache, keyed by task + model + content hash. | `hits` — the cache-effectiveness measure. TTL is `config.llm.cacheTtlDays` (45), enforced on read, not by deletion. |

### Distribution

| Table | Purpose | Non-obvious columns |
| --- | --- | --- |
| `newsletter_issues` | Japan Market Weekly drafts and sends. | `status` `draft → approved → sent`, with `approved_by` / `approved_at` distinct from `sent_at`. The gap between those two timestamps is the audit record proving `docs/newsletter/operations.md` was honoured. |
| `social_drafts` | Per-day platform drafts. | `change_id` — the change that justified the post, so a draft is always traceable to an event to a source. `language` defaults `ja`. |
| `watchlists` / `watchlist_items` | Per-email player watchlists. | `owner_email` — no user table yet. Intentional: Phase 1 has no accounts, and the Brevo list is the identity system. |
| `schema_meta` | Migration bookkeeping. | key/value. |

## `dedupe_key` construction

Not expressible as a SQL constraint, so it is normative here. `persist.js` and `changes.js`
must implement exactly this.

### `events.dedupe_key`

The key identifies **the claim**, not the report of it. A second outlet reporting the same
thing must merge into the existing event and add an `event_sources` row — that is how
`independent_source_count` rises and confidence gets promoted. If a second report created a
second event, confidence could never be earned.

Two families:

**Continuing claims** — `transfer`, `contract`, `club_situation`, `commercial`. These are one
ongoing state, reported repeatedly. **No time component.**

```
<type>:<subtype>:p<player_id>:<counterparty>
```

- `<counterparty>`: for `transfer`, `to<to_club_id>` if known, else `from<from_club_id>`, else `-`.
  For `contract` and `club_situation`, `c<club_id>`. For `commercial`, `c<club_id>` or `-`.
- Missing ids render as `-`.

```
transfer:interest:p17:to42
transfer:bid:p17:to42
contract:renewal:p9:c12
```

**Repeatable point events** — `injury`, `performance`, `national_team`, `media`, `social`.
The same player can genuinely have the same event again. **Include the date.**

```
<type>:<subtype>:p<player_id>:<counterparty>:<date>
```

- `<date>` = `occurred_at` truncated to `YYYY-MM-DD`, falling back to the JST detected date
  (`time.todayInTimezone()`) when `occurred_at` is unknown.

```
injury:out:p17:-:2026-08-14
performance:goal:p23:c8:2026-08-16
national_team:callup:p9:-:2026-08-18
```

Rules that apply to both:

1. Lowercase the whole key. Ids are integers, never slugs — a slug rename would orphan the key.
2. Never include the article, the source, or the detection timestamp. Those belong in
   `event_sources`.
3. The key is stored readable, not hashed. It appears in the admin UI and in support questions,
   and readability is worth more than the bytes.
4. **Subtype changes produce a new row.** `interest → bid → agreement → completed` is four keys.
   On promotion, set the previous event's `status = 'superseded'` and `superseded_by` to the new
   id. This chain is the rumour lifecycle and the training set described in `80-product-ideas.md`.
   Do not mutate a subtype in place; the history is the asset.
5. A `player_id` of null is allowed only for `club_situation` and `commercial`. A transfer,
   contract or injury event with no player is a resolution failure and belongs in
   `review_queue`, not in `events`.

### `changes.dedupe_key`

One change per entity per type per JST day. `detectChanges()` runs on every pipeline tick —
eight times a day — and must be idempotent. Without this, a signal that rose once produces
eight "MEDIUM → HIGH" rows.

```
<as_of_date>:<entity_type>:<entity_id>:<change_type>:<discriminator>
```

| `change_type` | `<discriminator>` |
| --- | --- |
| `new_event` | `e<event_id>` |
| `signal_band` | `<signal_type>:<before_band>><after_band>` |
| `confidence_up` | `e<event_id>:<after_confidence>` |
| `club_linked` | `c<club_id>` |
| `contract`, `injury`, `performance` | `e<event_id>` |

```
2026-08-20:player:17:signal_band:transfer:medium>high
2026-08-20:player:17:new_event:e4821
2026-08-20:player:17:club_linked:c42
```

Rules:

1. `as_of_date` is always JST (`time.todayInTimezone()`), never UTC. A European evening report
   lands on the following JST day, which is correct: the audience reads it in the morning in Japan.
   See `90-decision-log.md`.
2. Include `<signal_type>` in the `signal_band` discriminator. A player whose transfer signal and
   Japan Market Score both move on the same day has two legitimate changes.
3. Band transitions are recorded against the band, not the score. A score moving 51 → 54 is not a
   change; 49 → 51 crossing into `high` is. This is what keeps the daily brief short.
4. If a band oscillates within one day — `medium → high → medium` — the second transition writes a
   distinct key and both rows exist. Correct: the reader should see the walk-back. The brief
   renders the net position, not each hop.

## Deliberate omissions

- **No `users` table.** Brevo holds the list; Phase 1 has no accounts. `watchlists.owner_email` is
  the seam where that changes.
- **No `journalists` table.** Reliability is tracked per `source`, and `articles.author` is stored
  but not resolved. Promoting authors to first-class entities is the source reliability ledger in
  `80-product-ideas.md`, and it needs a table. Not Phase 1.
- **No `transfer_windows` table.** Window dates belong in `data/seeds/` as reference data, keyed by
  country code, until something queries them.
- **No article body, ever.** Rule 2.
