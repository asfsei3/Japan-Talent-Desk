/**
 * Curated Japan domestic destination dataset.
 *
 * Read `docs/data-sources.md` before changing anything here. Every figure is a hand-authored
 * planning estimate built from published fare structures and typical market rates. None of it
 * is live pricing, and none of it may be presented as such.
 *
 * Each record carries `provenance`, and each cost field is designed to be replaced field by
 * field as real sources are integrated. The scoring layer never inspects provenance, so
 * swapping a seed estimate for an API value changes the number without changing the logic.
 *
 * Conventions:
 * - `doorToDoorMinutes` is ONE WAY, and includes getting to the departure hub, waiting,
 *   travelling, and reaching the lodging area. It is not the vehicle's scheduled run time.
 * - `adultRoundTripYen` is the ROUND TRIP fare for one adult before the monthly price index.
 * - `vehicleRoundTripYen` is round-trip tolls plus fuel for self-drive, per vehicle.
 * - `priceIndexByMonth` is a 12-element multiplier array, January first.
 * - Interest and family scores are 0-100.
 */

const REVIEWED = "2026-08";

function seed(confidence = "medium") {
  return { class: "seed-estimate", lastReviewed: REVIEWED, confidence };
}

function fly(ja, en, doorToDoorMinutes, transfers, adultRoundTripYen) {
  return { mode: "flight", farePolicy: "domestic-flight", label: { ja, en }, doorToDoorMinutes, transfers, adultRoundTripYen };
}

function shinkansen(ja, en, doorToDoorMinutes, transfers, adultRoundTripYen) {
  return { mode: "shinkansen", farePolicy: "jr-shinkansen", label: { ja, en }, doorToDoorMinutes, transfers, adultRoundTripYen };
}

function express(ja, en, doorToDoorMinutes, transfers, adultRoundTripYen) {
  return { mode: "express", farePolicy: "jr-limited-express", label: { ja, en }, doorToDoorMinutes, transfers, adultRoundTripYen };
}

function bus(ja, en, doorToDoorMinutes, transfers, adultRoundTripYen) {
  return { mode: "bus", farePolicy: "highway-bus", label: { ja, en }, doorToDoorMinutes, transfers, adultRoundTripYen };
}

function ferry(ja, en, doorToDoorMinutes, transfers, adultRoundTripYen) {
  return { mode: "ferry", farePolicy: "ferry", label: { ja, en }, doorToDoorMinutes, transfers, adultRoundTripYen };
}

function drive(ja, en, doorToDoorMinutes, vehicleRoundTripYen) {
  return { mode: "car", farePolicy: "self-drive", label: { ja, en }, doorToDoorMinutes, transfers: 0, adultRoundTripYen: 0, vehicleRoundTripYen };
}

export const destinations = [
  {
    id: "okinawa-main",
    name: { ja: "沖縄本島（那覇・恩納）", en: "Okinawa Main Island" },
    prefecture: { ja: "沖縄県", en: "Okinawa" },
    region: "okinawa",
    summary: {
      ja: "国内で最も海がきれいなリゾート。家族向けホテルが多く、9月はまだ泳げて価格も落ち着く。",
      en: "Japan's flagship beach resort, with the widest choice of family hotels. Still swimmable in September, at shoulder-season prices.",
    },
    interests: { beach: 98, resort: 94, nature: 78, food: 74, city: 40, culture: 52, themepark: 35 },
    priceIndexByMonth: [0.85, 0.85, 0.95, 1.05, 0.95, 1.0, 1.35, 1.4, 1.0, 0.95, 0.85, 1.05],
    seasonNotes: {
      5: { ja: "梅雨入りの時期。安いが天候は読みにくい。", en: "Start of the rainy season: cheaper, but the weather is unreliable." },
      6: { ja: "梅雨明け前後で価格は落ち着くが、前半は雨が多い。", en: "Around the end of the rainy season: prices settle, but the first half is wet." },
      8: { ja: "海は最高だが繁忙期で航空券が高い。", en: "Best sea conditions but peak airfares." },
      9: { ja: "まだ泳げて価格が落ち着く狙い目。台風には注意。", en: "Still swimmable with prices settling. Watch for typhoons." },
      10: { ja: "泳げる日も多く、混雑が減る。", en: "Often still swimmable, with fewer crowds." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 11000, familyRoom: false, breakfastIncludedRate: 0.4, dinnerIncludedRate: 0.1 },
      standard: { nightlyPerRoomYen: 22000, familyRoom: true, breakfastIncludedRate: 0.7, dinnerIncludedRate: 0.25 },
      family: { nightlyPerRoomYen: 36000, familyRoom: true, breakfastIncludedRate: 0.9, dinnerIncludedRate: 0.4, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 5200,
    localTransport: { transitScore: 32, carRecommended: true, dailyTransitYen: 2400, rentalCarDailyYen: 8500, parkingDailyYen: 800, fuelTollsDailyYen: 1500 },
    activities: { adultDayRateYen: 4200, childDayRateYen: 2600, childFriendly: 92, indoorOptions: 70 },
    family: { strollerFriendly: 72, walkingIntensity: 36, childMeals: 86 },
    advantages: [
      { ja: "家族向けビーチリゾートの選択肢が国内で最も多い", en: "The widest choice of family beach resorts in Japan" },
      { ja: "9月でも泳げるうえ、8月より大幅に安い", en: "Swimmable in September at far below August prices" },
    ],
    cautions: [
      { ja: "レンタカーがほぼ必須。繁忙期は予約が取りにくい", en: "A rental car is close to essential and books out in peak season" },
      { ja: "台風シーズンは日程変更リスクがある", en: "Typhoon season carries a real risk of schedule disruption" },
    ],
    access: {
      tokyo: [fly("羽田 → 那覇（直行）", "Haneda to Naha, direct", 330, 1, 36000)],
      osaka: [fly("伊丹・関空 → 那覇（直行）", "Itami or Kansai to Naha, direct", 300, 1, 32000)],
      nagoya: [fly("中部 → 那覇（直行）", "Chubu to Naha, direct", 315, 1, 34000)],
    },
    provenance: seed("medium"),
  },

  {
    id: "miyakojima",
    name: { ja: "宮古島", en: "Miyakojima" },
    prefecture: { ja: "沖縄県", en: "Okinawa" },
    region: "okinawa",
    summary: {
      ja: "国内屈指の透明度を誇るビーチ。本島より静かだが、費用は一段高い。",
      en: "Arguably Japan's clearest water. Quieter than the main island, and a clear step up in cost.",
    },
    interests: { beach: 100, resort: 90, nature: 84, food: 62, city: 18, culture: 34 },
    priceIndexByMonth: [0.85, 0.85, 0.95, 1.1, 1.0, 1.05, 1.4, 1.45, 1.05, 0.95, 0.85, 1.05],
    seasonNotes: {
      6: { ja: "梅雨明け前後。価格は落ち着くが前半は雨が多い。", en: "Around the end of the rainy season: prices settle, but the first half is wet." },
      9: { ja: "海のコンディションは良好。航空券は本島より高止まり。", en: "Sea conditions are good; airfares stay higher than the main island." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 13000, familyRoom: false, breakfastIncludedRate: 0.4, dinnerIncludedRate: 0.1 },
      standard: { nightlyPerRoomYen: 26000, familyRoom: true, breakfastIncludedRate: 0.7, dinnerIncludedRate: 0.2 },
      family: { nightlyPerRoomYen: 44000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.35, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 5600,
    localTransport: { transitScore: 18, carRecommended: true, dailyTransitYen: 3200, rentalCarDailyYen: 9500, parkingDailyYen: 300, fuelTollsDailyYen: 1200 },
    activities: { adultDayRateYen: 4800, childDayRateYen: 2800, childFriendly: 80, indoorOptions: 40 },
    family: { strollerFriendly: 58, walkingIntensity: 40, childMeals: 72 },
    advantages: [
      { ja: "海の透明度は国内最高クラス", en: "Water clarity among the best in the country" },
      { ja: "本島より静かで落ち着いている", en: "Quieter and calmer than the main island" },
    ],
    cautions: [
      { ja: "レンタカーが必須。台数が少なく早期予約が必要", en: "A rental car is mandatory and supply is genuinely limited" },
      { ja: "雨天時の代替が少なく、小さい子連れには不向きな日がある", en: "Few wet-weather alternatives, which can be hard with small children" },
    ],
    access: {
      tokyo: [fly("羽田 → 宮古（直行）", "Haneda to Miyako, direct", 365, 1, 48000)],
      osaka: [fly("関空 → 宮古（直行・季節便あり）", "Kansai to Miyako, direct, seasonal", 340, 1, 45000)],
      nagoya: [fly("中部 → 那覇 → 宮古（乗継）", "Chubu via Naha to Miyako", 450, 2, 49000)],
    },
    provenance: seed("low"),
  },

  {
    id: "amami",
    name: { ja: "奄美大島", en: "Amami Oshima" },
    prefecture: { ja: "鹿児島県", en: "Kagoshima" },
    region: "kyushu",
    summary: {
      ja: "自然が濃く、沖縄より価格が落ち着くビーチ。観光地化されすぎていない。",
      en: "Lush, less developed beach island. Calmer prices than Okinawa and far less commercialised.",
    },
    interests: { beach: 88, nature: 92, resort: 66, food: 60, culture: 44, city: 14 },
    priceIndexByMonth: [0.85, 0.85, 0.9, 1.0, 0.95, 1.0, 1.3, 1.35, 1.0, 0.9, 0.85, 1.0],
    seasonNotes: {
      6: { ja: "梅雨の時期で雨が多い。価格は年間で安い部類。", en: "Rainy season, with prices among the year's lowest." },
      9: { ja: "海はまだ暖かく、宿の確保もしやすい。", en: "Sea is still warm and lodging is easier to secure." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 9500, familyRoom: false, breakfastIncludedRate: 0.45, dinnerIncludedRate: 0.3 },
      standard: { nightlyPerRoomYen: 18000, familyRoom: true, breakfastIncludedRate: 0.65, dinnerIncludedRate: 0.5 },
      family: { nightlyPerRoomYen: 29000, familyRoom: true, breakfastIncludedRate: 0.8, dinnerIncludedRate: 0.6, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4400,
    localTransport: { transitScore: 16, carRecommended: true, dailyTransitYen: 3000, rentalCarDailyYen: 8000, parkingDailyYen: 200, fuelTollsDailyYen: 1300 },
    activities: { adultDayRateYen: 3800, childDayRateYen: 2200, childFriendly: 70, indoorOptions: 34 },
    family: { strollerFriendly: 48, walkingIntensity: 50, childMeals: 62 },
    advantages: [
      { ja: "沖縄より確実に安く、自然は圧倒的", en: "Reliably cheaper than Okinawa with outstanding nature" },
      { ja: "混雑が少なく落ち着いて過ごせる", en: "Uncrowded and restful" },
    ],
    cautions: [
      { ja: "移動距離が長く、運転前提の島", en: "Long driving distances; the island assumes a car" },
      { ja: "子ども向けの屋内施設が少ない", en: "Few indoor options aimed at children" },
    ],
    access: {
      tokyo: [fly("羽田 → 奄美（直行）", "Haneda to Amami, direct", 310, 1, 40000)],
      osaka: [fly("伊丹 → 奄美（直行）", "Itami to Amami, direct", 300, 1, 37000)],
      nagoya: [fly("中部 → 鹿児島 → 奄美（乗継）", "Chubu via Kagoshima to Amami", 420, 2, 42000)],
    },
    provenance: seed("low"),
  },

  {
    id: "izu-shimoda",
    name: { ja: "南伊豆・下田", en: "Izu and Shimoda" },
    prefecture: { ja: "静岡県", en: "Shizuoka" },
    region: "chubu",
    summary: {
      ja: "東京から乗り換えなしで行ける海。温泉も一緒に楽しめる、家族の定番。",
      en: "Beach and onsen in one trip, reachable from Tokyo without changing trains. A family staple.",
    },
    interests: { beach: 82, onsen: 84, nature: 70, food: 72, resort: 58, culture: 40 },
    priceIndexByMonth: [0.9, 0.88, 0.95, 1.05, 1.05, 0.95, 1.25, 1.35, 1.0, 0.95, 1.0, 0.95],
    seasonNotes: {
      8: { ja: "海水浴の最盛期。宿代が跳ね上がる。", en: "Peak swimming season, with lodging prices to match." },
      9: { ja: "海水浴シーズン明けで空いており、温泉も心地よい。", en: "Just past swimming season: quiet, and comfortable for onsen." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 10000, familyRoom: true, breakfastIncludedRate: 0.6, dinnerIncludedRate: 0.5 },
      standard: { nightlyPerRoomYen: 19000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.75 },
      family: { nightlyPerRoomYen: 30000, familyRoom: true, breakfastIncludedRate: 0.95, dinnerIncludedRate: 0.85, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4600,
    localTransport: { transitScore: 44, carRecommended: true, dailyTransitYen: 1800, rentalCarDailyYen: 7500, parkingDailyYen: 700, fuelTollsDailyYen: 900 },
    activities: { adultDayRateYen: 2800, childDayRateYen: 1800, childFriendly: 82, indoorOptions: 58 },
    family: { strollerFriendly: 62, walkingIntensity: 40, childMeals: 84 },
    advantages: [
      { ja: "東京から特急一本で乗り換えなし", en: "One direct limited express from Tokyo, no transfers" },
      { ja: "海と温泉の両方を一度の旅行で満たせる", en: "Satisfies both beach and onsen in a single trip" },
    ],
    cautions: [
      { ja: "現地はバス便が少なく、車があると行動範囲が広がる", en: "Local buses are sparse; a car widens the trip considerably" },
      { ja: "8月は宿代が大きく上がる", en: "August lodging prices rise steeply" },
    ],
    access: {
      tokyo: [
        express("特急踊り子 東京 → 伊豆急下田", "Odoriko limited express, Tokyo to Izukyu-Shimoda", 200, 0, 13000),
        drive("東名・伊豆縦貫道 経由", "Via Tomei and the Izu expressway", 210, 12000),
      ],
      osaka: [shinkansen("新大阪 → 熱海 → 踊り子", "Shin-Osaka to Atami, then Odoriko", 320, 2, 32000)],
      nagoya: [shinkansen("名古屋 → 熱海 → 踊り子", "Nagoya to Atami, then Odoriko", 250, 2, 24000)],
    },
    provenance: seed("medium"),
  },

  {
    id: "atami",
    name: { ja: "熱海", en: "Atami" },
    prefecture: { ja: "静岡県", en: "Shizuoka" },
    region: "chubu",
    summary: {
      ja: "東京から新幹線で約50分。移動の負担が最も小さい温泉地。",
      en: "Roughly 50 minutes from Tokyo by shinkansen. The lowest-effort onsen trip there is.",
    },
    interests: { onsen: 88, beach: 62, food: 70, city: 48, culture: 44, resort: 56 },
    priceIndexByMonth: [0.95, 0.9, 1.0, 1.0, 1.05, 0.9, 1.15, 1.3, 0.95, 1.0, 1.05, 1.0],
    seasonNotes: {
      9: { ja: "夏の混雑が引き、宿が取りやすい。", en: "Summer crowds have thinned and rooms are easy to get." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 11000, familyRoom: true, breakfastIncludedRate: 0.6, dinnerIncludedRate: 0.5 },
      standard: { nightlyPerRoomYen: 21000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.75 },
      family: { nightlyPerRoomYen: 33000, familyRoom: true, breakfastIncludedRate: 0.95, dinnerIncludedRate: 0.85, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4800,
    localTransport: { transitScore: 66, carRecommended: false, dailyTransitYen: 1400, rentalCarDailyYen: 7500, parkingDailyYen: 1500, fuelTollsDailyYen: 900 },
    activities: { adultDayRateYen: 2600, childDayRateYen: 1600, childFriendly: 74, indoorOptions: 72 },
    family: { strollerFriendly: 56, walkingIntensity: 52, childMeals: 80 },
    advantages: [
      { ja: "移動時間が圧倒的に短く、小さい子でも負担が小さい", en: "Very short journey, which matters most with small children" },
      { ja: "駅前に宿・飲食が集中していて車不要", en: "Lodging and food cluster near the station, so no car is needed" },
    ],
    cautions: [
      { ja: "坂道が多く、ベビーカーは押しにくい場所がある", en: "Hilly streets make some areas awkward with a stroller" },
      { ja: "海水浴目的なら伊豆南部の方が満足度は高い", en: "For swimming specifically, southern Izu delivers more" },
    ],
    access: {
      tokyo: [shinkansen("東京 → 熱海（こだま）", "Tokyo to Atami by Kodama", 110, 0, 8600)],
      osaka: [shinkansen("新大阪 → 熱海", "Shin-Osaka to Atami", 230, 1, 28000)],
      nagoya: [shinkansen("名古屋 → 熱海", "Nagoya to Atami", 160, 1, 19000)],
    },
    provenance: seed("high"),
  },

  {
    id: "hakone",
    name: { ja: "箱根", en: "Hakone" },
    prefecture: { ja: "神奈川県", en: "Kanagawa" },
    region: "kanto",
    summary: {
      ja: "温泉・自然・美術館がそろい、子連れでも回りやすい定番。フリーパスで移動が楽。",
      en: "Onsen, nature, and museums in one compact area, easy to cover with children thanks to the area pass.",
    },
    interests: { onsen: 94, nature: 78, culture: 72, food: 64, resort: 62, city: 30 },
    priceIndexByMonth: [0.95, 0.9, 1.0, 1.05, 1.1, 0.95, 1.05, 1.2, 1.0, 1.1, 1.25, 1.0],
    seasonNotes: {
      9: { ja: "夏休み明けで落ち着き、紅葉前で価格も穏やか。", en: "Post-holiday calm, and before the autumn-foliage price rise." },
      11: { ja: "紅葉のピークで最も混雑し高くなる。", en: "Foliage peak: the busiest and priciest time." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 12000, familyRoom: true, breakfastIncludedRate: 0.6, dinnerIncludedRate: 0.45 },
      standard: { nightlyPerRoomYen: 24000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.7 },
      family: { nightlyPerRoomYen: 38000, familyRoom: true, breakfastIncludedRate: 0.95, dinnerIncludedRate: 0.85, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 5000,
    localTransport: { transitScore: 74, carRecommended: false, dailyTransitYen: 2000, rentalCarDailyYen: 7500, parkingDailyYen: 1200, fuelTollsDailyYen: 1000 },
    activities: { adultDayRateYen: 3400, childDayRateYen: 2000, childFriendly: 88, indoorOptions: 84 },
    family: { strollerFriendly: 66, walkingIntensity: 44, childMeals: 86 },
    advantages: [
      { ja: "フリーパスで乗り物を乗り継げ、子どもが飽きにくい", en: "The area pass turns transport itself into entertainment for children" },
      { ja: "雨でも美術館など屋内の選択肢が多い", en: "Plenty of indoor options such as museums when it rains" },
    ],
    cautions: [
      { ja: "紅葉期は混雑と価格が跳ね上がる", en: "Foliage season brings sharp crowding and price rises" },
      { ja: "坂と乗り換えが多く、ベビーカーはやや不便", en: "Slopes and frequent changes make strollers a little awkward" },
    ],
    access: {
      tokyo: [express("ロマンスカー 新宿 → 箱根湯本", "Romancecar, Shinjuku to Hakone-Yumoto", 150, 0, 5200)],
      osaka: [shinkansen("新大阪 → 小田原 → 箱根登山", "Shin-Osaka to Odawara, then Hakone Tozan", 265, 2, 30000)],
      nagoya: [shinkansen("名古屋 → 小田原 → 箱根登山", "Nagoya to Odawara, then Hakone Tozan", 195, 2, 21000)],
    },
    provenance: seed("high"),
  },

  {
    id: "kusatsu",
    name: { ja: "草津温泉", en: "Kusatsu Onsen" },
    prefecture: { ja: "群馬県", en: "Gunma" },
    region: "kanto",
    summary: {
      ja: "泉質で名高い山の温泉地。湯畑周辺は徒歩で完結する。",
      en: "A mountain onsen town famous for its water quality, walkable around the Yubatake.",
    },
    interests: { onsen: 100, nature: 74, food: 56, culture: 52, snow: 58, city: 20 },
    priceIndexByMonth: [1.1, 1.05, 0.95, 0.9, 1.0, 0.9, 1.0, 1.15, 1.0, 1.1, 1.05, 1.15],
    seasonNotes: {
      9: { ja: "涼しく過ごしやすい。紅葉前で比較的空いている。", en: "Cool and comfortable, quiet ahead of the foliage season." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 10000, familyRoom: true, breakfastIncludedRate: 0.7, dinnerIncludedRate: 0.6 },
      standard: { nightlyPerRoomYen: 20000, familyRoom: true, breakfastIncludedRate: 0.9, dinnerIncludedRate: 0.85 },
      family: { nightlyPerRoomYen: 31000, familyRoom: true, breakfastIncludedRate: 0.95, dinnerIncludedRate: 0.9, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4400,
    localTransport: { transitScore: 58, carRecommended: false, dailyTransitYen: 900, rentalCarDailyYen: 7500, parkingDailyYen: 800, fuelTollsDailyYen: 1200 },
    activities: { adultDayRateYen: 2200, childDayRateYen: 1400, childFriendly: 68, indoorOptions: 60 },
    family: { strollerFriendly: 44, walkingIntensity: 54, childMeals: 78 },
    advantages: [
      { ja: "温泉そのものの満足度が非常に高い", en: "Outstanding purely on the quality of the onsen" },
      { ja: "湯畑周辺は徒歩圏で完結する", en: "Everything central is within walking distance of the Yubatake" },
    ],
    cautions: [
      { ja: "東京からでも移動は4時間前後かかる", en: "Around four hours from Tokyo even so" },
      { ja: "坂が多く、乳児連れには歩きにくい", en: "Steep streets are hard going with an infant" },
    ],
    access: {
      tokyo: [
        express("特急草津・四万 + バス", "Kusatsu-Shima limited express plus bus", 240, 1, 12000),
        drive("関越・上信越道 経由", "Via the Kan-Etsu and Joshin-Etsu expressways", 215, 14000),
      ],
      osaka: [shinkansen("新大阪 → 東京 → 特急・バス", "Shin-Osaka via Tokyo, then limited express and bus", 400, 3, 40000)],
      nagoya: [shinkansen("名古屋 → 軽井沢 → バス", "Nagoya via Karuizawa, then bus", 305, 2, 28000)],
    },
    provenance: seed("medium"),
  },

  {
    id: "karuizawa",
    name: { ja: "軽井沢", en: "Karuizawa" },
    prefecture: { ja: "長野県", en: "Nagano" },
    region: "chubu",
    summary: {
      ja: "新幹線で1時間ちょっと。涼しく、駅前で買い物も食事も完結する高原リゾート。",
      en: "Just over an hour by shinkansen. A cool highland resort where shopping and dining sit right by the station.",
    },
    interests: { nature: 84, resort: 78, food: 74, shopping: 84, onsen: 56, culture: 58, snow: 46 },
    priceIndexByMonth: [0.9, 0.88, 0.9, 1.0, 1.05, 0.95, 1.25, 1.35, 1.0, 1.1, 0.95, 1.0],
    seasonNotes: {
      8: { ja: "避暑の最盛期で最も高い。", en: "Peak summer-escape season and the most expensive." },
      9: { ja: "涼しさは残り、価格は落ち着く。", en: "Still cool, with prices settling back." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 11000, familyRoom: true, breakfastIncludedRate: 0.6, dinnerIncludedRate: 0.2 },
      standard: { nightlyPerRoomYen: 23000, familyRoom: true, breakfastIncludedRate: 0.8, dinnerIncludedRate: 0.4 },
      family: { nightlyPerRoomYen: 36000, familyRoom: true, breakfastIncludedRate: 0.9, dinnerIncludedRate: 0.55, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 5000,
    localTransport: { transitScore: 62, carRecommended: false, dailyTransitYen: 1600, rentalCarDailyYen: 8000, parkingDailyYen: 1000, fuelTollsDailyYen: 900 },
    activities: { adultDayRateYen: 3000, childDayRateYen: 1900, childFriendly: 86, indoorOptions: 80 },
    family: { strollerFriendly: 82, walkingIntensity: 32, childMeals: 88 },
    advantages: [
      { ja: "新幹線で乗り換えなし、駅前で完結するので子連れが楽", en: "Direct shinkansen and a station-centred layout make it easy with children" },
      { ja: "平坦でベビーカーでも動きやすい", en: "Flat and genuinely stroller-friendly" },
    ],
    cautions: [
      { ja: "夏休み期間は宿代が大きく上がる", en: "Lodging prices climb sharply through the summer holidays" },
      { ja: "海の要素はない", en: "No beach element at all" },
    ],
    access: {
      tokyo: [shinkansen("北陸新幹線 東京 → 軽井沢", "Hokuriku Shinkansen, Tokyo to Karuizawa", 130, 0, 12000)],
      osaka: [shinkansen("新大阪 → 東京 → 軽井沢", "Shin-Osaka via Tokyo to Karuizawa", 300, 2, 40000)],
      nagoya: [shinkansen("名古屋 → 長野 → 軽井沢", "Nagoya via Nagano to Karuizawa", 230, 2, 26000)],
    },
    provenance: seed("high"),
  },

  {
    id: "nikko",
    name: { ja: "日光・鬼怒川", en: "Nikko and Kinugawa" },
    prefecture: { ja: "栃木県", en: "Tochigi" },
    region: "kanto",
    summary: {
      ja: "世界遺産の社寺と自然、鬼怒川の温泉。東京から特急一本。",
      en: "World Heritage shrines, mountain scenery, and the Kinugawa onsen, one direct limited express from Tokyo.",
    },
    interests: { culture: 92, nature: 82, onsen: 74, food: 54, themepark: 52, city: 22 },
    priceIndexByMonth: [0.9, 0.88, 0.95, 1.05, 1.1, 0.95, 1.05, 1.2, 1.0, 1.15, 1.2, 0.95],
    seasonNotes: {
      10: { ja: "紅葉が見頃でいろは坂は渋滞する。", en: "Foliage peaks and the Irohazaka road jams badly." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 9500, familyRoom: true, breakfastIncludedRate: 0.65, dinnerIncludedRate: 0.5 },
      standard: { nightlyPerRoomYen: 19000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.7 },
      family: { nightlyPerRoomYen: 30000, familyRoom: true, breakfastIncludedRate: 0.95, dinnerIncludedRate: 0.85, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4400,
    localTransport: { transitScore: 52, carRecommended: false, dailyTransitYen: 2000, rentalCarDailyYen: 7500, parkingDailyYen: 800, fuelTollsDailyYen: 1100 },
    activities: { adultDayRateYen: 3000, childDayRateYen: 1800, childFriendly: 80, indoorOptions: 62 },
    family: { strollerFriendly: 54, walkingIntensity: 58, childMeals: 78 },
    advantages: [
      { ja: "歴史と自然を一度に体験できる", en: "History and nature in a single trip" },
      { ja: "鬼怒川方面はテーマパークもあり子どもが飽きない", en: "The Kinugawa side adds theme parks that keep children engaged" },
    ],
    cautions: [
      { ja: "紅葉期のいろは坂は激しい渋滞になる", en: "The Irohazaka road is severely congested in foliage season" },
      { ja: "社寺は階段と坂が多い", en: "The shrine complexes involve a lot of steps and slopes" },
    ],
    access: {
      tokyo: [express("東武特急スペーシア 浅草 → 東武日光", "Tobu Spacia, Asakusa to Tobu-Nikko", 160, 0, 6400)],
      osaka: [shinkansen("新大阪 → 東京 → 日光", "Shin-Osaka via Tokyo to Nikko", 330, 2, 36000)],
      nagoya: [shinkansen("名古屋 → 東京 → 日光", "Nagoya via Tokyo to Nikko", 260, 2, 26000)],
    },
    provenance: seed("medium"),
  },

  {
    id: "boso-tateyama",
    name: { ja: "南房総・館山", en: "Boso and Tateyama" },
    prefecture: { ja: "千葉県", en: "Chiba" },
    region: "kanto",
    summary: {
      ja: "東京から最も近い海。日帰りに近い感覚で行ける穴場。",
      en: "The closest beach to Tokyo, near enough to feel like a day trip.",
    },
    interests: { beach: 76, nature: 66, food: 68, onsen: 48, resort: 44, city: 18 },
    priceIndexByMonth: [0.85, 0.85, 0.9, 0.95, 1.0, 0.95, 1.25, 1.35, 0.95, 0.9, 0.9, 0.9],
    seasonNotes: {
      9: { ja: "海水浴客が減り、料金も落ち着く。", en: "Swimmers thin out and prices settle." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 8500, familyRoom: true, breakfastIncludedRate: 0.65, dinnerIncludedRate: 0.45 },
      standard: { nightlyPerRoomYen: 16000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.65 },
      family: { nightlyPerRoomYen: 26000, familyRoom: true, breakfastIncludedRate: 0.9, dinnerIncludedRate: 0.75, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4000,
    localTransport: { transitScore: 34, carRecommended: true, dailyTransitYen: 1600, rentalCarDailyYen: 7000, parkingDailyYen: 400, fuelTollsDailyYen: 800 },
    activities: { adultDayRateYen: 2400, childDayRateYen: 1500, childFriendly: 84, indoorOptions: 48 },
    family: { strollerFriendly: 64, walkingIntensity: 34, childMeals: 78 },
    advantages: [
      { ja: "移動時間が短く、費用も国内屈指の安さ", en: "Short journey and among the cheapest options anywhere" },
      { ja: "小さい子連れでも移動の負担が小さい", en: "Very light travel burden with small children" },
    ],
    cautions: [
      { ja: "現地は公共交通が弱く、車があるかで満足度が変わる", en: "Weak local transit; the trip is much better with a car" },
      { ja: "リゾート感は沖縄などに比べると控えめ", en: "Much less of a resort feel than Okinawa" },
    ],
    access: {
      tokyo: [
        bus("東京駅 → 館山（高速バス）", "Highway bus, Tokyo Station to Tateyama", 135, 0, 5200),
        drive("アクアライン経由", "Via the Aqua-Line", 120, 8000),
      ],
    },
    provenance: seed("medium"),
  },

  {
    id: "hakuba",
    name: { ja: "白馬", en: "Hakuba" },
    prefecture: { ja: "長野県", en: "Nagano" },
    region: "chubu",
    summary: {
      ja: "冬は雪、夏は高原。首都圏から行ける本格的な山岳リゾート。",
      en: "Snow in winter, alpine highland in summer. A serious mountain resort within reach of Tokyo.",
    },
    interests: { snow: 96, nature: 88, onsen: 66, resort: 70, food: 54, city: 16 },
    priceIndexByMonth: [1.4, 1.4, 1.2, 0.85, 0.85, 0.85, 1.05, 1.15, 0.9, 0.95, 0.9, 1.3],
    seasonNotes: {
      1: { ja: "スキーの最盛期。価格は年間で最も高い。", en: "Peak ski season and the highest prices of the year." },
      9: { ja: "登山とアウトドアに最適で、宿は安い。", en: "Excellent for hiking and outdoor activity, with cheap lodging." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 10000, familyRoom: true, breakfastIncludedRate: 0.6, dinnerIncludedRate: 0.35 },
      standard: { nightlyPerRoomYen: 21000, familyRoom: true, breakfastIncludedRate: 0.8, dinnerIncludedRate: 0.55 },
      family: { nightlyPerRoomYen: 34000, familyRoom: true, breakfastIncludedRate: 0.9, dinnerIncludedRate: 0.7, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4600,
    localTransport: { transitScore: 30, carRecommended: true, dailyTransitYen: 1800, rentalCarDailyYen: 8000, parkingDailyYen: 500, fuelTollsDailyYen: 1200 },
    activities: { adultDayRateYen: 5200, childDayRateYen: 3200, childFriendly: 74, indoorOptions: 44 },
    family: { strollerFriendly: 40, walkingIntensity: 64, childMeals: 70 },
    advantages: [
      { ja: "雪質が高く、冬のアクティビティが充実", en: "Excellent snow quality and a deep winter offering" },
      { ja: "夏は涼しく、宿代が大きく下がる", en: "Cool in summer, when lodging costs fall away" },
    ],
    cautions: [
      { ja: "冬は装備と移動の負担が大きい", en: "Winter brings heavy gear and travel overhead" },
      { ja: "現地の移動は車かシャトル前提", en: "Getting around assumes a car or shuttle" },
    ],
    access: {
      tokyo: [shinkansen("北陸新幹線 → 長野 → バス", "Hokuriku Shinkansen to Nagano, then bus", 215, 1, 18000)],
      osaka: [express("特急しなの → 松本 → バス", "Shinano limited express to Matsumoto, then bus", 330, 2, 34000)],
      nagoya: [express("特急しなの → 松本 → バス", "Shinano limited express to Matsumoto, then bus", 245, 2, 22000)],
    },
    provenance: seed("medium"),
  },

  {
    id: "niseko",
    name: { ja: "ニセコ", en: "Niseko" },
    prefecture: { ja: "北海道", en: "Hokkaido" },
    region: "hokkaido",
    summary: {
      ja: "世界的に評価されるパウダースノー。冬のクオリティは国内随一。",
      en: "World-renowned powder. The best winter snow quality in the country.",
    },
    interests: { snow: 100, nature: 84, onsen: 74, resort: 82, food: 68, city: 18 },
    priceIndexByMonth: [1.55, 1.5, 1.25, 0.85, 0.8, 0.85, 1.0, 1.05, 0.85, 0.85, 1.0, 1.45],
    seasonNotes: {
      1: { ja: "世界中から人が集まり、価格は最高値。", en: "Global peak season, at the highest prices of the year." },
      9: { ja: "オフシーズンで宿は非常に安いが、雪は当然ない。", en: "Deep off-season with very cheap lodging, and obviously no snow." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 13000, familyRoom: true, breakfastIncludedRate: 0.5, dinnerIncludedRate: 0.15 },
      standard: { nightlyPerRoomYen: 28000, familyRoom: true, breakfastIncludedRate: 0.7, dinnerIncludedRate: 0.3 },
      family: { nightlyPerRoomYen: 48000, familyRoom: true, breakfastIncludedRate: 0.8, dinnerIncludedRate: 0.4, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 5800,
    localTransport: { transitScore: 26, carRecommended: true, dailyTransitYen: 2400, rentalCarDailyYen: 9000, parkingDailyYen: 600, fuelTollsDailyYen: 1400 },
    activities: { adultDayRateYen: 6000, childDayRateYen: 3600, childFriendly: 76, indoorOptions: 48 },
    family: { strollerFriendly: 38, walkingIntensity: 62, childMeals: 74 },
    advantages: [
      { ja: "雪質は国内最高クラス", en: "Snow quality is as good as it gets in Japan" },
      { ja: "家族向けのスキースクールが充実している", en: "Strong ski-school provision for families" },
    ],
    cautions: [
      { ja: "冬は費用が突出して高い", en: "Winter costs stand well above every alternative" },
      { ja: "空港からさらに2時間前後かかる", en: "Around two more hours from the airport" },
    ],
    access: {
      tokyo: [fly("羽田 → 新千歳 → バス", "Haneda to New Chitose, then bus", 400, 2, 36000)],
      osaka: [fly("関空・伊丹 → 新千歳 → バス", "Kansai or Itami to New Chitose, then bus", 415, 2, 34000)],
      nagoya: [fly("中部 → 新千歳 → バス", "Chubu to New Chitose, then bus", 415, 2, 34000)],
    },
    provenance: seed("medium"),
  },

  {
    id: "sapporo-otaru",
    name: { ja: "札幌・小樽", en: "Sapporo and Otaru" },
    prefecture: { ja: "北海道", en: "Hokkaido" },
    region: "hokkaido",
    summary: {
      ja: "食が圧倒的。市内は公共交通で回れ、車がなくても成立する。",
      en: "Outstanding food, and a city you can cover on public transport without renting a car.",
    },
    interests: { food: 96, city: 84, culture: 66, nature: 62, snow: 70, shopping: 76, onsen: 50 },
    priceIndexByMonth: [1.1, 1.25, 0.95, 0.9, 1.0, 1.05, 1.2, 1.25, 1.05, 0.95, 0.9, 1.15],
    seasonNotes: {
      2: { ja: "雪まつりで市内の宿が高騰する。", en: "The Snow Festival drives city lodging prices up sharply." },
      9: { ja: "気候が良く食材も良い時期。", en: "Good weather and an excellent season for produce." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 9000, familyRoom: false, breakfastIncludedRate: 0.6, dinnerIncludedRate: 0.05 },
      standard: { nightlyPerRoomYen: 18000, familyRoom: true, breakfastIncludedRate: 0.8, dinnerIncludedRate: 0.1 },
      family: { nightlyPerRoomYen: 28000, familyRoom: true, breakfastIncludedRate: 0.9, dinnerIncludedRate: 0.15, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 5400,
    localTransport: { transitScore: 84, carRecommended: false, dailyTransitYen: 1400, rentalCarDailyYen: 8000, parkingDailyYen: 1800, fuelTollsDailyYen: 1200 },
    activities: { adultDayRateYen: 2800, childDayRateYen: 1700, childFriendly: 80, indoorOptions: 88 },
    family: { strollerFriendly: 78, walkingIntensity: 42, childMeals: 88 },
    advantages: [
      { ja: "車なしで回れて、食事の満足度が非常に高い", en: "Navigable without a car, with exceptional food" },
      { ja: "雨や寒さでも屋内で過ごせる場所が多い", en: "Plenty of indoor options in bad weather" },
    ],
    cautions: [
      { ja: "冬は雪でベビーカーが使いにくい", en: "Winter snow makes strollers difficult" },
      { ja: "航空券が旅費の大半を占める", en: "Airfare dominates the total cost" },
    ],
    access: {
      tokyo: [fly("羽田 → 新千歳 → 快速エアポート", "Haneda to New Chitose, then the Airport rapid", 270, 1, 30000)],
      osaka: [fly("伊丹・関空 → 新千歳 → 快速", "Itami or Kansai to New Chitose, then rapid", 285, 1, 28000)],
      nagoya: [fly("中部 → 新千歳 → 快速", "Chubu to New Chitose, then rapid", 285, 1, 29000)],
    },
    provenance: seed("high"),
  },

  {
    id: "kyoto",
    name: { ja: "京都", en: "Kyoto" },
    prefecture: { ja: "京都府", en: "Kyoto" },
    region: "kansai",
    summary: {
      ja: "文化と食。新幹線で行きやすい一方、観光期の混雑は激しい。",
      en: "Culture and food, easy to reach by shinkansen, but severely crowded in peak season.",
    },
    interests: { culture: 100, food: 84, city: 74, shopping: 70, nature: 58, onsen: 34 },
    priceIndexByMonth: [0.9, 0.9, 1.15, 1.35, 1.05, 0.9, 0.95, 1.0, 1.0, 1.15, 1.4, 1.0],
    seasonNotes: {
      4: { ja: "桜で最も混雑し、宿代も跳ね上がる。", en: "Cherry-blossom peak: the most crowded and expensive time." },
      11: { ja: "紅葉で年間最高値。宿の確保が難しい。", en: "Autumn foliage brings the year's highest prices and scarce rooms." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 10000, familyRoom: false, breakfastIncludedRate: 0.5, dinnerIncludedRate: 0.05 },
      standard: { nightlyPerRoomYen: 22000, familyRoom: true, breakfastIncludedRate: 0.7, dinnerIncludedRate: 0.1 },
      family: { nightlyPerRoomYen: 34000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.2, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 5200,
    localTransport: { transitScore: 80, carRecommended: false, dailyTransitYen: 1500, rentalCarDailyYen: 8000, parkingDailyYen: 2000, fuelTollsDailyYen: 1000 },
    activities: { adultDayRateYen: 3000, childDayRateYen: 1600, childFriendly: 62, indoorOptions: 74 },
    family: { strollerFriendly: 52, walkingIntensity: 76, childMeals: 74 },
    advantages: [
      { ja: "移動が新幹線一本で分かりやすい", en: "A single direct shinkansen makes it simple" },
      { ja: "文化的な満足度が高い", en: "Culturally rich and rewarding" },
    ],
    cautions: [
      { ja: "歩く距離が長く、小さい子には負担が大きい", en: "A lot of walking, which is hard on small children" },
      { ja: "桜と紅葉の時期は混雑と価格が極端", en: "Blossom and foliage seasons are extreme for crowds and price" },
    ],
    access: {
      tokyo: [shinkansen("東海道新幹線 東京 → 京都", "Tokaido Shinkansen, Tokyo to Kyoto", 180, 0, 28000)],
      osaka: [express("JR京都線 大阪 → 京都", "JR Kyoto Line, Osaka to Kyoto", 75, 0, 1200)],
      nagoya: [shinkansen("名古屋 → 京都", "Nagoya to Kyoto", 110, 0, 11600)],
    },
    provenance: seed("high"),
  },

  {
    id: "osaka-usj",
    name: { ja: "大阪・ユニバーサルスタジオ", en: "Osaka and Universal Studios" },
    prefecture: { ja: "大阪府", en: "Osaka" },
    region: "kansai",
    summary: {
      ja: "テーマパークと街歩き、食。子どもの満足度が読みやすい。",
      en: "Theme park, city, and food. The most predictable option for keeping children happy.",
    },
    interests: { themepark: 100, city: 86, food: 92, shopping: 80, culture: 54, nature: 24 },
    priceIndexByMonth: [0.9, 0.9, 1.1, 1.1, 1.1, 0.95, 1.15, 1.25, 1.0, 1.05, 1.05, 1.05],
    seasonNotes: {
      9: { ja: "夏休み明けでパークが比較的空く。", en: "Post-holiday, when the park is comparatively quiet." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 9500, familyRoom: false, breakfastIncludedRate: 0.55, dinnerIncludedRate: 0.03 },
      standard: { nightlyPerRoomYen: 20000, familyRoom: true, breakfastIncludedRate: 0.75, dinnerIncludedRate: 0.08 },
      family: { nightlyPerRoomYen: 32000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.12, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4800,
    localTransport: { transitScore: 88, carRecommended: false, dailyTransitYen: 1300, rentalCarDailyYen: 8000, parkingDailyYen: 2200, fuelTollsDailyYen: 1000 },
    activities: { adultDayRateYen: 9000, childDayRateYen: 6200, childFriendly: 96, indoorOptions: 82 },
    family: { strollerFriendly: 80, walkingIntensity: 66, childMeals: 90 },
    advantages: [
      { ja: "子どもが確実に楽しめる", en: "Reliably delivers for children" },
      { ja: "公共交通が便利で車が不要", en: "Excellent transit; no car needed" },
    ],
    cautions: [
      { ja: "パークのチケット代が総額を押し上げる", en: "Park tickets push the total up significantly" },
      { ja: "パーク内の歩行距離が長い", en: "A lot of walking inside the park itself" },
    ],
    access: {
      tokyo: [shinkansen("東海道新幹線 東京 → 新大阪", "Tokaido Shinkansen, Tokyo to Shin-Osaka", 200, 1, 29000)],
      nagoya: [shinkansen("名古屋 → 新大阪", "Nagoya to Shin-Osaka", 120, 1, 13000)],
    },
    provenance: seed("high"),
  },

  {
    id: "tokyo-disney",
    name: { ja: "東京ディズニーリゾート", en: "Tokyo Disney Resort" },
    prefecture: { ja: "千葉県", en: "Chiba" },
    region: "kanto",
    summary: {
      ja: "子ども連れの王道。宿泊とチケットで費用は大きくなる。",
      en: "The default family trip, and an expensive one once tickets and lodging are counted.",
    },
    interests: { themepark: 100, city: 68, shopping: 70, food: 62, culture: 30, nature: 14 },
    priceIndexByMonth: [0.9, 0.9, 1.15, 1.1, 1.1, 0.95, 1.2, 1.3, 1.0, 1.05, 1.05, 1.15],
    seasonNotes: {
      9: { ja: "夏休み明けで比較的取りやすい。", en: "Easier to book after the summer holidays." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 12000, familyRoom: false, breakfastIncludedRate: 0.5, dinnerIncludedRate: 0.03 },
      standard: { nightlyPerRoomYen: 26000, familyRoom: true, breakfastIncludedRate: 0.7, dinnerIncludedRate: 0.08 },
      family: { nightlyPerRoomYen: 42000, familyRoom: true, breakfastIncludedRate: 0.8, dinnerIncludedRate: 0.12, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 5400,
    localTransport: { transitScore: 86, carRecommended: false, dailyTransitYen: 1200, rentalCarDailyYen: 8000, parkingDailyYen: 3000, fuelTollsDailyYen: 1000 },
    activities: { adultDayRateYen: 10500, childDayRateYen: 7000, childFriendly: 98, indoorOptions: 70 },
    family: { strollerFriendly: 88, walkingIntensity: 72, childMeals: 92 },
    advantages: [
      { ja: "子どもの満足度は非常に高い", en: "Extremely high satisfaction for children" },
      { ja: "ベビーカー対応が充実している", en: "Well set up for strollers" },
    ],
    cautions: [
      { ja: "チケットと宿で総額が大きくなりやすい", en: "Tickets plus lodging make the total climb fast" },
      { ja: "一日の歩行距離が長い", en: "Long daily walking distances" },
    ],
    access: {
      osaka: [shinkansen("新大阪 → 東京 → 京葉線", "Shin-Osaka to Tokyo, then the Keiyo Line", 265, 2, 30000)],
      nagoya: [shinkansen("名古屋 → 東京 → 京葉線", "Nagoya to Tokyo, then the Keiyo Line", 195, 2, 24000)],
    },
    provenance: seed("high"),
  },

  {
    id: "ise-shima",
    name: { ja: "伊勢志摩", en: "Ise-Shima" },
    prefecture: { ja: "三重県", en: "Mie" },
    region: "kansai",
    summary: {
      ja: "伊勢神宮と海。名古屋・大阪から近鉄特急で行きやすい。",
      en: "Ise Grand Shrine and the coast, easily reached from Nagoya and Osaka by Kintetsu limited express.",
    },
    interests: { culture: 88, beach: 66, food: 80, nature: 70, resort: 62, themepark: 54, onsen: 56 },
    priceIndexByMonth: [0.9, 0.88, 1.0, 1.05, 1.05, 0.9, 1.15, 1.3, 1.0, 1.0, 1.05, 0.95],
    seasonNotes: {
      9: { ja: "暑さが和らぎ、混雑も落ち着く。", en: "The heat eases and crowds thin out." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 9500, familyRoom: true, breakfastIncludedRate: 0.65, dinnerIncludedRate: 0.4 },
      standard: { nightlyPerRoomYen: 19000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.65 },
      family: { nightlyPerRoomYen: 31000, familyRoom: true, breakfastIncludedRate: 0.9, dinnerIncludedRate: 0.8, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4800,
    localTransport: { transitScore: 46, carRecommended: true, dailyTransitYen: 1900, rentalCarDailyYen: 7500, parkingDailyYen: 700, fuelTollsDailyYen: 1000 },
    activities: { adultDayRateYen: 3600, childDayRateYen: 2400, childFriendly: 86, indoorOptions: 66 },
    family: { strollerFriendly: 64, walkingIntensity: 52, childMeals: 84 },
    advantages: [
      { ja: "名古屋・大阪から近く費用対効果が高い", en: "Close to Nagoya and Osaka, with strong value for money" },
      { ja: "神宮・海・テーマパークと要素が揃う", en: "Shrine, sea, and theme park in one destination" },
    ],
    cautions: [
      { ja: "東京からは乗り換えが必要で時間がかかる", en: "From Tokyo it needs a transfer and takes longer" },
      { ja: "エリアが広く、車がないと回りにくい", en: "The area is spread out and hard to cover without a car" },
    ],
    access: {
      tokyo: [shinkansen("東京 → 名古屋 → 近鉄特急", "Tokyo to Nagoya, then Kintetsu limited express", 275, 1, 32000)],
      osaka: [express("近鉄特急 大阪難波 → 賢島", "Kintetsu limited express, Osaka-Namba to Kashikojima", 190, 0, 10000)],
      nagoya: [express("近鉄特急 名古屋 → 賢島", "Kintetsu limited express, Nagoya to Kashikojima", 165, 0, 9000)],
    },
    provenance: seed("medium"),
  },

  {
    id: "shirahama",
    name: { ja: "南紀白浜", en: "Nanki-Shirahama" },
    prefecture: { ja: "和歌山県", en: "Wakayama" },
    region: "kansai",
    summary: {
      ja: "白い砂浜と温泉、パンダのいる動物園。関西からの家族旅行の定番。",
      en: "White sand, onsen, and a zoo with pandas. A Kansai family staple.",
    },
    interests: { beach: 84, onsen: 82, themepark: 72, food: 66, nature: 64, resort: 66 },
    priceIndexByMonth: [0.9, 0.88, 0.95, 1.0, 1.05, 0.95, 1.25, 1.4, 1.0, 0.95, 0.95, 0.95],
    seasonNotes: {
      9: { ja: "海水浴シーズン明けで空き、価格も落ち着く。", en: "Past the swimming season: quieter and cheaper." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 10000, familyRoom: true, breakfastIncludedRate: 0.65, dinnerIncludedRate: 0.45 },
      standard: { nightlyPerRoomYen: 20000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.7 },
      family: { nightlyPerRoomYen: 32000, familyRoom: true, breakfastIncludedRate: 0.9, dinnerIncludedRate: 0.8, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4600,
    localTransport: { transitScore: 42, carRecommended: true, dailyTransitYen: 1700, rentalCarDailyYen: 7500, parkingDailyYen: 500, fuelTollsDailyYen: 900 },
    activities: { adultDayRateYen: 4400, childDayRateYen: 2800, childFriendly: 92, indoorOptions: 58 },
    family: { strollerFriendly: 68, walkingIntensity: 40, childMeals: 86 },
    advantages: [
      { ja: "海・温泉・動物園が揃い子連れ向き", en: "Beach, onsen, and a zoo — strong for children" },
      { ja: "大阪から特急一本で行ける", en: "One direct limited express from Osaka" },
    ],
    cautions: [
      { ja: "東京からは飛行機でも遠い部類", en: "Still a long trip from Tokyo, even by air" },
      { ja: "夏の宿代は大きく上がる", en: "Summer lodging prices rise steeply" },
    ],
    access: {
      tokyo: [fly("羽田 → 南紀白浜（直行）", "Haneda to Nanki-Shirahama, direct", 200, 1, 34000)],
      osaka: [express("特急くろしお 新大阪 → 白浜", "Kuroshio limited express, Shin-Osaka to Shirahama", 185, 0, 12000)],
      nagoya: [express("名古屋 → 新大阪 → 特急くろしお", "Nagoya via Shin-Osaka, then Kuroshio", 290, 2, 26000)],
    },
    provenance: seed("medium"),
  },

  {
    id: "beppu-yufuin",
    name: { ja: "別府・湯布院", en: "Beppu and Yufuin" },
    prefecture: { ja: "大分県", en: "Oita" },
    region: "kyushu",
    summary: {
      ja: "湧出量日本一の温泉地。関西からはフェリーという選択肢もある。",
      en: "Japan's largest hot-spring output. From Kansai there is also an overnight ferry option.",
    },
    interests: { onsen: 98, food: 74, nature: 72, culture: 58, city: 44, resort: 62 },
    priceIndexByMonth: [0.95, 0.9, 1.0, 1.05, 1.05, 0.9, 1.1, 1.2, 1.0, 1.05, 1.1, 1.0],
    seasonNotes: {
      9: { ja: "残暑は残るが宿は取りやすい。", en: "Still warm, but rooms are easy to secure." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 9000, familyRoom: true, breakfastIncludedRate: 0.7, dinnerIncludedRate: 0.5 },
      standard: { nightlyPerRoomYen: 19000, familyRoom: true, breakfastIncludedRate: 0.85, dinnerIncludedRate: 0.75 },
      family: { nightlyPerRoomYen: 31000, familyRoom: true, breakfastIncludedRate: 0.95, dinnerIncludedRate: 0.85, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 4400,
    localTransport: { transitScore: 54, carRecommended: true, dailyTransitYen: 1800, rentalCarDailyYen: 7500, parkingDailyYen: 600, fuelTollsDailyYen: 1100 },
    activities: { adultDayRateYen: 3000, childDayRateYen: 1800, childFriendly: 78, indoorOptions: 70 },
    family: { strollerFriendly: 58, walkingIntensity: 48, childMeals: 82 },
    advantages: [
      { ja: "温泉の種類と質が非常に豊富", en: "Exceptional variety and quality of hot springs" },
      { ja: "宿泊費が全国的に見て安い", en: "Lodging is cheap by national standards" },
    ],
    cautions: [
      { ja: "本州からは航空券が費用の中心になる", en: "From Honshu, airfare dominates the cost" },
      { ja: "別府と湯布院の移動に時間がかかる", en: "Moving between Beppu and Yufuin takes time" },
    ],
    access: {
      tokyo: [fly("羽田 → 大分 → バス", "Haneda to Oita, then bus", 265, 1, 38000)],
      osaka: [
        fly("伊丹 → 大分 → バス", "Itami to Oita, then bus", 220, 1, 30000),
        ferry("さんふらわあ 大阪 → 別府（夜行）", "Sunflower overnight ferry, Osaka to Beppu", 720, 0, 24000),
      ],
      nagoya: [fly("中部 → 大分 → バス", "Chubu to Oita, then bus", 235, 1, 34000)],
    },
    provenance: seed("medium"),
  },

  {
    id: "kanazawa",
    name: { ja: "金沢", en: "Kanazawa" },
    prefecture: { ja: "石川県", en: "Ishikawa" },
    region: "chubu",
    summary: {
      ja: "兼六園と近江町市場。新幹線で行きやすく、市内はコンパクト。",
      en: "Kenrokuen and the Omicho market, easy by shinkansen and compact once there.",
    },
    interests: { culture: 90, food: 88, city: 70, shopping: 64, nature: 52, onsen: 54 },
    priceIndexByMonth: [0.9, 0.88, 1.0, 1.1, 1.05, 0.95, 1.05, 1.15, 1.0, 1.05, 1.1, 0.95],
    seasonNotes: {
      9: { ja: "気候が良く、混雑も落ち着いている。", en: "Comfortable weather with settled crowds." },
    },
    hotels: {
      budget: { nightlyPerRoomYen: 9000, familyRoom: false, breakfastIncludedRate: 0.6, dinnerIncludedRate: 0.05 },
      standard: { nightlyPerRoomYen: 18000, familyRoom: true, breakfastIncludedRate: 0.8, dinnerIncludedRate: 0.15 },
      family: { nightlyPerRoomYen: 28000, familyRoom: true, breakfastIncludedRate: 0.9, dinnerIncludedRate: 0.25, childSleepFreeUnderAge: 6 },
    },
    mealIndexYen: 5000,
    localTransport: { transitScore: 70, carRecommended: false, dailyTransitYen: 1200, rentalCarDailyYen: 7500, parkingDailyYen: 1400, fuelTollsDailyYen: 1000 },
    activities: { adultDayRateYen: 2600, childDayRateYen: 1500, childFriendly: 68, indoorOptions: 78 },
    family: { strollerFriendly: 70, walkingIntensity: 54, childMeals: 78 },
    advantages: [
      { ja: "市内がコンパクトで回りやすい", en: "Compact and easy to cover" },
      { ja: "食事の満足度が高く、宿代は控えめ", en: "Excellent food with moderate lodging costs" },
    ],
    cautions: [
      { ja: "子ども向けの遊び場は多くない", en: "Not many attractions aimed squarely at children" },
      { ja: "冬は天候が崩れやすい", en: "Winter weather is often poor" },
    ],
    access: {
      tokyo: [shinkansen("北陸新幹線 東京 → 金沢", "Hokuriku Shinkansen, Tokyo to Kanazawa", 215, 0, 29000)],
      osaka: [express("特急サンダーバード + 北陸新幹線", "Thunderbird limited express plus Hokuriku Shinkansen", 215, 1, 18000)],
      nagoya: [express("特急しらさぎ + 北陸新幹線", "Shirasagi limited express plus Hokuriku Shinkansen", 220, 1, 16000)],
    },
    provenance: seed("medium"),
  },
];

export const destinationsById = new Map(destinations.map((destination) => [destination.id, destination]));

export function getDestination(destinationId) {
  return destinationsById.get(destinationId) || null;
}

/** Canonical interest tags. The parser and the scorer must agree on this list. */
export const interestTags = [
  "beach",
  "onsen",
  "snow",
  "themepark",
  "nature",
  "city",
  "food",
  "culture",
  "resort",
  "shopping",
];
