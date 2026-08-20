/**
 * Recommendation explanations.
 *
 * Generated from the numbers the engine actually computed, in Japanese and English. Because
 * every sentence is assembled from a computed value, an explanation cannot claim a price the
 * cost model did not produce — which is the specific failure mode that makes a free-text model
 * unsuitable here. `docs/cost-model.md` §3.3 records the reasoning and the cost comparison.
 */

const interestLabels = {
  beach: { ja: "海", en: "beach" },
  onsen: { ja: "温泉", en: "onsen" },
  snow: { ja: "雪・スキー", en: "snow" },
  themepark: { ja: "テーマパーク", en: "theme parks" },
  nature: { ja: "自然", en: "nature" },
  city: { ja: "街歩き", en: "city" },
  food: { ja: "グルメ", en: "food" },
  culture: { ja: "歴史・文化", en: "culture" },
  resort: { ja: "リゾート", en: "resort" },
  shopping: { ja: "買い物", en: "shopping" },
};

const tierLabels = {
  budget: { ja: "エコノミークラスの宿", en: "budget lodging" },
  standard: { ja: "スタンダードクラスの宿", en: "standard lodging" },
  family: { ja: "ファミリー向けの宿", en: "family-grade lodging" },
};

const localTransportLabels = {
  transit: { ja: "現地は公共交通で移動", en: "getting around on public transport" },
  "rental-car": { ja: "現地はレンタカー移動", en: "getting around by rental car" },
  "own-car": { ja: "マイカーでそのまま移動", en: "using your own car throughout" },
};

export function formatYen(value) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export function formatDuration(minutes, language) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  if (language === "ja") {
    return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
  }

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function categoryReason(candidate, categoryKey, request) {
  const scores = candidate.scores;

  if (categoryKey === "overall") {
    return {
      ja: `総合スコア${Math.round(scores.composite)}点で最上位。予算・移動・現地の過ごしやすさのバランスが最も良い組み合わせです。`,
      en: `Top overall at ${Math.round(scores.composite)} points — the best balance of budget, travel, and time on the ground.`,
    };
  }

  if (categoryKey === "budget") {
    return {
      ja: `候補の中で総額が最も安く、${formatYen(candidate.cost.totalYen)}に収まります。`,
      en: `The cheapest candidate overall, coming in at ${formatYen(candidate.cost.totalYen)}.`,
    };
  }

  if (categoryKey === "family") {
    return {
      ja: `子連れ適性スコアが${Math.round(scores.family)}点で最も高く、移動と現地の負担が小さい組み合わせです。`,
      en: `Highest family suitability at ${Math.round(scores.family)} points, with the lightest travel and on-the-ground burden.`,
    };
  }

  if (categoryKey === "easy") {
    return {
      ja: `移動の負担が最も小さい選択肢です（移動スコア${Math.round(scores.time)}点、利便性${Math.round(scores.convenience)}点）。`,
      en: `The least demanding option to reach and get around (travel ${Math.round(scores.time)}, convenience ${Math.round(scores.convenience)}).`,
    };
  }

  const label = interestLabels[categoryKey];

  if (label) {
    const monthNote = request.month ? `${request.month}月の条件を加味して` : "";

    return {
      ja: `${monthNote}「${label.ja}」の希望に最も合う候補です。`,
      en: `The strongest match for ${label.en}${request.month ? ` in month ${request.month}` : ""}.`,
    };
  }

  return { ja: "条件に合う候補です。", en: "A candidate matching your conditions." };
}

function costSentence(candidate, request) {
  const cost = candidate.cost;
  const people = request.adults + request.children.length;
  const nights = request.nights;

  return {
    ja: `${nights}泊${people}名の総額はおよそ${formatYen(cost.totalYen)}（${formatYen(cost.rangeYen.low)}〜${formatYen(cost.rangeYen.high)}）。交通${formatYen(cost.transport.yen)}、宿泊${formatYen(cost.accommodation.yen)}、食事${formatYen(cost.meals.yen)}、現地交通${formatYen(cost.localTransport.yen)}、アクティビティ${formatYen(cost.activities.yen)}を含みます。`,
    en: `Around ${formatYen(cost.totalYen)} in total for ${people} people over ${nights} night(s), in a range of ${formatYen(cost.rangeYen.low)}–${formatYen(cost.rangeYen.high)}. That covers transport ${formatYen(cost.transport.yen)}, lodging ${formatYen(cost.accommodation.yen)}, food ${formatYen(cost.meals.yen)}, local transport ${formatYen(cost.localTransport.yen)}, and activities ${formatYen(cost.activities.yen)}.`,
  };
}

function transportSentence(candidate) {
  const route = candidate.route;
  const transferText = route.transfers === 0 ? "乗り換えなし" : `乗り換え${route.transfers}回`;
  const transferTextEn = route.transfers === 0 ? "no transfers" : `${route.transfers} transfer(s)`;
  const local = localTransportLabels[candidate.cost.localTransport.mode];

  return {
    ja: `${route.label.ja}。片道の目安は${formatDuration(route.doorToDoorMinutes, "ja")}（ドアtoドア）で${transferText}。${local.ja}。`,
    en: `${route.label.en}. Roughly ${formatDuration(route.doorToDoorMinutes, "en")} door to door each way with ${transferTextEn}, ${local.en}.`,
  };
}

/**
 * Describes which meals the room rate is assumed to include.
 *
 * Worth saying out loud, because a ryokan sold 一泊二食 looks expensive per night and is often
 * the cheaper trip once dinner is counted. If the engine quietly relies on that, the user has
 * no way to sanity-check the number against the room rate they see on a booking site.
 */
function includedMealsPhrase(candidate) {
  const credit = candidate.cost.meals.includedMealsCreditYen ?? 0;

  if (credit <= 0) {
    return { ja: "", en: "" };
  }

  const dinnerRate = candidate.tier?.dinnerIncludedRate ?? 0;
  const halfBoard = dinnerRate >= 0.4;

  if (halfBoard) {
    return {
      ja: `このエリアは夕食・朝食付き（一泊二食）のプランが主流で、食費を約${formatYen(credit)}分見込んでいます。`,
      en: ` Half board (dinner and breakfast) is the norm here, modelled as roughly ${formatYen(credit)} off the food budget.`,
    };
  }

  return {
    ja: `朝食込みのプランが多く、食費を約${formatYen(credit)}分見込んでいます。`,
    en: ` Breakfast is commonly included, modelled as roughly ${formatYen(credit)} off the food budget.`,
  };
}

function hotelSentence(candidate, request) {
  const accommodation = candidate.cost.accommodation;
  const tier = tierLabels[candidate.tierName];
  const meals = includedMealsPhrase(candidate);

  return {
    ja: `${tier.ja}を${accommodation.rooms}部屋×${request.nights}泊、1泊1部屋あたり約${formatYen(accommodation.nightlyPerRoomYen)}で計算。${meals.ja}`,
    en: `Modelled on ${tier.en}: ${accommodation.rooms} room(s) for ${request.nights} night(s) at about ${formatYen(accommodation.nightlyPerRoomYen)} per room per night.${meals.en}`,
  };
}

function budgetSentence(candidate, request) {
  if (!request.budgetYen) {
    return null;
  }

  const difference = request.budgetYen - candidate.cost.totalYen;

  if (difference >= 0) {
    return {
      ja: `ご予算${formatYen(request.budgetYen)}に対して約${formatYen(difference)}の余裕があります。`,
      en: `That leaves about ${formatYen(difference)} of headroom against your ${formatYen(request.budgetYen)} budget.`,
    };
  }

  return {
    ja: `ご予算${formatYen(request.budgetYen)}を約${formatYen(Math.abs(difference))}超えます。宿のランクを下げるか、日程を短くすると収まります。`,
    en: `This runs about ${formatYen(Math.abs(difference))} over your ${formatYen(request.budgetYen)} budget. Dropping a lodging tier or a night would bring it back in.`,
  };
}

function familySentence(candidate, request) {
  if (request.children.length === 0 || candidate.scores.family === null) {
    return null;
  }

  const destination = candidate.destination;
  const ages = request.children.map((child) => child.age).filter((age) => age !== null && age !== undefined);
  const ageText = ages.length ? `${ages.join("歳・")}歳` : `${request.children.length}名`;

  return {
    ja: `子連れ適性は${Math.round(candidate.scores.family)}点（${ageText}のお子さま想定）。子ども向けの過ごしやすさ${destination.activities.childFriendly}点、雨天時の屋内選択肢${destination.activities.indoorOptions}点、ベビーカーの動きやすさ${destination.family.strollerFriendly}点です。`,
    en: `Family suitability scores ${Math.round(candidate.scores.family)}. Child-friendly activities ${destination.activities.childFriendly}, wet-weather indoor options ${destination.activities.indoorOptions}, stroller friendliness ${destination.family.strollerFriendly}.`,
  };
}

/**
 * Builds the full explanation for one recommendation.
 *
 * @returns {object} `{ headline, paragraphs, advantages, cautions }`, each with `ja` and `en`.
 */
export function explainCandidate(request, candidate, categoryKey) {
  const paragraphs = [
    categoryReason(candidate, categoryKey, request),
    costSentence(candidate, request),
    transportSentence(candidate),
    hotelSentence(candidate, request),
    budgetSentence(candidate, request),
    familySentence(candidate, request),
  ].filter(Boolean);

  const seasonNote = request.month ? candidate.destination.seasonNotes?.[request.month] : null;

  if (seasonNote) {
    paragraphs.push(seasonNote);
  }

  return {
    headline: {
      ja: candidate.destination.summary.ja,
      en: candidate.destination.summary.en,
    },
    paragraphs,
    advantages: candidate.destination.advantages,
    cautions: candidate.destination.cautions,
  };
}
