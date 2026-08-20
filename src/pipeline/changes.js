/**
 * Change detection — "What Changed Today?".
 *
 * This is the product. A user does not come back daily for a news list; they
 * come back to be told, in one line, what is different since yesterday. Every
 * row written here has to survive three tests:
 *   1. it states what CHANGED, not what exists;
 *   2. it carries the evidence weight (sources, confidence) in the same line;
 *   3. running the job twice on the same day writes nothing new — `dedupe_key`
 *      makes the whole job idempotent.
 *
 * Headlines are generated from stored facts by template. No model writes them,
 * and the wording rules from docs/strategy/positioning.md are enforced here in
 * both languages.
 */
import { CONFIDENCE_BY_KEY, config, confidenceRank } from "../config/index.js";
import { all, get, run } from "../db/client.js";
import { createLogger } from "../lib/logger.js";
import { todayInTimezone } from "../lib/time.js";

const log = createLogger("changes");

/** A new event below this importance is noise, not a change worth surfacing. */
const NEW_EVENT_IMPORTANCE_FLOOR = 2;
const PERFORMANCE_IMPORTANCE_FLOOR = 3;

/**
 * Contract, injury and performance events get their own change type, so
 * `new_event` covers everything else. Without this split a contract story would
 * appear twice in the daily brief.
 */
const DEDICATED_TYPES = { contract: "contract", injury: "injury", performance: "performance" };

/** Wording that the product never publishes, in either language. */
export const FORBIDDEN_PHRASES = [
  "final recommendation",
  "hidden gem",
  "perfect fit",
  "guaranteed availability",
  "risk-free",
  "risk free",
  "移籍確実",
  "掘り出し物",
  "完全にフィット",
  "絶対に獲得",
];

export function withinWordingRules(text) {
  const value = String(text ?? "").toLowerCase();
  return !FORBIDDEN_PHRASES.some((phrase) => value.includes(phrase.toLowerCase()));
}

const TYPE_LABELS = {
  transfer: "transfer",
  contract: "contract",
  injury: "injury",
  performance: "performance",
  national_team: "national team",
  media: "media",
  social: "social",
  commercial: "commercial",
  club_situation: "club situation",
};

const SUBTYPE_LABELS_JA = {
  interest: "関心報道",
  talks: "交渉報道",
  bid: "オファー報道",
  agreement: "合意報道",
  completed: "移籍報道",
  renewal: "契約延長報道",
  expiry: "契約満了報道",
  out: "負傷・離脱情報",
  return: "復帰情報",
  goal: "出場・得点情報",
  call_up: "代表関連情報",
};

const TYPE_LABELS_JA = {
  transfer: "移籍関連報道",
  contract: "契約関連情報",
  injury: "負傷・復帰情報",
  performance: "出場・パフォーマンス情報",
  national_team: "代表関連情報",
  media: "メディア関連情報",
  social: "SNS関連情報",
  commercial: "スポンサー関連情報",
  club_situation: "所属クラブの状況",
};

const CONFIDENCE_JA = {
  unverified: "未確認",
  rumored: "噂レベル",
  reported: "報道あり",
  strongly_reported: "複数報道",
  confirmed: "確認済み",
};

function confidenceLabel(key) {
  return CONFIDENCE_BY_KEY[key]?.label ?? key;
}

/** SQLite `datetime('now')` is UTC without a zone marker. */
function toIso(value) {
  if (!value) return null;
  const text = String(value).includes("T") ? String(value) : `${String(value).replace(" ", "T")}Z`;
  return text;
}

function isOnDate(value, asOfDate) {
  const iso = toIso(value);
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  // Business days are JST days; comparing raw UTC dates would move an evening
  // Japanese story into the previous day.
  return todayInTimezone(config.timezone, date) === asOfDate;
}

function sourceSuffixJa(event) {
  return `（情報源${event.source_count ?? 0}件・${CONFIDENCE_JA[event.confidence] ?? "未確認"}）`;
}

export function detectChanges({ asOfDate } = {}) {
  const date = asOfDate ?? todayInTimezone();
  const byType = {};
  let created = 0;

  function emit({ entityId, changeType, headline, headlineJa, detail, detailJa, before, after, importance, confidence, eventId, dedupeKey }) {
    for (const text of [headline, headlineJa, detail, detailJa]) {
      if (!withinWordingRules(text)) {
        log.warn("headline blocked by wording rules", { changeType, entityId });
        return;
      }
    }

    const result = run(
      `INSERT INTO changes (entity_type, entity_id, change_type, headline, detail, headline_ja, detail_ja,
          before_value, after_value, importance, confidence, event_id, as_of_date, dedupe_key)
       VALUES ('player', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO NOTHING`,
      entityId, changeType, headline, detail ?? null, headlineJa ?? null, detailJa ?? null,
      before ?? null, after ?? null, importance, confidence, eventId ?? null, date, dedupeKey
    );

    if (result.changes > 0) {
      created += 1;
      byType[changeType] = (byType[changeType] ?? 0) + 1;
    }
  }

  const players = new Map(
    all("SELECT id, slug, name_en, name_ja FROM players").map((row) => [row.id, row])
  );
  const nameOf = (id) => players.get(id)?.name_en ?? `Player ${id}`;
  const nameJaOf = (id) => players.get(id)?.name_ja ?? players.get(id)?.name_en ?? `選手${id}`;

  // --- 1. signal band crossings ------------------------------------------
  for (const signalType of ["transfer", "japan_market"]) {
    const current = all(
      `SELECT entity_id, score, band FROM signal_history
        WHERE entity_type = 'player' AND signal_type = ? AND as_of_date = ?`,
      signalType, date
    );

    for (const row of current) {
      const previous = get(
        `SELECT score, band, as_of_date FROM signal_history
          WHERE entity_type = 'player' AND entity_id = ? AND signal_type = ? AND as_of_date < ?
          ORDER BY as_of_date DESC LIMIT 1`,
        row.entity_id, signalType, date
      );
      // No baseline means no change. A newly tracked player must not read as a surge.
      if (!previous || previous.band === row.band) continue;

      const rising = row.score > previous.score;
      const label = signalType === "transfer" ? "transfer signal" : "Japan Market Score";
      const labelJa = signalType === "transfer" ? "移籍シグナル" : "日本市場スコア";
      const sources = get(
        `SELECT COALESCE(SUM(source_count), 0) AS n FROM events
          WHERE player_id = ? AND status = 'active' AND type = 'transfer'`,
        row.entity_id
      ).n;

      emit({
        entityId: row.entity_id,
        changeType: "signal_band",
        headline: `${nameOf(row.entity_id)} — ${label} ${previous.band} → ${row.band}`,
        headlineJa: `${nameJaOf(row.entity_id)}：${labelJa}が${previous.band}→${row.band}に変化（情報源${sources}件）`,
        detail: `Score ${previous.score} → ${row.score} since ${previous.as_of_date}. Bands are ranges, not probabilities.`,
        detailJa: `スコア ${previous.score} → ${row.score}（${previous.as_of_date}比）。バンドは確率ではなく範囲を示す。要確認。`,
        before: JSON.stringify({ signal: signalType, band: previous.band, score: previous.score }),
        after: JSON.stringify({ signal: signalType, band: row.band, score: row.score }),
        importance: rising && (row.band === "HIGH" || row.band === "VERY HIGH") ? 4 : 3,
        confidence: "reported",
        eventId: null,
        dedupeKey: `${date}|signal_band|player:${row.entity_id}|${signalType}|${previous.band}>${row.band}`,
      });
    }
  }

  // --- 2/3/5/6/7. events detected today -----------------------------------
  const recentEvents = all(
    `SELECT * FROM events
      WHERE status = 'active' AND player_id IS NOT NULL AND detected_at >= datetime(?, '-2 days')
      ORDER BY importance DESC, detected_at DESC`,
    `${date}T00:00:00Z`
  );

  for (const event of recentEvents) {
    const isNewToday = isOnDate(event.detected_at, date);
    const dedicated = DEDICATED_TYPES[event.type];

    if (isNewToday && dedicated) {
      const floor = event.type === "performance" ? PERFORMANCE_IMPORTANCE_FLOOR : NEW_EVENT_IMPORTANCE_FLOOR;
      if (event.importance >= floor) {
        const headlines = {
          contract: {
            en: `${nameOf(event.player_id)} — contract status reported to have changed (${event.source_count} sources, ${confidenceLabel(event.confidence)})`,
            ja: `${nameJaOf(event.player_id)}：契約状況の変化が報じられている${sourceSuffixJa(event)}`,
            detail: "Contract status requires direct confirmation before it is used in a decision.",
            detailJa: "契約状況は直接確認が必要。",
          },
          injury: {
            en: `${nameOf(event.player_id)} — injury status updated (${event.source_count} sources, ${confidenceLabel(event.confidence)})`,
            ja: `${nameJaOf(event.player_id)}：負傷・復帰情報が更新${sourceSuffixJa(event)}`,
            detail: "Availability should be verified directly with the club.",
            detailJa: "出場可否はクラブへの直接確認が必要。",
          },
          performance: {
            en: `${nameOf(event.player_id)} — notable performance reported (${event.source_count} sources)`,
            ja: `${nameJaOf(event.player_id)}：直近の出場内容が更新${sourceSuffixJa(event)}`,
            detail: event.headline,
            detailJa: event.headline_ja ?? "直近の出場・得点に関する報道。",
          },
        }[event.type];

        emit({
          entityId: event.player_id,
          changeType: dedicated,
          headline: headlines.en,
          headlineJa: headlines.ja,
          detail: `${event.headline} — ${headlines.detail}`,
          detailJa: `${event.headline_ja ?? ""} ${headlines.detailJa}`.trim(),
          after: event.subtype,
          importance: event.importance,
          confidence: event.confidence,
          eventId: event.id,
          dedupeKey: `${date}|${dedicated}|player:${event.player_id}|event:${event.id}`,
        });
      }
    } else if (isNewToday && event.importance >= NEW_EVENT_IMPORTANCE_FLOOR) {
      const label = TYPE_LABELS[event.type] ?? event.type;
      const labelJa = SUBTYPE_LABELS_JA[event.subtype] ?? TYPE_LABELS_JA[event.type] ?? "関連報道";

      emit({
        entityId: event.player_id,
        changeType: "new_event",
        headline: `${nameOf(event.player_id)} — new ${label} report (${event.source_count} sources, ${confidenceLabel(event.confidence)})`,
        headlineJa: `${nameJaOf(event.player_id)}：新たな${labelJa}を追加${sourceSuffixJa(event)}`,
        detail: event.headline,
        detailJa: event.summary_ja ?? event.headline_ja ?? "",
        after: `${event.type}:${event.subtype ?? ""}`,
        importance: event.importance,
        confidence: event.confidence,
        eventId: event.id,
        dedupeKey: `${date}|new_event|player:${event.player_id}|event:${event.id}`,
      });
    }

    // --- 3. confidence increases on an existing event ---------------------
    const payload = JSON.parse(event.payload ?? "{}");
    const history = Array.isArray(payload.confidence_history) ? payload.confidence_history : [];
    const today = history.filter((entry) => isOnDate(entry.at, date) && confidenceRank(entry.to) > confidenceRank(entry.from));
    const latest = today[today.length - 1];

    // An event created today already reports its source count in `new_event`;
    // a second line about its confidence would be the same news twice.
    if (latest && !isNewToday) {
      emit({
        entityId: event.player_id,
        changeType: "confidence_up",
        headline: `${nameOf(event.player_id)} — confidence increased: ${confidenceLabel(latest.from)} → ${confidenceLabel(latest.to)} (${event.source_count} sources)`,
        headlineJa: `${nameJaOf(event.player_id)}：確度が${CONFIDENCE_JA[latest.from] ?? latest.from}→${CONFIDENCE_JA[latest.to] ?? latest.to}に上昇（情報源${event.source_count}件）`,
        detail: `${event.headline} — corroborated by additional independent reporting.`,
        detailJa: `${event.headline_ja ?? ""} 独立した情報源による追加報道。要確認。`.trim(),
        before: latest.from,
        after: latest.to,
        importance: Math.max(event.importance, 3),
        confidence: event.confidence,
        eventId: event.id,
        dedupeKey: `${date}|confidence_up|event:${event.id}|${latest.to}`,
      });
    }

    // --- 4. newly linked club ---------------------------------------------
    const linkedClubId = event.to_club_id ?? (event.type === "transfer" ? event.club_id : null);
    if (isNewToday && linkedClubId) {
      const earlier = get(
        `SELECT COUNT(*) AS n FROM events
          WHERE player_id = ? AND id != ? AND status = 'active'
            AND (to_club_id = ? OR club_id = ?) AND detected_at < ?`,
        event.player_id, event.id, linkedClubId, linkedClubId, event.detected_at
      ).n;

      if (earlier === 0) {
        const club = get("SELECT name_en, name_ja FROM clubs WHERE id = ?", linkedClubId);
        emit({
          entityId: event.player_id,
          changeType: "club_linked",
          headline: `${nameOf(event.player_id)} — new club linked: ${club?.name_en ?? "unknown club"} (${event.source_count} sources, ${confidenceLabel(event.confidence)})`,
          headlineJa: `${nameJaOf(event.player_id)}：${club?.name_ja ?? club?.name_en ?? "クラブ"}との関連が新たに報じられている${sourceSuffixJa(event)}`,
          detail: `${event.headline} — a reported link, not an agreed move. Availability should be verified directly.`,
          detailJa: `${event.headline_ja ?? ""} 報道段階の関連であり、移籍可能性は直接確認が必要。`.trim(),
          after: club?.name_en ?? String(linkedClubId),
          importance: Math.max(event.importance, 3),
          confidence: event.confidence,
          eventId: event.id,
          dedupeKey: `${date}|club_linked|player:${event.player_id}|club:${linkedClubId}`,
        });
      }
    }
  }

  log.info("changes detected", { asOfDate: date, created, byType });
  return { created, byType };
}

export default detectChanges;
