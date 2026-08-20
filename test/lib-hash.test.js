import "./helpers/test-env.js";

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { canonicaliseUrl, hammingDistance, simhash, urlHash } from "../src/lib/hash.js";

describe("url canonicalisation", () => {
  it("collapses the same article shared through different campaigns", () => {
    const a = "https://www.example.com/news/story?utm_source=twitter&utm_medium=social";
    const b = "http://example.com/news/story/";
    assert.equal(urlHash(a), urlHash(b));
  });

  it("keeps meaningful query parameters", () => {
    assert.ok(canonicaliseUrl("https://example.com/a?id=7").includes("id=7"));
  });

  it("degrades to the raw string on unparseable input", () => {
    assert.equal(canonicaliseUrl("not a url"), "not a url");
  });
});

describe("simhash near-duplicate detection", () => {
  it("scores a rewrite of the same story as close", () => {
    const original = simhash("Brighton winger Kaoru Mitoma is attracting interest from Bayern Munich this summer");
    const rewrite = simhash("Bayern Munich are showing interest in Brighton winger Kaoru Mitoma this summer");
    assert.ok(hammingDistance(original, rewrite) <= 12, `distance ${hammingDistance(original, rewrite)}`);
  });

  it("scores an unrelated story as far", () => {
    const transfer = simhash("Brighton winger Kaoru Mitoma is attracting interest from Bayern Munich");
    const unrelated = simhash("Ticket prices announced for the domestic cup final in December");
    assert.ok(hammingDistance(transfer, unrelated) > 12);
  });

  it("treats an empty document as maximally distant rather than identical", () => {
    assert.equal(hammingDistance(simhash("something"), null), 64);
  });
});
