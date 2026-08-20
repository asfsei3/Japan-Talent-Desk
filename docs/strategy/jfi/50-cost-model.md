# JFI Cost Model

Last updated: 2026-08-20
Status: Modelled, not measured. Living document — replace each assumption with a measured rate as
soon as the pipeline has run for two weeks.

Model IDs and prices are the confirmed values in `40-api-costs.md`. Sonnet 5 is modelled at its
**standard** $3.00/$15.00 rate, not the intro rate that ends 2026-08-31.

Budget context: `01-strategy-v1.md` §13 caps **all** external spend at ¥10,000/month. See the
ceiling section at the end — it is the section that changes decisions.

Japanese output is priced in, not bolted on. `articles.title_ja`, `events.headline_ja` /
`summary_ja` and `changes.headline_ja` / `detail_ja` are requested **in the same structured
response** as the English extraction, which costs roughly 250 extra output tokens per extraction
(~$0.004) rather than a second call (~$0.012). The output-token counts below already include them.

## The funnel

Cost is a function of how many articles reach an LLM, not how many are collected. Four gates
stand between a feed and a paid call, and each one is a lever.

```
  articles collected
        │
        │  ×  dedupeSurvival      url_hash · content_hash · simhash ≤ 3
        ▼
  distinct articles
        │
        │  ×  prefilterPass       scoreArticle() ≥ config.prefilter.minRelevanceScore (40)
        ▼
  candidate articles ──────────────────────────────────────► TRIAGE   claude-haiku-4-5
        │                          × (1 − triageCacheHit)
        │  ×  triageToExtract
        ▼
  event-bearing articles ────────────────────────────────► EXTRACT  claude-sonnet-5
        │                          × (1 − extractCacheHit)
        │  ×  extractToEscalate
        ▼
  contested / high-impact ───────────────────────────────► ESCALATE claude-opus-5
```

Plus a fixed load that does not scale with articles: one daily brief call, a handful of social
drafts, one weekly newsletter draft.

## Assumed rates

Every one of these is an assumption. The "validate by" column is how it becomes a measurement.

| Rate | 100/d | 500/d | 1,000/d | 5,000/d | Reasoning | Validate by |
| --- | --- | --- | --- | --- | --- | --- |
| `dedupeSurvival` | 0.88 | 0.80 | 0.74 | 0.62 | Falls with volume: more feeds means more copies of the same wire story. | `articles` where `status='duplicate'` ÷ total, per day |
| `prefilterPass` | 0.14 | 0.12 | 0.11 | 0.09 | An article passes mainly by matching a tracked entity (55 pts). Most football news mentions none of 31 players. Falls with volume because added sources are broader. | `prefilterPending()` returns `{scored, passed, filteredOut}` |
| `triageCacheHit` | 0.15 | 0.15 | 0.15 | 0.15 | Re-syndication that simhash misses but the content hash of title+excerpt catches. | `llm_cache.hits`; `classifyPending()` returns `cacheHits` |
| `triageToExtract` | 0.45 | 0.45 | 0.45 | 0.45 | Slightly under half of entity-matching articles carry an extractable event. The rest are match reports and comment. | ratio of extract calls to triage calls in `cost_ledger` |
| `extractCacheHit` | 0.10 | 0.10 | 0.10 | 0.10 | Lower than triage: extraction keys on more of the article. | `cost_ledger` vs `llm_cache` |
| `extractToEscalate` | 0.06 | 0.06 | 0.06 | 0.06 | Gate is contradiction or `importance ≥ 4`. Deliberately rare. | count of `escalate` rows in `cost_ledger` |
| events per extraction | 0.6 | 0.6 | 0.6 | 0.6 | Many extractions merge into an existing `dedupe_key` rather than creating a row. | `classifyPending()` returns `eventsCreated`/`eventsUpdated` |

`prefilterPass` is the assumption with the widest error bar and the largest effect. If it is
really 0.25 rather than 0.11, every figure below roughly doubles. Measure it in week 2.

## Assumed token counts per call

Prompt caching is assumed on. A cached prefix must exceed ~1,024 tokens to cache at all, so each
system prompt is sized above that threshold deliberately; a 700-token system prompt would cache
nothing and cost full rate. Cache reads bill at ~0.1× input.

| Call | Model | Input (cacheable + volatile) | Output | Effective input | Cost/call |
| --- | --- | --- | --- | --- | --- |
| Triage | `claude-haiku-4-5` | 1,100 + 300 = 1,400 | 250 | 110 + 300 = 410 | **$0.00166** |
| Extract | `claude-sonnet-5` | 1,300 + 500 = 1,800 | 700 | 130 + 500 = 630 | **$0.01239** |
| Escalate | `claude-opus-5` | 1,500 + 1,500 = 3,000 | 1,200 | 150 + 1,500 = 1,650 | **$0.03825** |

Working, triage: (410 × $1 + 250 × $5) ÷ 1,000,000 = $0.00041 + $0.00125 = $0.00166.
Extract: (630 × $3 + 700 × $15) ÷ 1e6 = $0.00189 + $0.01050 = $0.01239.
Escalate: (1,650 × $5 + 1,200 × $25) ÷ 1e6 = $0.00825 + $0.03000 = $0.03825.

Without caching the same calls cost $0.00265, $0.01590 and $0.05250 — caching is worth 37% on
triage, 22% on extract, 27% on escalate. **Verify it is actually working**: if
`usage.cache_read_input_tokens` is zero across runs, something volatile (a timestamp, a run id) is
in the prefix and the savings are imaginary.

Fixed jobs, per tier:

| Job | Model | 100/d | 500/d | 1,000/d | 5,000/d |
| --- | --- | --- | --- | --- | --- |
| Daily brief (1 call/day) | `claude-sonnet-5` | 6k/1.5k → $0.04050 | 9k/1.8k → $0.05400 | 11k/2k → $0.06300 | 18k/2.6k → $0.09300 |
| Social drafts | `claude-haiku-4-5` | 3 → $0.00750 | 4 → $0.01000 | 5 → $0.01250 | 8 → $0.02000 |
| Weekly newsletter (÷7) | `claude-opus-5` | $0.01929 | $0.01929 | $0.01929 | $0.02679 |
| **Fixed subtotal/day** | | **$0.06729** | **$0.08329** | **$0.09479** | **$0.13979** |

## Modelled cost by tier

### 100 articles/day

```
100 collected × 0.88            =  88.0 distinct
 88.0        × 0.14             =  12.3 candidates
 12.3        × 0.85             =  10.5 triage calls    × $0.00166 = $0.01738
 12.3        × 0.45             =   5.5 extract cands
  5.5        × 0.90             =   5.0 extract calls   × $0.01239 = $0.06182
  5.5        × 0.06             =   0.3 escalate calls  × $0.03825 = $0.01273
                                       variable/day               = $0.09193
                                       fixed/day                  = $0.06729
                                       TOTAL/day                  = $0.15922
                                       TOTAL/month (×30.4)        =    $4.84
```

### 500 articles/day

```
500 × 0.80 = 400.0 → × 0.12 = 48.0 candidates
  triage    40.8 calls × $0.00166 = $0.06773
  extract   19.4 calls × $0.01239 = $0.24086
  escalate   1.3 calls × $0.03825 = $0.04958
  variable $0.35817 + fixed $0.08329 = $0.44146/day  →  $13.42/month
```

### 1,000 articles/day

```
1,000 × 0.74 = 740.0 → × 0.11 = 81.4 candidates
  triage    69.2 calls × $0.00166 = $0.11485
  extract   33.0 calls × $0.01239 = $0.40850
  escalate   2.2 calls × $0.03825 = $0.08407
  variable $0.60742 + fixed $0.09479 = $0.70221/day  →  $21.35/month
```

### 5,000 articles/day

```
5,000 × 0.62 = 3,100.0 → × 0.09 = 279.0 candidates
  triage   237.2 calls × $0.00166 = $0.39367
  extract  113.0 calls × $0.01239 = $1.40001
  escalate   7.5 calls × $0.03825 = $0.28814
  variable $2.08182 + fixed $0.13979 = $2.22161/day  →  $67.54/month
```

## Summary

| | 100/d | 500/d | 1,000/d | 5,000/d |
| --- | --- | --- | --- | --- |
| LLM calls/day | 20 | 67 | 111 | 367 |
| Variable $/day | $0.092 | $0.358 | $0.607 | $2.082 |
| Fixed $/day | $0.067 | $0.083 | $0.095 | $0.140 |
| **Total $/month** | **$4.84** | **$13.42** | **$21.35** | **$67.54** |
| Events created/day | ~3 | ~12 | ~20 | ~68 |
| $/event | $0.053 | $0.038 | $0.036 | $0.033 |

### Cost per N articles collected

Marginal (variable only) — the number to quote when asked "what does another source cost?":

| | per 100 | per 1,000 | per 10,000 |
| --- | --- | --- | --- |
| at 100/d | $0.092 | $0.92 | $9.19 |
| at 500/d | $0.072 | $0.72 | $7.16 |
| at 1,000/d | $0.061 | $0.61 | $6.07 |
| at 5,000/d | $0.042 | $0.42 | $4.16 |

Fully loaded (variable + fixed, at each tier's own volume) — the number for blueprint §30's
internal dashboard:

| | per 100 | per 1,000 | per 10,000 |
| --- | --- | --- | --- |
| at 100/d | $0.159 | $1.59 | $15.92 |
| at 500/d | $0.088 | $0.88 | $8.83 |
| at 1,000/d | $0.070 | $0.70 | $7.02 |
| at 5,000/d | $0.044 | $0.44 | $4.44 |

Unit cost falls with volume, which is counter-intuitive until you see why: the dedupe and
prefilter gates reject a *higher share* as volume rises, and the fixed jobs amortise. Volume is
cheap. This is the correct shape for the business — adding sources is not the expensive decision.

## What breaks first

### At 100/day — the fixed jobs dominate

| Line | Share |
| --- | --- |
| Daily brief | 25.4% |
| Extraction | 38.8% |
| Weekly newsletter | 12.1% |
| Triage | 10.9% |
| Escalation | 8.0% |
| Social drafts | 4.7% |

**42% of spend is the three fixed jobs**, and the daily brief alone is a quarter of it. At MVP
volume the product is paying more to *write about* the events than to *find* them.

Lever: build the daily brief deterministically. `changes` rows already carry `headline`,
`before_value`, `after_value`, `importance` and `confidence` — the brief is a template over an
ordered query, not a generation task. Use the LLM only for a two-sentence editorial top-line, and
only when there are ≥ 5 changes. Effect: daily brief drops from $0.0405 to ~$0.006, total tier-A
cost drops **21%**. Also faster, also deterministic, also removes an LLM from a published surface.

### At 500–5,000/day — extraction dominates

| Line | 500/d | 1,000/d | 5,000/d |
| --- | --- | --- | --- |
| Extraction (Sonnet 5) | 54.6% | 58.2% | **63.0%** |
| Triage (Haiku 4.5) | 15.3% | 16.4% | 17.7% |
| Escalation (Opus 5) | 11.2% | 12.0% | 13.0% |
| Fixed jobs | 18.9% | 13.5% | 6.3% |

Extraction is expensive per call and grows linearly. Every lever worth pulling above 500/day acts
on the number of extraction calls or their unit cost.

### What does *not* break

The configured guardrails are nowhere near binding:

- `llm.dailyCallBudget` = 600 → binds at **~8,180 articles/day**
- `llm.dailyCostBudgetUsd` = $5 → binds at **~11,700 articles/day**

That is correct for a guardrail. They exist to stop a runaway loop or a misconfigured feed, not to
shape normal operation. Leave them where they are.

### What actually breaks first — and it is not money

**Human review capacity.** At 5,000 articles/day the pipeline produces ~68 events/day. If the
review gate were `importance ≥ 4` **OR** `confidence ≤ reported`, most events would queue — 50+
items/day, over an hour of review, and `config.review.maxOpenItems` (250) hit within a week.

The gate must be **AND** for that pair — high-impact *and* weakly sourced — plus a short list of
unconditional triggers (new player entity, contradictory sources, ambiguous entity resolution).
Under that reading the queue takes ~7 items/day at 5,000 articles, which is ~9 minutes. See
`60-automation-plan.md`. This interpretation is a decision, recorded in `90-decision-log.md`,
because the alternative reading silently breaks the automation target.

Related: `review.maxOpenItems` is 250 and the seed already queued 31 player-verification items.
At 7 items/day with no resolution, the cap is reached in about a month. The cap is really an
instruction to clear the queue weekly.

**Second: SQLite writers.** Not row count — writer count. See `10-architecture.md`.

## Levers, ranked by saving per unit of damage

| # | Lever | Saving | What it costs you |
| --- | --- | --- | --- |
| 1 | **Batch API for extraction** — extraction is not latency-sensitive; the brief runs at 06:00 JST | ~50% of extraction = **31% of total** at 5,000/d | Results arrive within hours, not seconds. Nothing in the product needs sub-hour event latency. Verify Batch pricing and availability before relying on it. |
| 2 | **Deterministic daily brief** (above) | 21% at 100/d, 5% at 5,000/d | Loses editorial voice in the brief. Arguably an improvement. |
| 3 | **Tighten `triageToExtract`** — require triage to name both an event type and a resolved player before extracting | 0.45 → ~0.32 assumed = **17% of total** | Recall loss on events involving an unresolved player. Those should go to `review_queue` anyway. |
| 4 | **Raise `prefilter.minRelevanceScore` 40 → 50** | pass rate ~0.11 → ~0.07 assumed = **30% of variable** | Real recall loss: an article mentioning a player only in the excerpt with no Japan or event keyword now fails. Measure the false-negative rate on a hand-labelled sample of 200 articles before changing this. |
| 5 | **Escalate to Sonnet 5 instead of Opus 5** except on genuine multi-source contradiction | ~60% of escalation = 8% of total | Weaker reasoning on exactly the hardest cases. The escalation path exists because those cases are hard. Pull this last among the model levers. |
| 6 | **Verify prompt caching is live** | 22–37% per call — already assumed in every figure above | Nothing. If it is not working, these numbers are 25% too low. |
| 7 | **Shorten excerpts** | ~15% of extraction input | Directly trades accuracy for cost, on the one input that determines extraction quality. **Do not pull this.** Listed so nobody proposes it as if it were free. |

Levers 1, 2 and 6 have no quality cost and together are worth roughly 40% at high volume. Pull
those before touching 3, 4 or 5.

## Non-LLM costs

| Line | $/month | Source |
| --- | --- | --- |
| Railway hosting + volume | `VERIFY` | `40-api-costs.md` |
| Brevo | `VERIFY` (likely $0 at current list size) | `40-api-costs.md` |
| Error monitoring | $0 — `job_runs` plus a digest email | `40-api-costs.md` |
| News / football / social / search APIs | $0 in Phase 1–2 | not adopted |

## The ¥10,000/month ceiling

`01-strategy-v1.md` §13 sets a hard ceiling of **¥10,000/month for everything** — LLM, hosting,
email, every external service — rising to ¥30,000 then ¥50,000 only as revenue or users appear.
This supersedes the blueprint's implicit budget and changes the conclusions above.

At an assumed **¥150/USD** (assumption — `VERIFY` the rate you will actually be billed at, and
note the LLM bill is USD-denominated so a weak yen shrinks the budget):

```
¥10,000/month  =  $66.70/month  =  $2.19/day
   less hosting reserve (Railway, VERIFY — assume $20)   =  $46.70/month
   less Brevo (VERIFY — assume $0)                       =  $46.70/month
   LLM budget                                            =  $1.536/day
```

### What that buys

| | Articles/day sustainable | Modelled $/mo |
| --- | --- | --- |
| As modelled above | **~3,400** | $46.6 |
| With levers 1, 2 and 6 applied (no quality cost) | **~5,200** | $46.6 |
| Tier D as modelled (5,000/day, unoptimised) | — | **$67.5 — breaches the ceiling on LLM alone** |

Working, unoptimised: `($1.536 − $0.140 fixed) ÷ $0.000416 per article = 3,356/day`.
With the deterministic brief (fixed drops to ~$0.060) and Batch extraction (variable drops ~31.5%
to ~$0.000285): `($1.536 − $0.060) ÷ $0.000285 = 5,179/day`.

Three conclusions:

1. **The MVP source set is comfortably inside the ceiling.** `30-source-strategy.md` estimates
   120–250 articles/day from 8 enabled sources — around $5–13/month, roughly ¥750–2,000. There
   is a factor of 15 of headroom before the ceiling matters at all.
2. **The 5,000/day tier is not affordable unoptimised.** Do not scale source count past ~3,000
   articles/day until levers 1, 2 and 6 are in. They cost nothing in quality, so there is no
   reason to defer them past the point of need.
3. **`config.llm.dailyCostBudgetUsd` is set wrong for this ceiling.** It is $5/day, which is
   $152/month — **¥22,800, more than double the entire budget**. A runaway loop would consume two
   months of budget in one month and the guardrail would never fire. Recommend **$1.50/day**
   ($45.6/month), which leaves ~¥7,000 for LLM and ~¥3,000 for hosting. This is a config change
   owned by another agent; recorded here and in `90-decision-log.md`.

`config.llm.dailyCallBudget` (600/day) is fine — it binds at ~8,200 articles/day, well beyond the
volume the cost budget allows.

### Ceiling headroom by tier

| | $/mo | ¥/mo @¥150 | Share of ¥10,000 | Hosting headroom |
| --- | --- | --- | --- | --- |
| 100/d | $4.84 | ¥726 | 7% | ¥9,270 |
| 500/d | $13.42 | ¥2,013 | 20% | ¥7,990 |
| 1,000/d | $21.35 | ¥3,203 | 32% | ¥6,800 |
| 3,000/d | ~$46 | ¥6,900 | 69% | ¥3,100 |
| 5,000/d unoptimised | $67.54 | ¥10,131 | **101%** | none |

Revisit this table when the ceiling rises to ¥30,000, and again on any FX move beyond ±10%.

## The number that matters

At 1,000 articles/day the intelligence pipeline costs **$21/month — about ¥3,200, a third of the
budget** — and produces ~600 events/month at **$0.036 each**. That is a real constraint under
v1.0's ceiling, but not a tight one at MVP volume, and it is negligible against B2B pricing of
¥100K–300K/month (blueprint §21) or even against the ¥100,000/month target in v1.0 §17.

The binding constraints are source coverage, entity-resolution accuracy, and whether the founder
actually opens the product every morning (`01-strategy-v1.md` §3). Do not spend engineering time
optimising a ¥3,200 line while any of those is unsolved — but do keep the ceiling in view before
adding sources, because articles/day is the one number that converts directly into yen.
