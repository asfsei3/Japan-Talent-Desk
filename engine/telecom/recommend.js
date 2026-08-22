/**
 * Telecom Optimization MVP — recommendation engine.
 *
 * Pure functions over the curated plan dataset (plans.js). Given one line's
 * current spend and usage, finds the cheapest plan that covers the data
 * usage and the requested call tier, plus a "balanced" pick (curated for
 * support/network reliability, not just price) and — when the current
 * carrier is recognized — the cheapest plan within that same carrier group,
 * so a user can see "just switch plans, keep your carrier" as an option.
 */

const CALL_LEVEL = { none: 0, "5min": 1, unlimited: 2 };

export function carrierGroupFromLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) return null;
  if (/(^|[^a-z])(docomo|irumo|ahamo)([^a-z]|$)|ドコモ/.test(normalized)) return "docomo";
  if (/(^|[^a-z])(au|povo|uq)([^a-z]|$)|エーユー|ユーキュー/.test(normalized)) return "au";
  if (/softbank|ソフトバンク|linemo|ymobile|y!mobile|ワイモバイル/.test(normalized)) return "softbank";
  if (/rakuten|楽天/.test(normalized)) return "rakuten";
  return "mvno";
}

/** Total monthly cost of a plan for a given call-usage need, including any required add-on. */
export function planTotalCost(plan, callNeed) {
  const needLevel = CALL_LEVEL[callNeed] ?? 0;
  const bundleLevel = CALL_LEVEL[plan.callBundle] ?? 0;

  if (needLevel <= bundleLevel) {
    return plan.monthlyFeeYen;
  }

  if (needLevel === CALL_LEVEL["5min"]) {
    const addOn = plan.addOn5MinYen ?? plan.addOnUnlimitedYen;
    return addOn == null ? null : plan.monthlyFeeYen + addOn;
  }

  // needLevel === unlimited
  const addOn = plan.addOnUnlimitedYen;
  return addOn == null ? null : plan.monthlyFeeYen + addOn;
}

/** Plans that cover the requested data usage and support the requested call tier, priced and sorted cheapest-first. */
export function eligiblePlans(plans, { dataUsageGB, callNeed }) {
  return plans
    .map((plan) => ({ plan, totalCost: planTotalCost(plan, callNeed) }))
    .filter(({ plan, totalCost }) => totalCost !== null && plan.dataGB >= dataUsageGB)
    .sort((a, b) => a.totalCost - b.totalCost);
}

/**
 * Recommend for a single line.
 * @param {object} line - { carrierLabel, currentMonthlyFeeYen, dataUsageGB, callNeed }
 */
export function recommendForLine(plans, line) {
  const { carrierLabel, currentMonthlyFeeYen, dataUsageGB, callNeed } = line;
  const priced = eligiblePlans(plans, { dataUsageGB, callNeed });

  const cheapest = priced[0] ?? null;
  const balanced = priced.find(({ plan }) => plan.balancedPick) ?? cheapest;

  const currentGroup = carrierGroupFromLabel(carrierLabel);
  const stayWithCarrier =
    currentGroup && currentGroup !== "mvno"
      ? priced.find(({ plan }) => plan.carrierGroup === currentGroup) ?? null
      : null;

  const annualSavings = (pick) =>
    pick ? Math.round((currentMonthlyFeeYen - pick.totalCost) * 12) : null;

  return {
    currentMonthlyFeeYen,
    dataUsageGB,
    callNeed,
    cheapest: cheapest && { ...cheapest, annualSavingsYen: annualSavings(cheapest) },
    balanced: balanced && { ...balanced, annualSavingsYen: annualSavings(balanced) },
    stayWithCarrier: stayWithCarrier && { ...stayWithCarrier, annualSavingsYen: annualSavings(stayWithCarrier) },
  };
}

/**
 * Recommend across a household of lines and sum up the totals.
 * @param {Array<object>} lines - each shaped like recommendForLine's `line` param.
 */
export function recommendForHousehold(plans, lines) {
  const perLine = lines.map((line) => recommendForLine(plans, line));

  const sum = (pickKey) =>
    perLine.reduce((total, line) => {
      const pick = line[pickKey];
      return pick ? total + pick.totalCost : total;
    }, 0);

  const currentTotalMonthlyYen = perLine.reduce((total, line) => total + line.currentMonthlyFeeYen, 0);
  const cheapestTotalMonthlyYen = sum("cheapest");
  const balancedTotalMonthlyYen = sum("balanced");

  return {
    perLine,
    currentTotalMonthlyYen,
    cheapestTotalMonthlyYen,
    balancedTotalMonthlyYen,
    cheapestAnnualSavingsYen: Math.round((currentTotalMonthlyYen - cheapestTotalMonthlyYen) * 12),
    balancedAnnualSavingsYen: Math.round((currentTotalMonthlyYen - balancedTotalMonthlyYen) * 12),
  };
}
