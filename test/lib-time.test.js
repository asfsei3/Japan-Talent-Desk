import "./helpers/test-env.js";

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { dateDaysAgo, daysBetween, decayFactor, monthsUntil, todayInTimezone } from "../src/lib/time.js";

describe("business calendar", () => {
  it("uses JST for the day boundary", () => {
    // 22:00 UTC is already the next calendar day in Tokyo (UTC+9).
    const lateUtc = new Date("2026-08-20T22:00:00Z");
    assert.equal(todayInTimezone("Asia/Tokyo", lateUtc), "2026-08-21");
    assert.equal(todayInTimezone("UTC", lateUtc), "2026-08-20");
  });

  it("computes day offsets as plain dates", () => {
    assert.equal(dateDaysAgo(1, new Date("2026-08-20T12:00:00Z")), "2026-08-19");
  });

  it("measures elapsed days between timestamps", () => {
    assert.equal(daysBetween("2026-08-10T00:00:00Z", "2026-08-17T00:00:00Z"), 7);
    assert.equal(daysBetween("nonsense", "2026-08-17T00:00:00Z"), null);
  });
});

describe("decay and contract pressure", () => {
  it("halves the weight of a report every half-life", () => {
    assert.equal(decayFactor(0, 6), 1);
    assert.ok(Math.abs(decayFactor(6, 6) - 0.5) < 1e-9);
    assert.ok(Math.abs(decayFactor(12, 6) - 0.25) < 1e-9);
  });

  it("reports months remaining on a contract", () => {
    const months = monthsUntil("2027-06-30", new Date("2026-06-30T00:00:00Z"));
    assert.ok(months > 11.8 && months < 12.2, String(months));
    assert.equal(monthsUntil("not a date"), null);
  });
});
