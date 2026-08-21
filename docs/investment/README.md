# Investment Intelligence — MVP implementation notes

Status: Company Search + Company Page implemented, unit-tested, **not yet
verified against live SEC EDGAR** — see "Known gap" below before treating
this as production-ready.

## What this is

The smallest possible slice of `docs/platform/business-strategy.md`'s
recommended second vertical: search for a U.S.-listed company and see its
fundamentals, sourced entirely from free SEC EDGAR filing data (no API key,
no paid tier, no rate-limit-driven cost — see `docs/platform/data-sources.md`
and `docs/platform/api-costs.md` for why EDGAR was chosen over a paid quote
provider for this first slice).

Served at `/investment/` in this same repo, following the same pattern as
`/travel/` and `/intel` — one Node process, one more product.

## What it does

- **Company Search** (`GET /api/investment/search?q=`): matches against SEC's
  full ticker/CIK/name list (`company_tickers.json`), ranked exact-ticker →
  ticker-prefix → name-substring.
- **Company Page** (`GET /api/investment/company/:ticker`): pulls the most
  recent 10-K's fundamentals via SEC's XBRL "company facts" API and shows
  revenue, revenue growth, diluted EPS, gross margin, operating margin, and
  net income.

## What it deliberately does not do (yet)

Per spec §28 ("don't overbuild") and the scope agreed for this MVP:

- **No current price, market cap, or P/E.** SEC EDGAR is filing data, not
  market data — these fields render as "データなし" (no data) rather than a
  fabricated or stale number. Adding them means adding a market-data
  provider (Finnhub's free tier is the researched candidate — see
  `docs/platform/data-sources.md`), which is a real scope/cost decision, not
  a rounding error, and is out of scope for this first slice.
- **No "What Changed," Bull/Bear, or any AI-generated text.** This MVP is
  Company Search + Company Page only. The FACT/INTERPRETATION/AI_INFERENCE
  discipline from `docs/platform/architecture.md` §3 is honored trivially
  here because there is no AI_INFERENCE yet to distinguish — the one tag
  shown on the page is `FACT（SEC提出書類由来）`.
- **No Watchlist/Alert.** Those are shared-platform features
  (`docs/platform/architecture.md` §2) that don't exist anywhere in this
  repo yet; wiring Investment into them before they exist would mean
  building throwaway one-off state instead.
- **U.S. SEC filers only.** TSMC, ASML, and other non-U.S. names from the
  spec's example list are not covered — they don't file 10-Ks. Extending
  coverage to them needs a different data source, flagged as future work,
  not silently worked around with fabricated numbers.

## Known gap: not verified against live SEC EDGAR

The extraction/scoring logic (`engine/investment/company-facts.js`,
`engine/investment/tickers.js`) is unit-tested against fixture JSON
(`test/investment-company-facts.test.js`, `test/investment-tickers.test.js`)
and all tests pass. The HTTP layer (`engine/investment/edgar-client.js`) and
the server routes were **exercised locally but could not reach
`www.sec.gov` / `data.sec.gov`** from this development sandbox — its egress
proxy returned `403` for both hosts (an environment-level network policy,
not an application bug; confirmed via direct `curl` outside the app, and
the failure is a clean, handled `502` from the app's own error path, not a
crash). This is expected to work from a normal production host (Railway or
similar) that isn't behind this sandbox's outbound proxy allowlist, but
**that has not been confirmed** — verify `GET /api/investment/search?q=NVDA`
against a real deployment before treating this as launch-ready, and check
that `SEC_EDGAR_USER_AGENT` is set to a real contact (SEC's own guidance —
see `docs/platform/legal-risks.md`).

## Configuration

| Env var | Purpose | Default |
|---|---|---|
| `SEC_EDGAR_USER_AGENT` | Identifies this app to SEC per their access guidance | A placeholder that says to set a real one — replace before production traffic |

## Caching

- The ticker list (`company_tickers.json`, ~1MB, changes rarely) is fetched
  once per process and cached 24h.
- Company facts are cached per-CIK for 1h — fundamentals don't change
  intraday, so there's no reason to re-fetch on every page view. This is
  the same "cache by Entity, not by user session" principle documented in
  `docs/platform/api-costs.md`.
- Both caches are in-memory only (reset on process restart) — acceptable
  for this MVP's traffic; revisit if this becomes the actual bottleneck.

## Next steps

1. Verify live against SEC EDGAR from a real deployment (see "Known gap").
2. Set `SEC_EDGAR_USER_AGENT` to a real contact before any production traffic.
3. Decide whether market price data is worth adding (Finnhub free tier per
   `docs/platform/data-sources.md`) before expanding past fundamentals-only.
4. Link this from the `/ops` portal once it's confirmed working in production.
