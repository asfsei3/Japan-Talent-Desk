# JFI Architecture

Last updated: 2026-08-20
Status: Current working source-of-truth for Phase 1. Living document.

## What this document decides

1. The four layers are pipeline stages, not services. One process, one database.
2. No provider is named anywhere except `src/config/index.js` and `src/providers/`.
3. Scheduling runs inside the web process, because a Railway cron service cannot mount the same volume.
4. SQLite is the right store until a second writer process exists, not until the data gets big.

## The four layers

The blueprint names four layers. In the code they are five modules and one database.
The mapping is exact, and nothing else claims to be a layer.

| Blueprint layer | Code | Output |
| --- | --- | --- |
| 1. Global data collection | `src/providers/`, `src/pipeline/collect.js` | `articles` rows |
| 2. Intelligence engine | `src/pipeline/{prefilter,resolve,classify,persist}.js` | `article_entities`, `events`, `event_sources` |
| 3. Market intelligence | `src/pipeline/signals.js`, `metrics`, `market_impact_studies` | `signals`, `signal_history` |
| 4. Decision support | `src/pipeline/{changes,intelligence}.js`, `src/web/` | `changes`, daily brief, dossier, radar |

Layer 3 is deliberately not "Japan intelligence". Japan is a value in `metrics.market` and a
rank in `countries.market_priority`. See `20-data-model.md`.

## Pipeline

```
  L1  COLLECTION
      sources (17 seeded / 8 enabled)          providers/getNewsProvider(source)
      rss · fixture · [news-api] · [football]   ──►  adapter returns { fetchItems(source) }
                          │
                          ▼
      pipeline/collect.js
        robots.txt gate · ETag / Last-Modified · per-host delay 1200ms
        maxArticlesPerRun 400 · maxArticlesPerSource 40 · lookback 7d
        text.toExcerpt  (short factual summary — never the body)
        hash.urlHash · hash.sha256(content) · hash.simhash
                          │
                          ▼
                    ┌──────────┐
                    │ articles │  status = new
                    └────┬─────┘
                         │  exact dupe → status = duplicate, duplicate_of
                         │  near dupe (simhash hamming ≤ 3) → status = duplicate
                         ▼
  L2  INTELLIGENCE ENGINE
      pipeline/prefilter.js  ── scoreArticle() ──►  relevance_score, relevance_reason
        entity match 55 · japan kw 20 · event kw 15 · football kw 10 · trusted src 10
        title matches ×1.25
        uses pipeline/resolve.js buildEntityIndex() over player_aliases / club_aliases
                         │
             score < 40  ├──────────────►  status = prefiltered_out   (never sees an LLM)
             score ≥ 40  ▼
      pipeline/classify.js
        llm_cache lookup (key = task + model + content hash)
             hit  ├──────────────►  reuse response, no spend
             miss ▼
        providers/getLlmProvider().complete({ task, model, system, prompt, maxTokens })
          triage   claude-haiku-4-5   → is there an event here? which type?
          extract  claude-sonnet-5    → structured facts, only if triage says yes
          escalate claude-opus-5      → contradictions, importance ≥ 4 only
        every call writes cost_ledger + llm_cache
                         │
                         ▼
      pipeline/persist.js  ── persistExtraction()
        dedupe_key → insert or merge into events
        append event_sources · recount source_count / independent_source_count
        confidence = min(tier ceiling, independence rule)   [scores are arithmetic]
        importance ≥ 4 or confidence ≤ reported → review_queue
                         │
                         ▼
  L3  MARKET INTELLIGENCE
      pipeline/signals.js
        computeTransferSignal()    events + source weight + decay (half-life 6d, window 21d)
        computeJapanMarketScore()  metrics rows only; missing input lowers coverage,
                                   coverage < 0.6 → provisional, never guessed
        writes signals + daily signal_history snapshot
                         │
                         ▼
  L4  DECISION SUPPORT
      pipeline/changes.js      detectChanges() → changes rows (idempotent per JST day)
      pipeline/intelligence.js buildDailyBrief · buildPlayerDossier · buildTransferRadar
                         │
        ┌────────────────┼────────────────────┬──────────────────────┐
        ▼                ▼                    ▼                      ▼
   src/web  /intel   jobs/daily.js       jobs/weekly.js         review_queue
   public pages      social_drafts       newsletter_issues      admin UI
                     (draft only)        (draft only)           human decides
                          │                    │
                          └──── human approval ┘  ← config.{social,newsletter}.requireHumanApproval
```

Nothing crosses from `newsletter_issues.status = 'draft'` to `'sent'` without a person.
`docs/newsletter/operations.md` is the reason. See `60-automation-plan.md`.

## Module map

| Path | Owns | Contract |
| --- | --- | --- |
| `src/config/index.js` | Every tunable. The only file that reads `process.env`. | `config`, `CONFIDENCE`, `SOURCE_TIERS`, `EVENT_TYPES` |
| `src/db/client.js` | Connection, WAL, migrations, transactions. | `getDb, run, get, all, exec, transaction, migrate, upsert` |
| `src/db/schema.sql` | Canonical schema. No table is created anywhere else. | — |
| `src/db/seed.js` | Reference + roster load from `data/seeds/*.json`. | `seed()`, `buildPlayerAliases()`, `buildClubAliases()` |
| `src/lib/` | `logger, hash, text, time, http, xml`. No domain logic. | pure utilities |
| `src/providers/` | Every external system. Adapters only. | `getNewsProvider`, `getLlmProvider`, `getEmailProvider` |
| `src/pipeline/` | The eight stages above. | see `SHARED_SPEC` contracts |
| `src/jobs/` | `daily.js`, `weekly.js`. Compose pipeline calls; add no logic. | `runDaily`, `runWeekly` |
| `src/web/` | HTTP handler mounted under `config.basePath`. | `createRequestHandler`, `startServer` |
| `src/cli.js` | Operator surface. Every scheduled job is also a CLI command. | `npm run jfi -- <cmd>` |

Rule: `src/jobs/` may call `src/pipeline/`. `src/pipeline/` may call `src/providers/` and
`src/db/`. `src/providers/` may call `src/lib/` and `src/config/` and nothing else. A pipeline
module that imports another provider's SDK directly is a defect.

## The adapter pattern, and why no provider is hard-coded

Three registries in `src/providers/index.js`:

```
getNewsProvider(source)  → { fetchItems(source) }        selected by sources.provider
getLlmProvider()         → { name, complete({...}) }     selected by config.llm.provider
getEmailProvider()       → { sendCampaign(...) }         selected by config.newsletter.*
```

`sources.provider` is a per-row column, not a global setting. That is the important part: a
news API can be introduced for six sources while the other eleven stay on RSS, with no
branching outside the registry. Today the values in use are `rss` and `fixture`.

Four reasons the indirection earns its cost:

1. **Tests run offline.** `provider = 'fixture'` and `config.llm.provider = 'mock'` make the whole
   pipeline runnable with no network and no keys. This is a hard requirement, not a convenience —
   see `SHARED_SPEC`.
2. **Exit cost stays bounded.** Every provider in `40-api-costs.md` has a named exit strategy.
   An exit strategy that requires touching pipeline code is not an exit strategy.
3. **Pricing changes are config changes.** `config.llm.pricing` drives `cost_ledger`. Repricing a
   model is one edit.
4. **Cost discipline is enforced at one seam.** Cache lookup, budget check and ledger write all
   live behind `complete()`. There is no path to a paid call that skips them.

The LLM registry is the case that matters most, because it is the only provider that can spend
money per article. Selection: `config.llm.provider` is `anthropic` when `ANTHROPIC_API_KEY` is
set, `mock` when it is not, and `auto` resolves between them.

## Deployment topology

Railway. One service. One process.

```
  Railway service "japan-talent-desk"
  ┌──────────────────────────────────────────────────────────┐
  │  node server.js            (npm start, PORT from env)     │
  │                                                           │
  │   /                → index.html   Japan Talent Desk LP     │
  │   /assets/*        → static                               │
  │   /api/newsletter  → Brevo contact create (existing)       │
  │   /intel/*         → src/web/createRequestHandler()        │
  │   /intel/admin/*   → basic auth, JFI_ADMIN_PASSWORD        │
  │                                                           │
  │   in-process tick  → collect · prefilter · classify ·      │
  │                      signals · changes · daily · weekly    │
  └────────────────────────────┬─────────────────────────────┘
                               │  node:sqlite, WAL
                    ┌──────────▼──────────┐
                    │ Railway volume      │  mount /data
                    │ /data/jfi.db        │  JFI_DB_PATH=/data/jfi.db
                    │ /data/jfi.db-wal    │
                    │ /data/jfi.db-shm    │
                    └─────────────────────┘
```

Constraints that shaped this:

- **The database must be on the volume, not the container filesystem.** Railway containers are
  ephemeral; a redeploy without a volume loses every article, event and signal collected so far.
  `JFI_DB_PATH` defaults to `var/jfi.db` for local work and must be overridden in production.
- **WAL needs real file locking.** A block-device volume is fine. A network filesystem is not —
  SQLite's locking is unreliable over NFS-style mounts and will corrupt under concurrent access.
  Do not move the file to object storage.
- **A Railway cron job cannot share the volume.** Railway volumes attach to one service. A cron
  service is a separate service, so it gets a separate mount and a separate, empty database.
  This is the single most consequential deployment fact in this document.

### Scheduling

Given the volume constraint, two options remain, and both keep writes in one process:

- **Primary: in-process tick.** A `setInterval` inside `server.js` calls the same functions the
  CLI calls, on the cadence in `60-automation-plan.md`. One writer, no coordination, no second
  mount. Jobs are I/O-bound so they do not starve the HTTP handler. Every run still writes a
  `job_runs` row, so an in-process run is as auditable as a cron run.
- **Backup: external trigger.** An authenticated `POST /intel/admin/run?job=pipeline` endpoint,
  called by GitHub Actions scheduled workflows or an external cron service. Use this when a run
  must be forced, when the tick is suspected of being wedged, or if the process is ever split.

Rejected: Railway scheduled jobs as the primary mechanism (separate volume, as above);
a separate worker service (same reason, plus it introduces a second SQLite writer).

Every job is also a CLI command, so `railway run npm run jfi -- pipeline` reproduces any
scheduled run by hand against the same database. That property is worth protecting.

### Operational settings

| Setting | Value | Why |
| --- | --- | --- |
| `PRAGMA journal_mode` | `WAL` | readers do not block the writer; the web page stays responsive during a pipeline run |
| `PRAGMA foreign_keys` | `ON` | orphaned `event_sources` would silently break provenance |
| `PRAGMA busy_timeout` | 5000ms (assumption — set it in `db/client.js`) | absorbs the tick overlapping a request |
| `PRAGMA synchronous` | `NORMAL` under WAL | full fsync per commit is not worth it for re-fetchable article data |
| Backup | nightly `VACUUM INTO /data/backup/jfi-YYYY-MM-DD.db`, keep 14 | a file copy of a live WAL database is not a valid backup |

The backup line is not optional. The events table is the asset (blueprint §39); the article
text is re-fetchable and the seed data is in git, but a year of accumulated events and
`signal_history` is not reconstructible.

## The scaling exit

SQLite is a decision with a defined end. Postgres is not better here today and would add a
network hop, a connection pool and a managed-service bill to a system that fits in one file.

Migrate when **any one** of these is true:

| Trigger | Threshold | Why this is the line |
| --- | --- | --- |
| **Second writer process** | more than one process opening the DB for write | This is the real trigger. WAL allows one writer; a second one produces `SQLITE_BUSY` under load. Splitting the web and worker, adding a second region, or moving cron to its own service all cross it. |
| **Write contention** | `SQLITE_BUSY` retries on >1% of write attempts over a 24h window | Measurable before it becomes an outage. Instrument the retry count in `db/client.js`. |
| **Write rate** | sustained >50 writes/sec, or a pipeline run spending >90s in DB time | At ~5,000 articles/day the pipeline writes roughly 6,000 rows/day — four orders of magnitude below this. |
| **Row count** | `articles` > 5,000,000 or DB file > 20 GB | ~14 years at 1,000 articles/day, ~3 years at 5,000. Not the binding constraint. |
| **Operational requirement** | read replicas, point-in-time recovery, or multi-region | Bolting these onto SQLite is worse than migrating. |

Expected first trigger: the second writer, driven by an operational need (a heavy backfill, a
separate B2B API service), not by data volume. Plan for that shape, not for a size limit.

### What the migration actually costs

The schema was written to survive this. It uses no SQLite-specific types. The port is:

- `INTEGER PRIMARY KEY` → `GENERATED ALWAYS AS IDENTITY`
- `datetime('now')` defaults → `now()`
- `TEXT` dates stay `TEXT` (ISO-8601 sorts correctly) or become `timestamptz` in a second pass
- `INSERT ... ON CONFLICT ... DO UPDATE` — already Postgres-compatible syntax
- `UNIQUE` constraints and partial indexes — compatible
- `hash.simhash` stored as `TEXT` hex — compatible; consider `bit(64)` later

One code seam changes: the `upsert` helper and the parameter binding style in `src/db/client.js`.
Nothing in `src/pipeline/` should need edits, and if it does, that is a layering defect to fix
before the migration rather than during it.

Estimate: 2–3 days including a dual-write verification window. Assumption, to be re-estimated
once `src/db/client.js` is final.

## Open items

- `PRAGMA busy_timeout` and the `SQLITE_BUSY` retry counter are proposed here, not yet in code.
- The in-process tick is proposed here, not yet in code. `src/cli.js` has every command it needs.
- Backup job is not written. It is a `job_runs`-logged daily task like any other.
