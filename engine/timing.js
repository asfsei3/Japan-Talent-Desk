/**
 * When to go.
 *
 * The engine already knows two things about every month: what the trip costs (destination price
 * indices, applied to air fares and lodging) and how well the month suits what the traveller
 * asked to do (interest seasonality). Holding those apart and then comparing them is the whole
 * feature — moving an Okinawa trip from August to September can save six figures for a family
 * of four, and nothing else in the market will tell you that at the moment you are deciding.
 *
 * The rule that makes the advice trustworthy: a cheaper month is only suggested if it is still
 * a suitable month. Okinawa is cheapest in January, and telling a family who asked for a beach
 * to go then would be technically correct and completely useless.
 */

import { estimateTripCost } from "./cost-model.js";
import { seasonalSuitability } from "./scoring.js";

/** A suggested month must be at least this share as suitable as the one originally asked for. */
const SUITABILITY_FLOOR = 0.9;

/** Below this saving, shifting a family's dates is not worth suggesting. */
const MINIMUM_SAVING_RATE = 0.05;

/** How many months either side counts as a realistic shift for someone with fixed leave. */
const NEARBY_WINDOW = 2;

function monthDistance(from, to) {
  const raw = Math.abs(from - to);

  return Math.min(raw, 12 - raw);
}

/**
 * Costs the same trip in every month of the year and reports which months are worth considering.
 *
 * @param {object} request Structured trip request. Timing advice needs `request.month` set.
 * @param {object} destination Destination record.
 * @param {object} route The chosen access route.
 * @param {object} tier The chosen hotel tier.
 * @returns {object|null} Timing analysis, or null when there is no month to compare against.
 */
export function analyzeTiming(request, destination, route, tier) {
  if (!request.month) {
    return null;
  }

  const months = [];

  for (let month = 1; month <= 12; month += 1) {
    const cost = estimateTripCost({ ...request, month }, destination, route, tier);

    months.push({
      month,
      totalYen: cost.totalYen,
      suitability: Number(seasonalSuitability(request, month).toFixed(3)),
    });
  }

  const requested = months.find((entry) => entry.month === request.month);
  const cheapest = [...months].sort((a, b) => a.totalYen - b.totalYen)[0];

  const qualifying = months
    .filter((entry) => entry.month !== request.month)
    .filter((entry) => entry.suitability >= requested.suitability * SUITABILITY_FLOOR)
    .filter((entry) => entry.totalYen <= requested.totalYen * (1 - MINIMUM_SAVING_RATE))
    .map((entry) => ({
      ...entry,
      savingsYen: requested.totalYen - entry.totalYen,
      savingsRate: (requested.totalYen - entry.totalYen) / requested.totalYen,
      monthsAway: monthDistance(request.month, entry.month),
    }))
    .sort((a, b) => b.savingsYen - a.savingsYen);

  const nearby = qualifying.filter((entry) => entry.monthsAway <= NEARBY_WINDOW);

  // A shift a month or two away is advice someone with fixed school holidays can actually act
  // on, so it leads even when a distant month saves more.
  const suggestion = nearby[0] || qualifying[0] || null;

  return {
    requestedMonth: request.month,
    requestedTotalYen: requested.totalYen,
    requestedSuitability: requested.suitability,
    cheapestMonth: { month: cheapest.month, totalYen: cheapest.totalYen, suitability: cheapest.suitability },
    months,
    alternatives: qualifying.slice(0, 3),
    suggestion: suggestion
      ? {
          ...suggestion,
          note: destination.seasonNotes?.[suggestion.month] ?? null,
          message: buildMessage(suggestion),
        }
      : null,
  };
}

function buildMessage(suggestion) {
  const savings = `¥${Math.round(suggestion.savingsYen).toLocaleString("ja-JP")}`;
  const percentage = Math.round(suggestion.savingsRate * 100);

  return {
    ja: `${suggestion.month}月にずらせるなら、同じ条件で約${savings}（${percentage}%）安くなります。希望されたテーマの季節条件はほぼ変わりません。`,
    en: `Shifting to month ${suggestion.month} would save about ${savings} (${percentage}%) on the same trip, with essentially the same seasonal conditions for what you asked for.`,
  };
}
