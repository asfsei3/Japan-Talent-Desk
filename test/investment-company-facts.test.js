import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractCompanyMetrics } from "../engine/investment/company-facts.js";

function usdRow({ end, val, form = "10-K", fp = "FY", filed = "2024-01-15" }) {
  return { end, val, form, fp, filed };
}

describe("extractCompanyMetrics", () => {
  it("extracts the latest annual figures and computes derived ratios", () => {
    const facts = {
      entityName: "Example Corp",
      facts: {
        "us-gaap": {
          Revenues: {
            units: {
              USD: [
                usdRow({ end: "2023-12-31", val: 1_000_000_000 }),
                usdRow({ end: "2022-12-31", val: 800_000_000 }),
                // A 10-Q row must never be picked up as an annual figure.
                { end: "2023-09-30", val: 250_000_000, form: "10-Q", fp: "Q3" },
              ],
            },
          },
          EarningsPerShareDiluted: {
            units: { "USD/shares": [usdRow({ end: "2023-12-31", val: 3.5 })] },
          },
          GrossProfit: {
            units: { USD: [usdRow({ end: "2023-12-31", val: 600_000_000 })] },
          },
          OperatingIncomeLoss: {
            units: { USD: [usdRow({ end: "2023-12-31", val: 250_000_000 })] },
          },
          NetIncomeLoss: {
            units: { USD: [usdRow({ end: "2023-12-31", val: 180_000_000 })] },
          },
        },
      },
    };

    const metrics = extractCompanyMetrics(facts);

    assert.equal(metrics.entityName, "Example Corp");
    assert.equal(metrics.fiscalYearEnd, "2023-12-31");
    assert.equal(metrics.revenue, 1_000_000_000);
    assert.equal(metrics.revenueGrowth, 0.25); // (1.0B - 0.8B) / 0.8B
    assert.equal(metrics.epsDiluted, 3.5);
    assert.equal(metrics.grossMargin, 0.6);
    assert.equal(metrics.operatingMargin, 0.25);
    assert.equal(metrics.netIncome, 180_000_000);
    // Market data is never available from SEC filings.
    assert.equal(metrics.price, null);
    assert.equal(metrics.marketCap, null);
    assert.equal(metrics.peRatio, null);
  });

  it("falls back to an equivalent revenue tag when Revenues is absent", () => {
    const facts = {
      entityName: "Fallback Corp",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: { USD: [usdRow({ end: "2023-12-31", val: 500_000_000 })] },
          },
        },
      },
    };

    const metrics = extractCompanyMetrics(facts);
    assert.equal(metrics.revenue, 500_000_000);
  });

  it("returns null for every metric when no usable annual data exists", () => {
    const metrics = extractCompanyMetrics({ entityName: "Empty Corp", facts: { "us-gaap": {} } });
    assert.equal(metrics.revenue, null);
    assert.equal(metrics.revenueGrowth, null);
    assert.equal(metrics.epsDiluted, null);
    assert.equal(metrics.grossMargin, null);
    assert.equal(metrics.operatingMargin, null);
    assert.equal(metrics.netIncome, null);
  });

  it("does not compute revenue growth without a prior-year figure", () => {
    const facts = {
      facts: {
        "us-gaap": {
          Revenues: { units: { USD: [usdRow({ end: "2023-12-31", val: 1_000_000_000 })] } },
        },
      },
    };

    assert.equal(extractCompanyMetrics(facts).revenueGrowth, null);
  });

  it("handles a missing companyFacts payload without throwing", () => {
    const metrics = extractCompanyMetrics(null);
    assert.equal(metrics.entityName, null);
    assert.equal(metrics.revenue, null);
  });
});
