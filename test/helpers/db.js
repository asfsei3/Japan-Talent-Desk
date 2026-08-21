import "./test-env.js";

import { get, migrate, run } from "../../src/db/client.js";
import { seed } from "../../src/db/seed.js";
import { sha256, simhash, urlHash } from "../../src/lib/hash.js";

let seeded = false;

/** Migrate + seed once per test process. */
export function freshDb() {
  if (seeded) return;
  migrate();
  seed({ verbose: false });
  seeded = true;
}

/**
 * Insert an article the way `collect` would, so intelligence tests do not have
 * to depend on the collection layer being present.
 */
export function insertArticle({
  sourceSlug = "bbc-football",
  url,
  title,
  excerpt = "",
  publishedAt = new Date().toISOString(),
  status = "new",
  relevanceScore = 0,
} = {}) {
  const source = get("SELECT id FROM sources WHERE slug = ?", sourceSlug);
  if (!source) throw new Error(`unknown seed source: ${sourceSlug}`);

  const finalUrl = url ?? `https://example.invalid/${sha256(title).slice(0, 12)}`;
  const { lastInsertRowid } = run(
    `INSERT INTO articles (source_id, url, url_hash, title, excerpt, language, published_at,
        content_hash, simhash, relevance_score, status)
     VALUES (?, ?, ?, ?, ?, 'en', ?, ?, ?, ?, ?)`,
    source.id, finalUrl, urlHash(finalUrl), title, excerpt, publishedAt,
    sha256(`${title}::${excerpt}`), simhash(`${title} ${excerpt}`), relevanceScore, status
  );

  return get("SELECT * FROM articles WHERE id = ?", Number(lastInsertRowid));
}

export function playerId(slug) {
  const row = get("SELECT id FROM players WHERE slug = ?", slug);
  if (!row) throw new Error(`unknown seed player: ${slug}`);
  return row.id;
}

export function clubId(slug) {
  const row = get("SELECT id FROM clubs WHERE slug = ?", slug);
  if (!row) throw new Error(`unknown seed club: ${slug}`);
  return row.id;
}
