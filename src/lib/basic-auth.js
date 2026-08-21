/**
 * Shared HTTP Basic Auth check, used by anything gating an operator-only
 * route (JFI's /intel/admin, the root /ops portal). Credential comparison
 * uses crypto.timingSafeEqual instead of === to avoid leaking password
 * bytes through response-time differences.
 */
import { timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Compare against a same-length dummy so the mismatch doesn't leak length via timing.
    timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** @param {string|undefined} authorizationHeader */
export function checkBasicAuth(authorizationHeader, expectedUser, expectedPassword) {
  const header = String(authorizationHeader ?? "");
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;

  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  const user = separator === -1 ? decoded : decoded.slice(0, separator);
  const pass = separator === -1 ? "" : decoded.slice(separator + 1);
  return safeEqual(user, expectedUser) && safeEqual(pass, expectedPassword);
}
