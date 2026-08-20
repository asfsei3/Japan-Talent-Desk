# JFI Provider and Cost Register

Last updated: 2026-08-20
Status: Current working source-of-truth. Living document — re-verify every `VERIFY` cell before
any provider is enabled, and re-check all pricing quarterly.

Blueprint §27 requires this register. It replaces the `docs/strategy/api-costs.md` path named
there; see `90-decision-log.md`.

**Hard ceiling: ¥10,000/month for everything on this page** (`01-strategy-v1.md` §13), rising to
¥30,000 then ¥50,000 as users or revenue appear. At an assumed ¥150/USD that is **$66.70/month**.
Every row is measured against that number, not against whether it is individually cheap. FX is an
assumption — the LLM bill is USD-denominated, so a weak yen shrinks the budget without anything
changing on this page.

v1.0 §13 also asks for a status classification per service. Added as a column below.

## Rules for this file

1. **Anthropic pricing is confirmed** against the Claude API reference (checked 2026-08-20).
   Model IDs are exact strings and carry no date suffix.
2. **Every non-Anthropic price is `VERIFY`** unless stated otherwise. Vendor pricing pages change
   and a wrong number here becomes a wrong number in a budget. Each `VERIFY` names the check.
3. **Commercial-use restriction is the gating question, not price.** A free tier that forbids
   commercial use is unusable for a B2B product regardless of cost.
4. Costs are USD/month at the 1,000-articles/day tier from `50-cost-model.md` unless noted.

## Register

| Provider | Purpose | Pricing | Free tier | Commercial-use restrictions | Request limits | Expected usage | Expected $/mo | Alternative | Exit strategy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Anthropic — Claude Haiku 4.5** (`claude-haiku-4-5`) | Triage: does this article contain an event | $1.00 in / $5.00 out per MTok. 200K context | none | none | org rate limits by tier | ~69 calls/day | **$3.50** | Sonnet 5 at 3× cost; or rules-only triage | `config.llm.models.triage` — one string |
| **Anthropic — Claude Sonnet 5** (`claude-sonnet-5`) | Fact extraction into `events.payload` | $3.00 in / $15.00 out per MTok. Intro $2.00/$10.00 through 2026-08-31. 1M context | none | none | org rate limits | ~33 calls/day | **$12.40** | Haiku 4.5 for simple extraction; Batch API at 50% | `config.llm.models.extract` |
| **Anthropic — Claude Opus 5** (`claude-opus-5`) | Escalation: contradictions, importance ≥ 4, weekly newsletter | $5.00 in / $25.00 out per MTok. 1M context | none | none | org rate limits. Not on Priority Tier | ~2 calls/day + 1/week | **$3.10** | Sonnet 5 | `config.llm.models.escalate`; or disable escalation entirely |
| **RSS / self-hosted collection** | Primary collection. `sources.provider = 'rss'` | free | n/a | per-source; tracked in `sources.commercial_use` | self-imposed: 1200ms/host, 400 articles/run | 8 fetches/day × N sources | **$0** | none needed | n/a — this is the fallback everything else exits to |
| **News API** — GNews / NewsAPI.org / Bing News (undecided) | Recall on outlets without feeds; backfill | `VERIFY` | `VERIFY` | `VERIFY` — **the deciding factor** | `VERIFY` | Phase 2+ | `VERIFY` | more RSS; more club feeds | `sources.provider` per row — revert rows to `rss` |
| **Football data API** — football-data.org / API-Football / Sportmonks (undecided) | Appearances, minutes, goals for the performance signal | `VERIFY` | `VERIFY` | `VERIFY` | `VERIFY` | Phase 3 | `VERIFY` | manual `metrics` entry; club feeds | `getFootballDataProvider` adapter; `metrics` rows keep `provider` |
| **Social metrics** — X API / Instagram Graph / third-party (undecided) | `japanSocialAudience` (26 wt), `socialGrowth30d` (14 wt) | `VERIFY` | `VERIFY` | `VERIFY` | `VERIFY` | Phase 3 | `VERIFY` — assume this is the largest non-LLM line | manual monthly snapshot into `metrics` | Score publishes provisional; coverage drops 0.40 |
| **Search trends** — no official Google Trends API | `japanSearchInterest` (16 wt) | `VERIFY` | `VERIFY` | `VERIFY` | `VERIFY` | Phase 3 | `VERIFY` | manual weekly snapshot into `metrics` | coverage drops 0.16; score stays provisional |
| **Brevo** | Japan Market Weekly delivery, existing JTD list | `VERIFY` | `VERIFY` | none known | `VERIFY` | 1 campaign/week | `VERIFY` — likely $0 at current list size | Mailchimp, Resend, Postmark | `getEmailProvider()` adapter; export contacts first |
| **Railway** | Hosting: one Node service + one volume | `VERIFY` | `VERIFY` | none | n/a | 1 service, 1 vol, ~1 GB yr 1 | `VERIFY` — assume $5–20 | Fly.io, Render, a $6 VPS | `npm start` + a volume. Portable to anything running Node ≥ 22.5 |
| **Error monitoring** | Job failures, unhandled rejections, source errors | see below | — | — | — | — | **$0** | Sentry free tier | — |
| **Domain / DNS** | `scout.ai-orchestra.work` | `VERIFY` | — | — | — | existing | `VERIFY` | — | — |

**Phase 1 committed total: LLM ~$19/mo + Railway `VERIFY` + Brevo `VERIFY`.** Every other row is
Phase 2 or later and unbudgeted. Nothing in the paid columns is required for the MVP to work.
Against the ¥10,000 ceiling that is roughly ¥2,900 for LLM at 1,000 articles/day, leaving ~¥7,100
for hosting and everything else. Detail in `50-cost-model.md`.

## Service status classification

`01-strategy-v1.md` §13 asks for each service to be classed. The classes matter because two of
them are disqualifying in phase one.

| Class | Services | Note |
| --- | --- | --- |
| Free | RSS collection, error monitoring via `job_runs` | The MVP runs entirely on these plus LLM. |
| Free tier | Brevo (`VERIFY` the cap) | Verify the cap covers the projected list. |
| Paid | Railway | Fixed, small, unavoidable. |
| Usage based | Anthropic | The only line that scales with product volume. Bounded by `config.llm.dailyCostBudgetUsd`. |
| Requires partnership | social metrics; some news APIs; most affiliate networks | **v1.0 §6 constraint 5 and §18 both say the business must not depend on these in phase one.** Adopt only opportunistically, once traffic exists. |
| Manual | `metrics` entry for social, search interest, market values | The honest phase-one answer for every input we cannot buy cleanly. |

## Monetisation-side providers

v1.0 §6 adds advertising and affiliate revenue to the free layer. These are providers too, and
they carry obligations rather than costs.

| Provider | Purpose | Cost | Status | Restrictions | Exit |
| --- | --- | --- | --- | --- | --- |
| Ad network (undecided) | Display slots below the fold | revenue, not cost | `VERIFY` | Must not sit between a claim and its sources (v1.0 §6.2). Nothing above the fold (§6.4). | config-driven empty slots; removing an ad network is a config change |
| Affiliate — shirts / goods / boots | Player-page contextual placements | revenue | Requires approval → `VERIFY` self-signup availability | Every block labelled 広告 / PR | as above |
| Affiliate — streaming (Japan market) | Fixture-context placements | revenue | Requires approval → `VERIFY` | as above | as above |

Three rules that are not negotiable and belong here rather than only in a design doc:

1. **Build the slots as empty, config-driven placeholders now; fill them later.** v1.0 §4. This
   keeps the layout honest and avoids a retrofit.
2. **Every monetised block carries a visible 広告 / PR label.** Japan's stealth-marketing rules
   under 景品表示法 treat unlabelled advertising as a misleading representation, and this product
   is aimed squarely at a Japanese consumer audience. Confirm the exact labelling requirement with
   Japanese counsel before the first paid placement — see `85-risks.md`.
3. **The core product must be viable at zero affiliate revenue.** v1.0 §18. If a page only makes
   sense with the affiliate block in it, the page is wrong.

## Per-provider notes

### Anthropic

Confirmed 2026-08-20:

| Model | ID | Context | Input $/MTok | Output $/MTok |
| --- | --- | --- | --- | --- |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 1.00 | 5.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 3.00 (2.00 intro to 2026-08-31) | 15.00 (10.00 intro) |
| Claude Opus 5 | `claude-opus-5` | 1M | 5.00 | 25.00 |

**Two defects in `src/config/index.js` to fix (owned by the config agent, not this document):**

1. `JFI_MODEL_TRIAGE` defaults to `"claude-haiku-4-5-20251001"`. The correct ID is
   `claude-haiku-4-5` with **no date suffix**. Date-suffixed IDs are not the current addressing
   scheme. `config.llm.pricing` is keyed by the same wrong string, so the ledger happens to
   resolve — but a corrected model ID would silently price at $0. Fix both keys together.
2. `config.llm.pricing` has no cache-read or cache-write rates. Prompt-cache reads bill at roughly
   0.1× input and cache writes at roughly 1.25×. With caching enabled, `cost_ledger` will
   **overstate** spend. Overstating is the safe direction, so this is not urgent — but the ledger
   is the input to blueprint §30's cost-per-1,000-articles reporting, and an overstated unit cost
   drives the wrong optimisation. Add `cacheRead` / `cacheWrite` multipliers.

Also note: Sonnet 5 intro pricing runs to 2026-08-31, eleven days from this document's date.
`50-cost-model.md` models **standard** rates. Do not build a budget on the intro rate.

Cost controls already in config, and what they bind at:

| Control | Value | Binds at |
| --- | --- | --- |
| `prefilter.minRelevanceScore` | 40 | the main lever — rejects ~88% of articles before any call |
| `llm.dailyCallBudget` | 600 | ~8,300 articles/day |
| `llm.dailyCostBudgetUsd` | 5 | ~11,700 articles/day |
| `llm.cacheTtlDays` | 45 | — |
| `llm.maxOutputTokens` | 1600 | caps the expensive half of every call |

The two budgets are not close to binding at any modelled tier. That is correct for a guardrail:
they exist to catch a runaway loop, not to shape normal spend. See `50-cost-model.md`.

### News API

`VERIFY` before any commitment. Checks to run, in order:

1. **Commercial use on the free/entry tier.** Some developer tiers are non-commercial and
   localhost-only. If the entry tier forbids commercial use, the free tier does not exist for us.
2. **Article-content rights.** We store headline, URL and a short summary. Confirm the terms allow
   storing derived summaries and republishing headline + link.
3. **Japanese-language coverage.** A news API with thin Japanese-outlet coverage adds European
   duplication we already have. This is the whole reason to buy it or not.
4. Price at ~1,000 requests/day, and the overage rate.

Do not add a news API before backlog item 3 in `30-source-strategy.md`. Breadth without
independence increases cost and duplicate rate without increasing confidence.

### Football data API

`VERIFY`. Checks: free-tier league coverage (many free tiers exclude the exact second-tier and
smaller leagues where the tracked roster actually plays), commercial-use terms, per-minute rate
limit, and whether appearance/minutes data is in the free tier or only fixtures and results.

Until then, `performance` events come from articles and `metrics` rows are entered manually. The
performance signal is the weakest component and this is why.

### Social metrics

Expect this to be the largest non-LLM line and the hardest terms. Checks: current API tier pricing,
whether follower-count-by-country is available at all (it usually is not — `japanSocialAudience`
may be unmeasurable directly and need a proxy), commercial-use and data-retention terms, and
whether storing follower counts over time is permitted.

If per-country audience is unavailable, the honest response is to redefine the component around
what *is* measurable (Japanese-language engagement, Japanese media mentions) and reduce its
weight, not to estimate it. `config.japanMarketScore` weights are a config change.

### Search trends

There is no official Google Trends API. Unofficial scraping libraries breach ToS and are excluded
by blueprint §32. `VERIFY` the alternatives: Google Ads Keyword Planner API (requires an active,
spending ads account), or a paid SEO data vendor. If none clears on price or terms, drop the
component and accept coverage of 0.84 — still above `minCoverage` of 0.6.

### Brevo

Already integrated in `server.js` for list signup and retained by
`docs/newsletter/operations.md`. `VERIFY` the current free-tier daily send cap and whether the
weekly campaign fits under it at the projected list size. Exit is straightforward — the
`getEmailProvider()` adapter is one file — but **export the contact list before any migration**;
the list is the distribution asset, not the tool.

### Railway

`VERIFY`: the current plan price, the per-GB volume rate, and egress charges. Confirm the volume
attaches to the web service (`10-architecture.md` depends on this) and note again that a
scheduled-job service cannot share it.

### Error monitoring

Recommended for Phase 1–2: **no vendor.** The schema already carries the data.

- `job_runs.status = 'error'` with `job_runs.error` — every failure, already recorded.
- `sources.consecutive_errors` — per-source health.
- A daily digest email through the existing Brevo integration when any of the alert conditions in
  `60-automation-plan.md` fire.

This costs $0, adds no dependency, and produces exactly the signal a single operator can act on.
Add Sentry (or equivalent) only when there is a second operator or a user-facing error worth a
stack trace. `VERIFY` its free-tier event cap at that point.

## Review cadence

- **Quarterly:** re-check every price in this table. Anthropic model pricing and available models
  both change; re-read the Claude API reference rather than trusting this file.
- **Before enabling any provider:** clear its `VERIFY` cells and its `commercial_use` flag.
- **Monthly:** compare `cost_ledger` actuals against `50-cost-model.md`. A tier-level divergence
  means the funnel assumptions are wrong, not that the model is wrong — go fix the assumptions.
