import { createHash } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function shortHash(value, length = 16) {
  return sha256(value).slice(0, length);
}

/**
 * URL hash used for exact-duplicate detection. Tracking parameters are stripped
 * so the same article shared through different campaigns collapses to one row.
 */
const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref|ref_src|igshid|s|_ga)/i;

export function canonicaliseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    url.protocol = "https:";
    const params = [...url.searchParams.keys()];
    for (const key of params) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.search = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return String(rawUrl || "").trim();
  }
}

export function urlHash(rawUrl) {
  return sha256(canonicaliseUrl(rawUrl));
}

/**
 * 64-bit simhash over token shingles, used for near-duplicate detection when
 * several outlets rewrite the same wire story.
 */
export function simhash(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);

  if (!tokens.length) return "0".repeat(16);

  const vector = new Array(64).fill(0);
  for (const token of tokens) {
    const digest = createHash("md5").update(token).digest();
    for (let bit = 0; bit < 64; bit += 1) {
      const byte = digest[bit >> 3];
      const isSet = (byte >> (bit % 8)) & 1;
      vector[bit] += isSet ? 1 : -1;
    }
  }

  let hex = "";
  for (let nibble = 0; nibble < 16; nibble += 1) {
    let value = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      value = (value << 1) | (vector[nibble * 4 + bit] > 0 ? 1 : 0);
    }
    hex += value.toString(16);
  }
  return hex;
}

export function hammingDistance(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let distance = 0;
  for (let index = 0; index < hexA.length; index += 1) {
    let xor = parseInt(hexA[index], 16) ^ parseInt(hexB[index], 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export default { sha256, shortHash, canonicaliseUrl, urlHash, simhash, hammingDistance };
