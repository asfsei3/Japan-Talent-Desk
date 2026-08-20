/**
 * Data access for the web layer.
 *
 * Two jobs, both about degrading honestly:
 *   1. Resolve `src/pipeline/intelligence.js` at request time. It is built by
 *      another agent and may not exist yet; when it is missing the web layer
 *      must render an explicit empty state, never invented content.
 *   2. Wrap direct SQL so an unmigrated or missing database produces an empty
 *      result and a `degraded` flag instead of a 500.
 */
import { all, get } from "../db/client.js";
import { createLogger } from "../lib/logger.js";
import { emptyIntelligence } from "./sample-data.js";

const log = createLogger("web");

let intelligencePromise = null;
let schemaState = null;

/** The three functions the web layer consumes, per the shared module contract. */
const REQUIRED = ["buildDailyBrief", "buildPlayerDossier", "buildTransferRadar"];

export function resetDataCaches() {
  intelligencePromise = null;
  schemaState = null;
}

/**
 * The real pipeline module always wins. `injected` exists so tests can drive the
 * views with contract-shaped fixtures without touching the pipeline.
 */
export async function getIntelligence(injected) {
  if (injected) return { module: injected, source: "injected", available: true };
  if (!intelligencePromise) intelligencePromise = loadIntelligence();
  return intelligencePromise;
}

async function loadIntelligence() {
  try {
    const module = await import("../pipeline/intelligence.js");
    const missing = REQUIRED.filter((name) => typeof module[name] !== "function");
    if (missing.length) {
      log.warn("intelligence module incomplete", { missing });
      return { module: emptyIntelligence(), source: "unavailable", available: false };
    }
    return { module, source: "pipeline", available: true };
  } catch (error) {
    // Expected before the pipeline agent lands the module; the pages say so.
    log.warn("intelligence module unavailable", { error: error?.message || String(error) });
    return { module: emptyIntelligence(), source: "unavailable", available: false };
  }
}

/** Cheap one-time probe so every query does not pay for its own try/catch story. */
export function schemaReady() {
  if (schemaState !== null) return schemaState;
  try {
    schemaState = Boolean(get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'players'"));
  } catch {
    schemaState = false;
  }
  return schemaState;
}

export function queryAll(sql, ...params) {
  if (!schemaReady()) return [];
  try {
    return all(sql, ...params);
  } catch (error) {
    log.error("query failed", { error: error?.message || String(error) });
    return [];
  }
}

export function queryOne(sql, ...params) {
  if (!schemaReady()) return null;
  try {
    return get(sql, ...params);
  } catch (error) {
    log.error("query failed", { error: error?.message || String(error) });
    return null;
  }
}

export function countOf(sql, ...params) {
  const row = queryOne(sql, ...params);
  return row ? Number(Object.values(row)[0] ?? 0) : 0;
}

const PLAYER_COLUMNS = `
  p.id, p.slug, p.name_en, p.name_ja, p.name_kana, p.position, p.position_detail,
  p.birth_date, p.nationality, p.contract_until, p.contract_confidence,
  p.national_team, p.national_team_caps, p.market_value_eur, p.market_value_source,
  p.data_status, p.notes,
  c.name_en AS club_name, c.slug AS club_slug,
  l.name_en AS league_name, l.slug AS league_slug, l.jp_visibility AS league_jp_visibility,
  ts.score AS transfer_score, ts.band AS transfer_band, ts.coverage AS transfer_coverage,
  jm.score AS japan_score, jm.band AS japan_band, jm.coverage AS japan_coverage`;

const PLAYER_JOINS = `
  FROM players p
  LEFT JOIN clubs c ON c.id = p.current_club_id
  LEFT JOIN leagues l ON l.id = p.league_id
  LEFT JOIN signals ts ON ts.entity_type = 'player' AND ts.entity_id = p.id AND ts.signal_type = 'transfer'
  LEFT JOIN signals jm ON jm.entity_type = 'player' AND jm.entity_id = p.id AND jm.signal_type = 'japan_market'`;

export function listPlayers({ league, position, query, limit = 200, offset = 0 } = {}) {
  const where = ["p.tracked = 1", "p.status = 'active'"];
  const params = [];

  if (league) {
    where.push("l.slug = ?");
    params.push(league);
  }
  if (position) {
    where.push("p.position = ?");
    params.push(position);
  }
  if (query) {
    where.push("(lower(p.name_en) LIKE ? OR p.name_ja LIKE ?)");
    params.push(`%${String(query).toLowerCase()}%`, `%${query}%`);
  }

  return queryAll(
    `SELECT ${PLAYER_COLUMNS} ${PLAYER_JOINS}
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(ts.score, -1) DESC, p.name_en
      LIMIT ? OFFSET ?`,
    ...params,
    Number(limit),
    Number(offset)
  );
}

export function getPlayerBySlug(slug) {
  return queryOne(`SELECT ${PLAYER_COLUMNS} ${PLAYER_JOINS} WHERE p.slug = ?`, slug);
}

export function listLeagues() {
  return queryAll(
    `SELECT l.id, l.slug, l.name_en, l.name_ja, l.country_code, l.tier, l.jp_visibility,
            COUNT(p.id) AS player_count
       FROM leagues l
       LEFT JOIN players p ON p.league_id = l.id AND p.tracked = 1 AND p.status = 'active'
      GROUP BY l.id
      ORDER BY player_count DESC, l.jp_visibility DESC, l.name_en`
  );
}

export function getLeagueBySlug(slug) {
  return queryOne(
    `SELECT id, slug, name_en, name_ja, country_code, tier, jp_visibility FROM leagues WHERE slug = ?`,
    slug
  );
}

export function listPositions() {
  return queryAll(
    `SELECT position, COUNT(*) AS n FROM players
      WHERE tracked = 1 AND status = 'active' AND position IS NOT NULL
      GROUP BY position ORDER BY n DESC`
  );
}

/** Recent events for a player, used when the intelligence module has no dossier. */
export function listPlayerEvents(playerId, limit = 40) {
  return queryAll(
    `SELECT id, type, subtype, headline, summary, occurred_at, detected_at, confidence,
            importance, source_count, independent_source_count, best_source_tier
       FROM events
      WHERE player_id = ? AND status = 'active'
      ORDER BY COALESCE(occurred_at, detected_at) DESC
      LIMIT ?`,
    Number(playerId),
    Number(limit)
  );
}

export function listPlayerSources(playerId, limit = 60) {
  return queryAll(
    `SELECT es.url, es.title, es.published_at, es.detected_at, es.tier, s.name AS source_name
       FROM event_sources es
       JOIN events e ON e.id = es.event_id
       LEFT JOIN sources s ON s.id = es.source_id
      WHERE e.player_id = ?
      ORDER BY COALESCE(es.published_at, es.detected_at) DESC
      LIMIT ?`,
    Number(playerId),
    Number(limit)
  );
}

export default {
  getIntelligence,
  schemaReady,
  queryAll,
  queryOne,
  countOf,
  listPlayers,
  getPlayerBySlug,
  listLeagues,
  getLeagueBySlug,
  listPositions,
  listPlayerEvents,
  listPlayerSources,
  resetDataCaches,
};
