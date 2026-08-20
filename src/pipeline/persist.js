/**
 * Event persistence, deduplication and the confidence ladder.
 *
 * Six outlets rewriting the same story must converge on ONE event with six
 * sources, not six events — otherwise report volume, and every signal built on
 * it, is just a measure of how many outlets exist. That convergence is what
 * `dedupe_key` does, and it is why confidence is recomputed from the whole
 * source set on every corroboration rather than being set once at insert.
 */
import { config, CONFIDENCE_BY_KEY, SOURCE_TIERS, confidenceRank } from "../config/index.js";
import { all, get, run, transaction } from "../db/client.js";
import { shortHash } from "../lib/hash.js";
import { createLogger } from "../lib/logger.js";
import { normalizeAlias, toExcerpt } from "../lib/text.js";

const log = createLogger("persist");

/** Days per dedupe bucket. */
const BUCKET_DAYS = 14;

/**
 * Outlets describe the same stage of a story with different words. Folding the
 * synonyms means "Brighton eye Nakamura" and "Brighton tracking Nakamura"
 * become one event, while a genuine progression (interest -> bid -> agreement)
 * still creates a new, separately reported event.
 */
const SUBTYPE_FAMILIES = {
  interest: ["interest", "interested", "linked", "monitoring", "tracking", "scouting", "target", "eyeing"],
  talks: ["talks", "negotiation", "negotiations", "discussions"],
  bid: ["bid", "offer", "approach", "proposal"],
  agreement: ["agreement", "agreed", "personal_terms", "medical", "here_we_go"],
  completed: ["completed", "signed", "official", "announced", "unveiled", "join", "joined"],
  renewal: ["renewal", "extension", "extended", "new_deal", "renewed"],
  expiry: ["expiry", "expiring", "free_agent", "out_of_contract"],
  out: ["out", "injured", "injury", "sidelined", "surgery"],
  return: ["return", "returned", "fit", "recovered"],
};

export function subtypeFamily(subtype) {
  const value = normalizeAlias(subtype ?? "").replace(/\s+/g, "_");
  if (!value) return "unspecified";
  for (const [family, members] of Object.entries(SUBTYPE_FAMILIES)) {
    if (family === value || members.includes(value)) return family;
  }
  return value;
}

/** Coarse time bucket so one story does not fragment across the days it runs. */
export function timeBucket(dateish) {
  const time = new Date(dateish ?? Date.now()).getTime();
  const days = Math.floor((Number.isFinite(time) ? time : Date.now()) / 86_400_000);
  return Math.floor(days / BUCKET_DAYS);
}

/**
 * dedupe_key = sha(type | subtype family | player | counterparty club | bucket).
 *
 * The counterparty is the club the story is *about* — the destination for a
 * transfer, otherwise the named club. The 14-day bucket is the deliberate
 * trade-off: it stops the same claim splitting across the week it is reported,
 * at the cost of a boundary that can occasionally split a very long-running
 * story into two. Dropping the bucket instead would merge a January link and a
 * June link into one event, which is worse.
 */
export function buildDedupeKey(extraction) {
  const player = extraction.playerId
    ? `player:${extraction.playerId}`
    : `name:${normalizeAlias(extraction.playerName ?? "unknown")}`;
  const counterparty = extraction.toClubId ?? extraction.clubId ?? extraction.fromClubId ?? null;
  const parts = [
    extraction.type,
    subtypeFamily(extraction.subtype),
    player,
    counterparty ? `club:${counterparty}` : "club:none",
    `bucket:${timeBucket(extraction.occurredAt)}`,
  ];
  return shortHash(parts.join("|"), 32);
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return String(url ?? "").slice(0, 60);
  }
}

/**
 * Independence = a different source AND a different domain. Aggregators are
 * excluded entirely: five aggregators republishing one wire story is one story.
 */
export function independentSources(rows) {
  const ordered = [...rows].sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || String(a.detected_at).localeCompare(String(b.detected_at)));
  const seenSources = new Set();
  const seenDomains = new Set();
  const independent = [];

  for (const row of ordered) {
    if (row.kind === "aggregator" || row.kind === "social") continue;
    if (seenSources.has(row.source_id) || seenDomains.has(row.domain)) continue;
    seenSources.add(row.source_id);
    seenDomains.add(row.domain);
    independent.push(row);
  }
  return independent;
}

/** The ladder from the build spec, then the best source tier's hard ceiling. */
export function confidenceFor({ rows, completedAction }) {
  const independent = independentSources(rows);
  const atOrAbove = (tier) => independent.filter((row) => (row.tier ?? 9) <= tier).length;

  let key = "unverified";
  if (atOrAbove(1) >= 1 && completedAction) key = "confirmed";
  else if (atOrAbove(2) >= 2) key = "strongly_reported";
  else if (atOrAbove(2) >= 1 || atOrAbove(3) >= 2) key = "reported";
  else if (atOrAbove(3) >= 1) key = "rumored";

  const bestTier = rows.reduce((best, row) => Math.min(best, row.tier ?? 9), 9);
  const ceiling = SOURCE_TIERS[bestTier]?.maxConfidence ?? "unverified";
  if (confidenceRank(key) > confidenceRank(ceiling)) key = ceiling;

  return { key, bestTier: bestTier === 9 ? null : bestTier, independentCount: independent.length };
}

function queueReview({ eventId, reason, detail, priority }) {
  run(
    `INSERT INTO review_queue (item_type, item_id, reason, detail, priority) VALUES ('event', ?, ?, ?, ?)
     ON CONFLICT(item_type, item_id, reason) DO UPDATE SET detail = excluded.detail`,
    eventId, reason, detail, priority
  );
  run("UPDATE events SET review_required = 1 WHERE id = ?", eventId);
}

/** Transfer claims that share a player and a window but name different clubs. */
function conflictingSiblings(event) {
  if (event.type !== "transfer" || !event.player_id) return [];
  return all(
    `SELECT id, headline, to_club_id, subtype FROM events
      WHERE player_id = ? AND type = 'transfer' AND status = 'active' AND id != ?
        AND subtype = ? AND COALESCE(to_club_id, 0) != COALESCE(?, 0)
        AND abs(julianday(COALESCE(occurred_at, detected_at)) - julianday(COALESCE(?, detected_at))) <= ?`,
    event.player_id, event.id, event.subtype, event.to_club_id, event.occurred_at, BUCKET_DAYS
  );
}

export function persistExtraction(article, extraction) {
  const source = get("SELECT * FROM sources WHERE id = ?", article.source_id);
  const dedupeKey = buildDedupeKey(extraction);
  const created = [];
  const updated = [];
  const queuedForReview = [];

  return transaction(() => {
    let event = get("SELECT * FROM events WHERE dedupe_key = ?", dedupeKey);

    if (!event) {
      const { lastInsertRowid } = run(
        `INSERT INTO events (dedupe_key, type, subtype, player_id, club_id, from_club_id, to_club_id,
            headline, summary, headline_ja, summary_ja, occurred_at, confidence, confidence_rank, importance, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', 1, ?, ?)`,
        dedupeKey, extraction.type, subtypeFamily(extraction.subtype), extraction.playerId,
        extraction.clubId, extraction.fromClubId, extraction.toClubId,
        toExcerpt(extraction.headline, 200), toExcerpt(extraction.summary ?? "", 320),
        // Japanese fields summarise the extracted facts; they are never a
        // translation of the article body.
        extraction.headlineJa ? toExcerpt(extraction.headlineJa, 200) : null,
        extraction.summaryJa ? toExcerpt(extraction.summaryJa, 320) : null,
        extraction.occurredAt ?? article.published_at, extraction.importance ?? 1,
        JSON.stringify({ ...extraction.payload, base_importance: extraction.importance ?? 1, confidence_history: [] })
      );
      event = get("SELECT * FROM events WHERE id = ?", Number(lastInsertRowid));
      created.push(event.id);
    } else {
      updated.push(event.id);
    }

    run(
      `INSERT INTO event_sources (event_id, article_id, source_id, url, title, published_at, tier, weight)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id, url) DO NOTHING`,
      event.id, article.id, article.source_id, article.url, article.title, article.published_at,
      source?.tier ?? 4, SOURCE_TIERS[source?.tier ?? 4]?.weight ?? 0.25
    );

    const rows = all(
      `SELECT es.source_id, es.url, es.tier, es.detected_at, s.kind
         FROM event_sources es JOIN sources s ON s.id = es.source_id
        WHERE es.event_id = ?`,
      event.id
    ).map((row) => ({ ...row, domain: domainOf(row.url) }));

    const payload = JSON.parse(event.payload ?? "{}");
    const completedAction = extraction.completedAction === true || payload.completed_action === true;
    const { key, bestTier, independentCount } = confidenceFor({ rows, completedAction });

    const baseImportance = Math.max(payload.base_importance ?? 1, extraction.importance ?? 1);
    // Wide independent corroboration is itself a reason to look harder.
    const importance = Math.max(1, Math.min(5, baseImportance + (independentCount >= 3 ? 1 : 0)));

    const previousConfidence = event.confidence;
    const history = Array.isArray(payload.confidence_history) ? payload.confidence_history : [];
    if (previousConfidence !== key) {
      // changes.js reads this trail: a confidence increase is itself news.
      history.push({ from: previousConfidence, to: key, at: new Date().toISOString(), sources: rows.length });
    }

    const nextPayload = {
      ...payload,
      ...extraction.payload,
      base_importance: baseImportance,
      completed_action: completedAction,
      confidence_history: history,
      facts: [...(payload.facts ?? []), ...(extraction.facts ?? [])].slice(-20),
    };

    run(
      `UPDATE events SET source_count = ?, independent_source_count = ?, best_source_tier = ?,
          confidence = ?, confidence_rank = ?, importance = ?, payload = ?, updated_at = datetime('now'),
          from_club_id = COALESCE(from_club_id, ?), to_club_id = COALESCE(to_club_id, ?), club_id = COALESCE(club_id, ?),
          headline_ja = COALESCE(headline_ja, ?), summary_ja = COALESCE(summary_ja, ?)
        WHERE id = ?`,
      rows.length, independentCount, bestTier, key, confidenceRank(key), importance,
      JSON.stringify(nextPayload), extraction.fromClubId, extraction.toClubId, extraction.clubId,
      extraction.headlineJa ? toExcerpt(extraction.headlineJa, 200) : null,
      extraction.summaryJa ? toExcerpt(extraction.summaryJa, 320) : null, event.id
    );

    event = get("SELECT * FROM events WHERE id = ?", event.id);

    // --- review gates -----------------------------------------------------
    const player = extraction.playerId ? get("SELECT * FROM players WHERE id = ?", extraction.playerId) : null;

    if ((extraction.contradicts ?? []).length) {
      queueReview({
        eventId: event.id,
        reason: "source_contradiction",
        detail: `Sources disagree on "${event.headline}": ${(extraction.contradicts ?? []).join("; ")}`.slice(0, 500),
        priority: 4,
      });
      queuedForReview.push(event.id);
    }

    const siblings = conflictingSiblings(event);
    if (siblings.length) {
      queueReview({
        eventId: event.id,
        reason: "conflicting_claim",
        detail: `Another active ${event.type} claim for this player in the same window names a different club: ` +
          siblings.map((row) => `#${row.id} ${row.headline}`).join(" | ").slice(0, 400),
        priority: 4,
      });
      queuedForReview.push(event.id);
    }

    if (importance >= config.review.autoQueueImportance) {
      queueReview({
        eventId: event.id,
        reason: "high_importance",
        detail: `Importance ${importance}/5, confidence ${CONFIDENCE_BY_KEY[key]?.label ?? key}, ` +
          `${rows.length} sources (${independentCount} independent). Verify before publishing.`,
        priority: 4,
      });
      queuedForReview.push(event.id);
    }

    if (!player || player.tracked !== 1) {
      queueReview({
        eventId: event.id,
        reason: "untracked_player",
        detail: `Event names "${extraction.playerName ?? "an unidentified player"}" who is not currently tracked. ` +
          "Add the player or reject the event.",
        priority: 3,
      });
      queuedForReview.push(event.id);
    }

    if (
      importance >= config.review.autoQueueImportance &&
      confidenceRank(key) <= confidenceRank(config.review.queueConfidenceCeiling)
    ) {
      queueReview({
        eventId: event.id,
        reason: "low_confidence_high_importance",
        detail: `High-importance claim still only ${CONFIDENCE_BY_KEY[key]?.label ?? key}. ` +
          "Availability and contract status should be verified directly.",
        priority: 5,
      });
      queuedForReview.push(event.id);
    }

    log.debug("persisted", { event: event.id, confidence: key, sources: rows.length });
    return { created, updated, queuedForReview: [...new Set(queuedForReview)] };
  });
}

export default persistExtraction;
