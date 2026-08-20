/**
 * Read models: the daily brief, the player dossier and the transfer radar.
 *
 * Nothing here computes or invents anything. It assembles what the pipeline has
 * already established, and it carries provenance with every claim — source
 * count, confidence and, where a score is involved, its coverage. The
 * `whatToVerify` list on a dossier is the Japan Talent Desk promise expressed
 * as data: the open verification items fall straight out of what we do not yet
 * know, rather than being written by hand.
 */
import { CONFIDENCE_BY_KEY, config, confidenceRank } from "../config/index.js";
import { all, get } from "../db/client.js";
import { createLogger } from "../lib/logger.js";
import { monthsUntil, timeInTimezone, todayInTimezone } from "../lib/time.js";
import { withinWordingRules } from "./changes.js";
import { computeJapanMarketScore, computeTransferSignal, getMomentum } from "./signals.js";

const log = createLogger("intelligence");

const SECTION_BY_EVENT_TYPE = {
  transfer: "transfer",
  contract: "contract",
  injury: "injury",
  performance: "performance",
  national_team: "performance",
  club_situation: "transfer",
  media: "market",
  social: "market",
  commercial: "market",
};

/** The core note from docs/strategy/positioning.md, verbatim. */
export const SCREEN_NOTE =
  "This is an initial role-specific screen, not a final recruitment recommendation. " +
  "Transfer fee, salary, availability, and physical benchmarks should be treated as verification items.";

export const SCREEN_NOTE_JA =
  "これは役割別の初期スクリーニングであり、最終的な獲得推奨ではない。移籍金・給与・移籍可能性・フィジカル指標は要確認項目として扱う。";

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function ageFrom(birthDate) {
  if (!birthDate) return null;
  const months = monthsUntil(birthDate);
  return months === null ? null : Math.floor(-months / 12);
}

function sectionFor(row) {
  if (row.change_type === "contract" || row.change_type === "injury" || row.change_type === "performance") {
    return row.change_type;
  }
  if (row.change_type === "signal_band") {
    return parseJson(row.after_value, {})?.signal === "japan_market" ? "market" : "transfer";
  }
  return SECTION_BY_EVENT_TYPE[row.event_type] ?? "transfer";
}

// ---------------------------------------------------------------------------
// Daily brief
// ---------------------------------------------------------------------------

export function buildDailyBrief({ asOfDate } = {}) {
  const date = asOfDate ?? todayInTimezone();

  const rows = all(
    `SELECT c.*, e.type AS event_type, e.subtype AS event_subtype,
            p.slug AS player_slug, p.name_en AS player_name, p.name_ja AS player_name_ja
       FROM changes c
       LEFT JOIN events e ON e.id = c.event_id
       LEFT JOIN players p ON p.id = c.entity_id
      WHERE c.as_of_date = ?
      ORDER BY c.importance DESC, c.id`,
    date
  );

  const sections = { transfer: [], injury: [], contract: [], performance: [], market: [] };

  for (const row of rows) {
    const item = {
      id: row.id,
      changeType: row.change_type,
      player: { id: row.entity_id, slug: row.player_slug, name: row.player_name, nameJa: row.player_name_ja },
      headline: row.headline,
      headlineJa: row.headline_ja,
      detail: row.detail,
      detailJa: row.detail_ja,
      before: parseJson(row.before_value, row.before_value),
      after: parseJson(row.after_value, row.after_value),
      importance: row.importance,
      confidence: row.confidence,
      confidenceLabel: CONFIDENCE_BY_KEY[row.confidence]?.label ?? row.confidence,
      eventId: row.event_id,
    };
    sections[sectionFor(row)].push(item);
  }

  // Trending = largest positive momentum. A player with no baseline has no
  // momentum and is excluded rather than being shown as a rise from zero.
  const trending = [];
  for (const signal of all(
    "SELECT entity_id, score, band FROM signals WHERE entity_type = 'player' AND signal_type = 'transfer'"
  )) {
    const momentum = getMomentum(signal.entity_id, "transfer", config.transferSignal.momentumWindowDays);
    if (!momentum || momentum.deltaPoints <= 0) continue;
    const player = get("SELECT id, slug, name_en, name_ja FROM players WHERE id = ?", signal.entity_id);
    trending.push({
      player: { id: player.id, slug: player.slug, name: player.name_en, nameJa: player.name_ja },
      score: signal.score,
      band: signal.band,
      momentum,
    });
  }
  trending.sort((a, b) => b.momentum.deltaPoints - a.momentum.deltaPoints);

  const counts = {
    changes: rows.length,
    byType: rows.reduce((acc, row) => ({ ...acc, [row.change_type]: (acc[row.change_type] ?? 0) + 1 }), {}),
    playersAffected: new Set(rows.map((row) => row.entity_id)).size,
    eventsActive: get("SELECT COUNT(*) AS n FROM events WHERE status = 'active'").n,
    reviewOpen: get("SELECT COUNT(*) AS n FROM review_queue WHERE status = 'open'").n,
  };

  return {
    asOfDate: date,
    updatedAt: `${date} ${timeInTimezone()} JST`,
    sections,
    trending: trending.slice(0, 8),
    counts,
    note: SCREEN_NOTE,
    noteJa: SCREEN_NOTE_JA,
  };
}

// ---------------------------------------------------------------------------
// Player dossier
// ---------------------------------------------------------------------------

function eventRow(row) {
  return {
    id: row.id,
    type: row.type,
    subtype: row.subtype,
    headline: row.headline,
    headlineJa: row.headline_ja,
    summary: row.summary,
    summaryJa: row.summary_ja,
    occurredAt: row.occurred_at,
    detectedAt: row.detected_at,
    confidence: row.confidence,
    confidenceLabel: CONFIDENCE_BY_KEY[row.confidence]?.label ?? row.confidence,
    importance: row.importance,
    sourceCount: row.source_count,
    independentSourceCount: row.independent_source_count,
    bestSourceTier: row.best_source_tier,
    reviewRequired: row.review_required === 1,
  };
}

export function buildPlayerDossier(playerIdOrSlug) {
  const player = Number.isInteger(playerIdOrSlug) || /^\d+$/.test(String(playerIdOrSlug))
    ? get("SELECT * FROM players WHERE id = ?", Number(playerIdOrSlug))
    : get("SELECT * FROM players WHERE slug = ?", String(playerIdOrSlug));

  if (!player) return null;

  const club = player.current_club_id ? get("SELECT * FROM clubs WHERE id = ?", player.current_club_id) : null;
  const league = player.league_id ? get("SELECT * FROM leagues WHERE id = ?", player.league_id) : null;

  const events = all(
    "SELECT * FROM events WHERE player_id = ? AND status = 'active' ORDER BY COALESCE(occurred_at, detected_at) DESC",
    player.id
  );
  const byType = (type) => events.filter((row) => row.type === type);

  const transferSignal = computeTransferSignal(player.id);
  const japanMarket = computeJapanMarketScore(player.id);
  const momentum = getMomentum(player.id, "transfer", config.transferSignal.momentumWindowDays);

  const clubsLinked = all(
    `SELECT c.id, c.name_en, c.name_ja, COUNT(DISTINCT e.id) AS events,
            SUM(e.source_count) AS sources, MAX(COALESCE(e.occurred_at, e.detected_at)) AS last_reported,
            MAX(e.confidence_rank) AS best_rank
       FROM events e JOIN clubs c ON c.id = COALESCE(e.to_club_id, e.club_id)
      WHERE e.player_id = ? AND e.type = 'transfer' AND e.status = 'active'
        AND COALESCE(e.to_club_id, e.club_id) IS NOT NULL AND COALESCE(e.to_club_id, e.club_id) != COALESCE(?, 0)
      GROUP BY c.id ORDER BY last_reported DESC`,
    player.id, player.current_club_id
  ).map((row) => ({
    club: { id: row.id, name: row.name_en, nameJa: row.name_ja },
    events: row.events,
    sourceCount: row.sources,
    lastReportedAt: row.last_reported,
    bestConfidence: Object.values(CONFIDENCE_BY_KEY).find((entry) => entry.rank === row.best_rank)?.key ?? "unverified",
  }));

  const sources = all(
    `SELECT es.url, es.title, es.published_at, es.tier, s.name AS source_name, s.slug AS source_slug
       FROM event_sources es JOIN sources s ON s.id = es.source_id
       JOIN events e ON e.id = es.event_id
      WHERE e.player_id = ? AND e.status = 'active'
      ORDER BY COALESCE(es.published_at, es.detected_at) DESC`,
    player.id
  );
  const deduped = [...new Map(sources.map((row) => [row.url, row])).values()].map((row) => ({
    url: row.url,
    title: row.title,
    publishedAt: row.published_at,
    tier: row.tier,
    source: row.source_name,
    sourceSlug: row.source_slug,
  }));

  const contractMonths = player.contract_until ? monthsUntil(player.contract_until) : null;
  const contract = {
    until: player.contract_until,
    monthsRemaining: contractMonths === null ? null : Math.round(contractMonths * 10) / 10,
    confidence: player.contract_confidence ?? "unverified",
    // The product never states a contract date as fact unless a human confirmed it.
    verified: player.contract_confidence === "confirmed",
    events: byType("contract").map(eventRow),
  };

  const injuryEvents = byType("injury").map(eventRow);
  const openReviews = all(
    `SELECT reason, detail FROM review_queue
      WHERE status = 'open' AND ((item_type = 'player' AND item_id = ?)
         OR (item_type = 'event' AND item_id IN (SELECT id FROM events WHERE player_id = ?)))
      ORDER BY priority DESC LIMIT 20`,
    player.id, player.id
  );

  const whatToVerify = [];
  const addVerify = (item, itemJa, why) => whatToVerify.push({ item, itemJa, why });

  if (!contract.verified) {
    addVerify(
      `Contract status${contract.until ? ` (recorded as ${contract.until})` : ""} requires direct confirmation`,
      `契約状況${contract.until ? `（記録上は${contract.until}）` : ""}は直接確認が必要`,
      `stored confidence: ${contract.confidence}`
    );
  }
  if (player.data_status !== "verified") {
    addVerify(
      "Club, league and squad role are seeded reference data and should be checked directly",
      "所属クラブ・リーグ・起用状況は初期登録データであり直接確認が必要",
      `data_status: ${player.data_status}`
    );
  }
  for (const event of byType("transfer")) {
    if (confidenceRank(event.confidence) <= confidenceRank(config.review.queueConfidenceCeiling)) {
      addVerify(
        `Availability should be verified directly: ${event.headline}`,
        `移籍可能性は直接確認が必要: ${event.headline_ja ?? event.headline}`,
        `${CONFIDENCE_BY_KEY[event.confidence]?.label ?? event.confidence}, ${event.source_count} sources`
      );
    }
  }
  if (japanMarket.provisional) {
    addVerify(
      `Japan Market Score is provisional — only ${Math.round(japanMarket.coverage * 100)}% of its weighted inputs are measured`,
      `日本市場スコアは暫定値（測定済み入力は加重ベースで${Math.round(japanMarket.coverage * 100)}%）`,
      "missing metrics are excluded, never estimated"
    );
  }
  for (const review of openReviews) {
    addVerify(`Open review item: ${review.reason}`, `未処理のレビュー項目: ${review.reason}`, review.detail ?? "");
  }

  const dossier = {
    player: {
      id: player.id,
      slug: player.slug,
      name: player.name_en,
      nameJa: player.name_ja,
      nameKana: player.name_kana,
      position: player.position,
      age: ageFrom(player.birth_date),
      birthDate: player.birth_date,
      nationality: player.nationality,
      nationalTeam: player.national_team,
      club: club ? { id: club.id, name: club.name_en, nameJa: club.name_ja } : null,
      league: league ? { id: league.id, name: league.name_en, nameJa: league.name_ja, jpVisibility: league.jp_visibility } : null,
      tracked: player.tracked === 1,
      dataStatus: player.data_status,
    },
    transfer: {
      signal: { score: transferSignal.score, band: transferSignal.band, coverage: transferSignal.coverage, inputs: transferSignal.inputs },
      momentum,
      clubsLinked,
      events: byType("transfer").map(eventRow),
    },
    injury: { current: injuryEvents[0] ?? null, events: injuryEvents },
    contract,
    performance: { events: [...byType("performance"), ...byType("national_team")].map(eventRow) },
    media: { events: [...byType("media"), ...byType("social"), ...byType("commercial")].map(eventRow) },
    japanMarket: {
      score: japanMarket.score,
      band: japanMarket.band,
      coverage: japanMarket.coverage,
      provisional: japanMarket.provisional,
      // A provisional score must be labelled everywhere it appears.
      label: japanMarket.provisional ? `${japanMarket.band} (provisional)` : japanMarket.band,
      labelJa: japanMarket.provisional ? `${japanMarket.band}（暫定）` : japanMarket.band,
      inputs: japanMarket.inputs,
    },
    timeline: events.map(eventRow),
    sources: deduped,
    whatToVerify,
    note: SCREEN_NOTE,
    noteJa: SCREEN_NOTE_JA,
  };

  if (!withinWordingRules(JSON.stringify(dossier))) {
    log.warn("dossier tripped the wording rules", { player: player.slug });
  }
  return dossier;
}

// ---------------------------------------------------------------------------
// Transfer radar
// ---------------------------------------------------------------------------

export function buildTransferRadar({ limit = 25 } = {}) {
  const rows = all(
    `SELECT s.entity_id, s.score, s.band, s.coverage, p.slug, p.name_en, p.name_ja, p.position,
            c.name_en AS club_name, c.name_ja AS club_name_ja
       FROM signals s JOIN players p ON p.id = s.entity_id
       LEFT JOIN clubs c ON c.id = p.current_club_id
      WHERE s.entity_type = 'player' AND s.signal_type = 'transfer' AND s.score > 0
      ORDER BY s.score DESC LIMIT ?`,
    Number(limit)
  );

  return rows.map((row) => {
    const clubs = get(
      `SELECT COUNT(DISTINCT COALESCE(to_club_id, club_id)) AS n, COALESCE(SUM(source_count), 0) AS sources
         FROM events WHERE player_id = ? AND type = 'transfer' AND status = 'active'`,
      row.entity_id
    );
    const lastChange = get(
      "SELECT headline, headline_ja, as_of_date FROM changes WHERE entity_id = ? ORDER BY as_of_date DESC, id DESC LIMIT 1",
      row.entity_id
    );

    return {
      player: {
        id: row.entity_id,
        slug: row.slug,
        name: row.name_en,
        nameJa: row.name_ja,
        position: row.position,
        club: row.club_name ? { name: row.club_name, nameJa: row.club_name_ja } : null,
      },
      score: row.score,
      band: row.band,
      coverage: row.coverage,
      momentum: getMomentum(row.entity_id, "transfer", config.transferSignal.momentumWindowDays),
      clubsLinked: clubs.n,
      sourceCount: clubs.sources,
      lastChange: lastChange
        ? { headline: lastChange.headline, headlineJa: lastChange.headline_ja, asOfDate: lastChange.as_of_date }
        : null,
    };
  });
}

export default { buildDailyBrief, buildPlayerDossier, buildTransferRadar };
