/**
 * Investment Intelligence MVP — public entry point.
 *
 * Company Search + Company Page only, per docs/platform/business-strategy.md's
 * recommended sequencing and spec's "don't overbuild" instruction. Backed
 * entirely by SEC EDGAR (free, no key, no rate-limit-driven cost) — see
 * docs/investment/README.md for what that does and doesn't cover.
 */
import { fetchCompanyFacts } from "./edgar-client.js";
import { loadTickers, searchTickers, findByTicker } from "./tickers.js";
import { extractCompanyMetrics } from "./company-facts.js";

const factsCache = new Map(); // cik -> { metrics, cachedAt }
const FACTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — fundamentals don't change intraday

export async function searchCompanies(query, { limit = 10 } = {}) {
  const tickers = await loadTickers();
  return searchTickers(query, tickers, limit);
}

export async function getCompanyPage(ticker) {
  const tickers = await loadTickers();
  const match = findByTicker(ticker, tickers);
  if (!match) {
    return { ok: false, reason: "not-found" };
  }

  const cached = factsCache.get(match.cik);
  if (cached && Date.now() - cached.cachedAt < FACTS_CACHE_TTL_MS) {
    return { ok: true, ticker: match.ticker, cik: match.cik, metrics: cached.metrics };
  }

  const raw = await fetchCompanyFacts(match.cik);
  const metrics = extractCompanyMetrics(raw);
  factsCache.set(match.cik, { metrics, cachedAt: Date.now() });

  return { ok: true, ticker: match.ticker, cik: match.cik, metrics };
}

export { extractCompanyMetrics } from "./company-facts.js";
export { searchTickers, normalizeTickerList, findByTicker } from "./tickers.js";
