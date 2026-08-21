/**
 * The shared UI vocabulary for Japan Football Intelligence.
 *
 * The product UI is Japanese-first: the reader is a Japanese follower of
 * Japanese players abroad. Latin text survives only where it is the real name of
 * a thing (source names, article headlines, league names in secondary type) —
 * the view layer never fake-translates third-party text.
 *
 * Two rules run through every component here:
 *   1. Every string that came from outside this repository goes through
 *      `escapeHtml`. Article titles and source names are third-party text.
 *   2. 噂 must never look like 確定. Confidence is encoded three ways at once —
 *      label, filled rank ticks, and colour — so it survives greyscale, colour
 *      blindness and a screen reader.
 */
import { CONFIDENCE_BY_KEY, CONFIDENCE_ORDER, SOURCE_TIERS, config } from "../config/index.js";
import { escapeHtml } from "../lib/text.js";
import { formatDate, timeInTimezone } from "../lib/time.js";

export { escapeHtml };

const POSITION_NAMES = {
  GK: "GK",
  CB: "センターバック",
  LB: "左サイドバック",
  RB: "右サイドバック",
  DM: "守備的MF",
  CM: "セントラルMF",
  AM: "攻撃的MF",
  LW: "左ウイング",
  RW: "右ウイング",
  ST: "ストライカー",
};

const CONFIDENCE_LABELS = {
  unverified: "未確認",
  rumored: "噂",
  reported: "報道",
  strongly_reported: "有力報道",
  confirmed: "確定",
};

/** What each confidence level actually takes, in the product's own words. */
const CONFIDENCE_MEANING = {
  unverified: "未確認。アグリゲーター、SNS、または単一の低ティア言及のみ。事実として扱わないでください。",
  rumored: "噂。信頼できるメディア1社の報道のみで、裏付けとなる情報はありません。",
  reported: "報道。ティア1報道機関1社、または信頼できるメディア2社以上が報じています。",
  strongly_reported: "有力報道。独立したティア1報道機関2社以上が報じています。",
  confirmed: "確定。クラブ・リーグ・協会の公式発表に基づきます。",
};

const BAND_LABELS = {
  low: "低",
  medium: "中",
  moderate: "中程度",
  high: "高",
  very_high: "非常に高い",
  // managerSentiment bands (config.managerSentiment.bands) — a different axis
  // (negative-to-positive tone), not a signal-strength scale, so they get
  // their own labels rather than being folded into low/medium/high.
  negative: "否定的",
  mixed: "賛否混在",
  positive: "肯定的",
  very_positive: "非常に肯定的",
};

const TIER_LABELS = {
  1: "公式",
  2: "一次報道",
  3: "信頼メディア",
  4: "アグリゲーター/SNS",
};

export function positionName(code) {
  return POSITION_NAMES[String(code || "").toUpperCase()] || "";
}

/** Reads a value under any of the spellings the pipeline might hand back. */
export function pick(object, ...keys) {
  if (!object || typeof object !== "object") return undefined;
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * Japanese rendering wins when the pipeline supplied one. It never machine
 * translates here: `headline_ja` is written by the intelligence layer as a
 * summary of the facts, and English is the honest fallback when it is null.
 */
export function preferJa(row, jaKey, enKey) {
  return pick(row, jaKey) ?? pick(row, enKey) ?? "";
}

/** Only http(s) links are ever emitted; anything else renders as inert text. */
export function safeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function attr(value) {
  return escapeHtml(String(value ?? ""));
}

/**
 * Bilingual entity name: Japanese primary, English secondary in smaller type.
 * Falls back to whichever one exists.
 */
export function entityName(ja, en, { className = "name" } = {}) {
  const jaText = String(ja ?? "").trim();
  const enText = String(en ?? "").trim();

  if (jaText && enText && jaText !== enText) {
    return (
      `<span class="${attr(className)}">` +
      `<span class="name-ja" lang="ja">${escapeHtml(jaText)}</span>` +
      `<span class="name-en" lang="en">${escapeHtml(enText)}</span></span>`
    );
  }
  const only = jaText || enText;
  if (!only) return `<span class="${attr(className)}">名称未登録</span>`;
  return `<span class="${attr(className)}"><span class="name-ja"${jaText ? ' lang="ja"' : ' lang="en"'}>${escapeHtml(only)}</span></span>`;
}

/** Dates render in JST: the desk and the audience are Japan-based. */
export function jstDate(value) {
  return formatDate(value) || "";
}

export function jstDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(date)} ${timeInTimezone(config.timezone, date)} JST`;
}

export function timeTag(value, { withTime = false } = {}) {
  const text = withTime ? jstDateTime(value) : jstDate(value);
  if (!text) return "";
  const parsed = new Date(value);
  const machine = Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
  return `<time datetime="${attr(machine)}">${escapeHtml(text)}</time>`;
}

export function normalizeConfidence(value) {
  const key = String(pick(value, "key", "confidence") ?? value ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return CONFIDENCE_BY_KEY[key] ?? CONFIDENCE_BY_KEY.unverified;
}

export function confidenceLabel(value) {
  const level = normalizeConfidence(value);
  return CONFIDENCE_LABELS[level.key] ?? level.label;
}

/**
 * Confidence chip. The rank ticks are what stop 未確認 reading like 確定 when the
 * page is printed, screenshotted or viewed in greyscale.
 */
export function confidenceChip(value, { compact = false } = {}) {
  const level = normalizeConfidence(value);
  const label = CONFIDENCE_LABELS[level.key] ?? level.label;
  const meaning = CONFIDENCE_MEANING[level.key] || "";
  const ticks = CONFIDENCE_ORDER.map(
    (_, index) => `<i class="tick${index < level.rank ? " tick-on" : ""}"></i>`
  ).join("");

  return (
    `<span class="chip chip-confidence chip-${attr(level.key)}${compact ? " chip-compact" : ""}"` +
    ` title="${attr(meaning)}">` +
    `<span class="chip-ticks" aria-hidden="true">${ticks}</span>` +
    `<span class="chip-label">${escapeHtml(label)}</span>` +
    `<span class="visually-hidden">（信頼度 5段階中 ${level.rank}。${escapeHtml(meaning)}）</span>` +
    `</span>`
  );
}

function bandKey(band) {
  return String(band ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function bandLatin(band) {
  const key = bandKey(band);
  return key ? key.replace(/_/g, " ").toUpperCase() : "";
}

function bandText(band) {
  const key = bandKey(band);
  return BAND_LABELS[key] ?? bandLatin(band);
}

function bandSpan(band, extraClass = "") {
  return (
    `<span class="pill-band band-${attr(bandKey(band))}${extraClass ? ` ${extraClass}` : ""}">` +
    `<span class="band-ja">${escapeHtml(bandText(band))}</span>` +
    `<span class="band-latin" lang="en">${escapeHtml(bandLatin(band))}</span></span>`
  );
}

/**
 * Signal band pill. Pass `{ band }` for a state, or `{ from, to }` for the
 * 中 → 高 transition form the dashboard's change cards use.
 */
export function signalBandPill({ band, from, to, label = "" } = {}) {
  const prefix = label ? `<span class="pill-prefix">${escapeHtml(label)}</span>` : "";

  if (from && to && bandKey(from) !== bandKey(to)) {
    return (
      `<span class="pill pill-transition">${prefix}` +
      bandSpan(from, "band-from") +
      `<span class="pill-arrow" aria-hidden="true">→</span>` +
      `<span class="visually-hidden">から</span>` +
      bandSpan(to, "band-to") +
      `<span class="visually-hidden">へ変化</span>` +
      `</span>`
    );
  }

  const value = to || band || from;
  if (!value) return `<span class="pill pill-empty">${prefix}未算出</span>`;
  return `<span class="pill">${prefix}${bandSpan(value)}</span>`;
}

/**
 * `deltaPct` arrives either as a fraction (0.42) or as points (42). Anything
 * with magnitude under 5 is read as a fraction — a 500% single-window swing is
 * not a thing this signal produces.
 */
function toPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number) <= 5 ? number * 100 : number;
}

/** Momentum indicator: direction first, magnitude second, honest when absent. */
export function momentumIndicator(momentum, { windowDays = config.transferSignal.momentumWindowDays } = {}) {
  if (!momentum) {
    return (
      `<span class="momentum momentum-none">` +
      `<span class="momentum-glyph" aria-hidden="true">–</span>` +
      `<span class="momentum-text">基準値なし</span>` +
      `<span class="visually-hidden">（変化を測るための履歴が不足しています）</span>` +
      `</span>`
    );
  }

  const percent = toPercent(pick(momentum, "deltaPct", "delta_pct"));
  const points = Number(pick(momentum, "deltaPoints", "delta_points"));
  const rawDirection = String(pick(momentum, "direction") ?? "").toLowerCase();
  const direction =
    rawDirection ||
    (Number.isFinite(percent) && percent > 0 ? "up" : Number.isFinite(percent) && percent < 0 ? "down" : "flat");

  if (direction === "flat" || (!Number.isFinite(percent) && !Number.isFinite(points))) {
    return (
      `<span class="momentum momentum-flat">` +
      `<span class="momentum-glyph" aria-hidden="true">→</span>` +
      `<span class="momentum-text">${escapeHtml(String(windowDays))}日間で変化なし</span>` +
      `</span>`
    );
  }

  const glyph = direction === "down" ? "↓" : "↑";
  const sign = direction === "down" ? "−" : "+";
  const magnitude = Number.isFinite(percent)
    ? `${sign}${Math.abs(Math.round(percent))}%`
    : `${sign}${Math.abs(Math.round(points))}pt`;

  return (
    `<span class="momentum momentum-${attr(direction)}">` +
    `<span class="momentum-glyph" aria-hidden="true">${glyph}</span>` +
    `<span class="momentum-text">${escapeHtml(magnitude)}</span>` +
    `<span class="momentum-window">${escapeHtml(String(windowDays))}日</span>` +
    `<span class="visually-hidden">（${escapeHtml(String(windowDays))}日間で${direction === "down" ? "低下" : "上昇"}）</span>` +
    `</span>`
  );
}

export function tierBadge(tier) {
  const number = Number(tier);
  const meta = SOURCE_TIERS[number];
  if (!meta) return `<span class="tier tier-unknown">ティア不明</span>`;
  return `<span class="tier tier-${number}">ティア${number}・${escapeHtml(TIER_LABELS[number] ?? meta.label)}</span>`;
}

export function normalizeSource(row) {
  if (!row || typeof row !== "object") return null;
  return {
    name: String(pick(row, "name", "source_name", "sourceName", "source") ?? "出典元不明"),
    url: safeUrl(pick(row, "url", "link", "canonical_url")),
    // Article headlines stay in their original language: translating third-party
    // text in the view layer would misrepresent the source.
    title: String(pick(row, "title", "headline") ?? ""),
    publishedAt: pick(row, "publishedAt", "published_at") ?? null,
    detectedAt: pick(row, "detectedAt", "detected_at") ?? null,
    tier: pick(row, "tier", "best_source_tier") ?? null,
  };
}

/**
 * Provenance list. Headline plus link only — full article bodies are never
 * reproduced, per the copyright rule in the blueprint.
 */
export function sourceList(sources, { heading = "", emptyText = "この記述に紐づく出典は記録されていません。" } = {}) {
  const rows = (Array.isArray(sources) ? sources : []).map(normalizeSource).filter(Boolean);
  const title = heading ? `<h4 class="source-heading">${escapeHtml(heading)}</h4>` : "";

  if (!rows.length) return `${title}<p class="source-empty">${escapeHtml(emptyText)}</p>`;

  const items = rows
    .map((row) => {
      const label = row.title || row.name;
      const link = row.url
        ? `<a class="source-link" href="${attr(row.url)}" rel="nofollow noopener external" target="_blank">${escapeHtml(label)}</a>`
        : `<span class="source-link source-link-plain">${escapeHtml(label)}</span>`;
      const dates = [
        row.publishedAt ? `掲載 ${timeTag(row.publishedAt)}` : "掲載日未記録",
        row.detectedAt ? `検知 ${timeTag(row.detectedAt, { withTime: true })}` : "",
      ]
        .filter(Boolean)
        .join(" ・ ");

      return (
        `<li class="source-item">${link}` +
        `<p class="source-meta"><span class="source-name" lang="en">${escapeHtml(row.name)}</span> ${tierBadge(row.tier)}</p>` +
        `<p class="source-dates">${dates}</p></li>`
      );
    })
    .join("");

  return `${title}<ol class="source-list">${items}</ol>`;
}

const COMPONENT_LABELS = {
  reportVolume: "報道量",
  sourceQuality: "ソースの質",
  clubsLinked: "関心クラブ数",
  contractPressure: "契約状況の圧力",
  playerSideSignal: "選手side のシグナル",
  clubSituation: "クラブ状況",
  japanSocialAudience: "日本のSNSフォロワー",
  socialGrowth30d: "SNS成長率（30日）",
  japanMediaMentions30d: "日本メディア露出（30日）",
  japanSearchInterest: "日本の検索関心度",
  nationalTeamRelevance: "代表での重要度",
  leagueVisibilityInJapan: "リーグの日本での認知度",
};

function componentLabel(key) {
  return (
    COMPONENT_LABELS[key] ??
    String(key)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
  );
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (Number.isInteger(number)) return number.toLocaleString("ja-JP");
  return number.toFixed(Math.abs(number) < 1 ? 3 : 1);
}

function componentRows(inputs) {
  const entries = Object.entries(inputs || {});
  if (!entries.length) return "";

  const rows = entries
    .map(([name, value]) => {
      const raw = pick(value, "raw");
      const weight = pick(value, "weight");
      const points = pick(value, "points");
      const measured = raw !== undefined && raw !== null;
      return (
        `<tr class="${measured ? "" : "row-missing"}">` +
        `<th scope="row">${escapeHtml(componentLabel(name))}</th>` +
        `<td>${measured ? escapeHtml(formatNumber(raw)) : '<span class="missing">未計測</span>'}</td>` +
        `<td>${weight === undefined ? "—" : escapeHtml(String(weight))}</td>` +
        `<td>${points === undefined ? "—" : escapeHtml(formatNumber(points))}</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `<div class="scroll-x"><table class="component-table">` +
    `<caption>スコアの内訳。すべて実測値からの算術計算で、AIが数値を生成することはありません。</caption>` +
    `<thead><tr><th scope="col">構成要素</th><th scope="col">実測値</th>` +
    `<th scope="col">重み</th><th scope="col">ポイント</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>`
  );
}

/**
 * Score meter. Shows the number, the band, the coverage, the components, and —
 * when coverage is thin — says out loud that the score is provisional.
 */
export function scoreMeter({ label, score, band, coverage, provisional, inputs, note = "" } = {}) {
  const value = Number(score);
  const hasScore = Number.isFinite(value);
  const percent = hasScore ? Math.max(0, Math.min(100, value)) : 0;
  const coverageValue = Number(coverage);
  const hasCoverage = Number.isFinite(coverageValue);
  const threshold = Math.round(config.japanMarketScore.minCoverage * 100);
  const isProvisional =
    provisional === true || (hasCoverage && coverageValue < config.japanMarketScore.minCoverage);

  if (!hasScore) {
    return (
      `<figure class="score-meter score-meter-empty">` +
      `<figcaption class="score-caption">${escapeHtml(label || "スコア")}</figcaption>` +
      `<p class="score-empty">算出に必要な実測値がまだ足りません。推定値で埋めることはしません。</p></figure>`
    );
  }

  const provisionalBadge = isProvisional
    ? `<span class="badge badge-provisional" title="${attr(`カバレッジが基準の${threshold}%を下回っています`)}">暫定値</span>`
    : "";

  const coverageLine = hasCoverage
    ? `<p class="score-coverage">カバレッジ ${Math.round(coverageValue * 100)}%（加重入力に対する実測の割合）。` +
      (isProvisional ? `基準の${threshold}%を下回るため、暫定値として表示しています。` : "") +
      `</p>`
    : `<p class="score-coverage">カバレッジは記録されていません。</p>`;

  return (
    `<figure class="score-meter${isProvisional ? " is-provisional" : ""}">` +
    `<figcaption class="score-caption">${escapeHtml(label || "スコア")}` +
    `<span class="score-value">${escapeHtml(formatNumber(value))}<span class="score-scale">/100</span></span>` +
    `${signalBandPill({ band })}${provisionalBadge}</figcaption>` +
    `<div class="meter-track" role="img" aria-label="${attr(
      `${label || "スコア"}：100点中${formatNumber(value)}点${band ? `、${bandText(band)}` : ""}`
    )}"><span class="meter-fill band-${attr(bandKey(band))}" style="width:${percent}%"></span></div>` +
    coverageLine +
    (note ? `<p class="score-note">${escapeHtml(note)}</p>` : "") +
    componentRows(inputs) +
    `</figure>`
  );
}

const CHANGE_TYPE_LABELS = {
  signal_band: "シグナル変動",
  new_event: "新規情報",
  confidence_up: "信頼度上昇",
  club_linked: "クラブ関心",
  contract: "契約",
  injury: "怪我",
  performance: "出場",
  transfer: "移籍",
  market: "日本市場",
};

export function normalizeChange(row) {
  if (!row || typeof row !== "object") return null;
  const player = pick(row, "player") || {};
  const signal = pick(row, "signal") || null;
  const sources = (Array.isArray(pick(row, "sources")) ? row.sources : []).map(normalizeSource).filter(Boolean);
  const sourceCount = Number(pick(row, "sourceCount", "source_count") ?? sources.length ?? 0);

  return {
    id: pick(row, "id") ?? null,
    changeType: String(pick(row, "changeType", "change_type", "type") ?? "new_event"),
    headline: String(preferJa(row, "headlineJa", "headline_ja") || pick(row, "headline") || "変化を記録"),
    detail: String(preferJa(row, "detailJa", "detail_ja") || pick(row, "detail", "summary") || ""),
    beforeValue: pick(row, "beforeValue", "before_value") ?? null,
    afterValue: pick(row, "afterValue", "after_value") ?? null,
    importance: Number(pick(row, "importance") ?? 1),
    confidence: normalizeConfidence(pick(row, "confidence")),
    detectedAt: pick(row, "detectedAt", "detected_at") ?? null,
    asOfDate: pick(row, "asOfDate", "as_of_date") ?? null,
    player: {
      slug: pick(player, "slug", "player_slug") ?? pick(row, "playerSlug", "player_slug") ?? null,
      nameEn: pick(player, "nameEn", "name_en", "name") ?? pick(row, "playerName", "player_name") ?? "",
      nameJa: pick(player, "nameJa", "name_ja") ?? pick(row, "playerNameJa", "player_name_ja") ?? "",
      position: pick(player, "position") ?? null,
      clubJa: pick(player, "clubJa", "club_name_ja") ?? null,
      club: pick(player, "club", "club_name", "clubName") ?? null,
      leagueJa: pick(player, "leagueJa", "league_name_ja") ?? null,
      league: pick(player, "league", "league_name", "leagueName") ?? null,
    },
    signal,
    sources,
    sourceCount: Number.isFinite(sourceCount) ? sourceCount : sources.length,
  };
}

function playerLink(player, { basePath = config.basePath } = {}) {
  const name = entityName(player.nameJa, player.nameEn, { className: "change-player-name" });
  if (!player.slug) return `<span class="change-player">${name}</span>`;
  return `<a class="change-player" href="${attr(`${basePath}/players/${player.slug}`)}">${name}</a>`;
}

/**
 * Change card — the atom of 「今日変わったこと」. It leads with the player and
 * what moved, not with a headline, because this product is not a news list.
 */
export function changeCard(input, { headingLevel = 3 } = {}) {
  const change = normalizeChange(input);
  if (!change) return "";

  const heading = `h${Math.min(Math.max(headingLevel, 2), 5)}`;
  const context = [
    change.player.position ? positionName(change.player.position) || change.player.position : "",
    change.player.clubJa || change.player.club,
    change.player.leagueJa || change.player.league,
  ]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(" ・ ");

  const transition = change.signal
    ? signalBandPill({
        from: pick(change.signal, "from", "before", "beforeBand", "before_band"),
        to: pick(change.signal, "to", "after", "afterBand", "after_band", "band"),
        label: "移籍シグナル",
      })
    : change.beforeValue && change.afterValue
      ? signalBandPill({ from: change.beforeValue, to: change.afterValue })
      : "";

  const momentum =
    change.signal && pick(change.signal, "deltaPct", "delta_pct") !== undefined
      ? momentumIndicator(change.signal)
      : "";

  const sourcesBlock = change.sources.length
    ? `<details class="change-sources"><summary>出典 ${change.sources.length}件</summary>${sourceList(change.sources)}</details>`
    : `<p class="source-empty">出典が記録されていないため「${escapeHtml(confidenceLabel(change.confidence))}」として表示しています。</p>`;

  const typeLabel = CHANGE_TYPE_LABELS[change.changeType] ?? "";

  return (
    `<article class="change-card change-${attr(change.changeType)}">` +
    (typeLabel ? `<p class="change-type">${escapeHtml(typeLabel)}</p>` : "") +
    `<${heading} class="change-title">${playerLink(change.player)}</${heading}>` +
    (context ? `<p class="change-context">${context}</p>` : "") +
    (transition ? `<p class="change-transition">${transition}${momentum}</p>` : "") +
    `<p class="change-headline">${escapeHtml(change.headline)}</p>` +
    (change.detail ? `<p class="change-detail">${escapeHtml(change.detail)}</p>` : "") +
    `<p class="change-meta">${confidenceChip(change.confidence)}` +
    `<span class="meta-dot" aria-hidden="true">・</span>` +
    `<span class="change-sourcecount">出典 ${escapeHtml(String(change.sourceCount))}件</span>` +
    (change.detectedAt
      ? `<span class="meta-dot" aria-hidden="true">・</span><span class="change-time">更新 ${timeTag(
          change.detectedAt,
          { withTime: true }
        )}</span>`
      : "") +
    `</p>` +
    sourcesBlock +
    `</article>`
  );
}

export function emptyState(message, { hint = "" } = {}) {
  return (
    `<div class="empty-state"><p class="empty-message">${escapeHtml(message)}</p>` +
    (hint ? `<p class="empty-hint">${escapeHtml(hint)}</p>` : "") +
    `</div>`
  );
}

/** Seed roster rows are unverified until a human checks them. Say so on the page. */
export function dataStatusNote(status) {
  if (String(status) !== "seed_unverified") return "";
  return (
    `<p class="notice notice-seed"><strong>ロースター情報は未確認です。</strong>` +
    `このプロフィールの所属クラブ・ポジション・在籍状況は初期登録データで、公式ソースとの照合はまだ行われていません。` +
    `要確認事項として扱ってください。</p>`
  );
}

export function statTile({ label, value, note = "" }) {
  return (
    `<div class="stat-tile"><p class="stat-label">${escapeHtml(label)}</p>` +
    `<p class="stat-value">${escapeHtml(String(value))}</p>` +
    (note ? `<p class="stat-note">${escapeHtml(note)}</p>` : "") +
    `</div>`
  );
}

export default {
  confidenceChip,
  confidenceLabel,
  signalBandPill,
  momentumIndicator,
  sourceList,
  scoreMeter,
  changeCard,
  emptyState,
  dataStatusNote,
  statTile,
  entityName,
  tierBadge,
  timeTag,
  jstDate,
  jstDateTime,
  positionName,
  preferJa,
  safeUrl,
  escapeHtml,
};
