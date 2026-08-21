import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeTickerList, searchTickers, findByTicker } from "../engine/investment/tickers.js";

const RAW_TICKERS = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" },
  "2": { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
  "3": { cik_str: 1065280, ticker: "NFLX", title: "NETFLIX INC" },
};

describe("normalizeTickerList", () => {
  it("pads the CIK to 10 digits and upper-cases the ticker", () => {
    const list = normalizeTickerList(RAW_TICKERS);
    assert.equal(list.length, 4);
    const apple = list.find((row) => row.ticker === "AAPL");
    assert.equal(apple.cik, "0000320193");
    assert.equal(apple.name, "Apple Inc.");
  });
});

describe("searchTickers", () => {
  const tickers = normalizeTickerList(RAW_TICKERS);

  it("ranks an exact ticker match first", () => {
    const results = searchTickers("nvda", tickers);
    assert.equal(results[0].ticker, "NVDA");
  });

  it("matches a ticker prefix", () => {
    const results = searchTickers("N", tickers);
    const foundTickers = results.map((r) => r.ticker);
    assert.ok(foundTickers.includes("NVDA"));
    assert.ok(foundTickers.includes("NFLX"));
  });

  it("falls back to a company-name substring match", () => {
    const results = searchTickers("microsoft", tickers);
    assert.equal(results[0].ticker, "MSFT");
  });

  it("returns an empty array for an empty query", () => {
    assert.deepEqual(searchTickers("", tickers), []);
    assert.deepEqual(searchTickers("   ", tickers), []);
  });

  it("respects the limit", () => {
    const results = searchTickers("N", tickers, 1);
    assert.equal(results.length, 1);
  });
});

describe("findByTicker", () => {
  const tickers = normalizeTickerList(RAW_TICKERS);

  it("finds an exact, case-insensitive match", () => {
    const found = findByTicker("aapl", tickers);
    assert.equal(found.name, "Apple Inc.");
  });

  it("returns null when there is no match", () => {
    assert.equal(findByTicker("ZZZZ", tickers), null);
  });
});
