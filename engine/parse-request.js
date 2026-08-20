/**
 * Natural-language trip request parser.
 *
 * Converts free Japanese or English text into a structured TripRequest. Rule-based and
 * deterministic: no model call, no API cost, and no possibility of a hallucinated budget.
 * `docs/cost-model.md` §3.3 records why this is a rule parser rather than an LLM call, and
 * what would justify changing that.
 *
 * The parser reports what it could not determine rather than guessing silently. Anything it
 * assumed appears in `assumptions`; anything it could not resolve appears in `warnings`.
 */

import { origins } from "./data/origins.js";
import { interestTags } from "./data/destinations.js";

const FULL_WIDTH_DIGIT_OFFSET = 0xfee0;

/**
 * Bounds on every numeric input.
 *
 * These are not cosmetic. `childCount` drives a loop, and structured overrides arrive straight
 * from request JSON, so an unbounded value is a denial of service rather than a silly answer.
 * Clamping here covers both the parsed text and the override path, because both converge on
 * this function.
 */
const limits = {
  adults: { min: 1, max: 12 },
  childCount: { min: 0, max: 10 },
  nights: { min: 0, max: 30 },
  budgetYen: { min: 0, max: 100_000_000 },
  childAge: { min: 0, max: 17 },
  month: { min: 1, max: 12 },
};

/**
 * Coerces a value to an integer inside `bounds`, or returns null when there is no number here.
 *
 * Null, undefined, and empty string must return null rather than clamping: `Number(null)` is 0,
 * not NaN, so treating them as numbers would silently turn "not stated" into the lower bound and
 * suppress the caller's default-and-say-so path.
 */
function clampInteger(value, bounds) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(bounds.max, Math.max(bounds.min, Math.trunc(number)));
}

const kanjiDigits = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

const englishMonths = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Per-tag masks: substrings that contain a tag's keyword without carrying that meaning.
 *
 * 北海道, 熱海, 上海 and 日本海 all contain 海, so "北海道に行きたい" would otherwise be read
 * as a beach request. 海鮮 is the interesting case — it must be masked for `beach` while
 * still counting as a positive signal for `food`, which is why masks are scoped per tag
 * rather than applied to the whole string once.
 */
const tagMasks = {
  beach: ["北海道", "熱海", "上海", "日本海", "東海", "地中海", "海鮮", "海外"],
};

const interestKeywords = {
  beach: ["海", "ビーチ", "海水浴", "泳ぎ", "泳げ", "泳ぐ", "マリン", "beach", "sea", "swim", "ocean"],
  onsen: ["温泉", "露天", "湯治", "秘湯", "onsen", "hot spring", "hotspring", "spa"],
  snow: ["雪", "スキー", "スノボ", "スノーボード", "ゲレンデ", "雪遊び", "ski", "snow", "snowboard"],
  themepark: ["テーマパーク", "遊園地", "ディズニー", "ユニバ", "USJ", "theme park", "themepark", "disney", "universal"],
  nature: ["自然", "high原", "高原", "ハイキング", "登山", "森", "滝", "星空", "nature", "hiking", "mountain", "outdoor"],
  city: ["都会", "街歩き", "市内観光", "都市", "city", "urban", "nightlife"],
  food: ["グルメ", "美味しいもの", "おいしいもの", "食べ歩き", "海鮮", "寿司", "food", "gourmet", "cuisine", "seafood"],
  culture: ["歴史", "神社", "お寺", "寺", "文化", "世界遺産", "城", "culture", "history", "temple", "shrine", "heritage"],
  resort: ["リゾート", "resort"],
  shopping: ["買い物", "ショッピング", "アウトレット", "shopping", "outlet"],
};

function toHalfWidthDigits(text) {
  return text.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - FULL_WIDTH_DIGIT_OFFSET));
}

/** Converts kanji numerals up to 99 into arabic digits, leaving other text untouched. */
function convertKanjiNumbers(text) {
  return text.replace(/[〇一二三四五六七八九十]+/g, (match) => {
    if (!/[十〇一二三四五六七八九]/.test(match)) {
      return match;
    }

    const tensIndex = match.indexOf("十");

    if (tensIndex === -1) {
      let value = 0;

      for (const char of match) {
        if (kanjiDigits[char] === undefined) {
          return match;
        }

        value = value * 10 + kanjiDigits[char];
      }

      return String(value);
    }

    const head = match.slice(0, tensIndex);
    const tail = match.slice(tensIndex + 1);
    const tens = head === "" ? 1 : kanjiDigits[head];
    const ones = tail === "" ? 0 : kanjiDigits[tail];

    if (tens === undefined || ones === undefined) {
      return match;
    }

    return String(tens * 10 + ones);
  });
}

function normalize(text) {
  return convertKanjiNumbers(toHalfWidthDigits(String(text || ""))).replace(/\s+/g, " ").trim();
}

function maskPhrases(text, phrases) {
  let masked = text;

  for (const phrase of phrases) {
    masked = masked.split(phrase).join("＿".repeat(phrase.length));
  }

  return masked;
}

function parseBudget(text) {
  const manMatch = text.match(/(\d+(?:\.\d+)?)\s*万/);

  if (manMatch) {
    return Math.round(Number(manMatch[1]) * 10000);
  }

  const yenMatch = text.match(/(?:¥|￥)\s*(\d[\d,]*)|(\d[\d,]*)\s*円/);

  if (yenMatch) {
    return Number((yenMatch[1] || yenMatch[2]).replace(/,/g, ""));
  }

  const englishMatch = text.match(/budget\s*(?:of|:)?\s*(\d[\d,]*)/i);

  if (englishMatch) {
    return Number(englishMatch[1].replace(/,/g, ""));
  }

  return null;
}

function parseMonth(text) {
  const japaneseMatch = text.match(/(\d{1,2})\s*月/);

  if (japaneseMatch) {
    const month = Number(japaneseMatch[1]);

    if (month >= 1 && month <= 12) {
      return month;
    }
  }

  const slashMatch = text.match(/\b(\d{1,2})\s*\/\s*\d{1,2}\b/);

  if (slashMatch) {
    const month = Number(slashMatch[1]);

    if (month >= 1 && month <= 12) {
      return month;
    }
  }

  const englishMatch = text.toLowerCase().match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b/);

  if (englishMatch) {
    return englishMonths[englishMatch[1]];
  }

  return null;
}

/**
 * Nights, not days. Japanese trip lengths are quoted several ways and they do not all mean
 * the same thing: 3泊 is three nights, 2泊3日 is two, and 3連休 is a three-day weekend which
 * normally means two nights away.
 */
function parseNights(text) {
  const nightsMatch = text.match(/(\d+)\s*泊/);

  if (nightsMatch) {
    return Number(nightsMatch[1]);
  }

  const holidayMatch = text.match(/(\d+)\s*連休/);

  if (holidayMatch) {
    return Math.max(1, Number(holidayMatch[1]) - 1);
  }

  const daysMatch = text.match(/(\d+)\s*日間/);

  if (daysMatch) {
    return Math.max(1, Number(daysMatch[1]) - 1);
  }

  const englishMatch = text.match(/(\d+)\s*nights?/i);

  if (englishMatch) {
    return Number(englishMatch[1]);
  }

  const englishDays = text.match(/(\d+)\s*days?/i);

  if (englishDays) {
    return Math.max(1, Number(englishDays[1]) - 1);
  }

  if (/日帰り/.test(text)) {
    return 0;
  }

  if (/週末|weekend/i.test(text)) {
    return 1;
  }

  return null;
}

function parseParty(text) {
  const adultsMatch = text.match(/大人\s*(\d+)|(\d+)\s*人\s*の?大人|adults?\s*(\d+)|(\d+)\s*adults?/i);
  const childrenMatch = text.match(/(?:子供|子ども|こども|児童)\s*(\d+)|(?:children|kids?)\s*(\d+)|(\d+)\s*(?:children|kids?)/i);

  const adults = adultsMatch ? Number(adultsMatch[1] || adultsMatch[2] || adultsMatch[3] || adultsMatch[4]) : null;
  const childCount = childrenMatch ? Number(childrenMatch[1] || childrenMatch[2] || childrenMatch[3]) : null;

  const ages = [];

  for (const match of text.matchAll(/(\d+)\s*(?:歳|才)/g)) {
    ages.push(Number(match[1]));
  }

  for (const match of text.matchAll(/age[sd]?\s*(\d+)(?:\s*(?:and|,|&)\s*(\d+))?/gi)) {
    ages.push(Number(match[1]));

    if (match[2]) {
      ages.push(Number(match[2]));
    }
  }

  return { adults, childCount, ages };
}

function parseOrigin(text) {
  // A departure marker is the strongest signal, so it is checked before a bare city mention.
  for (const [originId, origin] of Object.entries(origins)) {
    for (const alias of origin.aliases) {
      if (new RegExp(`${alias}\\s*(?:から|発)`).test(text) || new RegExp(`from\\s+${alias}`, "i").test(text)) {
        return originId;
      }
    }
  }

  for (const [originId, origin] of Object.entries(origins)) {
    for (const alias of origin.aliases) {
      if (text.toLowerCase().includes(alias.toLowerCase())) {
        return originId;
      }
    }
  }

  return null;
}

function parseInterests(text) {
  const found = [];

  for (const tag of interestTags) {
    const keywords = interestKeywords[tag] || [];
    const masks = tagMasks[tag];
    const searchable = (masks ? maskPhrases(text, masks) : text).toLowerCase();

    if (keywords.some((keyword) => searchable.includes(keyword.toLowerCase()))) {
      found.push(tag);
    }
  }

  return found;
}

function parseConstraints(text) {
  const noCar = /車\s*(?:は)?\s*(?:なし|使わ|乗らな)|運転\s*(?:は)?\s*(?:しな|しませ|できな|できませ|苦手|無理|むり)|ペーパードライバー|no car|without a car|can'?t drive|don'?t drive/i.test(text);

  return {
    easyTransport: /楽|らく|乗り換え(?:なし|が?少|たくない)|直行|移動(?:時間)?(?:が|は)?短|近場|easy (?:transport|travel|access)|direct|minimal transfers|no transfers/i.test(text),
    noCar,
    car: !noCar && /車で|レンタカー|ドライブ|マイカー|自家用車|rental car|by car|drive/i.test(text),
    stroller: /ベビーカー|stroller|buggy|pram/i.test(text),
    walkingTolerance: /あまり歩き|歩きたくない|歩くのが?(?:苦手|大変)|長距離は歩け|little walking|not much walking/i.test(text)
      ? "low"
      : /たくさん歩|よく歩く|walk a lot|plenty of walking/i.test(text)
        ? "high"
        : "medium",
    activityLevel: /のんびり|ゆっくり|まったり|癒され|relax|slow/i.test(text)
      ? "low"
      : /アクティブ|たくさん遊|遊び倒|active|packed/i.test(text)
        ? "high"
        : "medium",
    dietary: parseDietary(text),
  };
}

function parseDietary(text) {
  const dietary = [];

  if (/アレルギー|allerg/i.test(text)) {
    dietary.push("allergy");
  }

  if (/ベジタリアン|ヴィーガン|vegetarian|vegan/i.test(text)) {
    dietary.push("vegetarian");
  }

  if (/ハラル|halal/i.test(text)) {
    dietary.push("halal");
  }

  return dietary;
}

/**
 * Parses free text into a structured trip request.
 *
 * @param {string} text Free-form Japanese or English description of the trip.
 * @param {object} [overrides] Structured values from a form, which always win over parsed text.
 * @returns {object} The structured request, with `warnings` and `assumptions` describing gaps.
 */
export function parseTripRequest(text, overrides = {}) {
  const normalized = normalize(text);

  const warnings = [];
  const assumptions = [];

  const party = parseParty(normalized);
  const parsedOrigin = parseOrigin(normalized);
  const parsedMonth = parseMonth(normalized);
  const parsedNights = parseNights(normalized);
  const parsedBudget = parseBudget(normalized);
  const parsedInterests = parseInterests(normalized);
  const constraints = parseConstraints(normalized);

  const originId = overrides.originId ?? parsedOrigin;

  if (!originId) {
    warnings.push({
      code: "origin-missing",
      ja: "出発地を判別できませんでした。東京・大阪・名古屋のいずれかを指定してください。",
      en: "Could not determine the departure city. Please specify Tokyo, Osaka, or Nagoya.",
    });
  }

  let adults = clampInteger(overrides.adults ?? party.adults, limits.adults);

  if (adults === null) {
    const genericPeople = normalized.match(/(\d+)\s*人/);

    if (genericPeople && party.childCount === null) {
      adults = clampInteger(genericPeople[1], limits.adults);
      assumptions.push({
        code: "adults-from-party-size",
        ja: `「${genericPeople[1]}人」を大人${genericPeople[1]}人として扱いました。`,
        en: `Read "${genericPeople[1]} people" as ${genericPeople[1]} adults.`,
      });
    } else {
      adults = 2;
      assumptions.push({
        code: "adults-default",
        ja: "大人の人数が不明なため、2人として計算しました。",
        en: "Adult count was not stated, so the estimate assumes 2 adults.",
      });
    }
  }

  const childCount = clampInteger(overrides.childCount ?? party.childCount ?? 0, limits.childCount) ?? 0;
  const overrideAges = Array.isArray(overrides.childAges) ? overrides.childAges : undefined;
  const rawAges = overrideAges ?? party.ages;
  const parsedAges = rawAges
    .slice(0, limits.childCount.max)
    .map((age) => clampInteger(age, limits.childAge))
    .filter((age) => age !== null);
  const children = [];

  for (let index = 0; index < childCount; index += 1) {
    children.push({ age: parsedAges[index] ?? null });
  }

  if (childCount > 0 && parsedAges.length === 0) {
    assumptions.push({
      code: "child-ages-unknown",
      ja: "子どもの年齢が不明なため、運賃・宿泊の子ども料金は標準的な想定で計算しました。年齢を入れると精度が上がります。",
      en: "Child ages were not given, so standard child pricing was assumed. Supplying ages improves accuracy.",
    });
  }

  const month = clampInteger(overrides.month ?? parsedMonth, limits.month);

  if (!month) {
    warnings.push({
      code: "month-missing",
      ja: "出発月を判別できませんでした。季節による価格差を反映できません。",
      en: "Could not determine the travel month, so seasonal price differences are not applied.",
    });
  }

  let nights = clampInteger(overrides.nights ?? parsedNights, limits.nights);

  if (nights === null) {
    nights = 2;
    assumptions.push({
      code: "nights-default",
      ja: "宿泊数が不明なため、2泊として計算しました。",
      en: "Trip length was not stated, so the estimate assumes 2 nights.",
    });
  }

  const budgetYen = clampInteger(overrides.budgetYen ?? parsedBudget, limits.budgetYen);

  if (!budgetYen) {
    warnings.push({
      code: "budget-missing",
      ja: "予算を判別できませんでした。予算適合のスコアは計算されません。",
      en: "Could not determine a budget, so budget-fit scoring is skipped.",
    });
  }

  const overrideInterests = Array.isArray(overrides.interests)
    ? overrides.interests.filter((tag) => interestTags.includes(tag))
    : null;
  const interests = overrideInterests ?? parsedInterests;

  if (interests.length === 0) {
    assumptions.push({
      code: "interests-none",
      ja: "希望のテーマが読み取れなかったため、総合バランスで評価しました。",
      en: "No specific theme was detected, so destinations were ranked on overall balance.",
    });
  }

  const mergedConstraints = { ...constraints, ...(overrides.constraints || {}) };

  if (children.some((child) => child.age !== null && child.age <= 2) && !mergedConstraints.stroller) {
    mergedConstraints.stroller = true;
    assumptions.push({
      code: "stroller-inferred",
      ja: "2歳以下のお子さまがいるため、ベビーカー利用を前提に評価しました。",
      en: "A child aged 2 or under is travelling, so stroller use was assumed.",
    });
  }

  return {
    raw: String(text || ""),
    originId,
    month,
    nights,
    adults,
    children,
    budgetYen,
    interests,
    constraints: mergedConstraints,
    warnings,
    assumptions,
  };
}

export const parserInternals = {
  clampInteger,
  limits,
  normalize,
  maskPhrases,
  parseBudget,
  parseMonth,
  parseNights,
  parseParty,
  parseOrigin,
  parseInterests,
  convertKanjiNumbers,
};
