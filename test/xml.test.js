/** Feed parsing, including the malformed fixture the collector must survive. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseFeed, readTagValue, readAttr, decodeEntities } from "../src/lib/xml.js";

function fixture(name) {
  return readFileSync(fileURLToPath(new URL(`./fixtures/feeds/${name}`, import.meta.url)), "utf8");
}

test("parses an RSS 2.0 feed with CDATA and namespaced fields", () => {
  const feed = parseFeed(fixture("guardian-football.xml"));

  assert.equal(feed.format, "rss");
  assert.equal(feed.feedTitle, "The Guardian — Football");
  assert.equal(feed.items.length, 4);

  const [first] = feed.items;
  assert.equal(first.title, "Liverpool weigh January move for Bayern Munich defender Hiroki Ito");
  assert.match(first.link, /^https:\/\/www\.theguardian\.com\//);
  assert.match(first.description, /initial contact/);
  assert.equal(first.author, "Fabrizio Example");
  assert.equal(first.publishedAt, "2026-08-18T07:15:00.000Z");
});

test("decodes numeric and named entities in titles", () => {
  const feed = parseFeed(fixture("guardian-football.xml"));
  const wembley = feed.items.find((item) => item.title.startsWith("Wembley"));
  assert.equal(wembley.title, "Wembley to host the 2027 Women's Champions League final");
});

test("parses an Atom feed and reads the alternate link", () => {
  const feed = parseFeed(fixture("brighton-official.xml"));

  assert.equal(feed.format, "atom");
  assert.equal(feed.items.length, 2);
  assert.equal(feed.items[0].link, "https://www.brightonandhovealbion.com/news/2026/08/19/kota-takai-signs");
  assert.match(feed.items[0].description, /permanent signing of Japan defender Kota Takai/);
});

test("keeps Japanese titles intact", () => {
  const feed = parseFeed(fixture("soccer-king.xml"));
  assert.equal(feed.items.length, 3);
  assert.match(feed.items[0].title, /久保建英/);
  assert.match(feed.items[1].description, /伊藤洋輝/);
});

test("a malformed feed yields no usable items instead of throwing", () => {
  const feed = parseFeed(fixture("zz-broken-feed.xml"));
  // The one well-formed item has no <link>, and the truncated one is unparseable.
  assert.equal(feed.items.length, 0);
});

test("empty and junk input are reported, not guessed at", () => {
  assert.deepEqual(parseFeed(""), { format: "unknown", feedTitle: null, items: [] });
  assert.equal(parseFeed("not xml at all").items.length, 0);
});

test("tag and attribute readers are namespace tolerant", () => {
  assert.equal(readTagValue("<dc:creator>Someone</dc:creator>", "creator"), "Someone");
  assert.equal(readAttr('rel="alternate" href="https://example.test/x"', "href"), "https://example.test/x");
  assert.equal(decodeEntities("A &amp; B &#39;C&#39; &lt;d&gt;"), "A & B 'C' <d>");
});
