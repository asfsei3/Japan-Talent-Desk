/**
 * Trip saving and sharing without a database.
 *
 * The whole trip request is encoded into a URL-safe token, so a saved or shared trip costs
 * nothing to store and works across devices with no account. `docs/cost-model.md` §3.4 records
 * why the MVP has no managed database: nothing yet needs one.
 *
 * Tokens are not secret and not signed. They carry only what the user typed, so the worst case
 * of a tampered token is a trip request the engine will re-validate anyway.
 */

const TOKEN_VERSION = 1;

function toBase64Url(text) {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token) {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/");

  return Buffer.from(padded, "base64").toString("utf8");
}

/** Encodes the parts of a request that a shared link needs to reproduce the result. */
export function encodeTrip(request) {
  const payload = {
    v: TOKEN_VERSION,
    o: request.originId,
    m: request.month,
    n: request.nights,
    a: request.adults,
    c: request.children.map((child) => child.age),
    b: request.budgetYen,
    i: request.interests,
    k: request.constraints,
  };

  return toBase64Url(JSON.stringify(payload));
}

/**
 * Decodes a share token back into request overrides.
 *
 * @returns {object|null} Overrides suitable for `parseTripRequest`, or null if unreadable.
 */
export function decodeTrip(token) {
  try {
    const payload = JSON.parse(fromBase64Url(String(token || "")));

    if (payload.v !== TOKEN_VERSION) {
      return null;
    }

    return {
      originId: payload.o ?? null,
      month: payload.m ?? null,
      nights: payload.n ?? null,
      adults: payload.a ?? null,
      childCount: Array.isArray(payload.c) ? payload.c.length : 0,
      childAges: Array.isArray(payload.c) ? payload.c : [],
      budgetYen: payload.b ?? null,
      interests: Array.isArray(payload.i) ? payload.i : [],
      constraints: payload.k || {},
    };
  } catch {
    return null;
  }
}
