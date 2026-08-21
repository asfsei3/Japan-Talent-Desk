# Japan Football Intelligence — Master Strategy & Product Blueprint

Status: Source blueprint (captured 2026-08-20)
Scope: Japan-first → Asia → Global Football Intelligence Platform

> This file is the captured strategic input. The numbered documents in this folder
> (`10-architecture.md` onward) are the worked-through engineering and commercial
> response to it. Where a later document contradicts this file, the later document
> wins and the reason is recorded in `90-decision-log.md`.

## 1. Vision

Collect and structure football information worldwide and build an **Intelligence Layer**
for understanding a specific market's players, transfers, media, and commercial value.

Japan first. Then `Japan → Asia → Global`.

## 2. Core Concept

Not a football news site. A conversion pipeline:

```
Raw Information → Structured Data → Events / Changes → Football Intelligence → Decision Support
```

## 3. Initial Positioning

**Japan Football Intelligence** — first target audience is people tracking
**Japanese players abroad**: transfers, contracts, injuries, appearances, European media,
Japanese media, social, transfer signals, and Japan-market commercial value, in one place.

## 4. B2B Brand

**Japan Talent Desk** remains the B2B brand.
Positioning: *Japan market intelligence for global football clubs.*
Delivers Japanese player intelligence, transfer intelligence, recruitment context,
player-side signals, Japan market intelligence, commercial intelligence.

## 5. What We Are NOT

- Japanese Transfermarkt
- Japanese Wyscout
- A football news aggregator
- AI player recommendation
- Generic scouting DB
- Agent / broker
- Video scouting
- A "you must sign this player" recommendation service

## 6. Core Differentiation

Incumbents are strong on performance, scouting, transfer, valuation.
JFI combines **Japan context + Japan market + media + social + commercial impact**, making
visible that:

```
Football Value ≠ Japan Market Value
```

## 7. Product Architecture

- **Layer 1 — Global Data Collection**: club/league/federation/player official sources,
  Japanese and European media, transfer journalists, RSS, news APIs, football data APIs,
  social APIs where available.
- **Layer 2 — Intelligence Engine**: AI + rules convert raw text into Player, Club, League
  entities and Transfer / Injury / Contract / Match / Media / Social / Commercial events.
- **Layer 3 — Japan Intelligence**: bind events to Japanese players and the Japan market.
- **Layer 4 — Decision Support**: What happened? What changed? Why does it matter?
  How reliable is it? What should be monitored next?

## 8. Killer UX: What Changed?

The homepage is not a news list. It is **What Changed Today?**

```
Keito Nakamura
Transfer Signal: MEDIUM → HIGH
New information: 3 new reports · new club linked · contract context changed
Confidence: Medium · Sources: 4 · Last updated: 08:32 JST
```

## 9. Daily Dashboard

Sections: Transfer, Injury, Contract, Performance, Market, Trending Players.

## 10. Player Intelligence Page

One continuously updated profile per player: Basic, Transfer, Performance, Injury, Media,
Social, Japan Market, Timeline.

## 11. Confidence Framework

Never present unverified information as fact.

`CONFIRMED` · `STRONGLY REPORTED` · `REPORTED` · `RUMORED` · `UNVERIFIED`

Every fact retains source, URL, published date, detected date, confidence.

## 12. Transfer Intelligence

**Transfer Radar** ranks players by current transfer activity using report count, source
reliability, clubs linked, contract status, player preference, club situation, history.

Do not output fake precision (`67% probability`). Output `LOW / MEDIUM / HIGH`.
Build a statistical model only once historical data exists.

## 13. Transfer Momentum

Track direction, not just status (`LOW → MEDIUM`, `7-day ↑ +42%`). A key proprietary metric.

## 14. Japan Market Intelligence

Measure Japanese social following, growth, Japanese media mentions, reach, search interest,
engagement, YouTube exposure, fan interest, commercial potential → **Japan Market Score 0–100**,
from transparent measurable inputs. An LLM must never invent the score.

## 15. Player Commercial Intelligence

Football value and Japan market value shown side by side, with named drivers.

## 16. Club Japan Intelligence

Per-club Japan profiles (Japanese players, audience, media exposure, social growth,
sponsorship, web interest, historical impact) → future **Japan Opportunity Score**.

## 17. Player Acquisition Impact

"What could happen in Japan if Club X signs Player Y?" Initially LOW/MEDIUM/HIGH/VERY HIGH,
later historical benchmark ranges. Never pretend to know exact shirt sales.

## 18. Historical Japan Market Database

Before vs after a Japanese player joins: social followers, Japanese engagement, Japanese media
mentions, search interest, web traffic, merchandise, sponsorship. This becomes proprietary and
is one of the biggest long-term moats.

## 19. Free Product

Player database, daily updates, transfer/injury/contract news, timeline, basic profiles,
basic Japan market info. Purpose: audience, SEO, distribution, data collection.
Advertising is not the primary business model.

## 20. Pro Product

¥1,000–¥5,000/month: watchlists, alerts, advanced timelines, Transfer Radar,
Transfer Momentum, Japan Market Score, comparisons, historical data, commercial profiles.
Optional monetization — B2B is the main target.

## 21. B2B Product

**Japan Talent Desk Intelligence** — Standard ¥100K–¥300K/mo, Advanced ¥300K–¥800K+/mo,
Custom research ¥100K–¥500K+/project. Pricing must be validated through interviews and sales.

## 22. B2B Customer Types

Primary: European clubs, sporting directors, recruitment, scouting.
Secondary: commercial/marketing/international business departments, agencies, sports media,
sponsors, Japanese companies entering football sponsorship.

## 23. Automation Philosophy

Minimum human maintenance; target <10–20 minutes/day after stabilization.
Humans review high-impact stories, correct edge cases, improve sources and rules, and sell.

## 24. Automated Pipeline

```
Global Sources → Collector → Raw Data Store → Deduplication → Entity Resolution →
AI Classification → Fact Extraction → Confidence Scoring → Database → Change Detection →
Intelligence Generation → Public Website → Newsletter → Social Drafts
```

## 25. Scheduled Automation

Every 1–3 hours: collect, detect new articles and changes.
Daily: update players/transfers/injuries/contracts/social, generate dashboard and alerts.
Weekly: Japan Market Weekly, transfer/player/commercial trends.

## 26. Human Review

Admin **Review Queue** for high-risk/high-impact only: contradictory sources, major transfer
rumours, injury reports, new player entities, low-confidence claims, important commercial data.
Actions: approve, reject, merge, edit, mark unverified.

## 27. API / Cost Strategy

Do not buy multiple expensive APIs at launch. Start with RSS, official sources, permitted public
sources, free tiers, low-cost APIs. Add paid providers only where quality materially improves the
product. Track every provider in `docs/strategy/api-costs.md` with provider, purpose, pricing,
free tier, commercial-use restrictions, request limits, expected usage, expected monthly cost,
alternative, and exit strategy.

## 28. API Architecture

Never hard-code one provider. Use adapters: `FootballDataProvider`, `NewsProvider`,
`SocialDataProvider`, `SearchProvider`, `LLMProvider`, `EmailProvider`.

## 29. Cost Optimization

Rule-based filtering → deduplication → cheap-model classification → strong model only for
important content → premium model only for complex/high-impact cases. Cache everything.
Hash URLs and content. Never process duplicate content twice.

## 30. Cost Reporting

Internal dashboard: daily articles collected/processed, LLM calls and cost, API calls and cost,
errors; monthly totals for API, LLM, hosting, database, email; cost per 100 / 1,000 / 10,000 articles.

## 31. Data Provenance

Every important data point is traceable: player, event, status, source, URL, published date,
detected date, confidence. Critical for B2B credibility.

## 32. Copyright / Data Compliance

Do not republish full copyrighted articles. Store metadata, headline where legally appropriate,
URL, source, short factual summary; link to the original. Respect robots.txt, ToS, API licenses,
commercial-use restrictions, copyright. Do not build the business on unauthorized scraping.

## 33. SEO

Useful indexable pages: Japanese players abroad, by league, transfer rumours, per-league pages,
player profiles, transfer timelines. Avoid thousands of thin AI-generated pages.

## 34. Newsletter

**Japan Market Weekly**, automatically generated from top transfer developments, biggest player
changes, injuries, contracts, trending players, Japan market developments, European club
opportunities. Brevo retained.

## 35. Social

AI identifies and ranks important stories → drafts posts → human approves → publish.
Target <5 minutes/day; eventually automate low-risk updates.

## 36. Roadmap

- **Phase 1 (0–2 months)**: player DB, club DB, news ingestion, source tracking, AI
  classification, entity resolution, transfer/injury/contract events, change detection,
  player pages, daily dashboard, admin dashboard. No unnecessary paid APIs.
- **Phase 2 (2–4 months)**: scheduled jobs, newsletter, alerts, social drafts, cost monitoring,
  error monitoring, more sources, better source ranking. Daily operation near-zero human work.
- **Phase 3 (4–8 months)**: social metrics, media metrics, search trends, Japan Market Score,
  Transfer Momentum, commercial profiles, Club Japan Intelligence. Begin B2B discovery.
- **Phase 4 (8–18 months)**: Japan Talent Desk portal, B2B reports, custom dashboards,
  recruitment intelligence, commercial intelligence, paid subscriptions, European club pilots.

## 37. Expansion Strategy

Do not expand internationally before Japan has product-market fit.
Japan → Korea / Australia / China / Iran / Saudi Arabia (Asia Player Intelligence) →
Asia Market Intelligence → Global Football Intelligence.
The data model must already support Player, Club, League, Country, Market, Event, Source,
Audience, Commercial Value. Japan is simply the initial filter.

## 38. Long-Term Vision

A platform a club can ask: which players should we monitor, which Japanese players are becoming
available, which Asian players have rising transfer momentum, which player would increase our
Japanese audience, which player has the strongest commercial potential in Korea, which markets
should we target, what changed in the Asian transfer market this week.

## 39. Potential Moat

Not the frontend. The structured event database, historical transfer data, source reliability
database, rumour lifecycle, Transfer Momentum, Japan Market Score, historical Japanese-player
commercial impact, club × market relationships, local market context, and accumulated history.

## 40. Business Model

```
Free Intelligence → Audience → Pro Users → B2B Intelligence → Custom Research →
Enterprise → Asia Intelligence → Global Football Intelligence
```

Free is distribution. B2B Intelligence is the primary monetization engine.

## 41. Success Metrics

- **Product**: DAU, returning users, watchlists, alert subscriptions, newsletter subscribers
- **Data**: sources monitored, articles/day, events/day, entity-resolution accuracy,
  duplicate-detection accuracy, source-confidence accuracy, update latency
- **Automation**: human minutes/day, % auto-processed, error rate, API cost/article, LLM cost/article
- **Business**: B2B leads, meetings, paid pilots, MRR, ARR, retention

## 42. Initial Revenue Targets

Targets, not forecasts. Y1: 1–5 B2B customers, ¥3M–¥8M. Y2: 10–20, ¥10M–¥25M.
Y3: 20–30+, ¥30M–¥50M+.

## 43. Most Important Product Principle

Do not ask "how do we make a better football news website?".
Ask: **"What information about Japanese football would be extremely annoying to collect
manually every day?"** Then automate it. Turn thousands of global information points into a
few high-value changes.

## 44. Initial Engineering Assignment

Inspect the existing repository, identify reusable architecture, review the LP, strategy docs,
newsletter and outbound workflows, then produce: architecture proposal, data model, source
strategy, API/provider comparison, cost model, automation plan, MVP implementation plan,
additional product ideas, major risks, recommended next steps — then implement Phase 1.

## 45. Final North Star

Build the world's most useful intelligence platform for understanding Japanese football players
and the Japanese football market — starting with Japan, then Asia, then global.
Japan is the wedge. The continuously updated intelligence database is the asset.
Japan Talent Desk is the B2B monetization layer.
