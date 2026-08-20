/**
 * RSS / Atom news provider.
 *
 * Blueprint §28 forbids hard-coding a provider anywhere but the registry, so
 * everything source-specific (conditional GET headers, robots, licence flags)
 * is handled here and reported back as data. The provider never throws: a dead
 * feed is an operational fact the collector has to record, not an exception
 * that aborts the whole run.
 */
import { config } from "../../config/index.js";
import { fetchText, isAllowedByRobots } from "../../lib/http.js";
import { parseFeed } from "../../lib/xml.js";
import { detectLanguage, toExcerpt } from "../../lib/text.js";
import { canonicaliseUrl } from "../../lib/hash.js";
import { parseDateLoose } from "../../lib/time.js";

export const name = "rss";

function result(overrides) {
  return {
    provider: name,
    ok: false,
    status: 0,
    reason: "fetch_error",
    notModified: false,
    robots: null,
    items: [],
    warnings: [],
    etag: null,
    lastModified: null,
    error: null,
    ...overrides,
  };
}

/** Feed items carry HTML fragments; only the headline and a short excerpt survive. */
function normaliseItem(source, item) {
  let url = item.link;
  try {
    // Feeds routinely publish relative or protocol-relative links.
    url = new URL(item.link, source.homepage || source.feed_url).toString();
  } catch {
    return null;
  }

  const title = toExcerpt(item.title, 300);
  if (!title) return null;

  return {
    url,
    canonicalUrl: canonicaliseUrl(url),
    title,
    excerpt: toExcerpt(item.description),
    author: item.author ? toExcerpt(item.author, 120) : null,
    publishedAt: parseDateLoose(item.publishedAt),
    guid: item.guid ?? null,
    language: source.language || detectLanguage(`${item.title} ${item.description}`),
    sourceSlug: null,
  };
}

export async function fetchItems(source) {
  if (!source?.feed_url) {
    return result({ reason: "no_feed_url", error: "source has no feed_url" });
  }

  let feedUrl;
  try {
    feedUrl = new URL(source.feed_url);
  } catch {
    return result({ reason: "invalid_feed_url", error: `not an absolute URL: ${source.feed_url}` });
  }

  if (!/^https?:$/.test(feedUrl.protocol)) {
    return result({ reason: "invalid_feed_url", error: `unsupported protocol: ${feedUrl.protocol}` });
  }

  let robots = { allowed: true, checked: false };
  if (config.http.respectRobots) {
    try {
      robots = await isAllowedByRobots(feedUrl.toString());
    } catch (error) {
      // A robots.txt we cannot read is not permission to crawl, but it is also
      // not a hard disallow; record it and let the collector decide.
      robots = { allowed: true, checked: false, error: error?.message || String(error) };
    }
    if (!robots.allowed) {
      return result({ reason: "robots_disallowed", robots, error: "robots.txt disallows this path" });
    }
  }

  const response = await fetchText(feedUrl.toString(), {
    etag: source.etag || undefined,
    lastModified: source.last_modified || undefined,
    acceptLanguage: source.language === "ja" ? "ja,en;q=0.8" : "en,ja;q=0.9",
  });

  if (response.notModified) {
    return result({ ok: true, status: 304, reason: "not_modified", notModified: true, robots });
  }

  if (!response.ok) {
    return result({
      status: response.status,
      reason: response.status ? "http_error" : "fetch_error",
      robots,
      error: response.error || `HTTP ${response.status}`,
    });
  }

  const feed = parseFeed(response.body);
  const items = [];
  for (const item of feed.items) {
    const normalised = normaliseItem(source, item);
    if (normalised) items.push(normalised);
  }

  const warnings = [];
  if (feed.format === "unknown") warnings.push("no recognisable RSS or Atom item nodes");
  if (feed.items.length && !items.length) warnings.push("every item was missing a usable link or title");

  return result({
    ok: true,
    status: response.status,
    reason: items.length ? "ok" : "empty",
    robots,
    items,
    warnings,
    etag: response.headers?.get("etag") ?? null,
    lastModified: response.headers?.get("last-modified") ?? null,
  });
}

export function createProvider() {
  return { name, fetchItems };
}

export default createProvider;
