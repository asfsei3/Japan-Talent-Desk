/**
 * Text normalisation for multilingual entity matching.
 *
 * Japanese names arrive as kanji, kana, and several romanisations, in either
 * name order, with or without macrons. Everything is folded to one comparable
 * form before matching.
 */

const JAPANESE_RANGE = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;

export function containsJapanese(value) {
  return JAPANESE_RANGE.test(String(value || ""));
}

export function detectLanguage(value) {
  return containsJapanese(value) ? "ja" : "en";
}

/**
 * Latin letters that carry no combining form, so NFD cannot decompose them.
 * Sources spell these inconsistently (Brøndby/Brondby, Mönchengladbach/Monchengladbach).
 */
const LATIN_FOLD = { "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "đ": "d", "ð": "d", "ł": "l", "þ": "th", "ı": "i" };

/**
 * NFKC + lowercase + fold Latin diacritics + collapse punctuation.
 *
 * The NFC recomposition after stripping combining marks is load-bearing: NFD
 * splits katakana dakuten into a separate U+3099 mark, and without recomposing
 * it the punctuation rule below deletes the mark and turns ブ into フ.
 */
export function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[øæœßđðłþı]/g, (character) => LATIN_FOLD[character])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .replace(/[’'`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeAlias(value) {
  const normalized = normalize(value);
  // Katakana middle dots and spacing inside Japanese names carry no matching signal.
  return containsJapanese(value) ? normalized.replace(/\s+/g, "") : normalized;
}

/** "Kaoru Mitoma" -> "mitoma kaoru", so either name order matches. */
export function reversedNameVariants(name) {
  const parts = normalize(name).split(" ").filter(Boolean);
  if (parts.length !== 2) return [];
  return [`${parts[1]} ${parts[0]}`];
}

/**
 * Common romanisation drift, contraction only: `Itou`/`Itoo`/`Itō` all fold to
 * `Ito`. Expanding in the other direction (`o` -> `ou`) was tried and removed:
 * it generated strings no source ever writes and only added noise.
 */
export function romajiVariants(name) {
  const base = normalize(name);
  if (!base || containsJapanese(name)) return [];

  const contracted = base.replace(/ou/g, "o").replace(/oo/g, "o").replace(/uu/g, "u");
  return contracted && contracted !== base ? [contracted] : [];
}

export function tokenize(value) {
  return normalize(value).split(" ").filter(Boolean);
}

/**
 * Substring match that respects word boundaries in Latin text and allows plain
 * substring matching for Japanese, which has no spaces.
 */
export function containsAlias(haystackNorm, aliasNorm, isJapanese) {
  if (!haystackNorm || !aliasNorm) return false;
  if (isJapanese) return haystackNorm.includes(aliasNorm);

  const index = haystackNorm.indexOf(aliasNorm);
  if (index === -1) return false;

  const before = index === 0 ? " " : haystackNorm[index - 1];
  const afterIndex = index + aliasNorm.length;
  const after = afterIndex >= haystackNorm.length ? " " : haystackNorm[afterIndex];
  return before === " " && after === " ";
}

/** Trim to a short factual excerpt. Full article bodies are never stored. */
export function toExcerpt(value, maxLength = 320) {
  const text = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

export function slugify(value) {
  const base = normalize(value).replace(/\s+/g, "-");
  return base || "item";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default {
  containsJapanese,
  detectLanguage,
  normalize,
  normalizeAlias,
  reversedNameVariants,
  romajiVariants,
  tokenize,
  containsAlias,
  toExcerpt,
  slugify,
  escapeHtml,
};
