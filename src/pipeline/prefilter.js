/**
 * Rule-based relevance gate. This is the single most important cost control in
 * the system: it decides which articles are ever allowed to reach an LLM.
 *
 * Everything here is arithmetic over `config.prefilter` weights, and the reason
 * string is written back to the row, so an operator can always see why an
 * article was let through or dropped — and can retune the weights instead of
 * arguing with a model.
 *
 * The score is an additive point total, not a percentage. Deliberately: the
 * weights are configurable, the maximum moves with them, and dressing the total
 * up as "87% relevant" would be exactly the fake precision the product bans.
 *
 * Status transition (the classify stage selects on
 * `status = 'new' AND relevance_score >= config.prefilter.minRelevanceScore`):
 *   - scored and passed  -> status stays 'new', relevance_score/reason written
 *   - scored and dropped -> status becomes 'prefiltered_out'
 *   - `relevance_reason IS NULL` is the marker for "not yet prefiltered", so a
 *     passing article is not rescored on the next run. `processed_at` belongs
 *     to the classify stage and is not touched here.
 */
import { config } from "../config/index.js";
import { all, get, run, transaction } from "../db/client.js";
import { createLogger } from "../lib/logger.js";
import { containsAlias, containsJapanese, normalize } from "../lib/text.js";
import { buildEntityIndex, resolveEntitiesDetailed } from "./resolve.js";

const log = createLogger("prefilter");

/**
 * A club with no player is weak evidence — Brighton news is not automatically
 * Japan intelligence — but it is not nothing, so it earns a fraction of the
 * entity weight rather than the whole of it.
 */
const CLUB_ONLY_SHARE = 0.4;

/** Tier 1-2 sources are official or tier-1 reporting; see config.SOURCE_TIERS. */
const TRUSTED_MAX_TIER = 2;

function terms(list) {
  return list.map((term) => ({
    term,
    norm: normalize(term).replace(/\s+/g, containsJapanese(term) ? "" : " "),
    isJapanese: containsJapanese(term),
  }));
}

const JAPAN_TERMS = terms([
  "japan", "japanese", "japan international", "nippon", "samurai blue",
  "j league", "jleague", "j1", "j2", "j3",
  "日本", "日本代表", "日本人", "Jリーグ", "サムライブルー", "代表",
]);

const FOOTBALL_TERMS = terms([
  "football", "soccer", "midfielder", "defender", "forward", "winger", "striker",
  "goalkeeper", "club", "league", "match", "matches", "season", "squad", "manager",
  "head coach", "goal", "goals", "starting xi",
  "サッカー", "試合", "リーグ", "選手", "監督", "クラブ", "得点", "先発",
]);

/**
 * Event vocabulary in both languages. Japanese media rarely repeats the English
 * word, so an English-only list would silently drop the entire Japanese half of
 * the source list — which is most of the Japan-side signal the product sells.
 */
const EVENT_TERMS = {
  transfer: terms([
    "transfer", "transfer window", "signing", "signs", "sign", "signed", "bid", "fee",
    "loan", "deal", "talks", "interest", "interested", "medical", "agreement", "move",
    "release clause", "targeted", "approach", "exit",
    "移籍", "完全移籍", "期限付き移籍", "レンタル", "獲得", "交渉", "オファー", "退団", "加入",
  ]),
  injury: terms([
    "injury", "injured", "ruled out", "sidelined", "out for", "surgery", "scan", "scans",
    "strain", "ligament", "hamstring", "fitness", "recovery", "comeback",
    "負傷", "怪我", "けが", "全治", "離脱", "手術", "復帰", "戦線離脱",
  ]),
  contract: terms([
    "contract", "extension", "renewal", "new deal", "expires", "expiry", "free agent",
    "contract talks", "terms",
    "契約", "契約延長", "契約更新", "契約満了", "更新", "フリー",
  ]),
};

function haystack(text) {
  const latin = normalize(text);
  return { latin, japanese: latin.replace(/\s+/g, ""), hasJapanese: containsJapanese(text) };
}

/**
 * Latin terms are word-boundary matched, but Japanese text has no boundaries,
 * so mixed-script text also gets a substring pass. Without it "Ｊ１第20節"
 * normalises to a single token and no keyword ever matches it.
 */
function hasTerm(hay, entry) {
  if (entry.isJapanese) return hay.japanese.includes(entry.norm);
  if (containsAlias(hay.latin, entry.norm, false)) return true;
  return hay.hasJapanese && hay.japanese.includes(entry.norm);
}

function firstMatch(hay, entries) {
  for (const entry of entries) {
    if (hasTerm(hay, entry)) return entry.term;
  }
  return null;
}

function bestByEntity(matches) {
  const best = new Map();
  for (const match of matches) {
    const key = `${match.entity_type}:${match.entity_id}`;
    const current = best.get(key);
    if (!current || match.score > current.score) best.set(key, match);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * Pure: no database access, no writes. Takes an article-shaped object
 * (`title`, `excerpt`, optional `source_tier`) and the entity index.
 *
 * @returns {{ score: number, reasons: string[], entities: Array }}
 */
export function scoreArticle(article, index) {
  const title = article?.title ?? "";
  const excerpt = article?.excerpt ?? "";

  const titleResult = resolveEntitiesDetailed(title, index, { field: "title" });
  const excerptResult = resolveEntitiesDetailed(excerpt, index, { field: "excerpt" });
  const entities = bestByEntity([...titleResult.matches, ...excerptResult.matches]);

  const players = entities.filter((entity) => entity.entity_type === "player");
  const clubs = entities.filter((entity) => entity.entity_type === "club");
  const titleEntity = titleResult.matches.length > 0;

  const hay = haystack(`${title} ${excerpt}`);
  const weights = config.prefilter;
  const reasons = [];
  let points = 0;

  const describe = (entity) => {
    const record = entity.entity_type === "player"
      ? index.playerById.get(entity.entity_id)
      : index.clubById.get(entity.entity_id);
    return record?.name_en ?? `${entity.entity_type} ${entity.entity_id}`;
  };

  if (players.length) {
    points += weights.entityMatchScore;
    reasons.push(
      `tracked player: ${players.map(describe).join(", ")} (+${weights.entityMatchScore})`
    );
  } else if (clubs.length) {
    const clubPoints = Math.round(weights.entityMatchScore * CLUB_ONLY_SHARE);
    points += clubPoints;
    reasons.push(`club only, no tracked player: ${clubs.map(describe).join(", ")} (+${clubPoints})`);
  } else {
    reasons.push("no tracked entity matched (+0)");
  }

  const japan = firstMatch(hay, JAPAN_TERMS);
  if (japan) {
    points += weights.japanKeywordScore;
    reasons.push(`Japan keyword "${japan}" (+${weights.japanKeywordScore})`);
  }

  const football = firstMatch(hay, FOOTBALL_TERMS);
  if (football) {
    points += weights.footballKeywordScore;
    reasons.push(`football vocabulary "${football}" (+${weights.footballKeywordScore})`);
  }

  const events = [];
  for (const [type, entries] of Object.entries(EVENT_TERMS)) {
    const hit = firstMatch(hay, entries);
    if (hit) events.push(`${type}:"${hit}"`);
  }
  if (events.length) {
    // One event bonus, however many vocabularies hit: a story is one story.
    points += weights.eventKeywordScore;
    reasons.push(`event vocabulary ${events.join(", ")} (+${weights.eventKeywordScore})`);
  }

  const tier = Number(article?.source_tier ?? 0);
  if (tier && tier <= TRUSTED_MAX_TIER) {
    points += weights.trustedSourceBonus;
    reasons.push(`trusted source, tier ${tier} (+${weights.trustedSourceBonus})`);
  }

  let score = points;
  if (titleEntity) {
    score = points * weights.titleMatchMultiplier;
    reasons.push(`entity named in the headline (x${weights.titleMatchMultiplier})`);
  }

  for (const item of [...titleResult.unresolved, ...excerptResult.unresolved]) {
    reasons.push(
      `"${item.alias}" left unresolved (${item.reason}): ${item.candidates.join(" / ")} — no player credited`
    );
  }

  return { score: Math.round(score), reasons, entities };
}

export function prefilterPending({ limit } = {}) {
  const index = buildEntityIndex();
  const minimum = config.prefilter.minRelevanceScore;

  const pending = all(
    `SELECT a.id, a.title, a.excerpt, a.language, s.tier AS source_tier, s.kind AS source_kind, s.slug AS source_slug
       FROM articles a
       JOIN sources s ON s.id = a.source_id
      WHERE a.status = 'new' AND a.relevance_reason IS NULL
      ORDER BY a.detected_at DESC
      LIMIT ?`,
    Math.max(0, Number(limit ?? config.collect.maxArticlesPerRun))
  );

  const stats = { scored: 0, passed: 0, filteredOut: 0 };

  for (const article of pending) {
    const { score, reasons, entities } = scoreArticle(article, index);
    const passed = score >= minimum;

    transaction(() => {
      run(
        `UPDATE articles SET relevance_score = ?, relevance_reason = ?, status = ? WHERE id = ?`,
        score, reasons.join("; ").slice(0, 2000), passed ? "new" : "prefiltered_out", article.id
      );

      // Entities are stored even for rejected articles: a mention is still a
      // mention, and the Japan media-volume metrics count them.
      run("DELETE FROM article_entities WHERE article_id = ?", article.id);
      for (const entity of entities) {
        run(
          `INSERT INTO article_entities (article_id, entity_type, entity_id, matched_text, match_field, score)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(article_id, entity_type, entity_id) DO UPDATE SET score = excluded.score`,
          article.id, entity.entity_type, entity.entity_id, entity.matched_text, entity.match_field, entity.score
        );
      }
    });

    stats.scored += 1;
    if (passed) stats.passed += 1;
    else stats.filteredOut += 1;
  }

  log.info("prefilter complete", { ...stats, minimum });
  return stats;
}

export function prefilterStats() {
  return get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'new' AND relevance_reason IS NOT NULL THEN 1 ELSE 0 END) AS passed,
            SUM(CASE WHEN status = 'prefiltered_out' THEN 1 ELSE 0 END) AS filtered_out,
            SUM(CASE WHEN status = 'duplicate' THEN 1 ELSE 0 END) AS duplicates
       FROM articles`
  );
}

export default { scoreArticle, prefilterPending, prefilterStats };
