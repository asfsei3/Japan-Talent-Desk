/**
 * robots.txt handling. Compliance is a product promise, so the evaluator is
 * tested directly rather than through the network — these run offline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseRobots, pathAllowed } from "../src/lib/http.js";

test("no rules means allowed", () => {
  assert.equal(pathAllowed(parseRobots(""), "/anything"), true);
  assert.equal(pathAllowed(parseRobots("# just a comment\n"), "/feed"), true);
});

test("a wildcard disallow blocks the matching prefix only", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /private\n");
  assert.equal(pathAllowed(rules, "/private/report"), false);
  assert.equal(pathAllowed(rules, "/public/report"), true);
});

test("an empty disallow is an explicit allow-all", () => {
  const rules = parseRobots("User-agent: *\nDisallow:\n");
  assert.equal(pathAllowed(rules, "/sport/football/rss.xml"), true);
});

test("a longer allow overrides a shorter disallow", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /news\nAllow: /news/rss\n");
  assert.equal(pathAllowed(rules, "/news/story"), false);
  assert.equal(pathAllowed(rules, "/news/rss"), true);
});

test("wildcards in patterns are treated as a prefix match", () => {
  const rules = parseRobots("User-agent: *\nDisallow: /search*\n");
  assert.equal(pathAllowed(rules, "/search?q=mitoma"), false);
  assert.equal(pathAllowed(rules, "/sitemap.xml"), true);
});

test("a group naming our bot wins over the wildcard group", () => {
  const rules = parseRobots(
    "User-agent: *\nDisallow:\n\nUser-agent: JapanFootballIntelligenceBot\nDisallow: /\n"
  );
  assert.equal(pathAllowed(rules, "/feed"), false);
});

test("comments, blank lines and stray colons do not derail parsing", () => {
  const rules = parseRobots(
    "# robots\nUser-agent: *   # everyone\n\nDisallow: /a\nSitemap: https://example.test/sitemap.xml\nDisallow: /b\n"
  );
  assert.equal(rules.length, 1);
  assert.equal(pathAllowed(rules, "/a/x"), false);
  assert.equal(pathAllowed(rules, "/b"), false);
  assert.equal(pathAllowed(rules, "/c"), true);
});

test("consecutive user-agent lines share one rule block", () => {
  const rules = parseRobots("User-agent: BadBot\nUser-agent: *\nDisallow: /nope\n");
  assert.equal(rules.length, 1);
  assert.equal(pathAllowed(rules, "/nope"), false);
});
