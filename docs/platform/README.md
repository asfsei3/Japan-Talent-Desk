# Platform Docs

This folder is the planning source-of-truth for the **Vertical Intelligence Platform**
strategy: a shared data/AI architecture intended to run Japan Talent Desk (Football
Intelligence) alongside future verticals (Investment, Shopping, Career, Travel,
Insurance, Global News, ...).

Nothing in this folder describes code that exists in this repository today. This
repository currently ships one working product: the JTD public site (static
landing page + newsletter signup via Brevo, see `server.js`). Everything below is
forward-looking design and research, written so that a build can start from a
grounded plan instead of from scratch.

## Files

- `architecture.md` — shared entity model, ingestion pipeline, alert engine, and
  how JTD fits into it today vs. the target state.
- `business-strategy.md` — the 15-criteria evaluation framework applied to JTD
  (current) and six candidate verticals, with a reality check against what JTD
  actually is today.
- `monetization.md` — Free → Premium → Affiliate funnel design and pricing
  candidates per vertical.
- `data-sources.md` — FREE / CHEAP / BEST / SCALE data source comparison for
  Investment and Shopping, the two verticals the spec asks to research first.
- `api-costs.md` — named APIs, pricing, and per-user-tier cost projections
  (1k / 10k / 100k / 1M users), including AI (Claude API) cost modeling.
- `legal-risks.md` — ToS / robots.txt / copyright / attribution rules, investment
  and recruitment-adjacent regulatory notes, affiliate compliance.
- `seo-strategy.md` — programmatic SEO plan per vertical with thin-content
  guardrails.
- `moat.md` — what historical/structured data each vertical should accumulate
  and why it compounds.

## Status

Planning only. No Investment or Shopping code exists yet. See each file's
"Status" line for how confident the numbers in it are — anything not verified
against a primary source is marked **要確認 (needs verification)** rather than
guessed.
