# Japan Talent Desk / Japan Football Intelligence

One Node process, two products, one Railway service:

- **Japan Talent Desk** (`/`) — the public static site, a Japanese-market recruitment
  intelligence service for European football clubs. B2B, English-first.
- **Japan Football Intelligence** (`/intel`) — a free, Japanese-first daily dashboard for
  people following Japanese players abroad, plus its admin/API surface. See
  `docs/strategy/jfi/` for the full architecture and product spec.

`server.js` at the repo root serves the static site and lazily mounts JFI's request handler
under `config.basePath` (`/intel` by default) — see `docs/strategy/jfi/10-architecture.md`.

This repository also contains the **Travel Decision Engine** (`engine/`, served at `/travel/`), a
separate product built on the same Node server. See [Travel Decision Engine](#travel-decision-engine) below.

## File Structure

```text
.
├── archive/
│   └── legacy-fsl/
├── assets/
├── data/
│   ├── monetization.json         JFI monetization slot config (safe to ship empty)
│   └── seeds/                    reference data, player/club rosters, sources
├── docs/
│   ├── README.md
│   ├── competitive-analysis.md    Travel: market positioning
│   ├── cost-model.md              Travel: infra/API spend
│   ├── data-sources.md            Travel: source audit
│   ├── travel/                    Travel Decision Engine pipeline/scoring docs
│   ├── newsletter/                JTD (B2B) newsletter process
│   ├── outbound/                  JTD (B2B) outbound policy
│   ├── platform/                  Vertical Intelligence Platform strategy (planning only)
│   ├── reports/                   JTD (B2B) report operations
│   └── strategy/
│       ├── positioning.md         JTD (B2B) positioning
│       └── jfi/                   JFI architecture, data model, cost model, automation plan
├── engine/                        Travel Decision Engine core (cost model, scoring, parsing)
│   ├── data/
│   ├── investment/                 Investment Intelligence core (SEC EDGAR client, fundamentals)
│   ├── telecom/                    Telecom Optimization core (plan dataset, recommendation engine)
│   ├── affiliate.js
│   ├── cost-model.js
│   ├── explain.js
│   ├── index.js
│   ├── parse-request.js
│   ├── recommend.js
│   ├── scoring.js
│   ├── share.js
│   └── timing.js
├── src/
│   ├── cli.js                     operator CLI — every scheduled job is also a CLI command
│   ├── config/                    all tunables; the only place that reads process.env
│   ├── db/                        schema, migrations, seed loader (node:sqlite, zero deps)
│   ├── jobs/                      daily / weekly / pipeline job composition
│   ├── lib/                       logger, hash, text, time, http, xml — no domain logic
│   ├── pipeline/                  collect → prefilter → classify → persist → signals → changes
│   ├── providers/                 adapters for news/LLM/email providers (fixture/mock by default)
│   └── web/                       /intel router, public + API + admin routes, scheduler
├── scripts/
│   └── generate-seo-pages.js      Travel Decision Engine SEO guide generator
├── test/                          JFI + Travel Decision Engine test suites
├── travel/
│   ├── guides/
│   ├── index.html
│   ├── travel.css
│   └── travel.js
├── investment/                     Investment Intelligence MVP (Company Search + Company Page)
├── telecom/                        Telecom Optimization MVP (household plan diagnosis)
├── index.html                     JTD landing page
├── selected-archive/
│   └── index.html
├── package.json
├── server.js                      process entry: static JTD site + Travel API + mounted JFI handler
└── styles.css
```

## Local Run

```bash
npm start                 # JTD site + Travel Decision Engine API + JFI mounted at /intel
npm run jfi -- help        # JFI operator CLI
npm run seo                 # regenerate the curated travel guide pages
npm test                   # JFI + Travel Decision Engine test suites
```

Open `http://localhost:3000` for the JTD site, `http://localhost:3000/travel/` for the Travel
Decision Engine, or `http://localhost:3000/intel` for JFI.

JFI needs a database before it will show real data:

```bash
npm run setup               # jfi migrate + seed
npm run pipeline            # one manual collect → ... → changes run
```

Without `ANTHROPIC_API_KEY` set, JFI runs on the mock LLM provider and the `fixture` news
source — fully offline, no network, no spend. See `docs/strategy/jfi/40-api-costs.md`.

## Deploying To Railway From GitHub

1. Push this folder to a GitHub repository.
2. In Railway, create a new project from the GitHub repo, attach a volume, and set
   `JFI_DB_PATH` to a path on that volume (defaults to `var/jfi.db`, which does not survive
   a redeploy without a volume — see `docs/strategy/jfi/10-architecture.md`).
3. Set `JFI_ADMIN_PASSWORD` to enable `/intel/admin`; it 404s when unset.
4. Railway should detect Node automatically. Default start command:

```bash
npm start
```

5. Railway provides `PORT` automatically.

## Content Boundaries

- Root site files are for the public JTD landing page only.
- `engine/`, `travel/`, `scripts/generate-seo-pages.js`, and the Travel Decision Engine's tests are independent of JTD messaging.
- `docs/strategy/positioning.md` is for current JTD (B2B) positioning and messaging source-of-truth.
- `docs/strategy/jfi/` is for JFI architecture, data model, and operating plan source-of-truth.
- `docs/outbound/` is for outbound policy, CTA rules, and send workflow notes.
- `docs/newsletter/` is for Japan Market Weekly process and Brevo-related notes.
- `docs/reports/` is for sample note structure guidance and report operations.
- `docs/platform/` is for the forward-looking Vertical Intelligence Platform strategy (shared architecture, monetization, data sources, API costs, legal risks, SEO, moat) — planning only, not a description of current site behavior.
- `archive/legacy-fsl/` is for internal method references only. FSL should inform the work, not appear in outward JTD messaging.

## Favicon And Logo Treatment

The JTD site uses a restrained text-only header and the local `favicon.svg`.

Japan Talent Desk remains the outward service name in JTD copy, headings, and newsletter language.

## Hero Asset

The hero image was generated for this project as a premium editorial football scouting scene. The site uses the optimized JPEG, with the original PNG retained as the source asset.

```text
assets/jtd-hero.jpg
```

## Travel Decision Engine

A decision engine for Japanese domestic travel: given dates, budget, departure city, party, and
preferences, it returns the best overall trip rather than an itinerary. The destination is the
output, not the input.

It compares every combination of destination, route, and hotel tier on **True Trip Cost** —
transport, lodging, meals, local transport, activities, and contingency — then ranks them with a
**Travel Value Score** that adapts its weights to the request. It also checks whether shifting
the dates would be cheaper *without going out of season*.

```text
"東京から9月の3連休に大人2人、子供2人で15万円以内。海か温泉。移動はできるだけ楽に。"
   ↓
総合ベスト / コスパ重視 / 家族連れベスト / 移動が楽 / 海ベスト / 温泉ベスト
```

### Design commitments

- **No scraping.** Commercial travel sites are never scraped. See `docs/data-sources.md`.
- **¥0 marginal cost.** No third-party call sits on the user request path. See `docs/cost-model.md`.
- **Ranking never reads commission.** The affiliate layer runs strictly after ranking, and a test
  asserts results are identical with and without an affiliate ID configured.
- **Estimates are labelled as estimates.** Every figure is a planning estimate from a curated
  dataset, presented as a range, and never presented as a live price.

### Documentation

| Document | Contents |
| --- | --- |
| `docs/data-sources.md` | Source audit, acquisition rules, and the rate limit that shaped the architecture |
| `docs/cost-model.md` | Infrastructure and API spend, and what is deliberately not bought |
| `docs/competitive-analysis.md` | Market positioning, the gap being targeted, and honest risks |
| `docs/travel/engine.md` | Pipeline, scoring model, and known limitations |

### Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /travel/` | The decision UI |
| `GET /travel/guides/` | Curated, generated comparison guides |
| `POST /api/travel/plan` | `{ text, overrides }` → recommendations |
| `GET /api/travel/plan?t=` | Restore a shared trip from a token |
| `GET /api/travel/meta` | Supported origins, interests, and real coverage counts |

Affiliate identifiers are read from the environment (`.env.example`). With none configured the
engine emits plain, untracked public search links.
