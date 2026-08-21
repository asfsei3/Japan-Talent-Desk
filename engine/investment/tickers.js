/**
 * SEC's company_tickers.json is a ~1MB flat list of every ticker-CIK mapping
 * SEC tracks (thousands of companies). It changes rarely, so it's fetched
 * once and cached in memory for the life of the process rather than hit on
 * every search request.
 */
import { fetchTickerList, padCik } from "./edgar-client.js";

let cache = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — the list barely changes day to day

/** Normalizes the raw {"0": {cik_str, ticker, title}, ...} object into an array. */
export function normalizeTickerList(raw) {
  return Object.values(raw ?? {}).map((row) => ({
    cik: padCik(row.cik_str),
    ticker: String(row.ticker ?? "").toUpperCase(),
    name: String(row.title ?? ""),
  }));
}

export async function loadTickers({ forceRefresh = false } = {}) {
  const stale = Date.now() - cacheLoadedAt > CACHE_TTL_MS;
  if (cache && !forceRefresh && !stale) return cache;

  const raw = await fetchTickerList();
  cache = normalizeTickerList(raw);
  cacheLoadedAt = Date.now();
  return cache;
}

/**
 * Ranks matches: exact ticker match first, then ticker-starts-with, then a
 * substring match on the company name. Case-insensitive throughout.
 *
 * @param {string} query
 * @param {{cik: string, ticker: string, name: string}[]} tickers
 * @param {number} [limit]
 */
export function searchTickers(query, tickers, limit = 10) {
  const q = String(query ?? "").trim().toUpperCase();
  if (!q) return [];

  const exact = [];
  const prefix = [];
  const nameMatch = [];

  for (const row of tickers) {
    if (row.ticker === q) {
      exact.push(row);
    } else if (row.ticker.startsWith(q)) {
      prefix.push(row);
    } else if (row.name.toUpperCase().includes(q)) {
      nameMatch.push(row);
    }
  }

  return [...exact, ...prefix, ...nameMatch].slice(0, limit);
}

export function findByTicker(ticker, tickers) {
  const q = String(ticker ?? "").trim().toUpperCase();
  return tickers.find((row) => row.ticker === q) ?? null;
}
