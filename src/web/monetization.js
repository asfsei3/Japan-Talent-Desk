/**
 * Monetization slots for the free layer.
 *
 * The founder's constraint is the whole design here: the core product must stay
 * useful and viable with every one of these switched off. So each slot is a
 * function that returns an empty string unless `data/monetization.json` names a
 * real, configured partner. Nothing is hardcoded in the view layer, nothing
 * renders above the fold on the dashboard, and nothing is ever placed between a
 * claim and its sources — provenance is not interruptible by commerce.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { rootDir } from "../config/index.js";
import { escapeHtml } from "../lib/text.js";
import { attr, safeUrl } from "./components.js";

const CONFIG_PATH = join(rootDir, "data", "monetization.json");

let cached = null;

function loadConfig() {
  if (cached) return cached;
  try {
    cached = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : {};
  } catch {
    // A malformed config must never break the product; it just means no slots.
    cached = {};
  }
  return cached;
}

export function resetMonetizationCache() {
  cached = null;
}

function isEnabled() {
  return loadConfig().enabled === true;
}

function disclosure() {
  const text = loadConfig().disclosure;
  return text ? `<p class="promo-disclosure">${escapeHtml(String(text))}</p>` : "";
}

function promoLabel(kind = "広告") {
  return `<p class="promo-label"><span class="promo-tag">${escapeHtml(kind)}</span></p>`;
}

function fill(template, tokens) {
  return String(template ?? "").replace(/\{(player|club|league)\}/g, (match, key) =>
    tokens[key] ? encodeURIComponent(String(tokens[key])) : match
  );
}

/**
 * Display advertising. Never above the fold on the dashboard: the first thing on
 * screen is always what changed.
 */
export function adSlot(position) {
  if (!isEnabled()) return "";
  const slot = loadConfig().ads?.[position];
  if (!slot || typeof slot !== "object" || !slot.html) return "";

  return (
    `<aside class="promo promo-ad promo-${attr(position)}" aria-label="広告">` +
    promoLabel(slot.label || "広告") +
    `<div class="promo-body">${slot.html}</div>` +
    `</aside>`
  );
}

/**
 * Affiliate commerce. Rendered as a clearly-labelled 関連商品 block that sits
 * below the player's intelligence content, never interleaved with facts.
 */
export function affiliateBlock({ kind, player = "", club = "", league = "" } = {}) {
  if (!isEnabled()) return "";
  const entry = loadConfig().affiliate?.[kind];
  const items = Array.isArray(entry?.items) ? entry.items : [];
  if (!items.length) return "";

  const tokens = { player, club, league };
  const rendered = items
    .map((item) => {
      const url = safeUrl(fill(item.url, tokens));
      const title = fill(item.title, tokens).replace(/%20/g, " ");
      if (!url || !title) return "";
      return (
        `<li class="promo-item">` +
        `<a href="${attr(url)}" rel="nofollow sponsored noopener" target="_blank">${escapeHtml(title)}</a>` +
        (item.note ? `<span class="promo-note">${escapeHtml(String(item.note))}</span>` : "") +
        `</li>`
      );
    })
    .filter(Boolean)
    .join("");

  if (!rendered) return "";

  return (
    `<aside class="promo promo-affiliate" aria-label="関連商品（広告）">` +
    promoLabel("PR") +
    `<h2 class="promo-heading">${escapeHtml(entry.label || "関連商品")}</h2>` +
    `<ul class="promo-list">${rendered}</ul>` +
    disclosure() +
    `</aside>`
  );
}

/** 配信で見る link block, keyed by league slug. Config-driven, no vendor in code. */
export function streamingBlock({ league, match = "" } = {}) {
  if (!isEnabled()) return "";
  const entry = loadConfig().streaming?.[league];
  const url = safeUrl(entry?.url);
  if (!entry || !url) return "";

  return (
    `<aside class="promo promo-streaming" aria-label="配信情報（広告）">` +
    promoLabel("PR") +
    `<h2 class="promo-heading">この試合を見る</h2>` +
    `<p class="promo-body"><a href="${attr(url)}" rel="nofollow sponsored noopener" target="_blank">` +
    `${escapeHtml(entry.label || "配信で見る")}</a>` +
    (match ? `<span class="promo-note">${escapeHtml(String(match))}</span>` : "") +
    (entry.note ? `<span class="promo-note">${escapeHtml(String(entry.note))}</span>` : "") +
    `</p>${disclosure()}</aside>`
  );
}

export default { adSlot, affiliateBlock, streamingBlock, resetMonetizationCache };
