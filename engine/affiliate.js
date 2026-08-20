/**
 * Booking hand-off links.
 *
 * This module is deliberately the LAST stage of the pipeline. It receives an already-ranked
 * result and attaches links to it. It is never consulted during scoring, so commission can
 * never influence what the engine recommends. See `docs/competitive-analysis.md` §6, Risk 4.
 *
 * Affiliate identifiers come from configuration, never from source. Until a programme approval
 * exists, the engine emits plain public search links with no tracking parameters — a fabricated
 * tracking ID would be both useless and dishonest.
 *
 * VERIFICATION REQUIRED BEFORE LAUNCH: every template below is marked `unverified`. Each
 * provider's affiliate documentation specifies the deep-link format that attributes a booking,
 * and those formats must replace these before any link is monetised. Tracked in
 * `docs/data-sources.md` §7.
 */

/**
 * @typedef {object} AffiliateConfig
 * @property {string} [rakutenAffiliateId]
 * @property {string} [valueCommerceId]
 * @property {string} [accessTradeId]
 */

const providers = {
  "rakuten-travel": {
    id: "rakuten-travel",
    name: { ja: "楽天トラベル", en: "Rakuten Travel" },
    category: "hotel",
    searchUrlTemplate: "https://search.travel.rakuten.co.jp/ds/hotellist/?f_query={query}",
    verificationStatus: "unverified",
  },
  jalan: {
    id: "jalan",
    name: { ja: "じゃらん", en: "Jalan" },
    category: "hotel",
    searchUrlTemplate: "https://www.jalan.net/uw/uwp2011/uww2011init.do?keyword={query}",
    verificationStatus: "unverified",
  },
  "rakuten-car": {
    id: "rakuten-car",
    name: { ja: "楽天トラベル レンタカー", en: "Rakuten Rental Car" },
    category: "rental-car",
    searchUrlTemplate: "https://travel.rakuten.co.jp/cars/",
    verificationStatus: "unverified",
  },
  "airline-search": {
    id: "airline-search",
    name: { ja: "国内線を検索", en: "Search domestic flights" },
    category: "flight",
    searchUrlTemplate: "https://travel.rakuten.co.jp/air/",
    verificationStatus: "unverified",
  },
  "jr-search": {
    id: "jr-search",
    name: { ja: "鉄道の時刻・運賃を確認", en: "Check rail times and fares" },
    category: "rail",
    searchUrlTemplate: "https://www.ekitan.com/",
    verificationStatus: "unverified",
  },
};

function fillTemplate(template, query) {
  return template.replace("{query}", encodeURIComponent(query));
}

/**
 * Appends affiliate tracking only when an identifier has actually been configured.
 * With no configuration the plain public link is returned unchanged.
 */
function applyTracking(url, provider, config) {
  if (provider.id.startsWith("rakuten") && config.rakutenAffiliateId) {
    const separator = url.includes("?") ? "&" : "?";

    return `${url}${separator}f_teikei=${encodeURIComponent(config.rakutenAffiliateId)}`;
  }

  return url;
}

function buildLink(providerId, query, config) {
  const provider = providers[providerId];

  if (!provider) {
    return null;
  }

  const url = fillTemplate(provider.searchUrlTemplate, query);

  return {
    providerId: provider.id,
    provider: provider.name,
    category: provider.category,
    url: applyTracking(url, provider, config),
    tracked: Boolean(config.rakutenAffiliateId) && provider.id.startsWith("rakuten"),
    verificationStatus: provider.verificationStatus,
  };
}

/**
 * Builds the booking hand-off links for one recommendation.
 *
 * @param {object} candidate A scored recommendation.
 * @param {AffiliateConfig} [config] Affiliate identifiers, normally sourced from the environment.
 * @returns {object[]} Links, ordered by how likely the user is to need them.
 */
export function buildBookingLinks(candidate, config = {}) {
  const destinationName = candidate.destination.name.ja;
  const links = [
    buildLink("rakuten-travel", destinationName, config),
    buildLink("jalan", destinationName, config),
  ];

  if (candidate.route.mode === "flight") {
    links.push(buildLink("airline-search", destinationName, config));
  }

  if (["shinkansen", "express", "bus"].includes(candidate.route.mode)) {
    links.push(buildLink("jr-search", destinationName, config));
  }

  if (candidate.cost.localTransport.mode === "rental-car") {
    links.push(buildLink("rakuten-car", destinationName, config));
  }

  return links.filter(Boolean);
}

/**
 * Reads affiliate identifiers from the environment. Absent identifiers are simply absent;
 * the link layer degrades to untracked public links rather than inventing an ID.
 */
export function affiliateConfigFromEnv(env = process.env) {
  return {
    rakutenAffiliateId: env.RAKUTEN_AFFILIATE_ID || undefined,
    valueCommerceId: env.VALUECOMMERCE_ID || undefined,
    accessTradeId: env.ACCESSTRADE_ID || undefined,
  };
}

/** Disclosure text. Japanese stealth-marketing rules require this wherever tracked links appear. */
export const affiliateDisclosure = {
  ja: "当サイトの予約リンクには広告（アフィリエイト）が含まれる場合があります。掲載順位は手数料の影響を受けません。",
  en: "Booking links on this page may be affiliate links. Ranking is never influenced by commission.",
};

export const affiliateProviders = providers;
