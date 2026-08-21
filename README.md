# Japan Talent Desk / Japan Football Intelligence

One Node process, two products, one Railway service:

- **Japan Talent Desk** (`/`) — the public static site, a Japanese-market recruitment
  intelligence service for European football clubs. B2B, English-first.
- **Japan Football Intelligence** (`/intel`) — a free, Japanese-first daily dashboard for
  people following Japanese players abroad, plus its admin/API surface. See
  `docs/strategy/jfi/` for the full architecture and product spec.

`server.js` at the repo root serves the static site and lazily mounts JFI's request handler
under `config.basePath` (`/intel` by default) — see `docs/strategy/jfi/10-architecture.md`.

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
│   ├── newsletter/                JTD (B2B) newsletter process
│   ├── outbound/                  JTD (B2B) outbound policy
│   ├── reports/                   JTD (B2B) report operations
│   └── strategy/
│       ├── positioning.md         JTD (B2B) positioning
│       └── jfi/                   JFI architecture, data model, cost model, automation plan
├── src/
│   ├── cli.js                     operator CLI — every scheduled job is also a CLI command
│   ├── config/                    all tunables; the only place that reads process.env
│   ├── db/                        schema, migrations, seed loader (node:sqlite, zero deps)
│   ├── jobs/                      daily / weekly / pipeline job composition
│   ├── lib/                       logger, hash, text, time, http, xml — no domain logic
│   ├── pipeline/                  collect → prefilter → classify → persist → signals → changes
│   ├── providers/                 adapters for news/LLM/email providers (fixture/mock by default)
│   └── web/                       /intel router, public + API + admin routes, scheduler
├── test/
├── index.html                     JTD landing page
├── package.json
├── server.js                      process entry: static JTD site + mounted JFI handler
└── styles.css
```

## Local Run

```bash
npm start                 # static JTD site + JFI mounted at /intel
npm run jfi -- help        # JFI operator CLI
npm test
```

Open `http://localhost:3000` for the JTD site, `http://localhost:3000/intel` for JFI.

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
- `docs/strategy/positioning.md` is for current JTD (B2B) positioning and messaging source-of-truth.
- `docs/strategy/jfi/` is for JFI architecture, data model, and operating plan source-of-truth.
- `docs/outbound/` is for outbound policy, CTA rules, and send workflow notes.
- `docs/newsletter/` is for Japan Market Weekly process and Brevo-related notes.
- `docs/reports/` is for sample note structure guidance and report operations.
- `archive/legacy-fsl/` is for internal method references only. FSL should inform the work, not appear in outward JTD messaging.

## Favicon And Logo Treatment

The JTD site uses a restrained text-only header and the local `favicon.svg`.

Japan Talent Desk remains the outward service name in JTD copy, headings, and newsletter language.

## Hero Asset

The hero image was generated for this project as a premium editorial football scouting scene. The site uses the optimized JPEG, with the original PNG retained as the source asset.

```text
assets/jtd-hero.jpg
```
