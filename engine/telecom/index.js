/**
 * Telecom Optimization MVP — public entry point.
 *
 * "通信費見直し診断" per docs/telecom/README.md: given current spend and
 * usage (per line, optionally several lines for a household), recommend
 * cheaper plans from a curated dataset and show the estimated annual
 * savings. No live pricing, no scraping — see docs/telecom/README.md.
 */
import { ASOF, PLANS } from "./plans.js";
import { recommendForHousehold } from "./recommend.js";

const MAX_LINES = 8;
const MAX_FEE_YEN = 200_000;
const MAX_DATA_GB = 1000;
const VALID_CALL_NEEDS = new Set(["none", "5min", "unlimited"]);

function parseLine(raw) {
  const carrierLabel = String(raw?.carrierLabel ?? "").slice(0, 60).trim();
  const currentMonthlyFeeYen = Number(raw?.currentMonthlyFeeYen);
  const dataUsageGB = Number(raw?.dataUsageGB);
  const callNeed = VALID_CALL_NEEDS.has(raw?.callNeed) ? raw.callNeed : "none";

  if (!Number.isFinite(currentMonthlyFeeYen) || currentMonthlyFeeYen < 0 || currentMonthlyFeeYen > MAX_FEE_YEN) {
    return { error: "現在の月額料金を正しく入力してください。" };
  }
  if (!Number.isFinite(dataUsageGB) || dataUsageGB < 0 || dataUsageGB > MAX_DATA_GB) {
    return { error: "月間データ使用量を正しく入力してください。" };
  }

  return { line: { carrierLabel, currentMonthlyFeeYen, dataUsageGB, callNeed } };
}

/**
 * @param {Array<object>} rawLines - untrusted input, one entry per phone line.
 * @returns {{ ok: true, asOf: string, result: object } | { ok: false, message: string }}
 */
export function diagnose(rawLines) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { ok: false, message: "少なくとも1回線分の情報を入力してください。" };
  }
  if (rawLines.length > MAX_LINES) {
    return { ok: false, message: `一度に診断できるのは${MAX_LINES}回線までです。` };
  }

  const lines = [];
  for (const raw of rawLines) {
    const { line, error } = parseLine(raw);
    if (error) return { ok: false, message: error };
    lines.push(line);
  }

  const result = recommendForHousehold(PLANS, lines);
  return { ok: true, asOf: ASOF, result };
}

export { PLANS, ASOF } from "./plans.js";
export { recommendForHousehold, recommendForLine, carrierGroupFromLabel } from "./recommend.js";
