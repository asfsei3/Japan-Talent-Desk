# Vertical Intelligence Platform — Architecture

Status: Planning / target-state design. No shared backend exists yet — see
"Where this repo actually is today."

## 0. Where this repo actually is today

This repository is a single static site (`index.html`, `styles.css`,
`server.js`) plus a Node HTTP server whose only dynamic behavior is one route:
`POST /api/newsletter`, which forwards a signup form to Brevo. There is no
database, no scheduled job, no crawler, and no AI pipeline in the codebase.
JTD's actual research process (sourcing players, writing notes) is manual and
lives outside this repo (see `archive/legacy-fsl/` and `docs/reports/`).

Everything in this document is the target architecture the platform *should*
converge on if JTD's process is automated and additional verticals are added
later. It is not a description of what exists now, and it should not be
mistaken for one.

## 1. Design goal

One shared substrate — data model, ingestion pipeline, alert engine — that
every vertical (Football/JTD today; Investment, Shopping, Career, Travel,
Insurance, Global News later) plugs into, instead of each vertical rebuilding
search, watchlists, alerts, and AI summarization from scratch.

A vertical should be addable by defining:

1. Its own Entity subtypes (e.g. `Player`, `Company`, `Product`)
2. Its own Sources and ingestion adapters
3. Its own AI extraction/classification prompts
4. Its own presentation layer (search UI, detail page)

...while reusing User, Watchlist, Alert, Subscription, and the ingestion
pipeline unchanged.

## 2. Shared entities

Core entities every vertical shares:

| Entity | Purpose |
|---|---|
| `User` | Account, auth, email, notification preferences |
| `Organization` | For B2B verticals (e.g. a football club account on JTD) |
| `Entity` | Polymorphic base row (a Player, a Company, a Product, ...) with `vertical`, `entity_type`, `slug` |
| `Source` | A feed/API/site being ingested: name, type, ToS/attribution notes, trust tier |
| `Article` | A collected piece of content: title, URL, source, published_at, short_summary — never full-text copy (see `legal-risks.md`) |
| `Event` | A structured, timestamped fact tied to an Entity (earnings released, transfer completed, price drop) |
| `Metric` | A timestamped numeric fact tied to an Entity (P/E, market price, xG, product price) — this is what makes trend/history views possible without re-deriving from Articles every time |
| `Watchlist` / `WatchlistItem` | User-saved Entities, vertical-agnostic |
| `Alert` / `AlertRule` | User-defined trigger conditions over Events/Metrics |
| `Category` / `Tag` | Cross-vertical taxonomy |
| `AIAnalysis` | Stored AI output tied to an Entity + time window, tagged FACT / INTERPRETATION / AI_INFERENCE (see below) |
| `AffiliateLink` | Outbound monetized link, tied to a retailer/provider and an Entity |
| `Subscription` | Premium plan state per User |

Vertical-specific `Entity` subtypes (all rows still live in `Entity`, distinguished by `entity_type`):

- **Football (JTD)**: `Player`, `Club`, `Match`, `Transfer`, `Competition`
- **Investment**: `Company`, `Stock`, `ETF`, `Earnings`, `Filing`, `Analyst`, `Theme`
- **Shopping**: `Product`, `Brand`, `Retailer`, `Price`, `Review`

## 3. Ingestion pipeline

```
SOURCE → INGEST → DEDUPLICATE → NORMALIZE → ENTITY RESOLUTION
       → AI CLASSIFICATION → AI SUMMARY → FACT EXTRACTION
       → STORE → SEARCH INDEX → ALERT ENGINE → USER
```

Notes on the stages that need real design work (not just naming):

- **DEDUPLICATE**: multiple sources often report the same event (a transfer,
  an earnings beat) within hours. Dedup key should be `(entity_id, event_type,
  date, normalized_headline_hash)`, not just URL — URLs are never stable
  dedup keys across syndicated content.
- **ENTITY RESOLUTION**: mapping "NVIDIA", "Nvidia Corp", "NVDA" to one
  `Company` row. Start with a per-vertical alias table (cheap, deterministic)
  before reaching for embedding-based matching — most verticals have a small,
  enumerable universe of entities (a few thousand tickers, a few hundred
  clubs) where a lookup table outperforms fuzzy matching on cost and
  reliability.
- **AI CLASSIFICATION / SUMMARY / FACT EXTRACTION**: this is the one stage
  that should call the Claude API (see `api-costs.md` for cost modeling).
  Output must be stored with a provenance tag distinguishing:
  - **FACT** — directly extracted from a cited source (a number, a quote, a
    date)
  - **INTERPRETATION** — a source's stated opinion (an analyst's view,
    reported market reaction)
  - **AI_INFERENCE** — the platform's own AI-generated synthesis (Bull/Bear
    case, "what changed") — always rendered with a visible disclaimer and a
    link back to the FACTs it was built from

  This distinction is a compliance requirement, not a nice-to-have — see
  `legal-risks.md` §Investment.

- **ALERT ENGINE**: `Event → Rule → Notification`. Rules are per-user,
  per-watchlist-item, defined against Event/Metric types (e.g. "notify me
  when `Price.value` for this `Product` drops below X", "notify me when a
  `Transfer` Event fires for a watched `Player`"). One rule engine, evaluated
  on every new Event/Metric row, fans out to Email/Push/Slack/Telegram
  channels per user preference. This is the concrete mechanism behind
  section 22/7/17 of the spec ("shared alert engine").

## 4. Automation-first execution model

Cron/queue-driven, not human-triggered:

- Scheduled ingestion jobs per Source (interval depends on Source volatility:
  RSS feeds can poll every 15–30 min, slower sources hourly/daily)
- Each job run is logged (Source, start/end, rows ingested, errors)
- Failures retry with backoff; a Source that fails N consecutive times is
  flagged in an admin view rather than silently dropped
- A fallback Source per critical data type where feasible (e.g. two market
  data providers) so one vendor outage doesn't blank a page

## 5. JTD (Football Intelligence) as Vertical #1 — migration path

JTD today is **not** running on this architecture — it is manual research
distributed as a newsletter, which is the opposite of "automation first"
(spec §0.1). Treating JTD as the platform's first vertical means an explicit
migration, not a relabeling:

1. Model `Player`, `Club`, `Transfer`, `Match` as `Entity` rows now, even
   before automated ingestion exists — this alone unlocks a searchable
   archive of past JTD notes and removes "which players have we already
   covered" as a manual lookup.
2. Add Source adapters for what's realistically automatable in Japanese
   football (J.League/JFA official data, club press releases, licensed
   stats feeds) — see `legal-risks.md` for why player-side info (agent
   conversations, availability signals) stays manual and out of the
   automated pipeline; that is JTD's actual moat (spec's positioning doc:
   "player-side signal reader"), not something to automate away.
3. Reuse Watchlist/Alert for clubs: a club contact can watch positions or
   named players and get notified on new `Event` rows, replacing the current
   one-way newsletter with the pull mechanism the rest of the platform uses.

## 6. Shared vs. vertical-specific storage

To avoid overbuilding for a single-vertical MVP: don't stand up a
multi-tenant schema before a second vertical actually exists. The `Entity`
polymorphic table above is cheap to design correctly from day one (it's a
handful of columns) — the expensive mistake to avoid is instead building
vertical-specific tables per feature (a `players` table, a `stocks` table,
a `products` table) that all duplicate Watchlist/Alert/Source glue code.
Model the shared core once; let vertical-specific detail live in a
`entity_type`-keyed JSON/attributes column or per-type child tables joined
on `entity_id`, added only when a vertical is actually being built.
