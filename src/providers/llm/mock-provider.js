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
  { type: "media", subtype: "feature", keywords: ["interview", "documentary", "column", "インタビュー"] },
];

const STRONG_CLAIM_WORDS = ["official", "confirmed", "announced", "completed", "signed", "medical", "agreement", "公式"];
const WEAK_CLAIM_WORDS = ["rumour", "rumor", "linked", "monitoring", "monitor", "could", "reportedly", "speculation", "eyeing", "噂"];

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

function importanceFor(article, rule, players, clubs) {
  let importance = 2;
  if (players.some((name) => article.tracked.includes(name))) importance += 1;
  if (clubs.length >= 2) importance += 1;
  if (STRONG_CLAIM_WORDS.some((word) => hasKeyword(article, word))) importance += 1;
  if (rule.type === "media") importance -= 1;
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

  const base = selfConfidence(article);
  const upgraded = upgradeConfidence && base === "low" ? "medium" : base;

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
