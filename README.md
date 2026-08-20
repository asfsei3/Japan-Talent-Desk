# Japan Talent Desk Site

Public-facing static site for Japan Talent Desk, a Japanese market recruitment intelligence service for European football clubs.

This repository also contains the **Travel Decision Engine** (`engine/`, served at `/travel/`), a
separate product built on the same Node server. See [Travel Decision Engine](#travel-decision-engine) below.

## File Structure

```text
.
├── archive/
│   └── legacy-fsl/
├── assets/
│   ├── favicon.svg
│   ├── jtd-hero.jpg
│   └── jtd-hero.png
├── docs/
│   ├── README.md
│   ├── competitive-analysis.md
│   ├── cost-model.md
│   ├── data-sources.md
│   ├── newsletter/
│   ├── outbound/
│   ├── reports/
│   ├── strategy/
│   └── travel/
├── engine/
│   ├── data/
│   ├── affiliate.js
│   ├── cost-model.js
│   ├── explain.js
│   ├── index.js
│   ├── parse-request.js
│   ├── recommend.js
│   ├── scoring.js
│   └── share.js
├── scripts/
│   └── generate-seo-pages.js
├── test/
├── travel/
│   ├── guides/
│   ├── index.html
│   ├── travel.css
│   └── travel.js
├── index.html
├── selected-archive/
│   └── index.html
├── package.json
├── README.md
├── server.js
└── styles.css
```

## Local Run

```bash
npm start        # site + Travel Decision Engine API
npm test         # engine test suite
npm run seo      # regenerate the curated travel guide pages
```

Open `http://localhost:3000` for the recruitment site, or `http://localhost:3000/travel/` for the
Travel Decision Engine.

## Deploying To Railway From GitHub

1. Push this folder to a GitHub repository.
2. In Railway, create a new project from the GitHub repo.
3. Railway should detect Node automatically.
4. Use the default start command:

```bash
npm start
```

5. Railway will provide `PORT` automatically. The included `server.js` serves only static files.

## Content Boundaries

- Root site files are for the public LP only.
- `engine/`, `travel/`, `scripts/`, and `test/` belong to the Travel Decision Engine and are independent of JTD messaging.
- `docs/strategy/` is for current JTD positioning and messaging source-of-truth.
- `docs/outbound/` is for outbound policy, CTA rules, and send workflow notes.
- `docs/newsletter/` is for Japan Market Weekly process and Brevo-related notes.
- `docs/reports/` is for sample note structure guidance and report operations.
- `archive/legacy-fsl/` is for internal method references only. FSL should inform the work, not appear in outward JTD messaging.

## Favicon And Logo Treatment

The site currently uses a restrained text-only header and the local `favicon.svg`.

Japan Talent Desk remains the outward service name in copy, headings, and newsletter language.

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
**Travel Value Score** that adapts its weights to the request.

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
