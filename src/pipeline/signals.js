/**
 * Signals: transfer signal, Japan Market Score, momentum, commercial estimates.
 *
 * Everything in this file is arithmetic over stored, measured inputs. No value
 * here is ever produced by a model — an LLM may extract the facts that feed it,
 * but the numbers themselves must be reproducible from the database alone.
 *
 * Two rules shape the whole design:
 *   - a missing input is EXCLUDED and lowers `coverage`; it is never imputed,
 *     because a guessed input is indistinguishable from a measured one once it
 *     is inside a score;
 *   - the score is expressed over the weight actually covered, so a data gap
 *     shows up as low coverage rather than as a confidently low score.
 */
import { SOURCE_TIERS, bandFor, config, confidenceRank } from "../config/index.js";
import { all, get, run, upsert } from "../db/client.js";
import { createLogger } from "../lib/logger.js";
import { dateDaysAgo, decayFactor, isoDaysAgo, monthsUntil, todayInTimezone } from "../lib/time.js";

const log = createLogger("signals");

/** Saturation points: the raw value at which a component scores full marks. */
const REPORT_VOLUME_SATURATION = 5;
const CLUBS_LINKED_SATURATION = 3;
const PLAYER_SIDE_SATURATION = 2;
const CLUB_SITUATION_SATURATION = 2;

/** Personal terms and negotiation stages are the player-side tell we can measure. */
const PLAYER_SIDE_SUBTYPES = new Set(["agreement", "talks"]);

/** Japan Market Score component -> the metric key that measures it. */
const METRIC_KEYS = {
  japanSocialAudience: "jp_social_followers",
  socialGrowth30d: "jp_social_growth_30d",
  japanMediaMentions30d: "jp_media_mentions_30d",
  japanSearchInterest: "jp_search_interest",
  nationalTeamRelevance: "jp_national_team_relevance",
  leagueVisibilityInJapan: "jp_league_visibility",
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Score over the weight we could actually measure. `coverage` is returned
 * alongside so no caller can show the number without showing how complete it is.
 */
function assemble(inputs, bands) {
  let points = 0;
  let coveredWeight = 0;
  let totalWeight = 0;

  for (const entry of Object.values(inputs)) {
    totalWeight += entry.weight;
    if (entry.raw === null) continue;
    coveredWeight += entry.weight;
    points += entry.points;
  }

  const score = coveredWeight > 0 ? round((points / coveredWeight) * 100) : 0;
  return {
    score,
    band: bandFor(bands, score).label,
    coverage: totalWeight > 0 ? round(coveredWeight / totalWeight, 3) : 0,
    inputs,
  };
}

function component(raw, normalized, weight) {
  return {
    raw,
    normalized: raw === null ? null : round(normalized, 3),
    weight,
    points: raw === null ? 0 : round(normalized * weight, 2),
  };
}

// ---------------------------------------------------------------------------
// Transfer signal
// ---------------------------------------------------------------------------

export function computeTransferSignal(playerId, { asOf } = {}) {
  const weights = config.transferSignal.weights;
  const now = asOf ? new Date(asOf) : new Date();
  const since = isoDaysAgo(config.transferSignal.windowDays, now);
  const player = get("SELECT * FROM players WHERE id = ?", playerId);

  const rows = all(
    `SELECT e.id, e.type, e.subtype, e.to_club_id, es.tier, COALESCE(es.published_at, es.detected_at) AS at
       FROM events e JOIN event_sources es ON es.event_id = e.id
      WHERE e.player_id = ? AND e.status = 'active' AND e.type IN ('transfer', 'contract')
        AND COALESCE(es.published_at, es.detected_at) >= ?`,
    playerId, since
  );

  const transferRows = rows.filter((row) => row.type === "transfer");
  const decayed = transferRows.map((row) => ({
    ...row,
    // Exponential decay: a report from three weeks ago is not news today.
    decay: decayFactor(Math.max(0, (now.getTime() - new Date(row.at).getTime()) / 86_400_000), config.transferSignal.halfLifeDays),
  }));

  const volume = decayed.reduce((sum, row) => sum + row.decay, 0);
  const qualityWeight = decayed.reduce((sum, row) => sum + row.decay * (SOURCE_TIERS[row.tier]?.weight ?? 0.25), 0);
  const clubs = new Set(transferRows.map((row) => row.to_club_id).filter(Boolean));
  const playerSide = decayed
    .filter((row) => PLAYER_SIDE_SUBTYPES.has(row.subtype))
    .reduce((sum, row) => sum + row.decay, 0);

  // Club situation is measured on the player's current club, so it can only be
  // computed when we know where the player is.
  let clubSituationRaw = null;
  if (player?.current_club_id) {
    const clubRows = all(
      `SELECT COALESCE(es.published_at, es.detected_at) AS at FROM events e
         JOIN event_sources es ON es.event_id = e.id
        WHERE e.status = 'active' AND e.type = 'club_situation'
          AND (e.club_id = ? OR e.from_club_id = ?)
          AND COALESCE(es.published_at, es.detected_at) >= ?`,
      player.current_club_id, player.current_club_id, since
    );
    clubSituationRaw = clubRows.reduce(
      (sum, row) => sum + decayFactor(Math.max(0, (now.getTime() - new Date(row.at).getTime()) / 86_400_000), config.transferSignal.halfLifeDays),
      0
    );
  }

  // Contract pressure is a stored date or nothing. An unknown contract end is
  // the single most common gap in Japanese-player data — never guessed.
  const months = player?.contract_until ? monthsUntil(player.contract_until, now) : null;
  const contractNormalized =
    months === null ? null : months <= 6 ? 1 : months <= 12 ? 0.75 : months <= 18 ? 0.5 : months <= 24 ? 0.25 : 0.1;

  const inputs = {
    reportVolume: component(round(volume, 2), clamp01(volume / REPORT_VOLUME_SATURATION), weights.reportVolume),
    sourceQuality: component(
      transferRows.length ? round(qualityWeight / Math.max(volume, 0.0001), 3) : 0,
      transferRows.length ? clamp01(qualityWeight / Math.max(volume, 0.0001)) : 0,
      weights.sourceQuality
    ),
    clubsLinked: component(clubs.size, clamp01(clubs.size / CLUBS_LINKED_SATURATION), weights.clubsLinked),
    contractPressure: component(
      months === null ? null : round(months, 1),
      contractNormalized ?? 0,
      weights.contractPressure
    ),
    playerSideSignal: component(round(playerSide, 2), clamp01(playerSide / PLAYER_SIDE_SATURATION), weights.playerSideSignal),
    clubSituation: component(
      clubSituationRaw === null ? null : round(clubSituationRaw, 2),
      clamp01((clubSituationRaw ?? 0) / CLUB_SITUATION_SATURATION),
      weights.clubSituation
    ),
  };

  return assemble(inputs, config.transferSignal.bands);
}

// ---------------------------------------------------------------------------
// Japan Market Score
// ---------------------------------------------------------------------------

function latestMetric(entityType, entityId, metricKey, asOfDate) {
  return get(
    `SELECT value, as_of_date, provider FROM metrics
      WHERE entity_type = ? AND entity_id = ? AND metric_key = ? AND as_of_date <= ?
      ORDER BY as_of_date DESC LIMIT 1`,
    entityType, entityId, metricKey, asOfDate
  );
}

function normalizeMetric(value, spec) {
  if (spec.scale === "log") {
    const min = Math.max(spec.min, 1);
    const clamped = Math.max(min, Math.min(spec.max, value));
    return clamp01((Math.log(clamped) - Math.log(min)) / (Math.log(spec.max) - Math.log(min)));
  }
  return clamp01((value - spec.min) / (spec.max - spec.min));
}

export function computeJapanMarketScore(playerId, { asOf } = {}) {
  const asOfDate = asOf ? String(asOf).slice(0, 10) : todayInTimezone();
  const player = get("SELECT * FROM players WHERE id = ?", playerId);
  const inputs = {};

  for (const [key, spec] of Object.entries(config.japanMarketScore.components)) {
    const metric = latestMetric("player", playerId, METRIC_KEYS[key], asOfDate);
    let value = metric?.value ?? null;

    // League visibility in Japan is measured reference data we already hold, so
    // reading it from the league row is a lookup, not an imputation.
    if (value === null && key === "leagueVisibilityInJapan" && player?.league_id) {
      value = get("SELECT jp_visibility FROM leagues WHERE id = ?", player.league_id)?.jp_visibility ?? null;
    }

    inputs[key] = component(value, value === null ? 0 : normalizeMetric(value, spec), spec.weight);
  }

  const result = assemble(inputs, config.japanMarketScore.bands);
  const provisional = result.coverage < config.japanMarketScore.minCoverage;

  // Provisional is carried on the object itself so a caller cannot render the
  // score without also having the flag in hand.
  return { ...result, provisional, asOfDate };
}

// ---------------------------------------------------------------------------
// Persistence and momentum
// ---------------------------------------------------------------------------

function writeSignal({ entityId, signalType, result, asOfDate }) {
  upsert(
    "signals",
    {
      entity_type: "player",
      entity_id: entityId,
      signal_type: signalType,
      score: result.score,
      band: result.band,
      coverage: result.coverage,
      inputs: JSON.stringify({ ...result.inputs, provisional: result.provisional ?? false }),
      computed_at: new Date().toISOString(),
    },
    ["entity_type", "entity_id", "signal_type"]
  );

  upsert(
    "signal_history",
    {
      entity_type: "player",
      entity_id: entityId,
      signal_type: signalType,
      score: result.score,
      band: result.band,
      as_of_date: asOfDate,
    },
    ["entity_type", "entity_id", "signal_type", "as_of_date"]
  );
}

export function recomputeSignals({ playerIds, asOfDate } = {}) {
  const date = asOfDate ?? todayInTimezone();
  const ids = playerIds?.length
    ? playerIds
    : all("SELECT id FROM players WHERE tracked = 1 AND status = 'active'").map((row) => row.id);

  let transferUpdated = 0;
  let japanMarketUpdated = 0;

  for (const id of ids) {
    writeSignal({ entityId: id, signalType: "transfer", result: computeTransferSignal(id, { asOf: date }), asOfDate: date });
    transferUpdated += 1;
    writeSignal({ entityId: id, signalType: "japan_market", result: computeJapanMarketScore(id, { asOf: date }), asOfDate: date });
    japanMarketUpdated += 1;
  }

  log.info("signals recomputed", { players: ids.length, asOfDate: date });
  return { players: ids.length, transferUpdated, japanMarketUpdated };
}

/**
 * Momentum needs a baseline. Without one it returns null rather than comparing
 * against zero — a player we started tracking yesterday must never look like a
 * player whose signal surged.
 */
export function getMomentum(playerId, signalType = "transfer", windowDays = config.transferSignal.momentumWindowDays) {
  const current = get(
    "SELECT score, band FROM signals WHERE entity_type = 'player' AND entity_id = ? AND signal_type = ?",
    playerId, signalType
  );
  if (!current) return null;

  const previous = get(
    `SELECT score, band, as_of_date FROM signal_history
      WHERE entity_type = 'player' AND entity_id = ? AND signal_type = ? AND as_of_date <= ?
      ORDER BY as_of_date DESC LIMIT 1`,
    playerId, signalType, dateDaysAgo(windowDays)
  );
  if (!previous) return null;

  const deltaPoints = round(current.score - previous.score);
  return {
    current: current.score,
    previous: previous.score,
    deltaPoints,
    deltaPct: previous.score > 0 ? round((deltaPoints / previous.score) * 100) : null,
    direction: deltaPoints > 0 ? "up" : deltaPoints < 0 ? "down" : "flat",
    since: previous.as_of_date,
    windowDays,
  };
}

// ---------------------------------------------------------------------------
// Commercial estimate — a range with named drivers, never a point estimate
// ---------------------------------------------------------------------------

/**
 * "Signing this player sells N shirts" is exactly the claim this product
 * refuses to make. With benchmark studies we publish the observed range; with
 * none we publish a band and nothing else. There is no middle option where a
 * number gets invented to fill the gap.
 */
export function computeCommercialEstimate(playerId, { clubId = null, market = "JP", metricKey = "jp_audience_uplift" } = {}) {
  const japanMarket = computeJapanMarketScore(playerId);
  const benchmarks = all(
    `SELECT id, player_id, club_id, delta_pct, confidence, window_days FROM market_impact_studies
      WHERE market = ? AND metric_key = ? AND delta_pct IS NOT NULL`,
    market, metricKey
  );

  const usable = benchmarks.filter((row) => Number.isFinite(row.delta_pct));
  const band = japanMarket.band.replace(/\s+/g, "_");
  const measured = Object.entries(japanMarket.inputs)
    .filter(([, entry]) => entry.raw !== null)
    .map(([key]) => key);

  let low = null;
  let high = null;
  let unit = null;
  let confidence = "unverified";

  if (usable.length >= 2) {
    low = Math.min(...usable.map((row) => row.delta_pct));
    high = Math.max(...usable.map((row) => row.delta_pct));
    unit = "pct_change";
    // The range is only as good as its weakest benchmark.
    confidence = usable.reduce(
      (worst, row) => (confidenceRank(row.confidence) < confidenceRank(worst) ? row.confidence : worst),
      "confirmed"
    );
  }

  const basis = {
    rule: usable.length >= 2
      ? "range = min/max observed delta across matching market impact studies"
      : "no benchmark studies available: band only, no range",
    japanMarketScore: { score: japanMarket.score, coverage: japanMarket.coverage, provisional: japanMarket.provisional },
    metricsUsed: measured,
    benchmarks: usable.map((row) => ({ id: row.id, playerId: row.player_id, deltaPct: row.delta_pct, confidence: row.confidence })),
  };

  // SQLite treats NULLs as distinct in a UNIQUE index, so a club-less estimate
  // would never hit the ON CONFLICT target. Replace by key instead of upserting.
  run(
    `DELETE FROM commercial_estimates
      WHERE entity_type = 'player' AND entity_id = ? AND club_id IS ? AND market = ? AND metric_key = ?`,
    playerId, clubId, market, metricKey
  );
  run(
    `INSERT INTO commercial_estimates
        (entity_type, entity_id, club_id, market, metric_key, low, high, unit, band, basis, confidence)
     VALUES ('player', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    playerId, clubId, market, metricKey, low, high, unit, band, JSON.stringify(basis), confidence
  );

  return { playerId, clubId, market, metricKey, low, high, unit, band, confidence, basis, provisional: japanMarket.provisional };
}

export default { computeTransferSignal, computeJapanMarketScore, recomputeSignals, getMomentum, computeCommercialEstimate };
