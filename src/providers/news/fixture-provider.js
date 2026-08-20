/**
 * Offline fixture news provider.
 *
 * The whole pipeline has to be runnable and demoable without network access, so
 * sources with `provider = 'fixture'` read from `test/fixtures/feeds/*.xml`
 * instead of the wire. The fixtures deliberately include a malformed feed: a
 * broken feed is a normal operating condition and must degrade to a warning.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { rootDir } from "../../config/index.js";
import { parseFeed, readTagValue } from "../../lib/xml.js";
import { detectLanguage, toExcerpt } from "../../lib/text.js";
import { canonicaliseUrl } from "../../lib/hash.js";
import { parseDateLoose } from "../../lib/time.js";

export const name = "fixture";

export const fixtureDir = join(rootDir, "test", "fixtures", "feeds");

/**
 * `feed_url` is either `fixtures/` (every fixture in the directory) or a single
 * file name. Sorted order keeps ingestion deterministic, which matters because
 * near-duplicate detection depends on which copy of a story lands first.
 */
export function resolveFixtureFiles(feedUrl) {
  const value = String(feedUrl || "fixtures/").trim();

  if (value && !value.endsWith("/")) {
    const file = join(fixtureDir, value.replace(/^fixtures\//, ""));
    return existsSync(file) ? [file] : [];
  }

  if (!existsSync(fixtureDir) || !statSync(fixtureDir).isDirectory()) return [];
  return readdirSync(fixtureDir)
    .filter((entry) => entry.endsWith(".xml"))
    .sort()
    .map((entry) => join(fixtureDir, entry));
}

function normaliseItem(source, item, sourceSlug, language) {
  if (!item.link || !item.title) return null;
  const url = item.link.trim();

  return {
    url,
    canonicalUrl: canonicaliseUrl(url),
    title: toExcerpt(item.title, 300),
    excerpt: toExcerpt(item.description),
    author: item.author ? toExcerpt(item.author, 120) : null,
    publishedAt: parseDateLoose(item.publishedAt),
    guid: item.guid ?? null,
    language: language || detectLanguage(`${item.title} ${item.description}`),
    // Fixtures may declare which real source they impersonate so the offline
    // demo exercises tier-1 official feeds as well as tier-3 media.
    sourceSlug,
  };
}

export async function fetchItems(source) {
  const files = resolveFixtureFiles(source?.feed_url);
  const items = [];
  const warnings = [];

  for (const file of files) {
    let xml = "";
    try {
      xml = readFileSync(file, "utf8");
    } catch (error) {
      warnings.push(`${file}: unreadable (${error?.message || error})`);
      continue;
    }

    let feed;
    try {
      feed = parseFeed(xml);
    } catch (error) {
      warnings.push(`${file}: parse failed (${error?.message || error})`);
      continue;
    }

    const sourceSlug = readTagValue(xml, "sourceSlug");
    const language = readTagValue(xml, "language");
    const before = items.length;

    for (const item of feed.items) {
      const normalised = normaliseItem(source, item, sourceSlug, language);
      if (normalised) items.push(normalised);
    }

    if (items.length === before) warnings.push(`${file}: no usable items (format=${feed.format})`);
  }

  if (!files.length) {
    return {
      provider: name,
      ok: false,
      status: 0,
      reason: "no_fixtures",
      notModified: false,
      robots: { allowed: true, checked: false },
      items: [],
      warnings,
      etag: null,
      lastModified: null,
      error: `no fixture feeds found for ${source?.feed_url ?? "(none)"}`,
    };
  }

  return {
    provider: name,
    ok: true,
    status: 200,
    reason: items.length ? "ok" : "empty",
    notModified: false,
    // Local files: robots.txt does not apply, and saying "checked" would be a lie.
    robots: { allowed: true, checked: false },
    items,
    warnings,
    etag: null,
    lastModified: null,
    error: null,
  };
}

export function createProvider() {
  return { name, fetchItems, fixtureDir };
}

export default createProvider;
