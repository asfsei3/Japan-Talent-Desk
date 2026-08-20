/**
 * The shared UI vocabulary for Japan Football Intelligence.
 *
 * Two rules run through every component here:
 *   1. Every string that came from outside this repository goes through
 *      `escapeHtml`. Article titles and source names are third-party text.
 *   2. A rumour must never look like a confirmed fact. Confidence is encoded
 *      three ways at once — label, filled rank ticks, and colour — so it
 *      survives greyscale, colour blindness and a screen reader.
 */
import { CONFIDENCE_BY_KEY, CONFIDENCE_ORDER, SOURCE_TIERS, config } from "../config/index.js";
import { escapeHtml } from "../lib/text.js";
import { formatDate, timeInTimezone } from "../lib/time.js";

export { escapeHtml };

const POSITION_NAMES = {
  GK: "Goalkeeper",
  CB: "Centre-back",
  LB: "Left-back",
  RB: "Right-back",
  DM: "Defensive midfielder",
  CM: "Central midfielder",
  AM: "Attacking midfielder",
  LW: "Left winger",
  RW: "Right winger",
  ST: "Striker",
};

/** What each confidence level actually means, in the product's own words. */
const CONFIDENCE_MEANING = {
  unverified: "Not verified. Aggregator, social or single low-tier mention only.",
  rumored: "Rumour. A single credible-media report, nothing corroborating it.",
  reported: "Reported by one tier-1 reporting source, or by two credible outlets.",
  strongly_reported: "Reported independently by two or more tier-1 reporting sources.",
  confirmed: "Confirmed by an official club, league or federation source.",
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

/** Dates are a JST product decision: the desk and the audience are Japan-based. */
export function jstDate(value) {
  const formatted = formatDate(value);
  return formatted || "";
}

export function jstDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatDate(date)}, ${timeInTimezone(config.timezone, date)} JST`;
}

export function timeTag(value, { withTime = false } = {}) {
  const text = withTime ? jstDateTime(value) : jstDate(value);
  if (!text) return "";
  const iso = new Date(value);
  const machine = Number.isNaN(iso.getTime()) ? String(value) : iso.toISOString();
  return `<time datetime="${attr(machine)}">${escapeHtml(text)}</time>`;
}

export function normalizeConfidence(value) {
  const key = String(pick(value, "key", "confidence") ?? value ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return CONFIDENCE_BY_KEY[key] ?? CONFIDENCE_BY_KEY.unverified;
}

/**
 * Confidence chip. The rank ticks are what stop `unverified` reading like
 * `confirmed` when the page is printed, screenshotted or viewed in greyscale.
 */
export function confidenceChip(value, { compact = false } = {}) {
  const level = normalizeConfidence(value);
  const meaning = CONFIDENCE_MEANING[level.key] || "";
  const ticks = CONFIDENCE_ORDER.map(
    (_, index) => `<i class="tick${index < level.rank ? " tick-on" : ""}"></i>`
  ).join("");

  return (
    `<span class="chip chip-confidence chip-${attr(level.key)}${compact ? " chip-compact" : ""}"` +
    ` title="${attr(meaning)}">` +
    `<span class="chip-ticks" aria-hidden="true">${ticks}</span>` +
    `<span class="chip-label">${escapeHtml(level.label)}</span>` +
    `<span class="visually-hidden"> — confidence ${level.rank} of 5. ${escapeHtml(meaning)}</span>` +
    `</span>`
  );
}

function bandKey(band) {
  return String(band ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function bandLabel(band) {
  const key = bandKey(band);
  if (!key) return "NO BAND";
  return key.replace(/_/g, " ").toUpperCase();
}

/**
 * Signal band pill. Pass `{ band }` for a state, or `{ from, to }` for the
 * `MEDIUM → HIGH` transition form the blueprint's homepage example uses.
 */
export function signalBandPill({ band, from, to, label = "" } = {}) {
  const prefix = label ? `<span class="pill-prefix">${escapeHtml(label)}</span>` : "";

  if (from && to && bandKey(from) !== bandKey(to)) {
    return (
      `<span class="pill pill-transition">${prefix}` +
      `<span class="pill-band band-${attr(bandKey(from))} band-from">${escapeHtml(bandLabel(from))}</span>` +
      `<span class="pill-arrow" aria-hidden="true">→</span>` +
      `<span class="visually-hidden"> moved to </span>` +
      `<span class="pill-band band-${attr(bandKey(to))} band-to">${escapeHtml(bandLabel(to))}</span>` +
      `</span>`
    );
  }

  const value = to || band || from;
  if (!value) return `<span class="pill pill-empty">${prefix}No band</span>`;
  return (
    `<span class="pill">${prefix}` +
    `<span class="pill-band band-${attr(bandKey(value))}">${escapeHtml(bandLabel(value))}</span>` +
    `</span>`
  );
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
      `<span class="momentum-text">No baseline yet</span>` +
      `<span class="visually-hidden"> — not enough history to measure movement.</span>` +
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
      `<span class="momentum-text">Unchanged over ${escapeHtml(String(windowDays))} days</span>` +
      `</span>`
    );
  }

  const glyph = direction === "down" ? "↓" : "↑";
  const sign = direction === "down" ? "−" : "+";
  const magnitude = Number.isFinite(percent)
    ? `${sign}${Math.abs(Math.round(percent))}%`
    : `${sign}${Math.abs(Math.round(points))} pts`;

  return (
    `<span class="momentum momentum-${attr(direction)}">` +
    `<span class="momentum-glyph" aria-hidden="true">${glyph}</span>` +
    `<span class="momentum-text">${escapeHtml(magnitude)}</span>` +
    `<span class="momentum-window"> · ${escapeHtml(String(windowDays))}-day</span>` +
    `<span class="visually-hidden"> ${direction === "down" ? "down" : "up"} over ${escapeHtml(String(windowDays))} days.</span>` +
    `</span>`
  );
}

export function tierBadge(tier) {
  const number = Number(tier);
  const meta = SOURCE_TIERS[number];
  if (!meta) return `<span class="tier tier-unknown">Tier unknown</span>`;
  return `<span class="tier tier-${number}">Tier ${number} · ${escapeHtml(meta.label)}</span>`;
}

export function normalizeSource(row) {
  if (!row || typeof row !== "object") return null;
  return {
    name: String(pick(row, "name", "source_name", "sourceName", "source") ?? "Unattributed source"),
    url: safeUrl(pick(row, "url", "link", "canonical_url")),
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
export function sourceList(sources, { heading = "", emptyText = "No source recorded for this claim." } = {}) {
  const rows = (Array.isArray(sources) ? sources : []).map(normalizeSource).filter(Boolean);
  const title = heading ? `<h4 class="source-heading">${escapeHtml(heading)}</h4>` : "";

  if (!rows.length) {
    return `${title}<p class="source-empty">${escapeHtml(emptyText)}</p>`;
  }

  const items = rows
    .map((row) => {
      const label = row.title || row.name;
      const link = row.url
        ? `<a class="source-link" href="${attr(row.url)}" rel="nofollow noopener external" target="_blank">${escapeHtml(label)}</a>`
        : `<span class="source-link source-link-plain">${escapeHtml(label)}</span>`;
      const dates = [
        row.publishedAt ? `Published ${timeTag(row.publishedAt)}` : "Publication date not recorded",
        row.detectedAt ? `Detected ${timeTag(row.detectedAt, { withTime: true })}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

      return (
        `<li class="source-item">${link}` +
        `<p class="source-meta"><span class="source-name">${escapeHtml(row.name)}</span> ${tierBadge(row.tier)}</p>` +
        `<p class="source-dates">${dates}</p></li>`
      );
    })
    .join("");

  return `${title}<ol class="source-list">${items}</ol>`;
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
        `<th scope="row">${escapeHtml(humanise(name))}</th>` +
        `<td>${measured ? escapeHtml(formatNumber(raw)) : '<span class="missing">Not measured</span>'}</td>` +
        `<td>${weight === undefined ? "—" : escapeHtml(String(weight))}</td>` +
        `<td>${points === undefined ? "—" : escapeHtml(formatNumber(points))}</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `<div class="scroll-x"><table class="component-table">` +
    `<caption>How the score was reached. Every component is arithmetic from a measured input.</caption>` +
    `<thead><tr><th scope="col">Component</th><th scope="col">Measured input</th>` +
    `<th scope="col">Weight</th><th scope="col">Points</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>`
  );
}

function humanise(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (Number.isInteger(number)) return number.toLocaleString("en-GB");
  return number.toFixed(Math.abs(number) < 1 ? 3 : 1);
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
  const isProvisional =
    provisional === true || (hasCoverage && coverageValue < config.japanMarketScore.minCoverage);

  if (!hasScore) {
    return (
      `<figure class="score-meter score-meter-empty">` +
      `<figcaption class="score-caption">${escapeHtml(label || "Score")}</figcaption>` +
      `<p class="score-empty">Not enough measured input to compute this score yet. ` +
      `No estimate is shown in its place.</p></figure>`
    );
  }

  const provisionalBadge = isProvisional
    ? `<span class="badge badge-provisional" title="Coverage is below the ${Math.round(
        config.japanMarketScore.minCoverage * 100
      )}% threshold">Provisional</span>`
    : "";

  const coverageLine = hasCoverage
    ? `<p class="score-coverage">Coverage ${Math.round(coverageValue * 100)}% of weighted inputs.` +
      (isProvisional
        ? ` Below the ${Math.round(config.japanMarketScore.minCoverage * 100)}% threshold, so this is published as provisional.`
        : "") +
      `</p>`
    : `<p class="score-coverage">Coverage not reported.</p>`;

  return (
    `<figure class="score-meter${isProvisional ? " is-provisional" : ""}">` +
    `<figcaption class="score-caption">${escapeHtml(label || "Score")}` +
    `<span class="score-value">${escapeHtml(formatNumber(value))}<span class="score-scale">/100</span></span>` +
    `${signalBandPill({ band })}${provisionalBadge}</figcaption>` +
    `<div class="meter-track" role="img" aria-label="${attr(
      `${label || "Score"}: ${formatNumber(value)} out of 100${band ? `, band ${bandLabel(band)}` : ""}`
    )}"><span class="meter-fill band-${attr(bandKey(band))}" style="width:${percent}%"></span></div>` +
    coverageLine +
    (note ? `<p class="score-note">${escapeHtml(note)}</p>` : "") +
    componentRows(inputs) +
    `</figure>`
  );
}

export function normalizeChange(row) {
  if (!row || typeof row !== "object") return null;
  const player = pick(row, "player") || {};
  const signal = pick(row, "signal") || null;
  const sources = (Array.isArray(pick(row, "sources")) ? row.sources : []).map(normalizeSource).filter(Boolean);
  const sourceCount = Number(pick(row, "sourceCount", "source_count") ?? sources.length ?? 0);

  return {
    id: pick(row, "id") ?? null,
    changeType: String(pick(row, "changeType", "change_type", "type") ?? "new_event"),
    headline: String(pick(row, "headline") ?? "Change recorded"),
    detail: String(pick(row, "detail", "summary") ?? ""),
    beforeValue: pick(row, "beforeValue", "before_value") ?? null,
    afterValue: pick(row, "afterValue", "after_value") ?? null,
    importance: Number(pick(row, "importance") ?? 1),
    confidence: normalizeConfidence(pick(row, "confidence")),
    detectedAt: pick(row, "detectedAt", "detected_at") ?? null,
    asOfDate: pick(row, "asOfDate", "as_of_date") ?? null,
    player: {
      slug: pick(player, "slug", "player_slug") ?? pick(row, "playerSlug", "player_slug") ?? null,
      name: pick(player, "name", "name_en", "nameEn") ?? pick(row, "playerName", "player_name") ?? "Unnamed player",
      nameJa: pick(player, "nameJa", "name_ja") ?? null,
      position: pick(player, "position") ?? null,
      club: pick(player, "club", "club_name", "clubName") ?? null,
      league: pick(player, "league", "league_name", "leagueName") ?? null,
    },
    signal,
    sources,
    sourceCount: Number.isFinite(sourceCount) ? sourceCount : sources.length,
  };
}

function playerLink(player) {
  const name = escapeHtml(player.name);
  if (!player.slug) return `<span class="change-player">${name}</span>`;
  return `<a class="change-player" href="${attr(`${config.basePath}/players/${player.slug}`)}">${name}</a>`;
}

/**
 * Change card — the atom of "What Changed Today". It leads with the player and
 * what moved, not with a headline, because this product is not a news list.
 */
export function changeCard(input, { headingLevel = 3 } = {}) {
  const change = normalizeChange(input);
  if (!change) return "";

  const heading = `h${Math.min(Math.max(headingLevel, 2), 5)}`;
  const jp = change.player.nameJa
    ? `<span class="change-player-ja" lang="ja">${escapeHtml(change.player.nameJa)}</span>`
    : "";
  const context = [change.player.position, change.player.club, change.player.league]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(" · ");

  const transition = change.signal
    ? signalBandPill({
        from: pick(change.signal, "from", "before", "beforeBand", "before_band"),
        to: pick(change.signal, "to", "after", "afterBand", "after_band", "band"),
        label: `${humanise(pick(change.signal, "type") ?? "signal")} signal`,
      })
    : change.beforeValue && change.afterValue
      ? signalBandPill({ from: change.beforeValue, to: change.afterValue })
      : "";

  const momentum = change.signal && pick(change.signal, "deltaPct", "delta_pct") !== undefined
    ? momentumIndicator(change.signal)
    : "";

  const sourcesBlock = change.sources.length
    ? `<details class="change-sources"><summary>Sources (${change.sources.length})</summary>${sourceList(change.sources)}</details>`
    : `<p class="source-empty">No source recorded. This is why it is shown as ${escapeHtml(
        change.confidence.label.toLowerCase()
      )}.</p>`;

  return (
    `<article class="change-card change-${attr(change.changeType)}">` +
    `<${heading} class="change-title">${playerLink(change.player)} ${jp}</${heading}>` +
    (context ? `<p class="change-context">${context}</p>` : "") +
    (transition ? `<p class="change-transition">${transition}${momentum}</p>` : "") +
    `<p class="change-headline">${escapeHtml(change.headline)}</p>` +
    (change.detail ? `<p class="change-detail">${escapeHtml(change.detail)}</p>` : "") +
    `<p class="change-meta">${confidenceChip(change.confidence)}` +
    `<span class="meta-dot" aria-hidden="true">·</span>` +
    `<span class="change-sourcecount">${escapeHtml(String(change.sourceCount))} source${change.sourceCount === 1 ? "" : "s"}</span>` +
    (change.detectedAt
      ? `<span class="meta-dot" aria-hidden="true">·</span><span class="change-time">Last updated ${timeTag(
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
    `<p class="notice notice-seed"><strong>Roster data unverified.</strong> ` +
    `Club, position and squad details for this profile came from the initial seed list and have not been ` +
    `checked against an official source yet. Treat them as verification items.</p>`
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
  signalBandPill,
  momentumIndicator,
  sourceList,
  scoreMeter,
  changeCard,
  emptyState,
  dataStatusNote,
  statTile,
  tierBadge,
  timeTag,
  jstDate,
  jstDateTime,
  positionName,
  safeUrl,
  escapeHtml,
};
