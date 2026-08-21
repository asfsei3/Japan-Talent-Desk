/**
 * Dependency-free RSS 2.0 / Atom 1.0 / RDF parser.
 *
 * It intentionally does only what feed ingestion needs: find item nodes, read a
 * handful of known fields, decode entities and CDATA. Anything it cannot parse
 * is reported rather than guessed at.
 */

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeEntities(value) {
  return String(value ?? "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
    if (ENTITIES[code]) return ENTITIES[code];
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return match;
  });
}

function stripCdata(value) {
  const trimmed = String(value ?? "").trim();
  const match = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return match ? match[1] : trimmed;
}

/** Read the first occurrence of `<tag>…</tag>`, namespace-tolerant. */
export function readTag(xml, tag) {
  const pattern = new RegExp(
    `<(?:[\\w-]+:)?${tag}(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>)`,
    "i"
  );
  const match = xml.match(pattern);
  if (!match) return null;
  if (match[2] === undefined) return { attrs: match[1] || "", value: "" };
  return { attrs: match[1] || "", value: decodeEntities(stripCdata(match[2])) };
}

export function readTagValue(xml, tag) {
  return readTag(xml, tag)?.value ?? null;
}

export function readAttr(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? decodeEntities(match[1]) : null;
}

function splitBlocks(xml, tag) {
  const pattern = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[\\w-]+:)?${tag}>`, "gi");
  return xml.match(pattern) ?? [];
}

function atomLink(block) {
  const links = block.match(/<(?:[\w-]+:)?link\b[^>]*\/?>/gi) ?? [];
  let fallback = null;
  for (const link of links) {
    const href = readAttr(link, "href");
    if (!href) continue;
    const rel = (readAttr(link, "rel") || "alternate").toLowerCase();
    if (rel === "alternate") return href;
    fallback = fallback ?? href;
  }
  return fallback;
}

/**
 * @returns {{format:string, feedTitle:string|null, items:Array<{title:string,link:string,description:string,publishedAt:string|null,author:string|null,guid:string|null}>}}
 */
export function parseFeed(xml) {
  const text = String(xml ?? "").replace(/^﻿/, "").trim();
  if (!text) return { format: "unknown", feedTitle: null, items: [] };

  const isAtom = /<(?:[\w-]+:)?feed[\s>]/i.test(text) && /<(?:[\w-]+:)?entry[\s>]/i.test(text);
  const blocks = isAtom ? splitBlocks(text, "entry") : splitBlocks(text, "item");
  const headerEnd = blocks.length ? text.indexOf(blocks[0]) : text.length;
  const feedTitle = readTagValue(text.slice(0, headerEnd), "title");

  const items = [];
  for (const block of blocks) {
    const title = readTagValue(block, "title");
    const link = isAtom ? atomLink(block) : readTagValue(block, "link") || readTagValue(block, "guid");
    if (!title || !link) continue;

    const description =
      readTagValue(block, "description") ??
      readTagValue(block, "summary") ??
      readTagValue(block, "content") ??
      readTagValue(block, "encoded") ??
      "";

    const published =
      readTagValue(block, "pubDate") ??
      readTagValue(block, "published") ??
      readTagValue(block, "updated") ??
      readTagValue(block, "date") ??
      null;

    const parsedDate = published ? new Date(published) : null;

    items.push({
      title: title.trim(),
      link: link.trim(),
      description: description.trim(),
      publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
      author: readTagValue(block, "creator") ?? readTagValue(block, "author") ?? null,
      guid: readTagValue(block, "guid") ?? readTagValue(block, "id") ?? null,
    });
  }

  return { format: isAtom ? "atom" : blocks.length ? "rss" : "unknown", feedTitle, items };
}

export default { parseFeed, readTag, readTagValue, readAttr, decodeEntities };
