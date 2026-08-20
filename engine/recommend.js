/**
 * The recommendation pipeline.
 *
 * Enumerates every viable trip configuration — destination, route, and hotel tier — costs and
 * scores each one, then picks the best configuration per destination and ranks destinations
 * against each other. Optimising over configurations rather than destinations alone is what
 * lets the engine answer "Okinawa on a budget hotel beats Hakone on a family room" instead of
 * comparing headline prices.
 */

import { destinations as allDestinations } from "./data/destinations.js";
import { estimateTripCost } from "./cost-model.js";
import {
  budgetScore,
  compositeScore,
  convenienceScore,
  comfortScore,
  familyScore,
  interestScore,
  resolveWeights,
  timeScore,
  scoringInternals,
} from "./scoring.js";
import { explainCandidate } from "./explain.js";
import { analyzeTiming } from "./timing.js";
import { buildBookingLinks } from "./affiliate.js";

const tierNames = ["budget", "standard", "family"];

function median(values) {
  if (values.length === 0) {
    return 1;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function buildConfigurations(request, destinations) {
  const configurations = [];

  for (const destination of destinations) {
    const routes = destination.access?.[request.originId];

    if (!routes || routes.length === 0) {
      continue;
    }

    for (const route of routes) {
      for (const tierName of tierNames) {
        const tier = destination.hotels[tierName];

        if (!tier) {
          continue;
        }

        const cost = estimateTripCost(request, destination, route, tier);
        cost.tierName = tierName;

        configurations.push({
          destination,
          route,
          tier,
          tierName,
          cost,
          scores: {
            interest: interestScore(request, destination),
            budget: budgetScore(request, cost.totalYen),
            time: timeScore(request, route),
            convenience: convenienceScore(request, destination, route, cost),
            family: familyScore(request, destination, route, tier),
            comfort: comfortScore(request, destination, tier, cost),
          },
        });
      }
    }
  }

  return configurations;
}

/**
 * Value is satisfaction per yen, and it only means anything relative to the other options on
 * the table, so it is computed once the whole candidate set is known and then normalised.
 */
function applyValueScores(configurations) {
  const medianTotal = median(configurations.map((configuration) => configuration.cost.totalYen));
  const rawValues = configurations.map((configuration) => {
    const costIndex = configuration.cost.totalYen / medianTotal;

    return configuration.scores.interest / Math.max(0.2, costIndex);
  });

  const lowest = Math.min(...rawValues);
  const highest = Math.max(...rawValues);
  const span = highest - lowest;

  configurations.forEach((configuration, index) => {
    configuration.scores.value = span === 0 ? 70 : ((rawValues[index] - lowest) / span) * 100;
  });
}

function bestConfigurationPerDestination(configurations) {
  const bestByDestination = new Map();

  for (const configuration of configurations) {
    const current = bestByDestination.get(configuration.destination.id);

    if (!current || configuration.scores.composite > current.scores.composite) {
      bestByDestination.set(configuration.destination.id, configuration);
    }
  }

  return [...bestByDestination.values()];
}

function alternativesFor(candidate, configurations) {
  return configurations
    .filter(
      (configuration) =>
        configuration.destination.id === candidate.destination.id &&
        (configuration.tierName !== candidate.tierName || configuration.route !== candidate.route)
    )
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, 2)
    .map((configuration) => ({
      tierName: configuration.tierName,
      route: configuration.route.label,
      totalYen: configuration.cost.totalYen,
      compositeScore: Math.round(configuration.scores.composite),
    }));
}

/**
 * Picks the winner for each output category.
 *
 * A destination may win more than one category — if Okinawa is both the best overall trip and
 * the best beach, saying so is more useful than manufacturing variety.
 */
function pickCategories(request, ranked, configurations) {
  const categories = [];

  if (ranked.length === 0) {
    return categories;
  }

  categories.push({ key: "overall", label: { ja: "総合ベスト", en: "Best Overall" }, candidate: ranked[0] });

  // Themed picks are chosen from what the stated budget can actually buy. Naming a ¥345,000
  // beach trip as "Best Beach" to someone with ¥150,000 is technically true and useless.
  const affordable = request.budgetYen ? ranked.filter((candidate) => candidate.cost.totalYen <= request.budgetYen) : ranked;

  // When nothing fits the stated budget, fall back to the cheapest options rather than the
  // whole list. Otherwise a themed pick optimises its own axis freely and answers a ¥50,000
  // question with a ¥190,000 trip.
  const pool =
    affordable.length > 0
      ? affordable
      : [...ranked].sort((a, b) => a.cost.totalYen - b.cost.totalYen).slice(0, 5);

  // Picks that optimise their own axis — family suitability, ease of travel — must still
  // respect what was actually asked for. Without this floor, a beach request could be answered
  // with a landlocked highland resort purely because it scores well with children, which
  // ignores the one thing the user actually stated.
  const bestPoolInterest = Math.max(...pool.map((candidate) => candidate.scores.interest));
  const relevantPool = pool.filter((candidate) => candidate.scores.interest >= bestPoolInterest * 0.5);
  const themedPool = relevantPool.length > 0 ? relevantPool : pool;

  // The budget pick searches every configuration, not just the per-destination winners, so it
  // can surface a cheaper hotel tier that the composite passed over. It still has to be a trip
  // the user would want: anything scoring far below the best available interest match is a
  // cheap trip to the wrong place, which is not the same thing as good value.
  const bestInterest = Math.max(...configurations.map((configuration) => configuration.scores.interest));
  const relevant = configurations.filter((configuration) => configuration.scores.interest >= bestInterest * 0.7);
  const cheapest = [...(relevant.length > 0 ? relevant : configurations)].sort(
    (a, b) => a.cost.totalYen - b.cost.totalYen
  )[0];

  if (cheapest) {
    categories.push({ key: "budget", label: { ja: "コスパ重視", en: "Best Budget" }, candidate: cheapest });
  }

  if (request.children.length > 0) {
    const family = [...themedPool].sort((a, b) => (b.scores.family ?? 0) - (a.scores.family ?? 0))[0];

    if (family) {
      categories.push({ key: "family", label: { ja: "家族連れベスト", en: "Best for Families" }, candidate: family });
    }
  }

  if (request.constraints?.easyTransport) {
    const easy = [...themedPool].sort(
      (a, b) => b.scores.time + b.scores.convenience - (a.scores.time + a.scores.convenience)
    )[0];

    if (easy) {
      categories.push({ key: "easy", label: { ja: "移動が楽", en: "Easiest Travel" }, candidate: easy });
    }
  }

  for (const tag of request.interests || []) {
    const seasonal = request.month ? scoringInternals.interestSeasonality[tag]?.[request.month - 1] ?? 1 : 1;
    const best = [...pool].sort(
      (a, b) =>
        (b.destination.interests?.[tag] ?? 0) * seasonal - (a.destination.interests?.[tag] ?? 0) * seasonal
    )[0];

    if (best && (best.destination.interests?.[tag] ?? 0) > 0) {
      categories.push({ key: tag, label: interestCategoryLabel(tag), candidate: best });
    }
  }

  return categories;
}

function interestCategoryLabel(tag) {
  const labels = {
    beach: { ja: "海ベスト", en: "Best Beach" },
    onsen: { ja: "温泉ベスト", en: "Best Onsen" },
    snow: { ja: "雪ベスト", en: "Best Snow" },
    themepark: { ja: "テーマパークベスト", en: "Best Theme Park" },
    nature: { ja: "自然ベスト", en: "Best Nature" },
    city: { ja: "街歩きベスト", en: "Best City" },
    food: { ja: "グルメベスト", en: "Best Food" },
    culture: { ja: "歴史・文化ベスト", en: "Best Culture" },
    resort: { ja: "リゾートベスト", en: "Best Resort" },
    shopping: { ja: "買い物ベスト", en: "Best Shopping" },
  };

  return labels[tag] || { ja: tag, en: tag };
}

function presentCandidate(request, candidate, configurations, categoryKey, affiliateConfig) {
  return {
    destinationId: candidate.destination.id,
    name: candidate.destination.name,
    prefecture: candidate.destination.prefecture,
    summary: candidate.destination.summary,
    tierName: candidate.tierName,
    route: {
      mode: candidate.route.mode,
      label: candidate.route.label,
      doorToDoorMinutes: candidate.route.doorToDoorMinutes,
      transfers: candidate.route.transfers,
    },
    cost: candidate.cost,
    scores: {
      travelValue: Math.round(candidate.scores.composite),
      interest: Math.round(candidate.scores.interest),
      budget: candidate.scores.budget === null ? null : Math.round(candidate.scores.budget),
      time: Math.round(candidate.scores.time),
      convenience: Math.round(candidate.scores.convenience),
      family: candidate.scores.family === null ? null : Math.round(candidate.scores.family),
      value: Math.round(candidate.scores.value),
      comfort: Math.round(candidate.scores.comfort),
    },
    withinBudget: request.budgetYen ? candidate.cost.totalYen <= request.budgetYen : null,
    explanation: explainCandidate(request, candidate, categoryKey),
    timing: analyzeTiming(request, candidate.destination, candidate.route, candidate.tier),
    alternatives: alternativesFor(candidate, configurations),
    bookingLinks: buildBookingLinks(candidate, affiliateConfig),
    provenance: candidate.destination.provenance,
  };
}

/**
 * Runs the full decision pipeline.
 *
 * @param {object} request A structured request from `parseTripRequest`.
 * @param {object} [options]
 * @param {object} [options.affiliateConfig] Affiliate identifiers for the link layer.
 * @param {object[]} [options.destinations] Destination set, overridable for testing.
 * @param {number} [options.limit] How many ranked destinations to return.
 * @returns {object} Categories, the full ranking, and the weights used.
 */
export function recommendTrips(request, options = {}) {
  const affiliateConfig = options.affiliateConfig || {};
  const destinations = options.destinations || allDestinations;
  const limit = options.limit ?? 8;

  if (!request.originId) {
    return {
      ok: false,
      reason: "origin-unsupported",
      message: {
        ja: "出発地を判別できませんでした。現在は東京・大阪・名古屋発に対応しています。",
        en: "Could not determine a supported departure city. Tokyo, Osaka, and Nagoya are supported today.",
      },
      categories: [],
      ranked: [],
    };
  }

  const configurations = buildConfigurations(request, destinations);

  if (configurations.length === 0) {
    return {
      ok: false,
      reason: "no-routes",
      message: {
        ja: "この出発地に対応する行き先データがまだありません。",
        en: "No destination routes are available for this departure city yet.",
      },
      categories: [],
      ranked: [],
    };
  }

  applyValueScores(configurations);

  const weights = resolveWeights(request);

  for (const configuration of configurations) {
    configuration.scores.composite = compositeScore(configuration.scores, weights);
  }

  const ranked = bestConfigurationPerDestination(configurations).sort(
    (a, b) => b.scores.composite - a.scores.composite
  );

  const categories = pickCategories(request, ranked, configurations).map((category) => ({
    key: category.key,
    label: category.label,
    recommendation: presentCandidate(request, category.candidate, configurations, category.key, affiliateConfig),
  }));

  const cheapestYen = Math.min(...configurations.map((configuration) => configuration.cost.totalYen));
  const budgetFit = request.budgetYen
    ? {
        feasible: cheapestYen <= request.budgetYen,
        cheapestYen,
        shortfallYen: Math.max(0, cheapestYen - request.budgetYen),
        message:
          cheapestYen <= request.budgetYen
            ? null
            : {
                ja: `ご予算${request.budgetYen.toLocaleString("ja-JP")}円では条件に合う行き先が見つかりませんでした。最も安い組み合わせでも約${cheapestYen.toLocaleString("ja-JP")}円かかります。泊数を減らすか、予算を見直すと選択肢が増えます。`,
                en: `No destination fits a ¥${request.budgetYen.toLocaleString("en-US")} budget. The cheapest workable combination is about ¥${cheapestYen.toLocaleString("en-US")}. Fewer nights or a higher budget opens up options.`,
              },
      }
    : null;

  return {
    ok: true,
    request,
    weights,
    budgetFit,
    categories,
    ranked: ranked
      .slice(0, limit)
      .map((candidate) => presentCandidate(request, candidate, configurations, "overall", affiliateConfig)),
    consideredDestinations: new Set(configurations.map((configuration) => configuration.destination.id)).size,
    consideredConfigurations: configurations.length,
    disclaimer: {
      ja: "表示金額はすべて概算の目安です。実際の価格は予約サイトでご確認ください。",
      en: "All figures are planning estimates. Confirm real prices at the booking provider.",
    },
  };
}
