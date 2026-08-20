/**
 * Central configuration for Japan Football Intelligence (JFI).
 *
 * Every tunable lives here so that scoring behaviour, cost controls and provider
 * selection can be reviewed in one place. Nothing in the pipeline should read
 * `process.env` directly.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadDotEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

function str(key, fallback = "") {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

function num(key, fallback) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function bool(key, fallback = false) {
  const value = str(key).toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

/**
 * Confidence ladder. Rank is used for comparisons and for deciding whether a
 * claim may be stated as fact anywhere in the product.
 */
export const CONFIDENCE = {
  UNVERIFIED: { key: "unverified", rank: 1, label: "Unverified" },
  RUMORED: { key: "rumored", rank: 2, label: "Rumored" },
  REPORTED: { key: "reported", rank: 3, label: "Reported" },
  STRONGLY_REPORTED: { key: "strongly_reported", rank: 4, label: "Strongly reported" },
  CONFIRMED: { key: "confirmed", rank: 5, label: "Confirmed" },
};

export const CONFIDENCE_BY_KEY = Object.fromEntries(
  Object.values(CONFIDENCE).map((entry) => [entry.key, entry])
);

export const CONFIDENCE_ORDER = Object.values(CONFIDENCE)
  .sort((a, b) => a.rank - b.rank)
  .map((entry) => entry.key);

/** Source tiers drive both confidence and signal weighting. */
export const SOURCE_TIERS = {
  1: { label: "Official", weight: 1.0, maxConfidence: "confirmed" },
  2: { label: "Tier-1 reporting", weight: 0.8, maxConfidence: "strongly_reported" },
  3: { label: "Credible media", weight: 0.55, maxConfidence: "reported" },
  4: { label: "Aggregator / social", weight: 0.25, maxConfidence: "rumored" },
};

export const EVENT_TYPES = [
  "transfer",
  "contract",
  "injury",
  "performance",
  "national_team",
  "media",
  "social",
  "commercial",
  "club_situation",
];

export const config = {
  env: str("NODE_ENV", "development"),
  port: num("PORT", 3000),

  /** JFI is mounted under a prefix so the deployed Japan Talent Desk LP at `/` is untouched. */
  basePath: str("JFI_BASE_PATH", "/intel").replace(/\/$/, ""),
  siteName: "Japan Football Intelligence",
  siteShortName: "JFI",
  b2bName: "Japan Talent Desk",
  canonicalOrigin: str("JFI_CANONICAL_ORIGIN", ""),
  timezone: str("JFI_TIMEZONE", "Asia/Tokyo"),

  database: {
    file: str("JFI_DB_PATH", join(rootDir, "var", "jfi.db")),
  },

  admin: {
    user: str("JFI_ADMIN_USER", "admin"),
    password: str("JFI_ADMIN_PASSWORD", ""),
    get enabled() {
      return Boolean(str("JFI_ADMIN_PASSWORD"));
    },
  },

  http: {
    userAgent: str(
      "JFI_USER_AGENT",
      "JapanFootballIntelligenceBot/0.1 (+https://scout.ai-orchestra.work; contact scout@ai-orchestra.work)"
    ),
    timeoutMs: num("JFI_HTTP_TIMEOUT_MS", 15000),
    retries: num("JFI_HTTP_RETRIES", 2),
    perHostDelayMs: num("JFI_HTTP_HOST_DELAY_MS", 1200),
    maxBytes: num("JFI_HTTP_MAX_BYTES", 4_000_000),
    respectRobots: bool("JFI_RESPECT_ROBOTS", true),
  },

  collect: {
    /** Hard ceiling per run so a misconfigured feed cannot blow up cost. */
    maxArticlesPerRun: num("JFI_MAX_ARTICLES_PER_RUN", 400),
    maxArticlesPerSource: num("JFI_MAX_ARTICLES_PER_SOURCE", 40),
    lookbackDays: num("JFI_COLLECT_LOOKBACK_DAYS", 7),
  },

  /**
   * Rule-based gate that runs BEFORE any LLM call. This is the single most
   * important cost control in the system.
   */
  prefilter: {
    minRelevanceScore: num("JFI_MIN_RELEVANCE", 40),
    /** Below this an article is stored but never classified. */
    entityMatchScore: 55,
    japanKeywordScore: 20,
    footballKeywordScore: 10,
    eventKeywordScore: 15,
    trustedSourceBonus: 10,
    titleMatchMultiplier: 1.25,
  },

  llm: {
    provider: str("JFI_LLM_PROVIDER", "auto"), // auto | anthropic | mock
    apiKey: str("ANTHROPIC_API_KEY", ""),
    baseUrl: str("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
    /** Tiered routing: cheap triage, strong extraction, premium only on escalation. */
    models: {
      triage: str("JFI_MODEL_TRIAGE", "claude-haiku-4-5-20251001"),
      extract: str("JFI_MODEL_EXTRACT", "claude-sonnet-5"),
      escalate: str("JFI_MODEL_ESCALATE", "claude-opus-5"),
    },
    /** USD per million tokens, used by the cost ledger. Update from the pricing docs. */
    pricing: {
      "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
      "claude-sonnet-5": { input: 3.0, output: 15.0 },
      "claude-opus-5": { input: 5.0, output: 25.0 },
    },
    maxOutputTokens: num("JFI_LLM_MAX_OUTPUT_TOKENS", 1600),
    dailyCallBudget: num("JFI_LLM_DAILY_CALL_BUDGET", 600),
    dailyCostBudgetUsd: num("JFI_LLM_DAILY_COST_BUDGET_USD", 5),
    cacheTtlDays: num("JFI_LLM_CACHE_TTL_DAYS", 45),
  },

  /**
   * Transfer Signal weights. Deliberately transparent and additive: the product
   * promises no fake precision, so every point must be explainable in the UI.
   */
  transferSignal: {
    weights: {
      reportVolume: 26,
      sourceQuality: 22,
      clubsLinked: 16,
      contractPressure: 16,
      playerSideSignal: 10,
      clubSituation: 10,
    },
    halfLifeDays: 6,
    windowDays: 21,
    bands: [
      { key: "low", label: "LOW", min: 0 },
      { key: "medium", label: "MEDIUM", min: 25 },
      { key: "high", label: "HIGH", min: 50 },
      { key: "very_high", label: "VERY HIGH", min: 75 },
    ],
    momentumWindowDays: 7,
  },

  /**
   * Japan Market Score components. Each component is 0-100 and computed from a
   * measured input. Missing inputs are excluded and reduce the coverage figure
   * rather than being guessed.
   */
  japanMarketScore: {
    components: {
      japanSocialAudience: { weight: 26, min: 1_000, max: 4_000_000, scale: "log" },
      socialGrowth30d: { weight: 14, min: 0, max: 0.12, scale: "linear" },
      japanMediaMentions30d: { weight: 22, min: 0, max: 120, scale: "log" },
      japanSearchInterest: { weight: 16, min: 0, max: 100, scale: "linear" },
      nationalTeamRelevance: { weight: 14, min: 0, max: 100, scale: "linear" },
      leagueVisibilityInJapan: { weight: 8, min: 0, max: 100, scale: "linear" },
    },
    /** Below this share of weight covered by real data, publish the score as provisional. */
    minCoverage: 0.6,
    bands: [
      { key: "low", label: "LOW", min: 0 },
      { key: "moderate", label: "MODERATE", min: 35 },
      { key: "high", label: "HIGH", min: 60 },
      { key: "very_high", label: "VERY HIGH", min: 80 },
    ],
  },

  review: {
    /** Anything at or above this importance always reaches a human. */
    autoQueueImportance: 4,
    queueConfidenceCeiling: "reported",
    maxOpenItems: num("JFI_REVIEW_MAX_OPEN", 250),
  },

  newsletter: {
    /**
     * docs/newsletter/operations.md forbids automated sending. The pipeline may
     * draft, but a human must approve before Brevo is called.
     */
    requireHumanApproval: bool("JFI_NEWSLETTER_REQUIRE_APPROVAL", true),
    brevoApiKey: str("BREVO_API_KEY", ""),
    listId: num("BREVO_LIST_ID_JAPAN_MARKET_WEEKLY", 0),
    senderEmail: str("BREVO_SENDER_EMAIL", "scout@ai-orchestra.work"),
    senderName: str("BREVO_SENDER_NAME", "Japan Talent Desk"),
  },

  social: {
    requireHumanApproval: bool("JFI_SOCIAL_REQUIRE_APPROVAL", true),
  },
};

export function confidenceRank(key) {
  return CONFIDENCE_BY_KEY[key]?.rank ?? 0;
}

export function bandFor(bands, score) {
  let current = bands[0];
  for (const band of bands) {
    if (score >= band.min) current = band;
  }
  return current;
}

export default config;
