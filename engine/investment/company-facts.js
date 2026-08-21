/**
 * Extracts a small set of investor-relevant metrics from a raw SEC EDGAR
 * "company facts" (XBRL) response. Pure function — no network I/O — so it's
 * unit-testable against fixture JSON instead of live SEC responses.
 *
 * GAAP tag names vary by filer (e.g. some report "Revenues", others
 * "RevenueFromContractWithCustomerExcludingAssessedTax"), so each metric
 * tries a short list of known-equivalent tags and uses the first one present.
 *
 * What this deliberately does NOT compute: current price, market cap, P/E.
 * SEC EDGAR is filing data, not market data — see docs/investment/README.md.
 */

const REVENUE_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
];
const EPS_DILUTED_TAGS = ["EarningsPerShareDiluted"];
const GROSS_PROFIT_TAGS = ["GrossProfit"];
const OPERATING_INCOME_TAGS = ["OperatingIncomeLoss"];
const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss"];

function firstAvailableTag(usGaap, candidates) {
  for (const tag of candidates) {
    if (usGaap[tag]) return usGaap[tag];
  }
  return null;
}

/** Annual (10-K, full fiscal year) rows for one XBRL unit, newest first. */
function annualValues(tagData, unit) {
  const rows = tagData?.units?.[unit] ?? [];
  return rows
    .filter((row) => row.form === "10-K" && row.fp === "FY" && row.end && row.val !== undefined)
    .sort((a, b) => new Date(b.end) - new Date(a.end));
}

function ratio(numerator, denominator) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

export function extractCompanyMetrics(companyFacts) {
  const usGaap = companyFacts?.facts?.["us-gaap"] ?? {};

  const revenueRows = annualValues(firstAvailableTag(usGaap, REVENUE_TAGS), "USD");
  const latestRevenue = revenueRows[0] ?? null;
  const priorRevenue = revenueRows[1] ?? null;
  const revenueGrowth =
    latestRevenue && priorRevenue ? ratio(latestRevenue.val - priorRevenue.val, Math.abs(priorRevenue.val)) : null;

  const epsRows = annualValues(firstAvailableTag(usGaap, EPS_DILUTED_TAGS), "USD/shares");
  const latestEps = epsRows[0] ?? null;

  const grossProfitRows = annualValues(firstAvailableTag(usGaap, GROSS_PROFIT_TAGS), "USD");
  const latestGrossProfit = grossProfitRows[0] ?? null;

  const operatingIncomeRows = annualValues(firstAvailableTag(usGaap, OPERATING_INCOME_TAGS), "USD");
  const latestOperatingIncome = operatingIncomeRows[0] ?? null;

  const netIncomeRows = annualValues(firstAvailableTag(usGaap, NET_INCOME_TAGS), "USD");
  const latestNetIncome = netIncomeRows[0] ?? null;

  return {
    entityName: companyFacts?.entityName ?? null,
    fiscalYearEnd: latestRevenue?.end ?? null,
    filedAt: latestRevenue?.filed ?? null,
    revenue: latestRevenue?.val ?? null,
    revenueGrowth,
    epsDiluted: latestEps?.val ?? null,
    grossMargin: ratio(latestGrossProfit?.val ?? null, latestRevenue?.val ?? null),
    operatingMargin: ratio(latestOperatingIncome?.val ?? null, latestRevenue?.val ?? null),
    netIncome: latestNetIncome?.val ?? null,
    // Not derivable from SEC filing data — needs a market-data provider.
    price: null,
    marketCap: null,
    peRatio: null,
  };
}
