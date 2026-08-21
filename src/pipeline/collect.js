/**
 * Collection stage: enabled sources -> `articles` rows.
 *
 * Three constraints shape this file.
 *
 * 1. Compliance. Robots is checked before a real HTTP source is fetched and the
 *    verdict is stored, and only the headline plus `text.toExcerpt` of the feed
 *    description is persisted — never a full body.
 * 2. Cost. Every duplicate that reaches the classifier is a wasted LLM call, and
 *    the same wire story is rewritten by a dozen outlets. Exact URL, exact
 *    content and near-duplicate detection all happen here, before anything is
 *    eligible for scoring.
 * 3. Honesty about failure. A feed that dies stays visibly dead: errors are
 *    counted on the source row, and a source that fails five runs in a row is
 *    disabled and queued for a human instead of silently returning nothing.
 */
import { config } from "../config/index.js";
import { all, get, run, transaction } from "../db/client.js";
import { hammingDistance, simhash, sha256, urlHash, canonicaliseUrl } from "../lib/hash.js";
import { isAllowedByRobots } from "../lib/http.js";
import { createLogger } from "../lib/logger.js";
import { detectLanguage, normalize, toExcerpt } from "../lib/text.js";
import { isoDaysAgo, nowIso } from "../lib/time.js";
import { getNewsProvider } from "../providers/index.js";

const log = createLogger("collect");

/**
 * Near-duplicate threshold, in bits of a 64-bit simhash.
 *
 * The classic web-scale value is 3, but that is calibrated for full documents
 * with hundreds of tokens. The signature here is a headline plus a ~320
 * character excerpt — 40-60 tokens — so a desk rewrite of the same wire story
 * moves far more bits than 3 and a threshold of 3 would catch nothing.
 *
 * Measured over the fixture set: the two versions of the Mitoma ankle story
 * ("out for six weeks" / "ruled out for six weeks", same facts, reworded lead)
 * sit at 8 bits, while the closest genuinely different pair sits at 23. The gap
 * is wide, so 12 is chosen to sit in it with margin on both sides: heavier
 * rewrites than the fixture still collapse, and unrelated stories stay apart.
 * Erring high would be the more expensive mistake — a wrongly merged story is
 * invisible to the reader, whereas a missed duplicate only costs one LLM call.
 */
export const NEAR_DUPLICATE_MAX_DISTANCE = 12;

/** Rewrites of a story appear within hours; three days is generous. */
export const NEAR_DUPLICATE_WINDOW_DAYS = 3;

/** Five failed runs is a dead feed, not a blip. */
export const MAX_CONSECUTIVE_ERRORS = 5;

function contentHash(title, excerpt) {
  return sha256(`${normalize(title)}\n${normalize(excerpt)}`);
}

function markSourceOk(source, { status, etag, lastModified }) {
  run(
    `UPDATE sources SET last_fetched_at = ?, last_status = ?, last_error = NULL,
        consecutive_errors = 0, etag = ?, last_modified = ?
      WHERE id = ?`,
    nowIso(), status, etag ?? source.etag ?? null, lastModified ?? source.last_modified ?? null, source.id
  );
}

function markSourceError(source, status, error) {
  const consecutive = (source.consecutive_errors ?? 0) + 1;
  run(
    `UPDATE sources SET last_fetched_at = ?, last_status = ?, last_error = ?, consecutive_errors = ?
      WHERE id = ?`,
    nowIso(), status, String(error ?? "unknown error").slice(0, 500), consecutive, source.id
  );

  if (consecutive < MAX_CONSECUTIVE_ERRORS) return false;

  run("UPDATE sources SET enabled = 0 WHERE id = ?", source.id);
  run(
    `INSERT INTO review_queue (item_type, item_id, reason, detail, priority)
     VALUES ('source', ?, 'source_disabled', ?, 4)
     ON CONFLICT(item_type, item_id, reason)
     DO UPDATE SET status = 'open', detail = excluded.detail, priority = excluded.priority,
       resolved_at = NULL, resolved_by = NULL`,
    source.id,
    `${source.name} (${source.slug}) failed ${consecutive} runs in a row and has been disabled. ` +
      `Last error: ${status} — ${error}. Verify the feed URL or retire the source.`
  );
  log.warn("source disabled after repeated errors", { source: source.slug, consecutive, error });
  return true;
}

function recordRobots(source, allowed) {
  run(
    "UPDATE sources SET robots_allowed = ?, robots_checked_at = ? WHERE id = ?",
    allowed ? 1 : 0, nowIso(), source.id
  );
}

function selectSources(sourceSlugs) {
  if (sourceSlugs?.length) {
    // An explicit slug list overrides `enabled` so an operator can test a
    // source that automatic collection is currently skipping.
    const placeholders = sourceSlugs.map(() => "?").join(", ");
    return all(`SELECT * FROM sources WHERE slug IN (${placeholders}) ORDER BY tier, slug`, ...sourceSlugs);
  }
  return all("SELECT * FROM sources WHERE enabled = 1 ORDER BY tier, slug");
}

/** Recent signatures, loaded once per run and extended as rows are inserted. */
function loadRecentSignatures() {
  return all(
    `SELECT id, simhash FROM articles
      WHERE simhash IS NOT NULL AND detected_at >= ?
      ORDER BY detected_at DESC`,
    isoDaysAgo(NEAR_DUPLICATE_WINDOW_DAYS)
  ).map((row) => ({ id: row.id, simhash: row.simhash }));
}

function findNearDuplicate(signature, recent) {
  let bestId = null;
  let bestDistance = 65;
  for (const candidate of recent) {
    const distance = hammingDistance(signature, candidate.simhash);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = candidate.id;
    }
  }
  return bestDistance <= NEAR_DUPLICATE_MAX_DISTANCE ? { id: bestId, distance: bestDistance } : null;
}

export async function collect({ sourceSlugs, limit } = {}) {
  const budget = Math.max(0, Number(limit ?? config.collect.maxArticlesPerRun));
  const perSource = Math.max(0, Number(config.collect.maxArticlesPerSource));
  const oldestAccepted = isoDaysAgo(config.collect.lookbackDays);

  const sources = selectSources(sourceSlugs);
  const sourceIdBySlug = new Map(all("SELECT id, slug FROM sources").map((row) => [row.slug, row.id]));
  const recent = loadRecentSignatures();

  const stats = {
    sources: 0,
    fetched: 0,
    inserted: 0,
    duplicates: 0,
    nearDuplicates: 0,
    errors: 0,
    skippedByRobots: 0,
  };

  let remaining = budget;

  for (const source of sources) {
    if (remaining <= 0) {
      log.info("run budget exhausted", { budget, source: source.slug });
      break;
    }
    stats.sources += 1;

    const isHttpSource = /^https?:\/\//i.test(source.feed_url ?? "");
    if (isHttpSource && config.http.respectRobots) {
      let allowed = true;
      try {
        // The result is cached per origin in lib/http, so the provider's own
        // guard costs nothing; this call exists to record the verdict.
        ({ allowed } = await isAllowedByRobots(source.feed_url));
      } catch (error) {
        log.warn("robots check failed", { source: source.slug, error: error?.message || String(error) });
        allowed = true;
      }
      recordRobots(source, allowed);
      if (!allowed) {
        stats.skippedByRobots += 1;
        run("UPDATE sources SET last_status = 'robots_disallowed', last_fetched_at = ? WHERE id = ?", nowIso(), source.id);
        log.warn("skipped: robots.txt disallows", { source: source.slug });
        continue;
      }
    }

    let response;
    try {
      response = await getNewsProvider(source).fetchItems(source);
    } catch (error) {
      // A provider that throws is a bug, but it must not take the run down.
      response = { ok: false, reason: "provider_threw", status: 0, error: error?.message || String(error), items: [] };
    }

    for (const warning of response.warnings ?? []) {
      log.warn("feed warning", { source: source.slug, warning });
    }

    if (response.reason === "robots_disallowed") {
      stats.skippedByRobots += 1;
      recordRobots(source, false);
      continue;
    }

    if (response.notModified) {
      markSourceOk(source, { status: "not_modified" });
      continue;
    }

    if (!response.ok) {
      stats.errors += 1;
      markSourceError(source, response.reason ?? "error", response.error ?? "unknown error");
      continue;
    }

    const items = response.items.slice(0, perSource);
    stats.fetched += items.length;
    markSourceOk(source, { status: "ok", etag: response.etag, lastModified: response.lastModified });

    for (const item of items) {
      if (remaining <= 0) break;
      if (item.publishedAt && item.publishedAt < oldestAccepted) continue;

      const attributedSourceId = (item.sourceSlug && sourceIdBySlug.get(item.sourceSlug)) || source.id;
      const inserted = storeArticle(item, attributedSourceId, recent, stats);
      if (inserted) remaining -= 1;
    }
  }

  log.info("collect complete", stats);
  return stats;
}

/**
 * Returns true when a new row was created (duplicates do not consume budget:
 * they cost nothing downstream).
 */
function storeArticle(item, sourceId, recent, stats) {
  const hash = urlHash(item.url);
  if (get("SELECT id FROM articles WHERE url_hash = ?", hash)) {
    stats.duplicates += 1;
    return false;
  }

  // Copyright: headline plus a short factual excerpt, never the body.
  const title = item.title;
  const excerpt = toExcerpt(item.excerpt ?? "");
  const content = contentHash(title, excerpt);

  const exact = get("SELECT id FROM articles WHERE content_hash = ?", content);
  const signature = simhash(`${title} ${excerpt}`);
  const near = exact ? { id: exact.id, distance: 0 } : findNearDuplicate(signature, recent);

  const status = near ? "duplicate" : "new";
  const result = transaction(() =>
    run(
      `INSERT INTO articles (source_id, url, url_hash, canonical_url, title, excerpt, author, language,
          published_at, content_hash, simhash, status, duplicate_of)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sourceId, item.url, hash, item.canonicalUrl ?? canonicaliseUrl(item.url), title, excerpt,
      item.author ?? null, item.language ?? detectLanguage(`${title} ${excerpt}`),
      item.publishedAt ?? null, content, signature, status, near?.id ?? null
    )
  );

  const id = Number(result.lastInsertRowid);
  recent.push({ id, simhash: signature });

  if (near) {
    if (exact) stats.duplicates += 1;
    else stats.nearDuplicates += 1;
    log.debug("duplicate stored", { id, duplicateOf: near.id, distance: near.distance, title });
    return false;
  }

  stats.inserted += 1;
  return true;
}

/**
 * Validate every source without ingesting anything.
 *
 * With no network this reports `unreachable` per source rather than pretending
 * the feed is fine — the whole point is to tell an operator which sources are
 * actually usable right now. `disabled` counts sources currently switched off;
 * they are still checked, because a disabled source is usually one waiting for
 * its feed URL to be verified.
 */
export async function checkSources({ sourceSlugs } = {}) {
  const sources = sourceSlugs?.length
    ? selectSources(sourceSlugs)
    : all("SELECT * FROM sources ORDER BY tier, slug");

  const results = [];
  let ok = 0;
  let failed = 0;
  let disabled = 0;

  for (const source of sources) {
    if (!source.enabled) disabled += 1;

    const notes = [];
    if (source.commercial_use === "restricted") notes.push("licence: restricted, metadata and link only");
    else if (source.commercial_use === "unknown") notes.push("licence: unverified commercial use");

    if (!source.feed_url) {
      failed += 1;
      results.push({ slug: source.slug, status: "no_feed_url", note: ["no feed_url configured", ...notes].join("; ") });
      continue;
    }

    const isHttpSource = /^https?:\/\//i.test(source.feed_url);
    if (isHttpSource && config.http.respectRobots) {
      try {
        const robots = await isAllowedByRobots(source.feed_url);
        recordRobots(source, robots.allowed);
        if (!robots.allowed) {
          failed += 1;
          results.push({ slug: source.slug, status: "robots_disallowed", note: ["robots.txt disallows the feed path", ...notes].join("; ") });
          continue;
        }
      } catch (error) {
        notes.push(`robots check failed: ${error?.message || error}`);
      }
    }

    let response;
    try {
      response = await getNewsProvider(source).fetchItems(source);
    } catch (error) {
      response = { ok: false, reason: "provider_threw", error: error?.message || String(error), items: [] };
    }

    if (response.ok) {
      ok += 1;
      results.push({
        slug: source.slug,
        status: response.notModified ? "not_modified" : response.items.length ? "ok" : "empty",
        note: [
          `tier ${source.tier}`,
          `${response.items.length} items`,
          ...(response.warnings ?? []),
          ...notes,
        ].join("; "),
      });
    } else {
      failed += 1;
      results.push({
        slug: source.slug,
        status: response.reason ?? "error",
        note: [response.error ?? "unknown error", ...notes].join("; "),
      });
    }
  }

  const summary = { checked: sources.length, ok, failed, disabled, results };
  log.info("source check complete", { checked: summary.checked, ok, failed, disabled });
  return summary;
}

export default { collect, checkSources, NEAR_DUPLICATE_MAX_DISTANCE };
