/**
 * Tiered LLM classification.
 *
 * Cost control is the whole design here, in four layers:
 *   1. the rule-based prefilter has already thrown most articles away;
 *   2. the response cache means identical content is never paid for twice;
 *   3. a daily call and cost budget stops the job before it can run away;
 *   4. models are tiered — cheap triage for everything, a stronger model only
 *      for articles that actually carry an event, and the premium model only
 *      for a low-confidence extraction on a high-importance transfer claim.
 *
 * Nothing a model returns reaches the database before it has passed schema
 * validation. Malformed output marks the article as an error and goes to a
 * human; it never becomes a published claim.
 *
 * Cost arithmetic at these thresholds, so the ¥10,000/month ceiling is auditable
 * (prices from config.llm.pricing, USD per million tokens):
 *   200 articles collected/day -> ~60 survive the prefilter and are triaged.
 *     triage   60/day  x (450 in x $1  + 150 out x $5 ) / 1M = $0.072/day
 *   ~40% of triaged articles carry a real event -> 24 extractions.
 *     extract  24/day  x (500 in x $3  + 400 out x $15) / 1M = $0.180/day
 *   ~5% of extractions are low-confidence major claims -> ~1 escalation.
 *     escalate  1/day  x (500 in x $5  + 400 out x $25) / 1M = $0.013/day
 *   Total ~$0.27/day ~= $8/month ~= JPY 1,200/month before cache hits, which
 *   removes every repeat of the same content. That leaves the rest of the
 *   JPY 10,000 budget for hosting and email.
 */
import { config, EVENT_TYPES } from "../config/index.js";
import { all, get, run } from "../db/client.js";
import { sha256 } from "../lib/hash.js";
import { createLogger } from "../lib/logger.js";
import { containsAlias, containsJapanese, normalize, normalizeAlias } from "../lib/text.js";
import { todayInTimezone } from "../lib/time.js";
import { createMockProvider } from "../providers/llm/mock-provider.js";
import { persistExtraction } from "./persist.js";

const log = createLogger("classify");

/**
 * Routing thresholds. Stated as constants because they are the cost/recall
 * trade-off of the whole platform and should be argued about explicitly.
 */
const EXTRACT_MIN_IMPORTANCE = 2; // triage importance 1 is background noise
const ESCALATE_MIN_IMPORTANCE = 4; // "major claim" floor
const ESCALATE_TYPES = new Set(["transfer", "contract"]);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const WORDING_RULES = `Wording rules (these are product rules, not style preferences):
- Never write "final recommendation", "hidden gem", "perfect fit", "guaranteed availability",
  "risk-free" or "cheap". Availability and contract status are always verification items.
- Never state a rumour as a fact. Report what a source claims, not what is true.
- Never estimate a fee, a salary or a probability. You do not compute scores.`;

const SHARED_RULES = `You are an extraction component inside a football intelligence pipeline.
Return STRICT JSON only: no prose, no markdown, no code fences, no trailing commas.

- Use the article text supplied. Do not use outside knowledge and do not speculate.
- If a field is not stated in the text, return null. Never guess a value to fill a field.
- Every extracted fact must carry the sentence from the text that supports it, copied verbatim.
${WORDING_RULES}

Japanese output rules:
- The Japanese fields are a SHORT FACTUAL SUMMARY OF THE EXTRACTED FACTS. They are not a
  translation of the article and must never reproduce its sentences.
- Hedge the same way the English does: 「〜と報じられている」「要確認」「移籍可能性は直接確認が必要」.
- Never write 「移籍確実」「掘り出し物」「完全にフィット」「絶対に獲得すべき」.`;

export const TRIAGE_SYSTEM = `${SHARED_RULES}

Task: triage. Decide whether this article is about one of the named players or clubs,
whether it reports a real event, and which entities it involves. Be conservative:
a preview, a match report with no incident, or an opinion column is not an event.`;

export const EXTRACT_SYSTEM = `${SHARED_RULES}

Task: extraction. Extract the single most important event in the article as structured facts.
Only name a club the text names. If the direction of a transfer is not stated, leave the
club fields null rather than inferring one.
Return headline_ja and summary_ja as well: one short Japanese line stating what is reported,
plus a Japanese summary that ends with the verification point.`;

export const ESCALATE_SYSTEM = `${SHARED_RULES}

Task: escalation. A cheaper model produced a low-confidence extraction of a high-importance
claim. Re-read the text and extract the event again. If the text does not actually support the
claim, say so by returning a lower importance and confidence_self "low" — resolving ambiguity
downwards is a correct answer.`;

/**
 * The article as the model sees it: headline, stored excerpt, source tier, and
 * the entity candidates the rule layer already matched. Full article bodies are
 * never sent — the copyright rule applies to prompts too.
 */
export function buildArticlePrompt(article, source, candidates) {
  const names = (list) => list.map((entry) => entry.name).join("; ");
  const namesJa = (list) => list.map((entry) => entry.nameJa ?? entry.name).join("; ");
  return [
    "<article>",
    `<title>${article.title ?? ""}</title>`,
    `<excerpt>${article.excerpt ?? ""}</excerpt>`,
    `<source tier="${source?.tier ?? 4}" kind="${source?.kind ?? "unknown"}" name="${source?.name ?? ""}"></source>`,
    `<published>${article.published_at ?? ""}</published>`,
    `<candidates players="${names(candidates.players)}" clubs="${names(candidates.clubs)}"` +
      ` tracked="${names(candidates.players.filter((entry) => entry.tracked))}"` +
      ` current="${names(candidates.currentClubs)}"` +
      ` players_ja="${namesJa(candidates.players)}" clubs_ja="${namesJa(candidates.clubs)}"></candidates>`,
    "</article>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Schemas — the gate between a model and the database
// ---------------------------------------------------------------------------

export const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["relevant", "event_present", "event_type", "event_subtype", "importance", "players", "clubs", "reason"],
  properties: {
    relevant: { type: "boolean" },
    event_present: { type: "boolean" },
    event_type: { type: ["string", "null"], enum: [...EVENT_TYPES, null] },
    event_subtype: { type: ["string", "null"] },
    importance: { type: "integer", minimum: 1, maximum: 5 },
    players: { type: "array", items: { type: "string" } },
    clubs: { type: "array", items: { type: "string" } },
    reason: { type: "string" },
  },
};

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["event"],
  properties: {
    reason: { type: ["string", "null"] },
    event: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["type", "subtype", "player", "headline", "importance", "confidence_self", "facts"],
      properties: {
        type: { type: "string", enum: EVENT_TYPES },
        subtype: { type: ["string", "null"] },
        player: { type: ["string", "null"] },
        club: { type: ["string", "null"] },
        from_club: { type: ["string", "null"] },
        to_club: { type: ["string", "null"] },
        headline: { type: "string" },
        summary: { type: ["string", "null"] },
        headline_ja: { type: ["string", "null"] },
        summary_ja: { type: ["string", "null"] },
        occurred_at: { type: ["string", "null"] },
        completed_action: { type: "boolean" },
        importance: { type: "integer", minimum: 1, maximum: 5 },
        confidence_self: { type: "string", enum: ["low", "medium", "high"] },
        contradicts: { type: "array", items: { type: "string" } },
        facts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "value", "supporting_sentence"],
            properties: {
              field: { type: "string" },
              value: { type: ["string", "null"] },
              supporting_sentence: { type: "string" },
            },
          },
        },
      },
    },
  },
};

function typeMatches(value, expected) {
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "integer") return Number.isInteger(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
    return typeof value === type;
  });
}

/** Deliberately small: only the JSON Schema subset the two schemas above use. */
export function validateAgainstSchema(value, schema, path = "$") {
  const errors = [];
  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push(`${path}: expected ${JSON.stringify(schema.type)}, got ${Array.isArray(value) ? "array" : typeof value}`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((entry, index) => errors.push(...validateAgainstSchema(entry, schema.items, `${path}[${index}]`)));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value) && schema.properties) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}.${key}: missing`);
    }
    for (const [key, entry] of Object.entries(value)) {
      const property = schema.properties[key];
      if (!property) {
        if (schema.additionalProperties === false) errors.push(`${path}.${key}: unexpected property`);
        continue;
      }
      errors.push(...validateAgainstSchema(entry, property, `${path}.${key}`));
    }
  }
  return errors;
}

export function parseModelJson(text) {
  const trimmed = String(text ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error.message}` };
  }
}

// ---------------------------------------------------------------------------
// Entity candidates
// ---------------------------------------------------------------------------

function buildAliasIndex() {
  const players = all(
    `SELECT pa.alias, pa.alias_norm, pa.player_id AS id, p.name_en AS name, p.name_ja AS name_ja,
            p.tracked, p.current_club_id
       FROM player_aliases pa JOIN players p ON p.id = pa.player_id`
  );
  const clubs = all(
    `SELECT ca.alias, ca.alias_norm, ca.club_id AS id, c.name_en AS name, c.name_ja AS name_ja
       FROM club_aliases ca JOIN clubs c ON c.id = ca.club_id`
  );
  return { players, clubs };
}

/**
 * Prefilter already wrote `article_entities`; those matches are trusted first.
 * The alias scan is the fallback so classification still works on an article
 * inserted directly (tests, backfills) without re-running the rule layer.
 */
function candidatesFor(article, index) {
  const haystack = normalize(`${article.title} ${article.excerpt ?? ""}`);
  const japanese = normalizeAlias(`${article.title} ${article.excerpt ?? ""}`);

  const stored = all(
    "SELECT entity_type, entity_id FROM article_entities WHERE article_id = ?",
    article.id
  );
  const storedPlayers = new Set(stored.filter((row) => row.entity_type === "player").map((row) => row.entity_id));
  const storedClubs = new Set(stored.filter((row) => row.entity_type === "club").map((row) => row.entity_id));

  const matched = (rows, storedIds) => {
    const byId = new Map();
    for (const row of rows) {
      const isJapanese = containsJapanese(row.alias);
      const hit =
        storedIds.has(row.id) ||
        containsAlias(isJapanese ? japanese : haystack, row.alias_norm, isJapanese);
      if (hit && !byId.has(row.id)) byId.set(row.id, row);
    }
    return [...byId.values()];
  };

  const players = matched(index.players, storedPlayers);
  const clubs = matched(index.clubs, storedClubs);
  const currentClubIds = new Set(players.map((player) => player.current_club_id).filter(Boolean));

  return {
    players: players.map((row) => ({ id: row.id, name: row.name, nameJa: row.name_ja, tracked: row.tracked === 1 })),
    clubs: clubs.map((row) => ({ id: row.id, name: row.name, nameJa: row.name_ja })),
    currentClubs: clubs.filter((row) => currentClubIds.has(row.id)).map((row) => ({ id: row.id, name: row.name })),
  };
}

/** Exact normalized alias match. Ambiguous names resolve to nothing on purpose. */
function resolveByAlias(name, rows) {
  if (!name) return null;
  const wanted = normalizeAlias(name);
  const hits = new Map();
  for (const row of rows) {
    if (row.alias_norm === wanted) hits.set(row.id, row);
  }
  if (hits.size !== 1) return null;
  return [...hits.values()][0];
}

// ---------------------------------------------------------------------------
// Cache, cost and budget
// ---------------------------------------------------------------------------

export function cacheKeyFor(model, task, contentHash) {
  return sha256(`${model}|${task}|${contentHash}`);
}

function readCache(key) {
  const row = get("SELECT * FROM llm_cache WHERE cache_key = ?", key);
  if (!row) return null;
  const ageDays = (Date.now() - new Date(`${row.created_at}Z`).getTime()) / 86_400_000;
  if (Number.isFinite(ageDays) && ageDays > config.llm.cacheTtlDays) return null;
  run("UPDATE llm_cache SET hits = hits + 1 WHERE cache_key = ?", key);
  return row;
}

function writeCache(key, { model, task, text, inputTokens, outputTokens }) {
  run(
    `INSERT INTO llm_cache (cache_key, model, task, response, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET response = excluded.response`,
    key, model, task, text, inputTokens, outputTokens
  );
}

export function costOf(model, inputTokens, outputTokens) {
  const pricing = config.llm.pricing[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

function recordCost({ provider, operation, model, inputTokens, outputTokens, costUsd, asOfDate }) {
  run(
    `INSERT INTO cost_ledger (as_of_date, provider, operation, model, calls, input_units, output_units, cost_usd, meta)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
     ON CONFLICT(as_of_date, provider, operation, model) DO UPDATE SET
       calls = cost_ledger.calls + 1,
       input_units = cost_ledger.input_units + excluded.input_units,
       output_units = cost_ledger.output_units + excluded.output_units,
       cost_usd = cost_ledger.cost_usd + excluded.cost_usd`,
    asOfDate, provider, operation, model, inputTokens, outputTokens, costUsd,
    // The mock provider is priced too, so budget behaviour is testable offline;
    // the provider column keeps the ledger honest about which spend was real.
    JSON.stringify({ simulated: provider === "mock" })
  );
}

function spendToday(asOfDate) {
  const row = get(
    `SELECT COALESCE(SUM(calls), 0) AS calls, COALESCE(SUM(cost_usd), 0) AS cost
       FROM cost_ledger WHERE as_of_date = ? AND operation IN ('triage', 'extract', 'escalate')`,
    asOfDate
  );
  return { calls: row.calls, costUsd: row.cost };
}

function budgetBreach(asOfDate) {
  const spend = spendToday(asOfDate);
  if (spend.calls >= config.llm.dailyCallBudget) {
    return `daily call budget reached (${spend.calls}/${config.llm.dailyCallBudget})`;
  }
  if (spend.costUsd >= config.llm.dailyCostBudgetUsd) {
    return `daily cost budget reached ($${spend.costUsd.toFixed(4)}/$${config.llm.dailyCostBudgetUsd})`;
  }
  return null;
}

function queueReview({ itemType, itemId, reason, detail, priority }) {
  run(
    `INSERT INTO review_queue (item_type, item_id, reason, detail, priority) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_type, item_id, reason) DO UPDATE SET detail = excluded.detail, status = 'open'`,
    itemType, itemId, reason, detail, priority
  );
}

/**
 * The provider registry owns provider selection. It is imported lazily and with
 * a fallback so this module stays usable — and testable — on its own.
 */
async function resolveProvider() {
  try {
    const registry = await import("../providers/index.js");
    if (typeof registry.getLlmProvider === "function") return registry.getLlmProvider();
  } catch {
    log.debug("provider registry unavailable, using the mock provider");
  }
  return createMockProvider();
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function classifyPending({ limit, force = false, provider: injected } = {}) {
  const provider = injected ?? (await resolveProvider());
  const asOfDate = todayInTimezone();
  const index = buildAliasIndex();

  const statuses = force ? ["new", "classified", "error"] : ["new"];
  const articles = all(
    `SELECT * FROM articles
      WHERE status IN (${statuses.map(() => "?").join(", ")}) AND relevance_score >= ?
      ORDER BY relevance_score DESC, detected_at DESC
      LIMIT ?`,
    ...statuses, config.prefilter.minRelevanceScore, Number(limit ?? config.collect.maxArticlesPerRun)
  );

  const stats = {
    considered: articles.length,
    classified: 0,
    cacheHits: 0,
    skipped: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    costUsd: 0,
    errors: 0,
    queuedForReview: 0,
    budgetStopped: null,
  };

  /** One call: cache first, budget second, provider last. */
  async function complete({ task, model, system, article, prompt }) {
    const key = cacheKeyFor(model, task, article.content_hash);
    if (!force) {
      const cached = readCache(key);
      if (cached) {
        stats.cacheHits += 1;
        return { text: cached.response, cached: true };
      }
    }

    const breach = budgetBreach(asOfDate);
    if (breach) return { text: null, cached: false, budgetStopped: breach };

    const response = await provider.complete({
      task,
      model,
      system,
      prompt,
      maxTokens: config.llm.maxOutputTokens,
    });

    const costUsd = costOf(model, response.inputTokens, response.outputTokens);
    recordCost({
      provider: provider.name,
      operation: task,
      model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costUsd,
      asOfDate,
    });
    stats.costUsd += costUsd;
    writeCache(key, {
      model,
      task,
      text: response.text,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    });
    return { text: response.text, cached: false };
  }

  function failArticle(article, message) {
    run("UPDATE articles SET status = 'error', error = ?, processed_at = datetime('now') WHERE id = ?", message, article.id);
    queueReview({
      itemType: "claim",
      itemId: article.id,
      reason: "invalid_model_output",
      detail: `Article ${article.id} — ${message}. No event was created.`,
      priority: 3,
    });
    stats.errors += 1;
    stats.queuedForReview += 1;
  }

  for (const article of articles) {
    const source = get("SELECT * FROM sources WHERE id = ?", article.source_id);
    const candidates = candidatesFor(article, index);
    const prompt = buildArticlePrompt(article, source, candidates);

    // --- tier 1: triage every surviving article on the cheap model ---------
    const triageResult = await complete({
      task: "triage",
      model: config.llm.models.triage,
      system: TRIAGE_SYSTEM,
      article,
      prompt,
    });
    if (triageResult.budgetStopped) {
      stats.budgetStopped = triageResult.budgetStopped;
      break;
    }

    const triageJson = parseModelJson(triageResult.text);
    if (!triageJson.ok) {
      failArticle(article, triageJson.error);
      continue;
    }
    const triageErrors = validateAgainstSchema(triageJson.value, TRIAGE_SCHEMA);
    if (triageErrors.length) {
      failArticle(article, `triage schema: ${triageErrors.slice(0, 3).join("; ")}`);
      continue;
    }

    const triage = triageJson.value;
    if (!triage.relevant || !triage.event_present || triage.importance < EXTRACT_MIN_IMPORTANCE) {
      run(
        "UPDATE articles SET status = 'classified', processed_at = datetime('now'), relevance_reason = ? WHERE id = ?",
        `triage: ${triage.reason}`.slice(0, 300), article.id
      );
      stats.skipped += 1;
      stats.classified += 1;
      continue;
    }

    // --- tier 2: extraction, only for articles that carry an event --------
    const extractResult = await complete({
      task: "extract",
      model: config.llm.models.extract,
      system: EXTRACT_SYSTEM,
      article,
      prompt,
    });
    if (extractResult.budgetStopped) {
      stats.budgetStopped = extractResult.budgetStopped;
      break;
    }

    let parsed = parseModelJson(extractResult.text);
    if (!parsed.ok) {
      failArticle(article, parsed.error);
      continue;
    }
    let errors = validateAgainstSchema(parsed.value, EXTRACTION_SCHEMA);
    if (errors.length) {
      failArticle(article, `extract schema: ${errors.slice(0, 3).join("; ")}`);
      continue;
    }
    let event = parsed.value.event;
    let usedModel = config.llm.models.extract;

    // --- tier 3: escalate a low-confidence, high-importance major claim ---
    const player = event ? resolveByAlias(event.player, index.players) : null;
    const shouldEscalate =
      event &&
      event.confidence_self === "low" &&
      Math.max(event.importance, triage.importance) >= ESCALATE_MIN_IMPORTANCE &&
      ESCALATE_TYPES.has(event.type) &&
      player?.tracked === 1;

    if (shouldEscalate) {
      const escalated = await complete({
        task: "escalate",
        model: config.llm.models.escalate,
        system: ESCALATE_SYSTEM,
        article,
        prompt,
      });
      if (escalated.budgetStopped) {
        stats.budgetStopped = escalated.budgetStopped;
        // The extraction in hand is still usable; persist it and stop after.
      } else {
        const reparsed = parseModelJson(escalated.text);
        const reErrors = reparsed.ok ? validateAgainstSchema(reparsed.value, EXTRACTION_SCHEMA) : ["unparseable"];
        if (reparsed.ok && !reErrors.length && reparsed.value.event) {
          parsed = reparsed;
          event = reparsed.value.event;
          usedModel = config.llm.models.escalate;
        }
      }
    }

    if (!event) {
      run("UPDATE articles SET status = 'classified', processed_at = datetime('now') WHERE id = ?", article.id);
      stats.skipped += 1;
      stats.classified += 1;
      continue;
    }

    // A supporting sentence that is not in the supplied text is not evidence.
    // The event still persists — its confidence is bounded by its sources
    // anyway — but the unsupported claim is flagged for a human.
    const haystack = normalize(`${article.title} ${article.excerpt ?? ""}`);
    const facts = event.facts.map((fact) => ({
      field: fact.field,
      value: fact.value,
      supportingSentence: fact.supporting_sentence,
      supported: haystack.includes(normalize(fact.supporting_sentence)),
    }));

    const toClub = resolveByAlias(event.to_club, index.clubs);
    const fromClub = resolveByAlias(event.from_club, index.clubs);
    const club = resolveByAlias(event.club, index.clubs);

    const result = persistExtraction(article, {
      type: event.type,
      subtype: event.subtype,
      playerId: player?.id ?? null,
      playerName: event.player,
      clubId: club?.id ?? null,
      fromClubId: fromClub?.id ?? null,
      toClubId: toClub?.id ?? null,
      headline: event.headline,
      summary: event.summary,
      headlineJa: event.headline_ja ?? null,
      summaryJa: event.summary_ja ?? null,
      occurredAt: event.occurred_at ?? article.published_at,
      importance: Math.max(event.importance, triage.importance),
      completedAction: event.completed_action === true,
      confidenceSelf: event.confidence_self,
      facts,
      contradicts: event.contradicts ?? [],
      payload: {
        model: usedModel,
        triage: { importance: triage.importance, reason: triage.reason },
        facts,
        unsupportedFacts: facts.filter((fact) => !fact.supported).length,
      },
    });

    stats.eventsCreated += result.created.length;
    stats.eventsUpdated += result.updated.length;
    stats.queuedForReview += result.queuedForReview.length;
    // The article's Japanese fields are the same fact summary, not a translation
    // of the source body, so they can be stored under the same copyright rule.
    run(
      `UPDATE articles SET status = 'classified', processed_at = datetime('now'),
          title_ja = COALESCE(?, title_ja), summary_ja = COALESCE(?, summary_ja) WHERE id = ?`,
      event.headline_ja ?? null, event.summary_ja ?? null, article.id
    );
    stats.classified += 1;

    if (stats.budgetStopped) break;
  }

  if (stats.budgetStopped) {
    log.warn("stopped on budget", { reason: stats.budgetStopped });
    queueReview({
      itemType: "source",
      itemId: 0,
      reason: "llm_budget_exhausted",
      detail: `Classification stopped on ${asOfDate}: ${stats.budgetStopped}. ` +
        `${stats.considered - stats.classified} articles left unclassified.`,
      priority: 4,
    });
    stats.queuedForReview += 1;
  }

  stats.costUsd = Number(stats.costUsd.toFixed(6));
  log.info("classify complete", stats);
  return stats;
}

export default classifyPending;
