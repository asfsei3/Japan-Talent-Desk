# Moat — Data & History Accumulation

Status: Planning. No historical data is being captured yet in any vertical
in this repo (JTD's research history lives in unstructured reports, not a
queryable store).

## Why this matters more than the AI layer

Spec §8/§10 is explicit: a "summarize this with AI" product has no moat —
any competitor with API access to the same model can replicate it in a
weekend. What compounds over time and can't be replicated overnight is:

- **History** a competitor doesn't have because they didn't start capturing
  it as early
- **Structured facts** (not prose) that support queries a plain AI chat
  answer can't do reliably (e.g. "show me every quarter this company's
  gross margin moved more than 2 points")
- **User-specific accumulation** (watchlists, alert history, what a given
  user has already seen) that makes the product get more useful to *that
  user* the longer they stay, which a generic AI tool never does

The `Metric` and `Event` entities in `architecture.md` §2 exist specifically
to make this possible — every ingestion run should write timestamped rows,
not overwrite a "current value" field. Overwriting current-value fields
instead of appending history is the single most common way a data platform
accidentally throws its own moat away.

## Per-vertical moat plan

### Investment Intelligence

- `Metric` history per company: price, market cap, margins, revenue growth,
  P/E — every ingestion writes a new dated row, never overwrites
- `Event` history: every earnings release, analyst action, and material
  news item tied to the company, permanently retained
- `AIAnalysis` history: store every generated "What Changed" / Bull-Bear
  synthesis with its date, not just the latest one — this is what enables
  the target capability from spec §10 ("what changed about this company in
  the last 6 months?") as a real query over stored analyses, not a fresh
  AI call re-deriving it from scratch each time
- User-side: Watchlist history, alerts received, and (once built) which
  companies a user has actually read the deep-dive for — feeds
  personalization later without needing to re-architect

### Shopping Intelligence

- `Metric` (price) history per product per retailer — the concrete
  foundation for "is this a good time to buy" (spec §16), which is
  impossible without historical price data no matter how good the AI layer
  is
- Product normalization mapping (the same physical product listed under
  different titles/SKUs across retailers) — this is unglamorous but is
  the actual hard problem in shopping comparison, and once solved for a
  product it stays solved
- Review aggregation over time (rating trend, not just current average)
- User preference history — what a user has searched for, saved, and
  bought (via affiliate conversion tracking) informs the "decision engine"
  spec §20 describes as the long-term goal — again a compounding asset
  that only exists if capture starts early

### JTD / Football Intelligence

This is the vertical with the clearest existing moat *and* the biggest gap
between where the value lives and where it's captured today:

- The actual moat (per `docs/strategy/positioning.md`) is human-sourced
  Japan-side signal — agent conversations, availability read, deal
  realism — which is fundamentally not automatable and therefore not
  replicable by a competitor spinning up an AI wrapper. This is a genuine,
  durable moat.
- The gap: none of it is currently stored as structured, queryable history
  — it lives in one-off newsletter issues and reports (`docs/reports/`).
  "This player, 6 months ago vs. now" is not answerable today without
  manually re-reading old issues.
- Fix: model past JTD coverage as `Entity` (`Player`) + `Event` rows
  retroactively where feasible, and require all new research output to be
  captured structurally (a `Player` Event row with a link to the full
  report), not just published as a newsletter issue and left there. This
  converts JTD's already-real informational moat into a *queryable* one,
  which is the actual product upgrade path described in
  `architecture.md` §5 — the newsletter isn't replaced, it becomes one
  output of a structured underlying record instead of the only copy of
  that record.

## Operating discipline this requires

- Every ingestion/AI job appends, it doesn't overwrite — enforce this at
  the schema level (append-only `Metric`/`Event`/`AIAnalysis` tables) so it
  can't be silently violated by a future engineer optimizing for simplicity
- Retention: don't build a "delete data older than N days" cleanup job for
  these tables by default — the history *is* the product's long-term value,
  not operational clutter to prune
- Cost note: this doesn't materially conflict with `api-costs.md`'s
  cost-control model — the expensive operations (API calls, AI synthesis)
  still run on a schedule bounded by entity coverage; storing the resulting
  rows indefinitely is cheap relative to regenerating them
