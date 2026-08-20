/**
 * True Trip Cost.
 *
 * The product's central claim is that comparing hotel prices across destinations is the wrong
 * comparison. What a family actually spends is transport plus lodging plus food plus getting
 * around once there plus the things they actually do. This module computes that total for one
 * concrete configuration: a destination, a route, and a hotel tier.
 *
 * Every returned figure is an estimate derived from the seed dataset. See `docs/data-sources.md`.
 */

import {
  activeDayShare,
  activityLevelMultipliers,
  contingencyRate,
  estimateBand,
  farePolicies,
  includedBreakfastShare,
  mealRates,
  occupancy,
  rentalCar,
} from "./data/pricing-model.js";

/**
 * Transport modes whose fares move with the season.
 *
 * Japanese rail and bus fares are regulated and effectively fixed year-round, so applying a
 * seasonal multiplier to a shinkansen fare would invent a price swing that does not exist.
 * Air fares do move, and sharply. Getting this distinction right is most of the reason the
 * model can tell a family that September is a good month for Okinawa but makes no difference
 * to the cost of reaching Hakone.
 */
const seasonSensitiveModes = new Set(["flight"]);

function round(value) {
  return Math.round(value);
}

function monthIndex(destination, month) {
  if (!month) {
    return 1;
  }

  return destination.priceIndexByMonth[month - 1] ?? 1;
}

/**
 * Splits the travelling party into fare categories for one transport mode. The boundaries
 * differ by mode, which is why this takes a policy rather than using fixed age bands.
 */
export function classifyPartyForFare(request, policy) {
  let infants = 0;
  let childFares = 0;
  let adultFares = request.adults;

  for (const child of request.children) {
    const age = child.age;

    if (age === null || age === undefined) {
      childFares += 1;
      continue;
    }

    if (age <= policy.infantMaxAge) {
      infants += 1;
    } else if (age <= policy.childMaxAge) {
      childFares += 1;
    } else {
      adultFares += 1;
    }
  }

  return { adultFares, childFares, infants };
}

/** Splits the party by the general age bands used for meals and activities. */
function classifyPartyForSpend(request) {
  let infants = 0;
  let children = 0;

  for (const child of request.children) {
    const age = child.age;

    if (age !== null && age !== undefined && age <= 2) {
      infants += 1;
    } else {
      children += 1;
    }
  }

  return { adults: request.adults, children, infants };
}

function transportCost(request, destination, route, month) {
  const policy = farePolicies[route.farePolicy];
  const seasonMultiplier = seasonSensitiveModes.has(route.mode) ? monthIndex(destination, month) : 1;

  if (!policy.perPerson) {
    const vehicleCost = (route.vehicleRoundTripYen || 0) * seasonMultiplier;

    return {
      yen: round(vehicleCost),
      basis: "per-vehicle",
      seasonMultiplier,
      detail: { adultFares: 0, childFares: 0, infants: request.children.length },
    };
  }

  const party = classifyPartyForFare(request, policy);
  const adultFare = route.adultRoundTripYen * seasonMultiplier;
  const total =
    party.adultFares * adultFare +
    party.childFares * adultFare * policy.childRate +
    party.infants * adultFare * policy.infantRate;

  return { yen: round(total), basis: "per-person", seasonMultiplier, detail: party };
}

/**
 * Rooms required for the party.
 *
 * Two Japanese facts drive this and both change which option is genuinely cheapest:
 * family rooms and ryokan commonly sleep four rather than two, and many properties let young
 * children share existing bedding free of charge (添い寝無料). A naive "party size over two"
 * would systematically overstate the cost of family-tier lodging and push every family
 * towards a budget room that does not in fact fit them.
 */
export function roomsRequired(request, tier) {
  const capacity = tier.familyRoom ? occupancy.familyRoomCapacity : occupancy.standardRoomCapacity;
  const freeUnderAge = tier.familyRoom ? tier.childSleepFreeUnderAge ?? 0 : 0;

  let sleepers = request.adults;

  for (const child of request.children) {
    const age = child.age;

    if (age !== null && age !== undefined && age < freeUnderAge) {
      continue;
    }

    sleepers += 1;
  }

  return Math.max(1, Math.ceil(sleepers / capacity));
}

function accommodationCost(request, destination, tier, month) {
  const rooms = roomsRequired(request, tier);
  const seasonMultiplier = monthIndex(destination, month);
  const nightlyRate = tier.nightlyPerRoomYen * seasonMultiplier;

  return {
    yen: round(rooms * request.nights * nightlyRate),
    rooms,
    nights: request.nights,
    nightlyPerRoomYen: round(nightlyRate),
    seasonMultiplier,
  };
}

function mealCost(request, destination, tier) {
  const party = classifyPartyForSpend(request);
  const days = request.nights + 1;
  const dailyForParty =
    party.adults * destination.mealIndexYen * mealRates.adult +
    party.children * destination.mealIndexYen * mealRates.child +
    party.infants * destination.mealIndexYen * mealRates.infant;

  const gross = dailyForParty * days;

  // An included breakfast is a real discount on food spend, and it is the single most common
  // reason a slightly dearer room is the better buy. Modelling it is what lets the engine
  // recommend the ¥52,000 hotel over the ¥45,000 one.
  const breakfastPeople = party.adults + party.children;
  const breakfastCredit =
    (tier.breakfastIncludedRate ?? 0) *
    request.nights *
    breakfastPeople *
    destination.mealIndexYen *
    includedBreakfastShare;

  return {
    yen: round(Math.max(0, gross - breakfastCredit)),
    grossYen: round(gross),
    includedBreakfastCreditYen: round(breakfastCredit),
    days,
  };
}

function localTransportCost(request, destination, route) {
  const local = destination.localTransport;
  const days = request.nights + 1;
  const partySize = request.adults + request.children.length;
  const constraints = request.constraints || {};

  const drivingOwnCar = route.mode === "car";
  const wantsCar = !constraints.noCar && (constraints.car || local.carRecommended);
  const useCar = drivingOwnCar || wantsCar;

  if (!useCar) {
    const party = classifyPartyForSpend(request);
    const daily =
      party.adults * local.dailyTransitYen +
      party.children * local.dailyTransitYen * 0.5;

    return { yen: round(daily * days), mode: "transit", days };
  }

  const parking = local.parkingDailyYen * request.nights;
  const fuelAndTolls = local.fuelTollsDailyYen * days;

  if (drivingOwnCar) {
    // Long-distance tolls and fuel are already counted in the route's vehicle cost.
    return { yen: round(parking + fuelAndTolls), mode: "own-car", days };
  }

  const sizeMultiplier = partySize > rentalCar.compactCapacity ? rentalCar.largeVehicleSurcharge : 1;
  const rental = local.rentalCarDailyYen * days * sizeMultiplier;

  return { yen: round(rental + parking + fuelAndTolls), mode: "rental-car", days, sizeMultiplier };
}

function activityCost(request, destination) {
  const party = classifyPartyForSpend(request);
  const constraints = request.constraints || {};
  const multiplier = activityLevelMultipliers[constraints.activityLevel] ?? activityLevelMultipliers.medium;

  // Arrival and departure days are mostly consumed by travel, so not every day carries a
  // full day of paid activities.
  const activeDays = Math.max(1, Math.round((request.nights + 1) * activeDayShare));
  const daily =
    party.adults * destination.activities.adultDayRateYen +
    party.children * destination.activities.childDayRateYen;

  return { yen: round(daily * multiplier * activeDays), activeDays, multiplier };
}

/**
 * Estimates the full cost of one trip configuration.
 *
 * @param {object} request Structured trip request.
 * @param {object} destination Destination record.
 * @param {object} route One access route for the request's origin.
 * @param {object} tier Hotel tier record.
 * @returns {object} Cost breakdown with a total and an honest range.
 */
export function estimateTripCost(request, destination, route, tier) {
  const month = request.month;

  const transport = transportCost(request, destination, route, month);
  const accommodation = accommodationCost(request, destination, tier, month);
  const meals = mealCost(request, destination, tier);
  const local = localTransportCost(request, destination, route);
  const activities = activityCost(request, destination);

  const subtotal = transport.yen + accommodation.yen + meals.yen + local.yen + activities.yen;
  const contingency = round(subtotal * contingencyRate);
  const totalYen = subtotal + contingency;
  const partySize = request.adults + request.children.length;

  return {
    transport,
    accommodation,
    meals,
    localTransport: local,
    activities,
    contingencyYen: contingency,
    subtotalYen: subtotal,
    totalYen,
    rangeYen: {
      low: round(totalYen * estimateBand.low),
      high: round(totalYen * estimateBand.high),
    },
    perPersonYen: round(totalYen / Math.max(1, partySize)),
    perNightYen: request.nights > 0 ? round(totalYen / request.nights) : totalYen,
    breakdown: [
      { key: "transport", yen: transport.yen },
      { key: "accommodation", yen: accommodation.yen },
      { key: "meals", yen: meals.yen },
      { key: "localTransport", yen: local.yen },
      { key: "activities", yen: activities.yen },
      { key: "contingency", yen: contingency },
    ],
  };
}
