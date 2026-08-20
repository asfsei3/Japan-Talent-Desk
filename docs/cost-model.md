# Travel Decision Engine — Infrastructure & API Cost Model

Audit date: 2026-08-20
Companion document: `docs/data-sources.md`
FX assumption: **USD 1 = JPY 150.** All ¥ figures are rounded and will move with the rate.

> Scope note: this document is about **what it costs to run the product**. The separate
> "True Trip Cost" model — what a user's *trip* costs — is engine logic, documented in
> `docs/travel/engine.md`.

---

## 1. Target

| Metric | Target |
| --- | --- |
| MVP infrastructure | **¥0 – ¥10,000 / month** |
| Actual MVP committed spend | **¥0 / month** |
| Actual MVP spend incl. hosting | **¥0 – ¥750 / month** |

The MVP meets the target with the entire budget unspent. That headroom is deliberate: it is
reserve for the first paid service that demonstrably improves recommendations, not a saving
to be proud of on its own.

---

## 2. Volume assumptions

Two scenarios, because unit costs only matter at scale:

| Scenario | Monthly trip queries | Notes |
| --- | --- | --- |
| **A — Launch** | 1,000 | Founder + early users + light SEO traffic |
| **B — Traction** | 10,000 | The point at which paid APIs start to hurt |

One "trip query" = one natural-language input scored across ~20 destinations.

---

## 3. Per-service cost table

### 3.1 Services actually used by the MVP

| Service | Purpose | Pricing | Requests/mo (A / B) | Cost/mo (A / B) | Free tier | Alternative | Required for MVP? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Seed dataset** (in-repo) | Destinations, fares, times, hotel bands | Free — it's a source file | n/a | **¥0 / ¥0** | n/a | Paid APIs | **Yes** |
| **Rule-based parser** (in-repo) | NL → structured request | Free — deterministic code | n/a | **¥0 / ¥0** | n/a | LLM parsing (§3.3) | **Yes** |
| **Template explanations** (in-repo) | "Why this destination" copy | Free — deterministic code | n/a | **¥0 / ¥0** | n/a | LLM explanations (§3.3) | **Yes** |
| **Railway hosting** | Static site + Node API | Hobby ≈ $5/mo; usage-based | n/a | **¥0 – ¥750** | Trial credit | Fly.io, Render, Cloudflare Pages | Yes (already in use) |
| **Domain** | — | ≈ ¥1,500/**year** | n/a | **≈ ¥125** | — | — | Yes |
| **Affiliate networks** | Monetisation | Free to join | n/a | **¥0** | n/a | — | Yes (revenue) |

**MVP total: ¥0 committed, ≈ ¥875/month including hosting and domain amortisation.**

The engine performs no third-party network calls on the user request path. This is not an
accident of scale — it is what makes the cost floor ¥0 regardless of traffic. Serving cost is
CPU only, and scoring 20 destinations is sub-millisecond work.

### 3.2 Free-tier services queued for Phase 1.5

| Service | Purpose | Pricing | Requests/mo (A / B) | Cost/mo | Free tier | Alternative | Required for MVP? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Rakuten Travel API** | Real hotel rates + affiliate URLs | Free | Batch: ~20k / ~20k | **¥0** | Unlimited, rate-capped | Jalan, Yahoo | **No** |
| **e-Stat / 国土数値情報** | Geo + tourism statistics | Free | < 1k | **¥0** | Yes | — | No |
| **JMA climate data** | Seasonality accuracy | Free | < 1k | **¥0** | Yes | Hand-authored | No |
| **ODPT / GTFS-JP** | Local transit feasibility | Free | Batch downloads | **¥0** | Yes | Hand-authored | No |

Rakuten request volume is **independent of user traffic** because of the precompute design in
`docs/data-sources.md` §4: a nightly batch refreshing ~20 destinations × ~30 departure dates is
~600 calls/night ≈ 18,000/month, comfortably inside a 1 rps budget (~2.6M/month theoretical).
Scenario B costs exactly the same as scenario A. That property is the whole point.

### 3.3 Optional LLM layer — costed, deliberately not adopted

The spec calls for "AI explanation". The MVP produces explanations from templates driven by the
actual computed numbers. Here is what the LLM alternative would cost, so the choice is explicit
rather than assumed.

Per query: ~2,500 input tokens (request + candidate table + destination facts) and ~800 output
tokens (Japanese explanation for 4 recommendations).

| Model | Model ID | Input $/1M | Output $/1M | Cost/query | Scenario A (1k) | Scenario B (10k) |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00 | ≈ $0.0065 | ≈ **¥975** | ≈ **¥9,750** |
| Claude Sonnet 5 | `claude-sonnet-5` | $3.00 | $15.00 | ≈ $0.0195 | ≈ **¥2,925** | ≈ **¥29,250** |
| Claude Opus 5 | `claude-opus-5` | $5.00 | $25.00 | ≈ $0.0325 | ≈ **¥4,875** | ≈ **¥48,750** |

Levers that change these numbers:

- **Prompt caching** — cache reads bill at roughly 0.1× and cache writes at roughly 1.25× of
  base input. The destination fact table is a stable prefix, so most of the 2,500 input tokens
  are cacheable. Realistically cuts input cost by well over half at steady traffic.
- **Batch API** — 50% discount, but it is asynchronous. Unusable for an interactive answer;
  usable for pre-generating SEO page copy.

**Decision: no LLM on the request path for MVP.** Three reasons, in order of weight:

1. **Cost shape.** At scenario B, Haiku alone consumes ~¥9,750/month — effectively the entire
   ¥10,000 budget for one optional feature, and it scales linearly with traffic while
   affiliate revenue does not scale linearly with queries.
2. **Groundedness.** Template explanations are generated *from* the computed cost breakdown and
   scores. They cannot state a price the engine did not calculate. A free-text model can, and on
   a product whose only value is trustworthy numbers, that is the more expensive failure.
3. **It is not the moat.** Per spec §15, generation is not the differentiator; the scoring and
   the data are.

**Where an LLM does earn its cost, later:** parsing genuinely unstructured input that the rule
parser rejects. That is a narrow fallback — a few hundred tokens, invoked only on parse failure,
so cost tracks failures rather than traffic. Batch-generated SEO copy is the second candidate.
Neither is on the MVP path.

### 3.4 Rejected paid services

| Service | Why rejected | What it would have cost |
| --- | --- | --- |
| **Google Maps Platform** (Routes / Distance Matrix) | 20 destinations × 2 legs = ~40 elements per query. Beyond the monthly credit this runs at roughly $5–$10 per 1,000 elements depending on SKU — scenario B implies **¥50,000–¥150,000+/month**, 5–15× the entire budget. Its caching restrictions also conflict with a precompute architecture. | Budget-breaking |
| **Flight fare APIs** (Amadeus / Duffel paid tiers) | Flight commission is thin; paid fare data cannot pay for itself at MVP scale. Japan domestic LCC coverage is unverified. | ¥10,000+/month |
| **Managed database** | The MVP is stateless: the seed dataset is a source file and saved trips are encoded in the URL. Nothing yet needs a database. | ¥750–¥3,000/month |
| **Paid analytics** | Server logs and a free tier answer the only question that matters early (does anyone click through?). | ¥1,500+/month |

Google Maps is the important line in this table. It is the single most tempting integration —
it is excellent, and every travel product reaches for it — and it is the one that would
silently destroy the cost model. The engine models travel times instead, at a real accuracy
cost that is documented rather than hidden.

---

## 4. When to start spending

Spend is unlocked by evidence, not by roadmap position. Each trigger below is a claim that can
be checked against data.

| Trigger | Then buy | Expected cost |
| --- | --- | --- |
| Users click booking links but bounce because the shown price was wrong | Rakuten API integration (free) | ¥0 |
| Rakuten alone gives poor coverage for a popular destination | Jalan API (free) | ¥0 |
| Parse failures exceed ~10% of inputs | LLM parse fallback, Haiku, failure-path only | < ¥1,000/mo |
| Affiliate revenue exceeds ¥50,000/month | LLM explanations, prompt-cached | ¥3,000–¥10,000/mo |
| Modelled travel times are provably causing wrong rankings | Self-hosted routing on ODPT/GTFS-JP before Google Maps | Compute only |

**Standing rule:** no paid API is added before the free path has been shown to be the actual
bottleneck. "It would be nicer" is not a trigger.

---

## 5. Revenue context

Affiliate commission on a Japanese domestic hotel booking is typically a low single-digit
percentage of booking value. A ¥100,000 family trip therefore returns on the order of
¥1,000–¥4,000 per *converted* booking, before considering that most sessions never book.

Against that, the meaningful ratio is **cost per query vs. conversion rate**, not cost per query
alone. At ¥0.00 marginal cost per query, the MVP is profitable at any conversion rate above
zero. At Sonnet-tier explanation cost (≈¥2.9/query), it needs roughly one converted booking per
~500–1,500 queries just to break even on the explanation feature.

That ratio, not a philosophical preference, is why the MVP ships with a ¥0 marginal cost.

---

## 6. Review checklist

- [ ] Re-check FX assumption (¥150/USD) if it has moved more than 10%
- [ ] Re-check Railway usage against the hobby tier as traffic grows
- [ ] Re-check LLM list prices before adopting any LLM layer — they change, and the Sonnet 5
      introductory rate ($2/$10) is scheduled to end 2026-08-31
- [ ] Confirm no service moved from free tier to paid without a corresponding entry here
- [ ] Confirm affiliate revenue is tracked per destination, so cost can be judged against it
