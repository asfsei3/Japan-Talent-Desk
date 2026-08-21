import "./helpers/test-env.js";

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  containsAlias,
  containsJapanese,
  escapeHtml,
  normalize,
  normalizeAlias,
  reversedNameVariants,
  romajiVariants,
  slugify,
  toExcerpt,
} from "../src/lib/text.js";

describe("text normalisation", () => {
  it("folds macrons, case and punctuation", () => {
    assert.equal(normalize("Junya Itō"), "junya ito");
    assert.equal(normalize("Brøndby  IF"), "brondby if");
    assert.equal(normalize("Borussia Mönchengladbach"), "borussia monchengladbach");
  });

  it("splits a possessive 's rather than merging it into the name", () => {
    // Deleting the apostrophe outright used to fold "Ito's" into "itos",
    // which then failed containsAlias's word-boundary check on every
    // possessive mention — a routine construction in football headlines.
    assert.equal(normalize("Hiroki Ito's future"), "hiroki ito s future");
    assert.equal(normalize("Mitoma's injury"), "mitoma s injury");
  });

  it("strips spacing inside Japanese aliases but keeps it in Latin ones", () => {
    assert.equal(normalizeAlias("三笘 薫"), "三笘薫");
    assert.equal(normalizeAlias("Kaoru Mitoma"), "kaoru mitoma");
  });

  it("detects Japanese across kanji, hiragana and katakana", () => {
    assert.ok(containsJapanese("三笘薫"));
    assert.ok(containsJapanese("みとま"));
    assert.ok(containsJapanese("ミトマ"));
    assert.ok(!containsJapanese("Mitoma"));
  });

  it("generates the reversed name order Japanese sources use", () => {
    assert.deepEqual(reversedNameVariants("Kaoru Mitoma"), ["mitoma kaoru"]);
    assert.deepEqual(reversedNameVariants("Kaoru"), []);
  });

  it("contracts romanisation drift without inventing expansions", () => {
    assert.deepEqual(romajiVariants("Junya Itou"), ["junya ito"]);
    // Already contracted: nothing new to add.
    assert.deepEqual(romajiVariants("Junya Ito"), []);
  });
});

describe("alias matching", () => {
  it("requires word boundaries for Latin text", () => {
    assert.ok(containsAlias("brighton winger kaoru mitoma scored", "kaoru mitoma", false));
    // "ito" must not match inside "capito".
    assert.ok(!containsAlias("the club capitolised on it", "ito", false));
  });

  it("matches a name in possessive form, as normalize() now hands it over", () => {
    assert.ok(containsAlias(normalize("Hiroki Ito's future is uncertain"), normalizeAlias("Hiroki Ito"), false));
  });

  it("allows substring matching for Japanese, which has no word spaces", () => {
    assert.ok(containsAlias("三笘薫が決勝点", "三笘薫", true));
  });
});

describe("excerpting and escaping", () => {
  it("strips markup and truncates on a word boundary", () => {
    const excerpt = toExcerpt(`<p>${"word ".repeat(200)}</p>`, 80);
    assert.ok(excerpt.length <= 81, excerpt.length);
    assert.ok(excerpt.endsWith("…"));
    assert.ok(!excerpt.includes("<p>"));
  });

  it("decodes the entities feeds actually emit", () => {
    assert.equal(toExcerpt("Brighton &amp; Hove"), "Brighton & Hove");
  });

  it("escapes third-party text so a headline cannot inject markup", () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("slugifies to url-safe output", () => {
    assert.equal(slugify("Real Sociedad"), "real-sociedad");
  });
});
