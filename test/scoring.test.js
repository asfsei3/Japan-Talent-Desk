import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTripRequest } from "../engine/parse-request.js";
import { getDestination } from "../engine/data/destinations.js";
import { estimateTripCost } from "../engine/cost-model.js";
import {
  budgetScore,
  comfortScore,
  compositeScore,
  convenienceScore,
  familyScore,
  interestScore,
  resolveWeights,
  timeScore,
} from "../engine/scoring.js";

describe("interestScore", () => {
  const okinawa = getDestination("okinawa-main");
  const kusatsu = getDestination("kusatsu");

  it("rewards a destination that is strong at what was asked for", () => {
    const request = parseTripRequest("東京から9月に2泊、海", { month: 9 });

    assert.ok(interestScore(request, okinawa) > interestScore(request, kusatsu));
  });

  it("applies seasonal suitability, not just the destination's strength", () => {
    const september = parseTripRequest("東京から2泊、海", { month: 9 });
    const january = parseTripRequest("東京から2泊、海", { month: 1 });

    assert.ok(
      interestScore(september, okinawa) > interestScore(january, okinawa),
      "a beach in January should score below the same beach in September"
    );
  });

  it("falls back to overall appeal when nothing specific was asked for", () => {
    const request = parseTripRequest("東京から2泊");

    assert.ok(interestScore(request, okinawa) > 0);
  });
});

describe("budgetScore", () => {
  const request = parseTripRequest("東京から2泊、10万円");

  it("is null when no budget was given, so it can be dropped from the composite", () => {
    assert.equal(budgetScore(parseTripRequest("東京から2泊"), 100000), null);
  });

  it("scores a trip that uses most of the budget at full marks", () => {
    assert.equal(budgetScore(request, 95000), 100);
  });

  it("does not treat spending far less as automatically better", () => {
    assert.ok(budgetScore(request, 30000) < budgetScore(request, 95000));
  });

  it("penalises going over budget, more the further over it goes", () => {
    const onBudget = budgetScore(request, 100000);
    const slightlyOver = budgetScore(request, 110000);
    const wellOver = budgetScore(request, 130000);

    assert.ok(slightlyOver < onBudget);
    assert.ok(wellOver < slightlyOver);
    assert.equal(budgetScore(request, 200000), 0, "far over budget is not a candidate at all");
  });
});

describe("timeScore", () => {
  it("judges travel time relative to the length of the trip", () => {
    const oneNight = parseTripRequest("東京から1泊");
    const sixNights = parseTripRequest("東京から6泊");
    const longRoute = { doorToDoorMinutes: 330, transfers: 1 };

    assert.ok(
      timeScore(sixNights, longRoute) > timeScore(oneNight, longRoute),
      "the same journey is more tolerable on a longer trip"
    );
  });

  it("prefers a shorter journey over a longer one", () => {
    const request = parseTripRequest("東京から2泊");

    assert.ok(timeScore(request, { doorToDoorMinutes: 110 }) > timeScore(request, { doorToDoorMinutes: 330 }));
  });
});

describe("convenienceScore", () => {
  it("caps the score when the party will not drive somewhere that needs a car", () => {
    const okinawa = getDestination("okinawa-main");
    const route = okinawa.access.tokyo[0];
    const noCar = parseTripRequest("東京から2泊、大人2人", { constraints: { noCar: true } });
    const cost = estimateTripCost(noCar, okinawa, route, okinawa.hotels.standard);

    assert.ok(okinawa.localTransport.carRecommended);
    assert.ok(convenienceScore(noCar, okinawa, route, cost) <= 42);
  });

  it("prefers fewer transfers", () => {
    const request = parseTripRequest("東京から2泊、大人2人");
    const hakone = getDestination("hakone");
    const direct = hakone.access.tokyo[0];
    const cost = estimateTripCost(request, hakone, direct, hakone.hotels.standard);
    const indirect = { ...direct, transfers: 3 };
    const indirectCost = estimateTripCost(request, hakone, indirect, hakone.hotels.standard);

    assert.ok(convenienceScore(request, hakone, direct, cost) > convenienceScore(request, hakone, indirect, indirectCost));
  });
});

describe("familyScore", () => {
  const hakone = getDestination("hakone");
  const route = hakone.access.tokyo[0];

  it("is null when no children are travelling", () => {
    const couple = parseTripRequest("東京から2泊、大人2人");

    assert.equal(familyScore(couple, hakone, route, hakone.hotels.standard), null);
  });

  it("penalises a long journey more heavily for a younger child", () => {
    const toddler = parseTripRequest("東京から2泊、大人2人、子供1人（2歳）");
    const teenager = parseTripRequest("東京から2泊、大人2人、子供1人（14歳）");
    const longRoute = { ...route, doorToDoorMinutes: 400 };

    assert.ok(
      familyScore(toddler, hakone, longRoute, hakone.hotels.standard) <
        familyScore(teenager, hakone, longRoute, hakone.hotels.standard)
    );
  });

  it("rewards lodging the family actually fits into", () => {
    const request = parseTripRequest("東京から2泊、大人2人、子供2人（8歳、6歳）");
    const withFamilyRoom = familyScore(request, hakone, route, { ...hakone.hotels.standard, familyRoom: true });
    const withoutFamilyRoom = familyScore(request, hakone, route, { ...hakone.hotels.standard, familyRoom: false });

    assert.ok(withFamilyRoom > withoutFamilyRoom);
  });
});

describe("comfortScore", () => {
  const request = parseTripRequest("東京から2泊、大人2人、子供2人（8歳、6歳）");
  const hakone = getDestination("hakone");

  it("rates a better lodging tier higher, so budget headroom can buy a better trip", () => {
    const cheap = estimateTripCost(request, hakone, hakone.access.tokyo[0], hakone.hotels.budget);
    cheap.tierName = "budget";
    const better = estimateTripCost(request, hakone, hakone.access.tokyo[0], hakone.hotels.family);
    better.tierName = "family";

    assert.ok(comfortScore(request, hakone, hakone.hotels.family, better) > comfortScore(request, hakone, hakone.hotels.budget, cheap));
  });
});

describe("resolveWeights", () => {
  it("always sums to one", () => {
    for (const query of ["東京から2泊", "東京から2泊、子供2人、10万円、移動は楽に", "大阪から3泊、大人2人"]) {
      const weights = resolveWeights(parseTripRequest(query));
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

      assert.ok(Math.abs(total - 1) < 1e-9, `weights for "${query}" summed to ${total}`);
    }
  });

  it("drops the family weight when no children are travelling", () => {
    assert.equal(resolveWeights(parseTripRequest("東京から2泊、大人2人")).family, 0);
    assert.ok(resolveWeights(parseTripRequest("東京から2泊、大人2人、子供1人")).family > 0);
  });

  it("drops the budget weight when no budget was given", () => {
    assert.equal(resolveWeights(parseTripRequest("東京から2泊、大人2人")).budget, 0);
  });

  it("weights convenience and time more when easy travel was asked for", () => {
    const plain = resolveWeights(parseTripRequest("東京から2泊、大人2人、子供1人、10万円"));
    const easy = resolveWeights(parseTripRequest("東京から2泊、大人2人、子供1人、10万円、移動はできるだけ楽に"));

    assert.ok(easy.convenience > plain.convenience);
    assert.ok(easy.time > plain.time);
  });
});

describe("compositeScore", () => {
  it("redistributes the weight of missing components instead of scoring them zero", () => {
    const weights = { a: 0.5, b: 0.5 };

    assert.equal(compositeScore({ a: 80, b: null }, weights), 80);
    assert.equal(compositeScore({ a: 80, b: 40 }, weights), 60);
  });

  it("returns zero when nothing can be scored", () => {
    assert.equal(compositeScore({ a: null }, { a: 1 }), 0);
  });
});
