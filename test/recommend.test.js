import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTripRequest } from "../engine/parse-request.js";
import { recommendTrips } from "../engine/recommend.js";
import { planTrip, engineCapabilities } from "../engine/index.js";
import { destinations } from "../engine/data/destinations.js";
import { origins } from "../engine/data/origins.js";

const SPEC_QUERY = "東京から9月の3連休に大人2人、子供2人で15万円以内。海か温泉。移動はできるだけ楽に。";

describe("recommendTrips", () => {
  it("answers the product spec's example query with the expected shape of result", () => {
    const result = recommendTrips(parseTripRequest(SPEC_QUERY));
    const keys = result.categories.map((category) => category.key);

    assert.equal(result.ok, true);
    assert.ok(keys.includes("overall"));
    assert.ok(keys.includes("budget"));
    assert.ok(keys.includes("family"));
    assert.ok(keys.includes("beach"));
    assert.ok(keys.includes("onsen"));
  });

  it("gives every recommendation the fields the spec asks to display", () => {
    const result = recommendTrips(parseTripRequest(SPEC_QUERY));

    for (const category of result.categories) {
      const recommendation = category.recommendation;

      assert.ok(recommendation.cost.totalYen > 0, "estimated total cost");
      assert.ok(recommendation.route.label.ja, "transportation");
      assert.ok(recommendation.tierName, "hotel");
      assert.ok(recommendation.route.doorToDoorMinutes > 0, "travel time");
      assert.ok(recommendation.explanation.advantages.length > 0, "major advantages");
      assert.ok(recommendation.explanation.cautions.length > 0, "disadvantages");
      assert.ok(recommendation.scores.family !== undefined, "family suitability");
      assert.ok(recommendation.bookingLinks.length > 0, "booking links");
      assert.ok(recommendation.explanation.paragraphs.length > 0, "AI explanation");
    }
  });

  it("keeps themed picks inside the stated budget when anything fits", () => {
    const result = recommendTrips(parseTripRequest(SPEC_QUERY));

    for (const category of result.categories) {
      assert.equal(
        category.recommendation.withinBudget,
        true,
        `${category.key} picked a trip over budget while affordable options existed`
      );
    }
  });

  it("keeps themed picks relevant to what was actually asked for", () => {
    // Regression: "Best for Families" once answered a beach request with a landlocked highland
    // resort, because it optimised family suitability while ignoring the stated interest.
    const result = recommendTrips(parseTripRequest("東京から8月に3泊、大人2人、子供2人で40万円。海。"));
    const bestInterest = Math.max(...result.ranked.map((recommendation) => recommendation.scores.interest));

    for (const category of result.categories) {
      assert.ok(
        category.recommendation.scores.interest >= bestInterest * 0.5,
        `${category.key} picked ${category.recommendation.destinationId} with interest fit ${category.recommendation.scores.interest}`
      );
    }
  });

  it("says plainly when nothing fits the budget instead of pretending", () => {
    const result = recommendTrips(parseTripRequest("東京から9月に3泊、大人2人、子供2人で2万円。海。"));

    assert.equal(result.budgetFit.feasible, false);
    assert.ok(result.budgetFit.cheapestYen > 20000);
    assert.ok(result.budgetFit.message.ja.length > 0);
  });

  it("spends budget headroom on a better hotel rather than banking it", () => {
    // The spec is explicit that the cheapest hotel is not automatically the right answer.
    const tight = recommendTrips(parseTripRequest("東京から9月に2泊、大人2人、子供2人で9万円。温泉。"));
    const generous = recommendTrips(parseTripRequest("東京から9月に2泊、大人2人、子供2人で30万円。温泉。"));

    const tiers = ["budget", "standard", "family"];
    const tightTier = tiers.indexOf(tight.categories[0].recommendation.tierName);
    const generousTier = tiers.indexOf(generous.categories[0].recommendation.tierName);

    assert.ok(
      generousTier > tightTier,
      `expected a better lodging tier with a larger budget, got ${tight.categories[0].recommendation.tierName} then ${generous.categories[0].recommendation.tierName}`
    );
  });

  it("offers a genuinely cheaper budget pick than the overall pick", () => {
    const result = recommendTrips(parseTripRequest(SPEC_QUERY));
    const overall = result.categories.find((category) => category.key === "overall").recommendation;
    const budget = result.categories.find((category) => category.key === "budget").recommendation;

    assert.ok(budget.cost.totalYen <= overall.cost.totalYen);
  });

  it("ranks a different winner when the season changes", () => {
    const summer = recommendTrips(parseTripRequest("東京から8月に3泊、大人2人で30万円。海。"));
    const winter = recommendTrips(parseTripRequest("東京から1月に3泊、大人2人で30万円。雪。"));

    assert.notEqual(
      summer.categories[0].recommendation.destinationId,
      winter.categories[0].recommendation.destinationId
    );
  });

  it("refuses to invent a route for an unsupported origin", () => {
    const result = recommendTrips(parseTripRequest("9月に3泊で海に行きたい"));

    assert.equal(result.ok, false);
    assert.equal(result.reason, "origin-unsupported");
    assert.equal(result.categories.length, 0);
  });

  it("never recommends a destination it has no route to from the origin", () => {
    for (const originId of Object.keys(origins)) {
      const result = recommendTrips(parseTripRequest(`${origins[originId].name.ja}から9月に2泊、大人2人で20万円`));

      for (const recommendation of result.ranked) {
        const destination = destinations.find((entry) => entry.id === recommendation.destinationId);

        assert.ok(
          destination.access?.[originId]?.length > 0,
          `${recommendation.destinationId} was recommended from ${originId} with no route`
        );
      }
    }
  });

  it("keeps ranking independent of affiliate configuration", () => {
    const request = parseTripRequest(SPEC_QUERY);
    const plain = recommendTrips(request, { affiliateConfig: {} });
    const tracked = recommendTrips(request, { affiliateConfig: { rakutenAffiliateId: "test-affiliate-id" } });

    assert.deepEqual(
      plain.ranked.map((recommendation) => recommendation.destinationId),
      tracked.ranked.map((recommendation) => recommendation.destinationId),
      "commission must never influence the ranking"
    );
    assert.ok(tracked.categories[0].recommendation.bookingLinks.some((link) => link.tracked));
    assert.ok(plain.categories[0].recommendation.bookingLinks.every((link) => !link.tracked));
  });

  it("produces a total that is the sum of its parts for every ranked candidate", () => {
    const result = recommendTrips(parseTripRequest(SPEC_QUERY));

    for (const recommendation of result.ranked) {
      const summed = recommendation.cost.breakdown.reduce((total, line) => total + line.yen, 0);

      assert.equal(summed, recommendation.cost.totalYen, `${recommendation.destinationId} total does not reconcile`);
    }
  });

  it("keeps every score inside 0-100", () => {
    const result = recommendTrips(parseTripRequest(SPEC_QUERY));

    for (const recommendation of result.ranked) {
      for (const [key, value] of Object.entries(recommendation.scores)) {
        if (value === null) {
          continue;
        }

        assert.ok(value >= 0 && value <= 100, `${recommendation.destinationId}.${key} was ${value}`);
      }
    }
  });
});

describe("planTrip", () => {
  it("parses, recommends, and returns a share token in one call", () => {
    const plan = planTrip(SPEC_QUERY);

    assert.equal(plan.request.originId, "tokyo");
    assert.equal(plan.result.ok, true);
    assert.ok(plan.shareToken.length > 0);
  });
});

describe("engineCapabilities", () => {
  it("reports real coverage rather than a claim", () => {
    const capabilities = engineCapabilities();

    assert.equal(capabilities.destinationCount, destinations.length);

    for (const entry of capabilities.coverage) {
      const actual = destinations.filter((destination) => destination.access?.[entry.originId]).length;

      assert.equal(entry.destinations, actual);
    }
  });
});

describe("destination dataset integrity", () => {
  it("has a well-formed record for every destination", () => {
    const seen = new Set();

    for (const destination of destinations) {
      assert.ok(!seen.has(destination.id), `duplicate destination id ${destination.id}`);
      seen.add(destination.id);

      assert.equal(destination.priceIndexByMonth.length, 12, `${destination.id} month array`);
      assert.ok(destination.name.ja && destination.name.en, `${destination.id} names`);
      assert.ok(destination.summary.ja && destination.summary.en, `${destination.id} summary`);
      assert.ok(destination.advantages.length > 0, `${destination.id} advantages`);
      assert.ok(destination.cautions.length > 0, `${destination.id} cautions`);
      assert.ok(destination.mealIndexYen > 0, `${destination.id} meal index`);
      assert.ok(destination.provenance.class, `${destination.id} provenance`);

      for (const tierName of ["budget", "standard", "family"]) {
        const tier = destination.hotels[tierName];

        assert.ok(tier.nightlyPerRoomYen > 0, `${destination.id}.${tierName}`);

        for (const field of ["breakfastIncludedRate", "dinnerIncludedRate"]) {
          assert.equal(typeof tier[field], "number", `${destination.id}.${tierName}.${field} missing`);
          assert.ok(tier[field] >= 0 && tier[field] <= 1, `${destination.id}.${tierName}.${field} out of range`);
        }
      }

      const originIds = Object.keys(destination.access);
      assert.ok(originIds.length > 0, `${destination.id} has no access routes`);

      for (const originId of originIds) {
        assert.ok(origins[originId], `${destination.id} references unknown origin ${originId}`);

        for (const route of destination.access[originId]) {
          assert.ok(route.doorToDoorMinutes > 0, `${destination.id} route duration`);
          assert.ok(route.transfers >= 0, `${destination.id} route transfers`);
          assert.ok(route.label.ja && route.label.en, `${destination.id} route label`);
        }
      }
    }
  });

  it("increases included-meal rates with the lodging tier", () => {
    for (const destination of destinations) {
      const { budget, standard, family } = destination.hotels;

      assert.ok(budget.dinnerIncludedRate <= standard.dinnerIncludedRate, `${destination.id} dinner rate`);
      assert.ok(standard.dinnerIncludedRate <= family.dinnerIncludedRate, `${destination.id} dinner rate`);
    }
  });

  it("keeps hotel tiers ordered from cheapest to dearest", () => {
    for (const destination of destinations) {
      assert.ok(
        destination.hotels.budget.nightlyPerRoomYen < destination.hotels.standard.nightlyPerRoomYen,
        `${destination.id} budget tier is not cheaper than standard`
      );
      assert.ok(
        destination.hotels.standard.nightlyPerRoomYen < destination.hotels.family.nightlyPerRoomYen,
        `${destination.id} standard tier is not cheaper than family`
      );
    }
  });
});
