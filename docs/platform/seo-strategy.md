# SEO Strategy

Status: Planning. No programmatic pages exist yet for any vertical.

## Principle

Programmatic SEO (spec §9, §19) is only worth building where each generated
page carries real, current, differentiated data — not where it's a template
wrapped around the same three sentences with a different noun swapped in.
Search engines increasingly penalize thin programmatic content, and even
where they don't, a thin page converts nobody. The test for every page
template below: **would this page still be useful if the user found it with
no AI summary at all, just the structured data?** If not, it's not ready to
publish at scale.

## Investment Intelligence

Candidate URL structure:

```
/stocks/{ticker}                 — overview: price, fundamentals, "what changed"
/stocks/{ticker}/news             — chronological, sourced news list
/stocks/{ticker}/earnings         — earnings history + estimates vs. actuals
/stocks/{ticker}/valuation        — P/E, margins, growth trend over time
```

What makes each page non-thin:
- Real, refreshed `Metric` history (architecture.md §2) — a valuation page
  with 8 quarters of actual margin trend is genuinely useful; one with a
  single static number scraped once is not.
- The AI_INFERENCE sections (Bull/Bear/Risks) must cite specific FACT rows,
  not generic boilerplate — a template that produces the same "strong
  fundamentals, competitive market" text for every ticker is exactly the
  thin-content failure mode to avoid.
- Launch order: start with a few hundred large-cap, high-search-volume
  tickers (the coverage set costed in `api-costs.md`) rather than
  attempting exhaustive market coverage on day one — a smaller set of
  genuinely deep pages outranks a large set of shallow ones.

## Shopping Intelligence

Candidate URL structure:

```
/products/{slug}                        — product detail: price across retailers, history
/best/{category}-under-{price}          — curated comparison, e.g. "running-shoes-under-20000"
/comparison/{product-a}-vs-{product-b}  — head-to-head
```

Guardrails specific to this vertical (spec §19 explicitly warns against
AI-only thin pages here):
- `/best/...` pages must be generated from an actual ranking computed over
  real price/review/spec data (`architecture.md`'s `Metric`/`Review`
  entities), not an AI prompt asked to "list good running shoes under
  ¥20,000" with no grounding — that produces content indistinguishable from
  every other AI-written buying guide already saturating this category.
- Only generate a `/best/...` page for a category once there are enough
  tracked products in it to make a real comparison (a defensible minimum —
  e.g. 10+) — don't create the URL just because the template supports it.
- `/comparison/...` pages should be generated from real, current data for
  both products (price, specs, ratings) — stale comparison pages (one
  product discontinued, price wildly out of date) actively damage trust
  and should be automatically flagged for refresh or unpublished, not left
  live indefinitely.

## JTD / Football Intelligence

JTD's public site today is a single landing page, not indexed content
depth — this is the vertical furthest from programmatic SEO readiness. If
JTD migrates onto the shared architecture (`architecture.md` §5), the
natural SEO surface is public player-profile pages:

```
/players/{slug}   — a structured profile: club, position, recent match
                     data, "profiles to monitor" framing per positioning.md
```

This must stay consistent with `docs/strategy/positioning.md`'s wording
rules (e.g. "profile to monitor," never "hidden gem" or "final
recommendation") — SEO copy is still outward JTD messaging and subject to
the same positioning discipline as everything else. Given the currently
manual, relationship-driven nature of JTD's actual research (see
`business-strategy.md`), player pages should launch only for players
already covered in existing JTD research output, not be auto-generated
from raw stats feeds with no human research behind them — an auto-generated
stats page with no Japan-side context is exactly the "generic scouting
database" positioning JTD is explicitly trying not to be.

## Cross-vertical SEO infrastructure

Shared, regardless of vertical:
- Server-rendered (not client-only-rendered) pages so content is crawlable
  without JS execution
- Structured data markup (schema.org `Product`, `Organization`, or
  `FinancialProduct` types as applicable) so search engines can parse
  price/rating/fact data directly
- A sitemap generation job that adds new Entity pages as they're created
  and removes/redirects pages for delisted/discontinued entities, so the
  sitemap doesn't accumulate dead links over time
- Canonical URLs and pagination handled correctly for comparison/listing
  pages to avoid duplicate-content penalties

## What not to do

Do not generate pages for the full theoretical universe of tickers/products
before there's real underlying data for each — that inflates page count
without inflating quality, which is precisely the trap spec §9 and §19 warn
against. Grow page count in lockstep with genuine data coverage
(`api-costs.md`'s "coverage breadth" framing), not ahead of it.
