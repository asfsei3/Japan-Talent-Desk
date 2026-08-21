# API Cost Management

Status: Planning / cost modeling. No paid data or AI API is wired into this
repo yet — the only live external call is the Brevo newsletter signup in
`server.js`. Everything below models costs for the *target* architecture in
`architecture.md`, so decisions can be made before the bill exists, per
spec §4.

## Currently live in this repo

| Provider | API | Free tier | Paid tier | Pricing model | Current usage | Est. monthly cost |
|---|---|---|---|---|---|---|
| Brevo | Contacts API (`POST /v3/contacts`) | Up to 300 emails/day on the free plan (typical historical Brevo free tier) | Contact-count and email-volume tiered plans | Per-plan, not per-request | One write per newsletter signup | 要確認 — likely $0 (free tier) at current signup volume, but confirm current plan/limits directly at Brevo's pricing page before assuming this stays free as the list grows |

## The key cost-control principle for this architecture

**AI and data-API cost should scale with the number of distinct Entities the
platform covers, not with the number of users.** If every user's page view
triggers a fresh API/AI call, cost is unbounded and directly proportional to
growth — the failure mode spec §4 warns about. If instead:

- Market data / fundamentals / news are fetched and cached **per Entity**,
  refreshed on a schedule (e.g. quotes every 15 min, fundamentals daily,
  news on ingestion) — not per page view
- AI synthesis ("What Changed", Bull/Bear) is generated **once per Entity
  per day** and stored in `AIAnalysis`, then served to every user watching
  that Entity from the cache

...then cost is bounded by *coverage breadth* (how many companies/products
are tracked) and is nearly flat as user count grows from 1,000 to 1,000,000.
The only cost line that scales with users directly is hosting/bandwidth for
serving cached pages, which is orders of magnitude cheaper than repeated
AI/API calls. All projections below assume this caching model is actually
implemented — if it isn't, multiply the AI/data-API rows by roughly the
ratio of daily active users to Entities covered.

## Investment Intelligence — modeled costs

Assumption for modeling: 500 actively-covered companies (a reasonable MVP
coverage set), refreshed daily for AI synthesis, quotes cached 15 minutes
during market hours (~26 refreshes/day/entity).

| Provider | API | Free tier | Paid tier | Pricing model | Rate limit | Expected monthly requests (platform-side, not per-user) | Est. monthly cost |
|---|---|---|---|---|---|---|---|
| Finnhub | Quotes + basic fundamentals | 60 calls/min, no card | $11.99–$99.99/mo Premium | Flat monthly | 60/min free | ~500 entities × 26 refreshes/day × 30 = ~390,000/mo | $0 if free-tier rate limit (60/min ≈ 86,400/day) covers it — it does at this coverage size; upgrade only if coverage or refresh frequency grows |
| SEC EDGAR | XBRL company facts, full-text search | Free, unlimited within rate limit | n/a (no paid tier — it's a public API) | Free | 10 req/sec | ~500 entities × 1 refresh/day × 30 = 15,000/mo (fundamentals change infrequently) | $0 |
| Alpha Vantage | Backup/secondary quote source | 25 req/day free | $49.99–$249.99/mo | Flat monthly, RPM-tiered | 25/day free / up to 1,200/min paid | Fallback only, low volume if Finnhub is primary | $0–$49.99 if kept as a paid fallback for redundancy |
| NewsAPI.org | Business plan (if used instead of RSS) | Not usable commercially at $0 | $449/mo (250K req/mo) or $358.80/mo billed annually | Flat + overage $0.0018/req | n/a | Only if RSS/EDGAR full-text coverage proves insufficient | $0 (deferred per `data-sources.md`) → $449/mo if adopted |
| Claude API (Sonnet 5) | AI synthesis — "What Changed", Bull/Bear, fact extraction | n/a | Usage-based | $3.00/1M input, $15.00/1M output tokens (standard; a lower intro rate applies through 2026-08-31 — do not plan around a temporary rate) | Org-level rate limits, not per-request cost-relevant here | ~500 entities × 1 synthesis/day × 30 = 15,000 calls/mo, ~5K input + ~1K output tokens/call | 15,000 × (5,000×$3/1M + 1,000×$15/1M) = 15,000 × ($0.015+$0.015) = **~$450/mo** |

**Investment vertical total (500-company coverage, any user count from 1k
to 1M given the caching model above): roughly $450–$900/mo** (Claude
synthesis + Finnhub, before any paid news API). This is deliberately
presented as independent of user count — see the cost-control principle
above — with the caveat that it holds only if per-view calls are actually
avoided.

### If the caching model is *not* yet built (per-user-session calls)

For contrast — this is the failure mode to avoid, not a recommendation:

| Users | Assumed sessions/mo × API+AI calls/session | Rough monthly cost (uncached) |
|---|---|---|
| 1,000 | ~10,000 sessions × 3 calls | Still small in absolute terms, but now scales linearly |
| 10,000 | ~100,000 sessions × 3 calls | ~10x the cached-model cost |
| 100,000 | ~1,000,000 sessions × 3 calls | ~100x — this is where an uncached design becomes financially dangerous |
| 1,000,000 | ~10,000,000 sessions × 3 calls | Unsustainable without caching; this scenario is exactly why spec §4 mandates caching/batching before scale |

## Shopping Intelligence — modeled costs

Assumption: Rakuten + Yahoo! Shopping APIs (both free, no stated per-request
cost found — see `data-sources.md`), refreshed per-product on a schedule
rather than per page view.

| Provider | API | Cost | Notes |
|---|---|---|---|
| Rakuten Web Service | Ichiba Item Search | Free | Confirm current rate limit directly — not found in this pass (see `data-sources.md`) |
| Yahoo! Shopping | Product search | Free | Same caveat |
| Amazon | PA-API / Creators API | Free but access-gated by sales threshold | $0 API cost once eligible; the real cost is the chicken-and-egg delay before eligibility (see `data-sources.md`) |
| Claude API | Product comparison summaries ("Best for X" classification) | Usage-based | Modeled the same way as Investment: once per product per catalog refresh, not per user view. At a 5,000-product catalog refreshed weekly with ~2K input/500 output tokens: 5,000 × (2,000×$3/1M + 500×$15/1M) = 5,000 × $0.0135 ≈ **$68/refresh, ~$270/mo at weekly refresh** |

**Shopping vertical total: near-$0 data API cost (Rakuten/Yahoo are free)
+ roughly $270/mo AI cost at a 5,000-product catalog** — again largely
independent of user count if caching holds.

## User-tier cost projection summary

| Users | Investment AI+data (cached model) | Shopping AI+data (cached model) | Hosting/bandwidth (rough, both verticals) | Notes |
|---|---|---|---|---|
| 1,000 | ~$450–900/mo | ~$0–270/mo | 要確認 — depends on hosting provider; static+cached pages keep this low | Coverage-bound cost dominates at this scale |
| 10,000 | ~$450–900/mo | ~$0–270/mo | Modestly higher (CDN egress) | Same coverage, same AI cost — this is the point of caching |
| 100,000 | ~$450–900/mo, unless coverage breadth grows (more companies tracked) | ~$0–270/mo, unless catalog grows | Meaningful hosting line item now | Growth should be funded by expanding *coverage*, which is a deliberate, budgeted decision — not an automatic cost explosion |
| 1,000,000 | Same logic — cost driven by coverage breadth choice, not user count | Same | Real infra engineering required (DB read replicas, CDN) | If costs are scaling with users at this point, the caching assumption has broken somewhere and needs an audit |

## What to do if costs threaten to scale with users

Per spec §4, in priority order:
1. **Caching** — verify every data/AI call is keyed by Entity+day, not by
   user session, before anything else
2. **Batching** — batch AI synthesis calls across entities using the Claude
   Batches API (50% lower cost, non-latency-sensitive since synthesis runs
   on a schedule, not on-demand)
3. **Incremental update** — only re-run AI synthesis for entities with new
   Events since the last run, not the full covered universe every cycle
4. **Scheduled update** — confirm ingestion frequency matches actual data
   volatility (quotes need 15-min refresh; fundamentals don't need daily)
5. **Fallback provider** — keep a second quote/news provider configured so
   a primary vendor's price increase or outage doesn't force an emergency
   architecture change
