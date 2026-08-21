/**
 * Minimal SEC EDGAR client. Free, no API key, no commercial-use restriction —
 * data.sec.gov is a U.S. government API. The only requirements are a real
 * identifying User-Agent and staying under the published rate limit (10
 * req/sec across all EDGAR APIs). See docs/platform/data-sources.md and
 * docs/platform/legal-risks.md for the research behind this choice.
 *
 * This MVP does not fetch market price data (SEC EDGAR doesn't have it) —
 * see docs/investment/README.md for what that means for this page.
 */

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const COMPANY_FACTS_URL = (cik10) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;

function userAgent() {
  // SEC asks for a real contact so they can reach a misbehaving client —
  // see https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data
  const configured = process.env.SEC_EDGAR_USER_AGENT;
  if (configured && configured.trim()) return configured.trim();
  return "Japan Talent Desk Investment MVP (set SEC_EDGAR_USER_AGENT in .env with a real contact)";
}

/** Serializes requests to this module at roughly the rate limit's per-request interval. */
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 110; // ~9 req/sec, under SEC's 10 req/sec limit with margin

async function throttledFetch(url) {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();

  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent(),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`SEC EDGAR request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.json();
}

export async function fetchTickerList() {
  return throttledFetch(TICKERS_URL);
}

/** @param {string} cik10 Zero-padded 10-digit CIK, e.g. "0000320193". */
export async function fetchCompanyFacts(cik10) {
  return throttledFetch(COMPANY_FACTS_URL(cik10));
}

export function padCik(cikNumber) {
  return String(cikNumber).padStart(10, "0");
}
