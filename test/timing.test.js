import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTripRequest } from "../engine/parse-request.js";
import { recommendTrips } from "../engine/recommend.js";
import { getDestination } from "../engine/data/destinations.js";
import { analyzeTiming } from "../engine/timing.js";
import { seasonalSuitability } from "../engine/scoring.js";

function timingFor(query, destinationId) {
  const request = parseTripRequest(query);
  const destination = getDestination(destinationId);

  return analyzeTiming(request, destination, destination.access.tokyo[0], destination.hotels.standard);
}

describe("seasonalSuitability", () => {
  it("rates a beach far lower in midwinter than in late summer", () => {
    const request = parseTripRequest("東京から2泊、海");

    assert.ok(seasonalSuitability(request, 1) < 0.4);
    assert.ok(seasonalSuitability(request, 9) > 0.9);
  });

  it("is neutral when nothing specific was asked for", () => {
    assert.equal(seasonalSuitability(parseTripRequest("東京から2泊"), 1), 1);
  });

  it("blends the requested themes rather than taking the best one", () => {
    const both = parseTripRequest("東京から2泊、海か温泉");
    const beachOnly = parseTripRequest("東京から2泊、海");

    assert.ok(seasonalSuitability(both, 1) > seasonalSuitability(beachOnly, 1), "onsen lifts a winter month");
  });
});

describe("analyzeTiming", () => {
  it("returns nothing to compare against when no month was given", () => {
    assert.equal(timingFor("東京から2泊、大人2人、海", "okinawa-main"), null);
  });

  it("costs the trip in all twelve months", () => {
    const timing = timingFor("東京から8月に3泊、大人2人、海", "okinawa-main");

    assert.equal(timing.months.length, 12);
    assert.deepEqual(timing.months.map((entry) => entry.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    for (const entry of timing.months) {
      assert.ok(entry.totalYen > 0);
      assert.ok(entry.suitability >= 0 && entry.suitability <= 1);
    }
  });

  it("refuses to send a beach trip to the cheapest month when that month is out of season", () => {
    // Okinawa is cheapest in January precisely because nobody wants to swim then. Suggesting it
    // would be arithmetically correct and useless, which is the failure this guard exists for.
    const timing = timingFor("東京から8月に3泊、大人2人、子供2人、海", "okinawa-main");

    assert.equal(timing.cheapestMonth.month, 1);
    assert.ok(timing.cheapestMonth.suitability < 0.4);
    assert.notEqual(timing.suggestion.month, timing.cheapestMonth.month);
  });

  it("never suggests a month materially less suitable than the one requested", () => {
    const queries = [
      ["東京から8月に3泊、大人2人、海", "okinawa-main"],
      ["東京から1月に3泊、大人2人、雪", "niseko"],
      ["東京から11月に2泊、大人2人、温泉", "hakone"],
      ["東京から4月に2泊、大人2人、歴史", "nikko"],
    ];

    for (const [query, destinationId] of queries) {
      const timing = timingFor(query, destinationId);

      for (const alternative of timing.alternatives) {
        assert.ok(
          alternative.suitability >= timing.requestedSuitability * 0.9,
          `${destinationId}: month ${alternative.month} is too far out of season to suggest`
        );
      }
    }
  });

  it("suggests nothing when the requested month is already the right call", () => {
    // January in Niseko is peak price and peak snow. There is no cheaper month worth having.
    const timing = timingFor("東京から1月に3泊、大人2人、雪", "niseko");

    assert.equal(timing.suggestion, null);
  });

  it("only suggests a shift that saves a material amount", () => {
    const timing = timingFor("東京から8月に3泊、大人2人、海", "okinawa-main");

    assert.ok(timing.suggestion.savingsRate >= 0.05);
    assert.ok(timing.suggestion.savingsYen > 0);
  });

  it("reports savings that reconcile with the two monthly totals", () => {
    const timing = timingFor("東京から8月に3泊、大人2人、海", "okinawa-main");
    const suggested = timing.months.find((entry) => entry.month === timing.suggestion.month);

    assert.equal(timing.suggestion.savingsYen, timing.requestedTotalYen - suggested.totalYen);
  });

  it("prefers a shift someone with fixed leave could actually make", () => {
    const timing = timingFor("東京から8月に3泊、大人2人、海", "okinawa-main");

    assert.ok(timing.suggestion.monthsAway <= 2, "a nearby month should lead over a distant one");
  });

  it("carries the destination's own note for the suggested month when there is one", () => {
    const timing = timingFor("東京から8月に3泊、大人2人、海", "okinawa-main");

    assert.ok(timing.suggestion.note, "Okinawa has a note for the suggested month");
    assert.ok(timing.suggestion.note.ja.length > 0);
  });

  it("attaches timing to every recommendation when a month was given", () => {
    const result = recommendTrips(parseTripRequest("東京から8月に3泊、大人2人、子供2人で40万円。海。"));

    for (const recommendation of result.ranked) {
      assert.ok(recommendation.timing, `${recommendation.destinationId} has no timing analysis`);
      assert.equal(recommendation.timing.requestedMonth, 8);
    }
  });

  it("omits timing entirely when no month was given", () => {
    const result = recommendTrips(parseTripRequest("東京から3泊、大人2人で20万円。海。"));

    for (const recommendation of result.ranked) {
      assert.equal(recommendation.timing, null);
    }
  });
});
