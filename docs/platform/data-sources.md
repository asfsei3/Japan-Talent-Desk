# Data Sources — Investment & Shopping

Status: Research pass done via web search on 2026-08-21; pricing/terms for
third-party commercial APIs change often — anything below not backed by a
primary-source citation, or older than a few months by the time you read
this, should be re-checked before committing to it in production. Marked
**要確認** where the search results were inconclusive or the primary docs
page needs direct review of the current commercial license terms.

Per spec §29, each category is compared FREE / CHEAP / BEST / SCALE.

---

## Investment Intelligence

### Market price data (quotes, OHLCV)

| Tier | Provider | Notes |
|---|---|---|
| FREE | Alpha Vantage free key | 25 requests/day — usable only for a demo, not a live product. [alphavantage.co/documentation](https://www.alphavantage.co/documentation/) |
| FREE | Finnhub free tier | 60 calls/min, real-time US quotes, basic fundamentals, no card required — the strongest free tier found for an MVP. 要確認: commercial-use terms of the free tier specifically (Finnhub's paid tiers exist precisely because heavy commercial use is expected to graduate off free). [finnhub.io/pricing](https://finnhub.io/pricing) |
| CHEAP | Alpha Vantage $49.99/mo | 75 req/min, 15-min-delayed US data; realtime data starts at the $99.99/mo (150 req/min) tier. [alphavantage.co/premium](https://www.alphavantage.co/premium/) |
| CHEAP | Finnhub Premium $11.99–$99.99/mo | Adds international coverage, more history, higher rate limits |
| BEST | Polygon.io / Massive.com Stocks Starter ($29/mo+) | Per-asset-class billing (stocks/options/forex/crypto priced separately); free Basic tier is 5 calls/min with EOD + 15-min-delayed data. Rebranded to Massive as of Oct 2025 — pricing page now at massive.com. 要確認: current tier names/limits post-rebrand before committing |
| SCALE | Polygon/Massive Advanced ($199/mo) or enterprise SIP feed | Real-time consolidated tape, unlimited calls at the top tier |

### Fundamentals (revenue, EPS, margins, growth)

| Tier | Provider | Notes |
|---|---|---|
| FREE | SEC EDGAR (`data.sec.gov`, XBRL "company facts" API) | Free, no key, 10 req/sec rate limit, U.S. government work (not copyrightable) — the single best long-term free source for U.S. filers' fundamentals. Requires a `User-Agent` header with a real name/email. [sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) |
| FREE | Finnhub free tier "basic fundamentals" | Faster to integrate than raw XBRL parsing, narrower field coverage |
| CHEAP/BEST | Finnhub Premium or Alpha Vantage Premium | Structured fundamentals without XBRL parsing, cross-market coverage |
| SCALE | 要確認 | Institutional-grade providers (e.g. FactSet, Bloomberg, S&P Capital IQ) — out of scope for an MVP; pricing is enterprise-quote-only and not comparable to the self-serve tiers above |

Recommended MVP path: **SEC EDGAR for U.S.-filer fundamentals (free, no
ceiling)** + **Finnhub free/cheap tier for quotes and non-U.S. names**,
upgrading to a paid quote provider only once real-time data is a proven
user requirement (most "what changed today" use cases tolerate a 15-minute
delay).

### News

| Tier | Provider | Notes |
|---|---|---|
| FREE | Company/source RSS feeds, SEC EDGAR full-text search | No licensing fee, but coverage is fragmented — one feed per company/source, not a unified news API |
| FREE (non-commercial only) | NewsAPI.org Developer plan | 100 req/day, 24h-delayed, **ToS explicitly forbids commercial use** — do not build on this tier for a monetized product |
| CHEAP–BEST | NewsAPI.org Business plan | $449/mo ($358.80/mo billed annually), 250K req/mo, 5yr history, commercial license, CORS-enabled. [newsapi.org/pricing](https://newsapi.org/pricing) |
| BEST/SCALE | 要確認 | Category-specific alternatives (e.g. narrower financial-news APIs) worth a second pass before committing $449/mo — several newer/cheaper entrants were surfaced in search results but not independently verified here |

Recommended MVP path: **RSS + SEC filings** cover "what changed" for U.S.
tickers without any paid news API. Add a paid news API only once volume
(multiple markets, non-filing news) justifies $449+/mo — don't default to
NewsAPI.org on day one.

### Analyst actions / estimates

要確認 in full — not independently researched this pass. Finnhub's paid
tiers include estimates data; treat as CHEAP/BEST tier pending direct
confirmation of current pricing and field coverage.

---

## Shopping Intelligence

### Amazon

| Tier | Notes |
|---|---|
| Access gate | Amazon's Product Advertising API (PA-API) access requires an active Associates account with **qualifying sales in the trailing 30 days** — the commonly cited current threshold is 10 qualifying items shipped in 30 days (raised from an earlier 3-sale rule), enforced on a rolling basis. **PA-API 5.0 is being deprecated May 15, 2026**, with migration to a new "Creators API." 要確認: exact Creators API terms/limits before building against it — this is a moving target as of this research pass. [webservices.amazon.com/paapi5/documentation/troubleshooting/api-rates.html](https://webservices.amazon.com/paapi5/documentation/troubleshooting/api-rates.html) |
| Practical implication | A brand-new Shopping MVP **cannot** get Amazon API access before it already has affiliate sales — a chicken-and-egg gate. MVP should launch price/product comparison for Amazon using manually-entered or scraped-with-caution product references initially (see `legal-risks.md` for scraping constraints), and apply for PA-API/Creators API access once the affiliate program is already producing qualifying sales through another channel (e.g. Rakuten/Yahoo). |

### Rakuten (Ichiba)

| Tier | Notes |
|---|---|
| FREE | Rakuten Web Service — Ichiba Item Search API is free to use for any registered Rakuten developer app; results must be used to introduce products and link back to the Rakuten product page (no scraping/republishing bans found in the summarized docs, but the full current ToS should be read directly before launch — the docs are versioned by date, e.g. `ichiba-item-search` version 2026-07-01). 要確認: rate limits and any recent ToS changes — confirm directly at [webservice.rakuten.co.jp/documentation/ichiba-item-search](https://webservice.rakuten.co.jp/documentation/ichiba-item-search) |
| Monetization | Rakuten Affiliate program pairs with the same API — commission-based, no separate paid tier found |

Rakuten is the strongest FREE-tier fit of the three Japanese/global retailers
checked: no sales threshold to unlock the API (unlike Amazon), free search
API, and an attached affiliate program — good candidate for the Shopping
MVP's first integrated retailer.

### Yahoo! Shopping (Japan)

| Tier | Notes |
|---|---|
| FREE | Yahoo! Shopping Web API (product search) is part of Yahoo! Developer Network, no stated cost found in this pass |
| Affiliate | "Yahoo!ショッピングアフィリエイト" launched Jan 26, 2026 — no screening/setup fee, usable with just a Yahoo! JAPAN ID; a separate API-based affiliate path runs through ValueCommerce. 要確認: whether the no-screening self-serve affiliate program and the API-based ValueCommerce program are the same commission terms or need separate signup — confirm at [developer.yahoo.co.jp/webapi/shopping/affiliate.html](https://developer.yahoo.co.jp/webapi/shopping/affiliate.html) |

### Recommended Shopping MVP data path

**FREE tier only at launch**: Rakuten Ichiba Item Search API (product +
price data) + Yahoo! Shopping Web API, both with attached affiliate
programs and no sales-threshold gate. Defer Amazon integration until the
affiliate program has organic traffic and can clear PA-API/Creators API's
qualifying-sales requirement through the other two retailers first.

---

## What still needs direct verification before any integration ships

- Full current ToS text for Rakuten Web Service and Yahoo! Developer Network
  (not just the affiliate summary pages) — confirm redistribution and
  caching rules for product data, not just "linking back."
- Amazon Creators API terms once PA-API is fully retired (May 15, 2026).
- Whether NewsAPI.org's Business tier terms permit AI-summarized redistribution
  of headlines (vs. just internal use) — the commercial license type matters
  for how "what changed today" digests can quote source headlines.
- SEC EDGAR fair-access policy details beyond rate limit (declared crawler
  identification, etc.) — low risk, but confirm before high-volume polling.
