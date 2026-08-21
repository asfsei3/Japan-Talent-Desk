# JFI Product Ideas — Parked

Last updated: 2026-08-20
Status: Explicitly out of scope for Phase 1. Nothing here has a table, a seeded source, or a
route. This document exists so a future session sees the idea was considered and boundaried on
purpose, rather than rediscovering it and folding it into JFI's schema by accident.

## Ideas that extend JFI itself

### Source reliability ledger

Promote reporting track record from an implicit property of `sources.tier` to an explicit,
per-outlet-and-author ledger: hit rate on `interest → completed` chains, average lead time before
a completed transfer, rate of superseded/contradicted calls. `articles.author` is already stored
but not resolved to a first-class entity (`20-data-model.md` "Deliberate omissions" — no
`journalists` table). Needs one before this is buildable. Not Phase 1: there is not yet enough
`event_sources` history to make a ledger meaningful, and `signals.js`'s source-tier weighting is a
reasonable proxy until there is.

### Rumour lifecycle as a training set

The `interest → talks → bid → agreement → completed` supersede chain (`20-data-model.md`) is,
over time, a labelled dataset: every promoted event is a case where the earlier signal turned out
correct, every event that goes stale without promotion is a case where it did not. This is the
natural way to calibrate `computeTransferSignal()`'s weights empirically instead of by
assumption. Needs months of accumulated chains before it is statistically meaningful — this is a
Phase 3+ idea, not a Phase 1 gap.

### Historical Japan Market Database

Blueprint §18: track a player's Japan-side metrics before and after a club signing, to eventually
ground `commercial_estimates` in observed comparator ranges rather than a cold-start guess.
`market_impact_studies` already exists in the schema as the landing table for this
(`20-data-model.md`); it is empty by design until enough signings have enough before/after
`metrics` history to populate it. This is the long-term moat blueprint §39 describes — it is real,
and it is also strictly a function of time and consistent data collection, not of more engineering
now.

### Data licensing

Once a source's `commercial_use` flag is genuinely cleared (not just `unknown`, the safe default —
see `85-risks.md`), the accumulated structured event data itself becomes a licensable product
distinct from the free site or the JTD subscription: a feed of confidence-scored, provenance-
tracked Japanese-football events. `30-source-strategy.md`'s source hygiene rule that every source
needs `commercial_use` set before `enabled = 1` is what makes this legally possible later — it is
not itself the licensing product.

### Asia / Global expansion

`20-data-model.md`'s "market-agnostic model" decision (`90-decision-log.md` D1) means this is
data-loading, not re-architecture: seed a second country's `countries` / `leagues` / `clubs` /
`players` / `player_aliases` rows, raise its `market_priority`, and the same pipeline runs against
it. The actual work is source discovery and alias curation per new market (`30-source-strategy.md`'s
"Deliberately absent... scraping anything that does not publish a feed" rule applies identically),
which is why this waits for Japan product-market fit rather than being parallelised now.

## Sibling products proposed, not adopted into JFI

The founder's later brainstorming raised several products that could share JFI's collection →
structuring → intelligence → decision-support engine against a different subject:

- **Global Career Intelligence** — the same pipeline shape (source → entity → event → change)
  applied to job postings and company hiring signals instead of football, aimed at Japan-based
  people evaluating global-company roles.
- **AI Company Intelligence** — funding, hiring, product-launch, and Japan-presence tracking for
  AI/tech companies, on the same engine.
- **Japan Market Intelligence** — B2B lead generation: monitoring foreign companies' Japan-market
  activity (hiring, localisation, partnerships) as a signal feed for companies selling into Japan.
- **Global News Intelligence Japan** — cross-source event clustering and a "Japan blindspot"
  score (high global coverage, low Japanese coverage) for general news rather than football.

None of these get a table, a route, or a seeded source in this repository. They are recorded here,
not designed here, specifically so JFI's schema stays market-agnostic-for-football rather than
becoming accidentally football-and-jobs-and-AI-companies-agnostic — a distinction that matters
because a schema built to anticipate all four at once would be worse at each than four schemas
built one at a time, each after the previous one has real usage data. See `90-decision-log.md` D8.
