/**
 * Offline LLM test double.
 *
 * This is NOT a simulation of a model. It is a deterministic keyword parser that
 * emits exactly the JSON shape the real prompts demand, so the whole pipeline —
 * routing, caching, cost ledger, validation, persistence — is exercisable in CI
 * with no network and no API key. Every answer is derived from rules a reader
 * can check by eye; nothing here should ever be mistaken for intelligence.
 */
import { createLogger } from "../../lib/logger.js";
import { normalize } from "../../lib/text.js";

const log = createLogger("llm:mock");

/**
 * Ordered because a single article can trip several rules and the first match
 * wins: a transfer story that also mentions a goal is a transfer story.
 */
const EVENT_RULES = [
  {
    type: "transfer",
    subtype: "completed",
    keywords: ["completed the signing", "has signed for", "joins", "unveiled", "official signing", "完全移籍"],
  },
  { type: "transfer", subtype: "agreement", keywords: ["agreement", "agreed a deal", "personal terms", "medical", "合意"] },
  { type: "transfer", subtype: "bid", keywords: ["bid", "an offer", "transfer fee", "オファー"] },
  {
    type: "transfer",
    subtype: "interest",
    keywords: ["interest", "interested", "linked", "monitoring", "monitor", "tracking", "scouting", "talks", "transfer", "move to", "移籍", "関心"],
  },
  { type: "contract", subtype: "renewal", keywords: ["new contract", "contract extension", "extends", "renewal", "signs new deal", "契約延長"] },
  { type: "contract", subtype: "expiry", keywords: ["contract expires", "out of contract", "final year of his contract", "free agent", "契約満了"] },
  { type: "injury", subtype: "out", keywords: ["injury", "injured", "hamstring", "sidelined", "ruled out", "surgery", "knock", "負傷", "離脱"] },
  { type: "injury", subtype: "return", keywords: ["returns from injury", "back in training", "fit again", "復帰"] },
  { type: "performance", subtype: "goal", keywords: ["scored", "goal", "brace", "hat-trick", "assist", "man of the match", "ゴール"] },
  { type: "national_team", subtype: "call_up", keywords: ["japan squad", "samurai blue", "national team", "call-up", "world cup qualifier", "日本代表"] },
  { type: "commercial", subtype: "sponsorship", keywords: ["sponsor", "endorsement", "brand ambassador", "commercial deal", "スポンサー"] },
  { type: "club_situation", subtype: "manager", keywords: ["sacked", "new head coach", "new manager", "relegation", "監督"] },
  {
    type: "media",
    subtype: "manager_comment",
    keywords: ["said the manager", "manager said", "head coach said", "press conference", "told reporters after the match", "監督は語った", "監督が語った"],
  },
  {
    type: "media",
    subtype: "player_comment",
    keywords: ["the player said", "he told reporters", "told the press", "said in an interview about his future", "選手は語った", "本人は語った"],
  },
  { type: "media", subtype: "feature", keywords: ["interview", "documentary", "column", "インタビュー"] },
];

const STRONG_CLAIM_WORDS = ["official", "confirmed", "announced", "completed", "signed", "medical", "agreement", "公式"];
const WEAK_CLAIM_WORDS = ["rumour", "rumor", "linked", "monitoring", "monitor", "could", "reportedly", "speculation", "eyeing", "噂"];

const QUOTE_SUBTYPES = new Set(["manager_comment", "player_comment"]);

/**
 * Keyword doubles for the quote-derived signals `classify.js` now asks a real
 * model for. Negative phrasing is checked first because it is usually the
 * more specific tell ("not guaranteed a starting" vs. the bare word "start").
 */
const NEGATIVE_SENTIMENT_WORDS = ["not good enough", "disappointed", "needs to improve", "struggling", "concerned", "not entirely happy", "懸念", "物足りない"];
const POSITIVE_SENTIMENT_WORDS = ["excellent", "impressed", "deserves", "key player", "very pleased", "happy with his", "素晴らしい", "高く評価"];
const NEGATIVE_SELECTION_WORDS = ["not guaranteed a starting", "out of the squad", "left out", "benched", "no guarantees over his role", "起用は保証されない", "メンバー外"];
const POSITIVE_SELECTION_WORDS = ["nailed on starter", "guaranteed starter", "first-choice", "will start", "in my starting eleven", "レギュラーに定着"];
const INDIRECT_TRANSFER_WORDS = ["future is uncertain", "assess his options", "listening to offers", "not guaranteed to stay", "future away from the club", "could leave in the", "契約継続の保証はない", "移籍の可能性を排除しない"];

function firstHit(article, wordLists) {
  for (const [label, words] of wordLists) {
    const hit = words.find((word) => hasKeyword(article, word));
    if (hit) return { label, hit };
  }
  return null;
}

/**
 * The extra facts `classify.js`'s QUOTE_RULES asks a real model for, derived
 * the same deterministic way as everything else in this file. Only produced
 * for the two quote subtypes — a transfer/injury/contract article never gets
 * these fields, matching what the real prompt actually asks for.
 */
function quoteFacts(article, rule) {
  if (!QUOTE_SUBTYPES.has(rule.subtype)) return [];

  const facts = [];
  const speaker = rule.subtype === "manager_comment" ? "manager" : "player";
  facts.push({ field: "speaker", value: speaker, supporting_sentence: supportingSentence(article, rule.matched) });

  const sentiment = firstHit(article, [
    ["negative", NEGATIVE_SENTIMENT_WORDS],
    ["positive", POSITIVE_SENTIMENT_WORDS],
  ]);
  facts.push({
    field: "sentiment",
    value: sentiment?.label ?? "neutral",
    supporting_sentence: sentiment ? supportingSentence(article, sentiment.hit) : supportingSentence(article, rule.matched),
  });

  const selection = firstHit(article, [
    ["negative", NEGATIVE_SELECTION_WORDS],
    ["positive", POSITIVE_SELECTION_WORDS],
  ]);
  if (selection) {
    facts.push({ field: "selection_signal", value: selection.label, supporting_sentence: supportingSentence(article, selection.hit) });
  }

  const indirect = INDIRECT_TRANSFER_WORDS.find((word) => hasKeyword(article, word));
  if (indirect) {
    facts.push({ field: "transfer_signal_indirect", value: "positive", supporting_sentence: supportingSentence(article, indirect) });
  }

  return facts;
}

function extractTag(prompt, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(prompt);
  return match ? match[1].trim() : "";
}

function extractList(prompt, attribute) {
  const match = new RegExp(`${attribute}="([^"]*)"`).exec(prompt);
  if (!match || !match[1].trim()) return [];
  return match[1].split(";").map((value) => value.trim()).filter(Boolean);
}

/** The article as the prompt presented it — title plus the stored short excerpt. */
function readArticle(prompt) {
  const title = extractTag(prompt, "title");
  const excerpt = extractTag(prompt, "excerpt");
  return {
    title,
    excerpt,
    text: `${title}. ${excerpt}`.trim(),
    normalized: normalize(`${title} ${excerpt}`),
    rawLower: `${title} ${excerpt}`.toLowerCase(),
    players: extractList(prompt, "players"),
    clubs: extractList(prompt, "clubs"),
    tracked: extractList(prompt, "tracked"),
    currentClubs: extractList(prompt, "current"),
    playersJa: extractList(prompt, "players_ja"),
    clubsJa: extractList(prompt, "clubs_ja"),
    sourceName: (/<source[^>]*name="([^"]*)"/.exec(prompt) ?? [])[1] ?? "",
  };
}

function hasKeyword(article, keyword) {
  // Japanese has no word boundaries, so both surfaces are checked: the raw
  // lowercase string for kana/kanji and the normalized one for Latin text.
  if (article.rawLower.includes(keyword.toLowerCase())) return true;
  const normalized = normalize(keyword);
  return normalized.length > 0 && article.normalized.includes(normalized);
}

function matchRule(article) {
  for (const rule of EVENT_RULES) {
    const hit = rule.keywords.find((keyword) => hasKeyword(article, keyword));
    if (hit) return { ...rule, matched: hit };
  }
  return null;
}

/** Candidate names the prompt supplied, kept only when they actually appear in the text. */
function mentioned(article, names) {
  const seen = [];
  for (const name of names) {
    const index = article.normalized.indexOf(normalize(name));
    const rawIndex = article.rawLower.indexOf(name.toLowerCase());
    if (index >= 0) seen.push({ name, at: index });
    else if (rawIndex >= 0) seen.push({ name, at: rawIndex });
  }
  return seen.sort((a, b) => a.at - b.at).map((entry) => entry.name);
}

/** The sentence a fact came from, so the pipeline can check the claim is grounded. */
function supportingSentence(article, needle) {
  const sentences = article.text.split(/(?<=[.!?。])\s+/).filter(Boolean);
  const found = sentences.find((sentence) => normalize(sentence).includes(normalize(needle)));
  return found ?? sentences[0] ?? article.title;
}

/**
 * Japanese output templates.
 *
 * These produce a short factual summary of the EXTRACTED FACTS — never a
 * translation of the source article, which is what keeps the copyright position
 * defensible. Every template is hedged (〜と報じられている / 要確認); none of the
 * banned certainty phrasings (移籍確実, 掘り出し物, 完全にフィット) can be produced.
 */
const JA_TEMPLATES = {
  "transfer:interest": ({ player, club }) => `${player}に${club ?? "欧州クラブ"}が関心と報じられている`,
  "transfer:bid": ({ player, club }) => `${club ?? "獲得候補クラブ"}が${player}へオファーと報じられている`,
  "transfer:agreement": ({ player, club }) => `${player}と${club ?? "移籍先候補"}の合意が報じられている`,
  "transfer:completed": ({ player, club }) => `${player}の${club ?? "新クラブ"}への移籍が報じられている`,
  "contract:renewal": ({ player }) => `${player}の契約延長が報じられている`,
  "contract:expiry": ({ player }) => `${player}の契約満了が報じられている`,
  "injury:out": ({ player }) => `${player}の負傷・離脱が報じられている`,
  "injury:return": ({ player }) => `${player}の復帰が報じられている`,
  "performance:goal": ({ player }) => `${player}の直近の出場・得点が報じられている`,
  "national_team:call_up": ({ player }) => `${player}の代表関連の動きが報じられている`,
  "commercial:sponsorship": ({ player }) => `${player}のスポンサー関連の動きが報じられている`,
  "club_situation:manager": ({ club }) => `${club ?? "クラブ"}の監督人事が報じられている`,
  "media:manager_comment": ({ player }) => `${player}について監督がコメントしたと報じられている`,
  "media:player_comment": ({ player }) => `${player}が自身について語ったと報じられている`,
  "media:feature": ({ player }) => `${player}に関する記事が公開された`,
};

/** Japanese name when the prompt supplied one, else the Latin name. */
function japaneseName(article, name, list, jaList) {
  const index = list.findIndex((entry) => normalize(entry) === normalize(name ?? ""));
  return (index >= 0 && jaList[index]) || name || null;
}

function importanceFor(article, rule, players, clubs) {
  let importance = 2;
  if (players.some((name) => article.tracked.includes(name))) importance += 1;
  if (clubs.length >= 2) importance += 1;
  if (STRONG_CLAIM_WORDS.some((word) => hasKeyword(article, word))) importance += 1;
  if (rule.type === "media") importance -= 1;
  // A quote hinting at a move without an explicit transfer report is exactly
  // the case QUOTE_RULES exists for — worth surfacing, not filed as background.
  if (QUOTE_SUBTYPES.has(rule.subtype) && INDIRECT_TRANSFER_WORDS.some((word) => hasKeyword(article, word))) {
    importance += 1;
  }
  return Math.max(1, Math.min(5, importance));
}

function selfConfidence(article) {
  if (STRONG_CLAIM_WORDS.some((word) => hasKeyword(article, word))) return "high";
  if (WEAK_CLAIM_WORDS.some((word) => hasKeyword(article, word))) return "low";
  return "medium";
}

function triageResponse(article) {
  const rule = matchRule(article);
  const players = mentioned(article, article.players);
  const clubs = mentioned(article, article.clubs);

  if (!rule || (!players.length && !clubs.length)) {
    return {
      relevant: players.length > 0,
      event_present: false,
      event_type: null,
      event_subtype: null,
      importance: 1,
      players,
      clubs,
      reason: rule ? "no tracked entity named in the text" : "no event keyword matched",
    };
  }

  return {
    relevant: true,
    event_present: true,
    event_type: rule.type,
    event_subtype: rule.subtype,
    importance: importanceFor(article, rule, players, clubs),
    players,
    clubs,
    reason: `keyword rule matched: "${rule.matched}"`,
  };
}

function extractResponse(article, { upgradeConfidence = false } = {}) {
  const rule = matchRule(article);
  const players = mentioned(article, article.players);
  const clubs = mentioned(article, article.clubs);

  if (!rule) return { event: null, reason: "no event keyword matched" };

  // Direction comes from the club the prompt says the player is already at:
  // that one is the origin, the other named club is the counterparty. A real
  // model reads the sentence; this double just needs to be predictable.
  const isCurrent = (name) => article.currentClubs.some((value) => normalize(value) === normalize(name));
  const fromClub = rule.type === "transfer" ? clubs.find(isCurrent) ?? null : null;
  const toClub = rule.type === "transfer" ? clubs.find((name) => !isCurrent(name)) ?? null : null;
  const club = rule.type === "transfer" ? null : clubs[0] ?? null;

  const facts = [];
  if (players[0]) {
    facts.push({
      field: "player",
      value: players[0],
      supporting_sentence: supportingSentence(article, players[0]),
    });
  }
  if (toClub || club) {
    facts.push({
      field: rule.type === "transfer" ? "club_linked" : "club",
      value: toClub ?? club,
      supporting_sentence: supportingSentence(article, toClub ?? club),
    });
  }
  facts.push({
    field: "event_claim",
    value: `${rule.type}:${rule.subtype}`,
    supporting_sentence: supportingSentence(article, rule.matched),
  });
  facts.push(...quoteFacts(article, rule));

  const base = selfConfidence(article);
  const upgraded = upgradeConfidence && base === "low" ? "medium" : base;

  const playerJa = japaneseName(article, players[0], article.players, article.playersJa) ?? "対象選手";
  const clubJa = japaneseName(article, toClub ?? club, article.clubs, article.clubsJa);
  const template = JA_TEMPLATES[`${rule.type}:${rule.subtype}`] ?? (() => `${playerJa}に関する情報が更新された`);
  const headlineJa = template({ player: playerJa, club: clubJa });

  return {
    event: {
      type: rule.type,
      subtype: rule.subtype,
      player: players[0] ?? null,
      club,
      from_club: fromClub,
      to_club: toClub,
      headline: article.title,
      summary: article.excerpt || article.title,
      headline_ja: headlineJa,
      summary_ja: `${headlineJa}。情報源: ${article.sourceName || "未指定"}。契約状況および移籍可能性は直接確認が必要。`,
      occurred_at: null,
      completed_action: rule.subtype === "completed" || hasKeyword(article, "official"),
      importance: importanceFor(article, rule, players, clubs),
      confidence_self: upgraded,
      facts,
      contradicts: [],
    },
  };
}

export function createMockProvider() {
  return {
    name: "mock",

    async complete({ task, model, system = "", prompt = "", maxTokens }) {
      const article = readArticle(prompt);
      let payload;

      if (task === "triage") payload = triageResponse(article);
      else if (task === "extract") payload = extractResponse(article);
      else if (task === "escalate") payload = extractResponse(article, { upgradeConfidence: true });
      else payload = { error: `unknown task: ${task}` };

      const text = JSON.stringify(payload);
      log.debug("mock completion", { task, model, chars: text.length });

      return {
        text,
        model,
        // Four characters per token is the usual rough English ratio; it only
        // has to be stable so ledger and budget assertions are reproducible.
        inputTokens: Math.ceil((system.length + prompt.length) / 4),
        outputTokens: Math.min(maxTokens ?? Infinity, Math.ceil(text.length / 4)),
        cached: false,
      };
    },
  };
}

export default createMockProvider;
