import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTripRequest } from "../engine/parse-request.js";
import { getDestination } from "../engine/data/destinations.js";
import { classifyPartyForFare, estimateTripCost, roomsRequired } from "../engine/cost-model.js";
import { farePolicies } from "../engine/data/pricing-model.js";

function familyRequest(overrides = {}) {
  return parseTripRequest("東京から9月に2泊、大人2人、子供2人（8歳と5歳）で15万円", overrides);
}

describe("fare classification", () => {
  it("applies the flight age boundaries", () => {
    const request = parseTripRequest("東京から2泊 大人2人 子供3人（1歳、5歳、13歳）");
    const party = classifyPartyForFare(request, farePolicies["domestic-flight"]);

    assert.equal(party.infants, 1, "under 3 flies free on a lap");
    assert.equal(party.childFares, 1, "3 to 11 pays the child fare");
    assert.equal(party.adultFares, 3, "12 and over pays the adult fare, plus the two adults");
  });

  it("applies the different JR age boundaries", () => {
    const request = parseTripRequest("東京から2泊 大人2人 子供2人（5歳、8歳）");
    const party = classifyPartyForFare(request, farePolicies["jr-shinkansen"]);

    assert.equal(party.infants, 1, "under 6 travels free on JR without a reserved seat");
    assert.equal(party.childFares, 1);
    assert.equal(party.adultFares, 2);
  });

  it("charges nobody a fare when self-driving", () => {
    assert.equal(farePolicies["self-drive"].perPerson, false);
  });
});

describe("room requirements", () => {
  const request = parseTripRequest("東京から2泊 大人2人 子供2人（8歳、3歳）");

  it("packs a family of four into one family room", () => {
    const rooms = roomsRequired(request, { familyRoom: true, childSleepFreeUnderAge: 6 });

    assert.equal(rooms, 1);
  });

  it("needs two rooms when the property has no family room", () => {
    const rooms = roomsRequired(request, { familyRoom: false });

    assert.equal(rooms, 2);
  });

  it("does not count a young child who sleeps free", () => {
    const twoAdultsOneToddler = parseTripRequest("東京から2泊 大人2人 子供1人（3歳）");
    const rooms = roomsRequired(twoAdultsOneToddler, { familyRoom: true, childSleepFreeUnderAge: 6 });

    assert.equal(rooms, 1);
  });
});

describe("estimateTripCost", () => {
  const request = familyRequest();
  const hakone = getDestination("hakone");
  const okinawa = getDestination("okinawa-main");

  it("returns every cost component and a total that matches the breakdown", () => {
    const cost = estimateTripCost(request, hakone, hakone.access.tokyo[0], hakone.hotels.standard);
    const summed = cost.breakdown.reduce((total, line) => total + line.yen, 0);

    assert.equal(summed, cost.totalYen);
    assert.ok(cost.transport.yen > 0);
    assert.ok(cost.accommodation.yen > 0);
    assert.ok(cost.meals.yen > 0);
    assert.ok(cost.activities.yen > 0);
  });

  it("reports a range around the point estimate rather than false precision", () => {
    const cost = estimateTripCost(request, hakone, hakone.access.tokyo[0], hakone.hotels.standard);

    assert.ok(cost.rangeYen.low < cost.totalYen);
    assert.ok(cost.rangeYen.high > cost.totalYen);
  });

  it("moves air fares with the season but leaves rail fares alone", () => {
    const august = familyRequest({ month: 8 });
    const september = familyRequest({ month: 9 });

    const flightAugust = estimateTripCost(august, okinawa, okinawa.access.tokyo[0], okinawa.hotels.standard);
    const flightSeptember = estimateTripCost(september, okinawa, okinawa.access.tokyo[0], okinawa.hotels.standard);

    assert.ok(
      flightAugust.transport.yen > flightSeptember.transport.yen,
      "Okinawa airfare should be higher in August than September"
    );

    const railAugust = estimateTripCost(august, hakone, hakone.access.tokyo[0], hakone.hotels.standard);
    const railSeptember = estimateTripCost(september, hakone, hakone.access.tokyo[0], hakone.hotels.standard);

    assert.equal(
      railAugust.transport.yen,
      railSeptember.transport.yen,
      "Japanese rail fares are regulated and do not move with the season"
    );
    assert.ok(
      railAugust.accommodation.yen > railSeptember.accommodation.yen,
      "lodging should still move with the season even where the fare does not"
    );
  });

  it("discounts food when breakfast is included", () => {
    const withBreakfast = estimateTripCost(request, hakone, hakone.access.tokyo[0], {
      ...hakone.hotels.standard,
      breakfastIncludedRate: 1,
    });
    const withoutBreakfast = estimateTripCost(request, hakone, hakone.access.tokyo[0], {
      ...hakone.hotels.standard,
      breakfastIncludedRate: 0,
    });

    assert.ok(withBreakfast.meals.yen < withoutBreakfast.meals.yen);
    assert.ok(withBreakfast.meals.includedBreakfastCreditYen > 0);
  });

  it("uses transit instead of a rental car when the party will not drive", () => {
    const noCar = familyRequest({ constraints: { noCar: true, car: false } });
    const cost = estimateTripCost(noCar, okinawa, okinawa.access.tokyo[0], okinawa.hotels.standard);

    assert.equal(cost.localTransport.mode, "transit");
  });

  it("skips the rental car when the party drove there in their own", () => {
    const izu = getDestination("izu-shimoda");
    const driveRoute = izu.access.tokyo.find((route) => route.mode === "car");
    const cost = estimateTripCost(request, izu, driveRoute, izu.hotels.standard);

    assert.equal(cost.localTransport.mode, "own-car");
    assert.equal(cost.transport.basis, "per-vehicle");
  });

  it("scales cost with party size", () => {
    const couple = parseTripRequest("東京から9月に2泊、大人2人");
    const bigger = parseTripRequest("東京から9月に2泊、大人4人");

    const coupleCost = estimateTripCost(couple, okinawa, okinawa.access.tokyo[0], okinawa.hotels.standard);
    const biggerCost = estimateTripCost(bigger, okinawa, okinawa.access.tokyo[0], okinawa.hotels.standard);

    assert.ok(biggerCost.totalYen > coupleCost.totalYen);
  });
});
