/**
 * Supported departure cities.
 *
 * Coverage is deliberately narrow. The ICP is families departing Tokyo, Osaka, and Nagoya,
 * and every destination in the seed dataset carries hand-checked access routes from these
 * three. Adding an origin means adding a route to every destination, so an origin is only
 * listed once that work is done — the engine reports an unsupported origin rather than
 * inventing a route.
 */

export const origins = {
  tokyo: {
    id: "tokyo",
    name: { ja: "東京", en: "Tokyo" },
    aliases: ["東京", "東京都", "首都圏", "関東", "23区", "都内", "とうきょう", "tokyo", "yokohama", "横浜", "神奈川", "千葉", "埼玉"],
    hubs: { air: ["HND", "NRT"], rail: "東京駅" },
  },
  osaka: {
    id: "osaka",
    name: { ja: "大阪", en: "Osaka" },
    aliases: ["大阪", "大阪府", "関西", "近畿", "梅田", "難波", "なんば", "おおさか", "osaka", "kansai", "神戸", "兵庫"],
    hubs: { air: ["ITM", "KIX"], rail: "新大阪駅" },
  },
  nagoya: {
    id: "nagoya",
    name: { ja: "名古屋", en: "Nagoya" },
    aliases: ["名古屋", "愛知", "中京", "東海", "なごや", "nagoya", "aichi", "岐阜"],
    hubs: { air: ["NGO"], rail: "名古屋駅" },
  },
};

export const originIds = Object.keys(origins);

export function getOrigin(originId) {
  return origins[originId] || null;
}
