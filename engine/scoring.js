/**
 * Travel Value Score and its components.
 *
 * The scoring layer answers "which of these trips is best for this particular party", which is
 * a different question from "which is cheapest". Each component is scored 0-100 and combined
 * with weights that adapt to the request: a party with children weights family suitability,
 * a request that asked for easy travel weights convenience and time.
 *
 * Design rule, enforced by review: **nothing in this module may read commission rates, affiliate
 * configuration, or booking-provider identity.** Ranking is computed before the affiliate layer
 * is aware of the result. See `docs/competitive-analysis.md` §6, Risk 4.
 */

import { roomsRequired } from "./cost-model.js";

/**
 * Seasonal suitability by interest, as a 0-1 multiplier per month, January first.
 *
 * Distinct from `priceIndexByMonth`, which is about cost. A beach is cheap in January because
 * nobody wants to swim then, and the engine has to understand both halves of that sentence.
 */
const interestSeasonality = {
  beach: [0.25, 0.25, 0.35, 0.5, 0.7, 0.9, 1.0, 1.0, 0.95, 0.7, 0.4, 0.25],
  onsen: [1.0, 1.0, 0.95, 0.85, 0.8, 0.75, 0.7, 0.7, 0.85, 0.95, 1.0, 1.0],
  snow: [1.0, 1.0, 0.85, 0.3, 0.08, 0.05, 0.05, 0.05, 0.05, 0.15, 0.4, 0.9],
  nature: [0.5, 0.5, 0.7, 0.9, 1.0, 0.85, 0.8, 0.8, 0.95, 1.0, 0.9, 0.55],
  themepark: [0.8, 0.8, 0.9, 0.95, 0.95, 0.85, 0.85, 0.85, 0.95, 1.0, 0.95, 0.85],
  culture: [0.8, 0.8, 0.95, 1.0, 0.95, 0.8, 0.8, 0.8, 0.9, 1.0, 1.0, 0.8],
  city: [0.9, 0.9, 0.95, 1.0, 1.0, 0.9, 0.9, 0.9, 0.95, 1.0, 1.0, 0.95],
  food: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1.0, 1.0, 1.0, 1.0],
  resort: [0.7, 0.7, 0.8, 0.9, 0.95, 0.9, 1.0, 1.0, 0.95, 0.9, 0.8, 0.75],
  shopping: [1.0, 0.95, 0.95, 0.95, 0.95, 0.95, 1.0, 0.95, 0.95, 0.95, 0.95, 1.0],
};

/** Age assumed for a child whose age was not supplied. School age is the commonest case. */
const ASSUMED_CHILD_AGE = 6;

function clamp(value, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value));
}

function mean(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function youngestChildAge(request) {
  if (request.children.length === 0) {
    return null;
  }

  const ages = request.children.map((child) => (child.age === null || child.age === undefined ? ASSUMED_CHILD_AGE : child.age));

  return Math.min(...ages);
}

/**
 * How well the destination matches what was asked for, adjusted for the month.
 *
 * A destination is rewarded for being outstanding at one requested thing rather than mediocre
 * at several, because a family that asked for a beach wants a good beach, not a compromise.
 */
export function interestScore(request, destination) {
  const requested = request.interests || [];
  const month = request.month;

  if (requested.length === 0) {
    const all = Object.values(destination.interests || {});
    const top = all.length ? Math.max(...all) : 0;

    return clamp(top * 0.6 + mean(all) * 0.4);
  }

  const matches = requested.map((tag) => {
    const strength = destination.interests?.[tag] ?? 0;
    const seasonal = month ? interestSeasonality[tag]?.[month - 1] ?? 1 : 1;

    return strength * seasonal;
  });

  const best = Math.max(...matches);

  return clamp(best * 0.6 + mean(matches) * 0.4);
}

/**
 * How well a month suits what the traveller asked to do, ignoring price entirely.
 *
 * Kept separate from cost so the two can disagree out loud: a beach is cheapest in January
 * precisely because nobody wants to swim then, and any advice to shift dates has to know that.
 *
 * @returns {number} 0-1, where 1 is fully in season for everything requested.
 */
export function seasonalSuitability(request, month) {
  const requested = request.interests || [];

  if (!month || requested.length === 0) {
    return 1;
  }

  const values = requested.map((tag) => interestSeasonality[tag]?.[month - 1] ?? 1);

  return mean(values);
}

/**
 * Budget fit.
 *
 * Deliberately not "cheapest wins". A trip that uses most of the stated budget is exactly what
 * was asked for; one that uses a fraction of it may be underwhelming. Going over budget is
 * penalised steeply, because the budget is usually a real constraint rather than a preference.
 */
export function budgetScore(request, totalYen) {
  if (!request.budgetYen) {
    return null;
  }

  const ratio = totalYen / request.budgetYen;

  if (ratio <= 0.45) {
    return 82;
  }

  if (ratio <= 0.7) {
    return 82 + ((ratio - 0.45) / 0.25) * 18;
  }

  if (ratio <= 1) {
    return 100;
  }

  if (ratio <= 1.15) {
    return clamp(100 - ((ratio - 1) / 0.15) * 55);
  }

  if (ratio <= 1.4) {
    return clamp(45 - ((ratio - 1.15) / 0.25) * 45);
  }

  return 0;
}

/**
 * Travel time relative to trip length.
 *
 * Six hours each way is fine for a week and absurd for one night, so this is scored as the
 * share of available waking time spent in transit rather than as absolute minutes.
 */
export function timeScore(request, route) {
  const wakingMinutesPerDay = 12 * 60;
  const tripMinutes = Math.max(1, (request.nights + 1) * wakingMinutesPerDay);
  const travelShare = (route.doorToDoorMinutes * 2) / tripMinutes;

  return clamp(100 - travelShare * 200);
}

/**
 * How much friction the trip involves: transfers, whether the destination works without a car,
 * and how much walking it demands.
 */
export function convenienceScore(request, destination, route, cost) {
  const local = destination.localTransport;
  const constraints = request.constraints || {};
  const usingCar = cost.localTransport.mode !== "transit";

  const transferScore = clamp(100 - route.transfers * 16);
  const groundScore = usingCar ? 78 : local.transitScore;
  const walkingScore = clamp(100 - destination.family.walkingIntensity);

  let score = transferScore * 0.45 + groundScore * 0.35 + walkingScore * 0.2;

  if (constraints.easyTransport) {
    score -= route.transfers * 6;
  }

  // Refusing to drive at a destination that assumes a car is the single biggest convenience
  // failure available, and no amount of good scenery compensates for it.
  if (constraints.noCar && local.carRecommended) {
    score = Math.min(score, 42);
  }

  if (constraints.stroller) {
    score -= (100 - destination.family.strollerFriendly) * 0.15;
  }

  return clamp(score);
}

/**
 * Family suitability.
 *
 * Returns null when no children are travelling, so the composite can drop the component
 * entirely rather than score everyone against an irrelevant axis.
 */
export function familyScore(request, destination, route, tier) {
  if (request.children.length === 0) {
    return null;
  }

  const youngest = youngestChildAge(request);
  const constraints = request.constraints || {};
  const family = destination.family;
  const activities = destination.activities;

  let score =
    activities.childFriendly * 0.26 +
    family.childMeals * 0.18 +
    family.strollerFriendly * 0.14 +
    activities.indoorOptions * 0.12 +
    clamp(100 - family.walkingIntensity) * 0.14 +
    clamp(100 - route.transfers * 18) * 0.16;

  // A long door-to-door journey is disproportionately hard with a toddler, and the penalty
  // has to scale with how young the youngest child is rather than apply flatly.
  const hours = route.doorToDoorMinutes / 60;
  const ageSensitivity = clamp((10 - youngest) / 10, 0, 1);
  score -= Math.max(0, hours - 2) * 6 * ageSensitivity;

  if (constraints.stroller) {
    score -= (100 - family.strollerFriendly) * 0.2;
  }

  // A room the family actually fits in, with young children sleeping free, is worth real points.
  if (tier.familyRoom) {
    score += 6;
  }

  if (roomsRequired(request, tier) > 1) {
    score -= 8;
  }

  return clamp(score);
}

/**
 * Comfort of the chosen lodging configuration.
 *
 * Without this component the engine has no reason to ever recommend anything but the cheapest
 * room, which is the exact failure the product is meant to avoid: a ¥52,000 room with breakfast
 * included, a family room, and no second booking can be the better buy over a ¥45,000 one. This
 * is what lets budget headroom translate into a better trip instead of just a smaller number.
 */
export function comfortScore(request, destination, tier, cost) {
  const tierBase = { budget: 45, standard: 72, family: 88 };
  let score = tierBase[cost.tierName] ?? 60;

  score += (tier.breakfastIncludedRate ?? 0) * 12;

  if (request.children.length > 0) {
    if (tier.familyRoom) {
      score += 8;
    }

    if (cost.accommodation.rooms > 1) {
      score -= 10;
    }
  }

  return clamp(score);
}

/**
 * Component weights, adapted to the request.
 *
 * Weights are data rather than magic numbers scattered through the composite so that the
 * trade-off the engine is making can be inspected, tested, and shown to the user.
 */
export function resolveWeights(request) {
  const constraints = request.constraints || {};
  const hasChildren = request.children.length > 0;
  const hasBudget = Boolean(request.budgetYen);

  const weights = {
    interest: 0.26,
    budget: 0.2,
    time: 0.14,
    convenience: 0.14,
    family: 0.16,
    value: 0.1,
    comfort: 0.1,
  };

  if (!hasChildren) {
    weights.interest += 0.06;
    weights.convenience += 0.06;
    weights.comfort += 0.04;
    weights.family = 0;
  }

  if (!hasBudget) {
    weights.value += 0.1;
    weights.interest += 0.1;
    weights.budget = 0;
  }

  if (constraints.easyTransport) {
    const shift = Math.min(0.1, weights.interest - 0.1);
    weights.interest -= shift;
    weights.convenience += shift * 0.6;
    weights.time += shift * 0.4;
  }

  if (constraints.walkingTolerance === "low") {
    const shift = Math.min(0.04, weights.interest - 0.1);
    weights.interest -= shift;
    weights.convenience += shift;
  }

  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);

  for (const key of Object.keys(weights)) {
    weights[key] /= total;
  }

  return weights;
}

/**
 * Combines component scores into the Travel Value Score.
 *
 * Components that are null (no budget stated, no children travelling) are dropped and their
 * weight is redistributed, so a missing input lowers confidence rather than the score.
 */
export function compositeScore(scores, weights) {
  let weighted = 0;
  let used = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const score = scores[key];

    if (score === null || score === undefined || weight === 0) {
      continue;
    }

    weighted += score * weight;
    used += weight;
  }

  if (used === 0) {
    return 0;
  }

  return clamp(weighted / used);
}

export const scoringInternals = { interestSeasonality, clamp, youngestChildAge, ASSUMED_CHILD_AGE };
