/**
 * Collection, deduplication and source health.
 *
 * Everything here runs offline: the fixture provider stands in for the wire,
 * and network failure is exercised with a source that cannot resolve.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dbPath = fileURLToPath(new URL("../var/test-collect.db", import.meta.url));
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
process.env.JFI_DB_PATH = dbPath;
process.env.JFI_LOG_LEVEL = "error";
// Keep the offline-failure test quick; the politeness delays have their own job.
process.env.JFI_HTTP_HOST_DELAY_MS = "0";
process.env.JFI_HTTP_RETRIES = "0";

const { all, get, migrate, run } = await import("../src/db/client.js");
const { seed } = await import("../src/db/seed.js");
const { registerProvider } = await import("../src/providers/index.js");
const { collect, checkSources, NEAR_DUPLICATE_MAX_DISTANCE } = await import("../src/pipeline/collect.js");
const { toExcerpt } = await import("../src/lib/text.js");
const { hammingDistance } = await import("../src/lib/hash.js");

migrate();
seed({ verbose: false });

const first = await collect({ sourceSlugs: ["jfi-fixtures"] });

test("fixtures are collected offline", () => {
  assert.equal(first.sources, 1);
  assert.equal(first.errors, 0);
  assert.ok(first.fetched >= 10, `expected at least 10 items, got ${first.fetched}`);
  assert.ok(first.inserted >= 9);
});

test("items are attributed to the source the fixture impersonates", () => {
  const bySource = all(
    `SELECT s.slug, s.tier, COUNT(*) AS n FROM articles a JOIN sources s ON s.id = a.source_id GROUP BY s.slug`
  );
  const slugs = bySource.map((row) => row.slug);
  assert.ok(slugs.includes("brighton-official"), "the official club feed must produce tier-1 articles");
  assert.ok(slugs.includes("soccer-king"), "the Japanese-language feed must be represented");
  assert.ok(slugs.includes("guardian-football"));
});

test("only a headline and a short excerpt are stored", () => {
  for (const article of all("SELECT title, excerpt FROM articles")) {
    assert.ok(article.title.length > 0);
    assert.ok((article.excerpt ?? "").length <= 321, "excerpt must stay inside toExcerpt limits");
    assert.equal(article.excerpt, toExcerpt(article.excerpt));
  }
});

test("hashes are stored for every article", () => {
  const missing = get(
    "SELECT COUNT(*) AS n FROM articles WHERE url_hash IS NULL OR content_hash IS NULL OR simhash IS NULL"
  );
  assert.equal(missing.n, 0);
});

test("a rewrite of the same story by another outlet is marked as a near-duplicate", () => {
  assert.equal(first.nearDuplicates, 1);

  const duplicate = get(
    "SELECT id, title, simhash, duplicate_of FROM articles WHERE status = 'duplicate'"
  );
  assert.ok(duplicate, "expected the Sky rewrite of the Mitoma injury story to be flagged");
  assert.match(duplicate.title, /Mitoma/);

  const original = get("SELECT id, title, simhash FROM articles WHERE id = ?", duplicate.duplicate_of);
  assert.match(original.title, /Mitoma/);
  assert.ok(hammingDistance(duplicate.simhash, original.simhash) <= NEAR_DUPLICATE_MAX_DISTANCE);
});

test("unrelated stories stay well clear of the near-duplicate threshold", () => {
  const rows = all("SELECT id, simhash, duplicate_of FROM articles WHERE duplicate_of IS NULL");
  let closest = 64;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      closest = Math.min(closest, hammingDistance(rows[i].simhash, rows[j].simhash));
    }
  }
  assert.ok(closest > NEAR_DUPLICATE_MAX_DISTANCE, `closest non-duplicate pair was ${closest} bits`);
});

test("re-running collects nothing new and counts exact duplicates", async () => {
  const before = get("SELECT COUNT(*) AS n FROM articles").n;
  const second = await collect({ sourceSlugs: ["jfi-fixtures"] });

  assert.equal(second.inserted, 0);
  assert.ok(second.duplicates >= before);
  assert.equal(get("SELECT COUNT(*) AS n FROM articles").n, before);
});

test("the run limit is honoured", async () => {
  run("DELETE FROM article_entities");
  run("DELETE FROM articles");
  const limited = await collect({ sourceSlugs: ["jfi-fixtures"], limit: 3 });
  assert.equal(limited.inserted, 3);
  assert.ok(get("SELECT COUNT(*) AS n FROM articles").n <= 4);
});

test("source health is recorded after a successful fetch", () => {
  const source = get("SELECT * FROM sources WHERE slug = 'jfi-fixtures'");
  assert.equal(source.last_status, "ok");
  assert.equal(source.consecutive_errors, 0);
  assert.equal(source.last_error, null);
  assert.ok(source.last_fetched_at);
});

test("a robots refusal skips the source and is recorded, not thrown", async () => {
  registerProvider("news", "test-robots-block", () => ({
    name: "test-robots-block",
    async fetchItems() {
      return { ok: false, reason: "robots_disallowed", status: 0, items: [], warnings: [], error: "disallowed" };
    },
  }));
  run(
    `INSERT INTO sources (slug, name, kind, feed_url, provider, language, tier, enabled)
     VALUES ('test-robots', 'Robots Blocked', 'media_eu', 'fixtures/', 'test-robots-block', 'en', 3, 1)`
  );

  const stats = await collect({ sourceSlugs: ["test-robots"] });
  assert.equal(stats.skippedByRobots, 1);
  assert.equal(stats.errors, 0);
  assert.equal(get("SELECT robots_allowed FROM sources WHERE slug = 'test-robots'").robots_allowed, 0);
});

test("five consecutive failures disable a source and queue it for a human", async () => {
  registerProvider("news", "test-always-fails", () => ({
    name: "test-always-fails",
    async fetchItems() {
      return { ok: false, reason: "http_error", status: 503, items: [], warnings: [], error: "HTTP 503" };
    },
  }));
  run(
    `INSERT INTO sources (slug, name, kind, feed_url, provider, language, tier, enabled)
     VALUES ('test-dead-feed', 'Dead Feed', 'media_eu', 'fixtures/', 'test-always-fails', 'en', 3, 1)`
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const stats = await collect({ sourceSlugs: ["test-dead-feed"] });
    assert.equal(stats.errors, 1);
    assert.equal(get("SELECT enabled FROM sources WHERE slug = 'test-dead-feed'").enabled, 1);
  }

  await collect({ sourceSlugs: ["test-dead-feed"] });
  const source = get("SELECT * FROM sources WHERE slug = 'test-dead-feed'");
  assert.equal(source.enabled, 0);
  assert.equal(source.consecutive_errors, 5);
  assert.match(source.last_error, /503/);

  const queued = get(
    "SELECT * FROM review_queue WHERE item_type = 'source' AND item_id = ? AND reason = 'source_disabled'",
    source.id
  );
  assert.ok(queued, "a dead feed must reach a human");
  assert.equal(queued.status, "open");
});

test("a provider that throws is contained", async () => {
  registerProvider("news", "test-throws", () => ({
    name: "test-throws",
    async fetchItems() {
      throw new Error("boom");
    },
  }));
  run(
    `INSERT INTO sources (slug, name, kind, feed_url, provider, language, tier, enabled)
     VALUES ('test-throws-source', 'Throwing Feed', 'media_eu', 'fixtures/', 'test-throws', 'en', 3, 1)`
  );

  const stats = await collect({ sourceSlugs: ["test-throws-source"] });
  assert.equal(stats.errors, 1);
  assert.match(get("SELECT last_error FROM sources WHERE slug = 'test-throws-source'").last_error, /boom/);
});

test("checkSources validates without ingesting", async () => {
  const before = get("SELECT COUNT(*) AS n FROM articles").n;
  const report = await checkSources({ sourceSlugs: ["jfi-fixtures"] });

  assert.equal(report.checked, 1);
  assert.equal(report.ok, 1);
  assert.equal(report.failed, 0);
  assert.equal(report.results[0].slug, "jfi-fixtures");
  assert.equal(report.results[0].status, "ok");
  assert.match(report.results[0].note, /items/);
  assert.equal(get("SELECT COUNT(*) AS n FROM articles").n, before, "checkSources must not ingest");
});

test("checkSources reports an unreachable feed honestly", async () => {
  run(
    `INSERT INTO sources (slug, name, kind, feed_url, provider, language, tier, commercial_use, enabled)
     VALUES ('test-offline', 'Offline Feed', 'media_eu', 'https://feed.invalid/rss.xml', 'rss', 'en', 3, 'unknown', 0)`
  );

  const report = await checkSources({ sourceSlugs: ["test-offline"] });
  assert.equal(report.ok, 0);
  assert.equal(report.failed, 1);
  assert.equal(report.disabled, 1);
  assert.notEqual(report.results[0].status, "ok");
  assert.match(report.results[0].note, /licence: unverified commercial use/);
});

test("checkSources flags a source with no feed URL", async () => {
  run(
    `INSERT INTO sources (slug, name, kind, feed_url, provider, language, tier, commercial_use, enabled)
     VALUES ('test-nofeed', 'No Feed', 'media_eu', NULL, 'rss', 'en', 3, 'restricted', 1)`
  );

  const report = await checkSources({ sourceSlugs: ["test-nofeed"] });
  assert.equal(report.results[0].status, "no_feed_url");
  assert.match(report.results[0].note, /licence: restricted/);
});
