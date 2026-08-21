/**
 * Travel Decision Engine — public entry point.
 *
 * The pipeline in one call:
 *   text -> structured request -> configurations -> cost -> scores -> ranked recommendations
 *
 * Everything runs locally and synchronously. There is no third-party call on this path, which
 * is what keeps the marginal cost of a query at zero. See `docs/cost-model.md`.
 */

import { parseTripRequest } from "./parse-request.js";
import { recommendTrips } from "./recommend.js";
import { encodeTrip, decodeTrip } from "./share.js";
import { affiliateConfigFromEnv, affiliateDisclosure } from "./affiliate.js";
import { analyzeTiming } from "./timing.js";
import { destinations, interestTags } from "./data/destinations.js";
import { origins } from "./data/origins.js";

export { parseTripRequest, recommendTrips, encodeTrip, decodeTrip, affiliateConfigFromEnv, affiliateDisclosure };
export { analyzeTiming };
export { destinations, interestTags, origins };

/**
 * Parses a natural-language trip description and returns ranked recommendations.
 *
 * @param {string} text Free-form Japanese or English description.
 * @param {object} [options]
 * @param {object} [options.overrides] Structured values from a form, which win over parsed text.
 * @param {object} [options.affiliateConfig] Affiliate identifiers for the booking-link layer.
 * @param {number} [options.limit] How many ranked destinations to return.
 * @returns {object} `{ request, result, shareToken }`.
 */
export function planTrip(text, options = {}) {
  const request = parseTripRequest(text, options.overrides || {});
  const result = recommendTrips(request, {
    affiliateConfig: options.affiliateConfig || {},
    limit: options.limit,
  });

  return {
    request,
    result,
    shareToken: encodeTrip(request),
  };
}

/** Describes what the engine currently supports, for populating a form. */
export function engineCapabilities() {
  return {
    origins: Object.values(origins).map((origin) => ({ id: origin.id, name: origin.name })),
    interests: interestTags,
    destinationCount: destinations.length,
    coverage: Object.values(origins).map((origin) => ({
      originId: origin.id,
      destinations: destinations.filter((destination) => destination.access?.[origin.id]).length,
    })),
    dataProvenance: {
      class: "seed-estimate",
      note: {
        ja: "料金・所要時間は独自データによる概算です。実際の価格は各予約サイトでご確認ください。",
        en: "Prices and travel times are estimates from a curated dataset. Confirm real prices at the booking provider.",
      },
    },
  };
}
