/**
 * Telecom Optimization MVP — curated carrier plan dataset.
 *
 * Manually curated snapshot of major Japanese carrier and MVNO plans, in the
 * same spirit as the Travel Decision Engine's design commitment
 * (docs/data-sources.md, docs/travel/engine.md): no scraping, no live price
 * feed. Every figure here is a planning estimate, not a live price — see
 * docs/telecom/README.md for the full disclaimer and how to keep this
 * dataset current.
 *
 * Prices are tax-included estimates in yen (whole numbers). `dataGB` is the
 * monthly high-speed data allowance; `Infinity` means effectively unlimited.
 * `callBundle` is what's included in the base price: "none" (pay-per-call),
 * "5min" (5-minutes-per-call unlimited), or "unlimited" (fully unlimited
 * calls). `addOn5MinYen` / `addOnUnlimitedYen` are the monthly cost to add
 * that call tier when it isn't already bundled (null when the carrier
 * doesn't offer that add-on separately).
 */

export const ASOF = "2025年6月時点の目安（公開情報からの手動集計、随時要確認）";

export const PLANS = [
  // docomo family
  { id: "docomo-irumo-05", carrierGroup: "docomo", carrier: "docomo", planName: "irumo 0.5GB", dataGB: 0.5, monthlyFeeYen: 550, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1100, hasPhysicalStores: true, balancedPick: false, notes: "ドコモ回線・データ極小向け" },
  { id: "docomo-irumo-3", carrierGroup: "docomo", carrier: "docomo", planName: "irumo 3GB", dataGB: 3, monthlyFeeYen: 880, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1100, hasPhysicalStores: true, balancedPick: false, notes: "ドコモ回線" },
  { id: "docomo-irumo-6", carrierGroup: "docomo", carrier: "docomo", planName: "irumo 6GB", dataGB: 6, monthlyFeeYen: 1650, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1100, hasPhysicalStores: true, balancedPick: false, notes: "ドコモ回線" },
  { id: "docomo-irumo-9", carrierGroup: "docomo", carrier: "docomo", planName: "irumo 9GB", dataGB: 9, monthlyFeeYen: 2167, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1100, hasPhysicalStores: true, balancedPick: false, notes: "ドコモ回線" },
  { id: "docomo-ahamo-30", carrierGroup: "docomo", carrier: "ahamo", planName: "ahamo 30GB", dataGB: 30, monthlyFeeYen: 2970, callBundle: "5min", addOn5MinYen: null, addOnUnlimitedYen: 1100, hasPhysicalStores: false, balancedPick: true, notes: "ドコモ回線・5分かけ放題込み。オンライン専用（有償で店舗サポート可）" },

  // au family
  { id: "au-povo-topping-3", carrierGroup: "au", carrier: "povo2.0", planName: "povo2.0 (基本料0円+3GBトッピング)", dataGB: 3, monthlyFeeYen: 990, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1650, hasPhysicalStores: false, balancedPick: false, notes: "au回線・基本料0円＋都度トッピング。使わない月は0円になり得る" },
  { id: "au-povo-topping-20", carrierGroup: "au", carrier: "povo2.0", planName: "povo2.0 (基本料0円+20GBトッピング)", dataGB: 20, monthlyFeeYen: 2700, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1650, hasPhysicalStores: false, balancedPick: false, notes: "au回線・トッピング制。使用量が毎月変動する人向け" },
  { id: "au-uq-komikomi-20", carrierGroup: "au", carrier: "UQ mobile", planName: "コミコミプラン 20GB", dataGB: 20, monthlyFeeYen: 2090, callBundle: "5min", addOn5MinYen: null, addOnUnlimitedYen: 1100, hasPhysicalStores: true, balancedPick: true, notes: "au回線・5分かけ放題込み・全国UQスポットで店舗サポートあり" },

  // SoftBank family
  { id: "sb-linemo-mini", carrierGroup: "softbank", carrier: "LINEMO", planName: "ベストプランmini 3GB", dataGB: 3, monthlyFeeYen: 990, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1650, hasPhysicalStores: false, balancedPick: false, notes: "ソフトバンク回線・オンライン専用" },
  { id: "sb-linemo-best-20", carrierGroup: "softbank", carrier: "LINEMO", planName: "ベストプラン 20GB", dataGB: 20, monthlyFeeYen: 2970, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1650, hasPhysicalStores: false, balancedPick: false, notes: "ソフトバンク回線・オンライン専用" },
  { id: "sb-ymobile-s", carrierGroup: "softbank", carrier: "Y!mobile", planName: "シンプル2 S 4GB", dataGB: 4, monthlyFeeYen: 2365, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1650, hasPhysicalStores: true, balancedPick: false, notes: "ソフトバンク回線・全国店舗サポートあり" },
  { id: "sb-ymobile-m", carrierGroup: "softbank", carrier: "Y!mobile", planName: "シンプル2 M 20GB", dataGB: 20, monthlyFeeYen: 4015, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1650, hasPhysicalStores: true, balancedPick: true, notes: "ソフトバンク回線・全国店舗サポートあり（家族割・PayPay特典で実質下がる場合あり、本MVP未反映）" },

  // Rakuten
  { id: "rakuten-saikyo-low", carrierGroup: "rakuten", carrier: "楽天モバイル", planName: "Rakuten最強プラン（〜3GB）", dataGB: 3, monthlyFeeYen: 1078, callBundle: "unlimited", addOn5MinYen: null, addOnUnlimitedYen: null, hasPhysicalStores: true, balancedPick: true, notes: "自社回線＋au回線ローミング。Rakuten Linkアプリでかけ放題込み" },
  { id: "rakuten-saikyo-mid", carrierGroup: "rakuten", carrier: "楽天モバイル", planName: "Rakuten最強プラン（〜20GB）", dataGB: 20, monthlyFeeYen: 2178, callBundle: "unlimited", addOn5MinYen: null, addOnUnlimitedYen: null, hasPhysicalStores: true, balancedPick: true, notes: "自社回線＋au回線ローミング。Rakuten Linkアプリでかけ放題込み" },
  { id: "rakuten-saikyo-unlimited", carrierGroup: "rakuten", carrier: "楽天モバイル", planName: "Rakuten最強プラン（無制限）", dataGB: Infinity, monthlyFeeYen: 3278, callBundle: "unlimited", addOn5MinYen: null, addOnUnlimitedYen: null, hasPhysicalStores: true, balancedPick: true, notes: "自社回線＋au回線ローミング。データ無制限＋かけ放題込み" },

  // MVNOs
  { id: "mvno-iijmio-2", carrierGroup: "mvno", carrier: "IIJmio", planName: "ギガプラン 2GB", dataGB: 2, monthlyFeeYen: 850, callBundle: "none", addOn5MinYen: 660, addOnUnlimitedYen: 1400, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ/au回線選択可" },
  { id: "mvno-iijmio-10", carrierGroup: "mvno", carrier: "IIJmio", planName: "ギガプラン 10GB", dataGB: 10, monthlyFeeYen: 1500, callBundle: "none", addOn5MinYen: 660, addOnUnlimitedYen: 1400, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ/au回線選択可" },
  { id: "mvno-iijmio-20", carrierGroup: "mvno", carrier: "IIJmio", planName: "ギガプラン 20GB", dataGB: 20, monthlyFeeYen: 2000, callBundle: "none", addOn5MinYen: 660, addOnUnlimitedYen: 1400, hasPhysicalStores: false, balancedPick: true, notes: "ドコモ/au回線選択可・価格と容量のバランスが良い" },
  { id: "mvno-mineo-5", carrierGroup: "mvno", carrier: "mineo", planName: "マイピタ 5GB", dataGB: 5, monthlyFeeYen: 1518, callBundle: "none", addOn5MinYen: 850, addOnUnlimitedYen: 1400, hasPhysicalStores: true, balancedPick: false, notes: "ドコモ/au/ソフトバンク回線選択可・店舗サポートあり" },
  { id: "mvno-mineo-20", carrierGroup: "mvno", carrier: "mineo", planName: "マイピタ 20GB", dataGB: 20, monthlyFeeYen: 2178, callBundle: "none", addOn5MinYen: 850, addOnUnlimitedYen: 1400, hasPhysicalStores: true, balancedPick: false, notes: "ドコモ/au/ソフトバンク回線選択可・店舗サポートあり" },
  { id: "mvno-ocn-3", carrierGroup: "mvno", carrier: "OCN モバイル ONE", planName: "3GB", dataGB: 3, monthlyFeeYen: 880, callBundle: "none", addOn5MinYen: 935, addOnUnlimitedYen: 1430, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ回線" },
  { id: "mvno-ocn-10", carrierGroup: "mvno", carrier: "OCN モバイル ONE", planName: "10GB", dataGB: 10, monthlyFeeYen: 1760, callBundle: "none", addOn5MinYen: 935, addOnUnlimitedYen: 1430, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ回線" },
  { id: "mvno-biglobe-6", carrierGroup: "mvno", carrier: "BIGLOBEモバイル", planName: "6GB", dataGB: 6, monthlyFeeYen: 1870, callBundle: "none", addOn5MinYen: 700, addOnUnlimitedYen: 1400, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ/au回線選択可" },
  { id: "mvno-biglobe-20", carrierGroup: "mvno", carrier: "BIGLOBEモバイル", planName: "20GB", dataGB: 20, monthlyFeeYen: 3400, callBundle: "none", addOn5MinYen: 700, addOnUnlimitedYen: 1400, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ/au回線選択可" },
  { id: "mvno-nuro-5", carrierGroup: "mvno", carrier: "NUROモバイル", planName: "バリュープラス 5GB", dataGB: 5, monthlyFeeYen: 900, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1600, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ/au/ソフトバンク回線選択可" },
  { id: "mvno-nuro-20", carrierGroup: "mvno", carrier: "NUROモバイル", planName: "バリュープラス 20GB", dataGB: 20, monthlyFeeYen: 2200, callBundle: "none", addOn5MinYen: 880, addOnUnlimitedYen: 1600, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ/au/ソフトバンク回線選択可" },
  { id: "mvno-his-7", carrierGroup: "mvno", carrier: "HISモバイル", planName: "自由自在プラン 7GB", dataGB: 7, monthlyFeeYen: 1190, callBundle: "none", addOn5MinYen: 770, addOnUnlimitedYen: 1400, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ回線" },
  { id: "mvno-his-20", carrierGroup: "mvno", carrier: "HISモバイル", planName: "自由自在プラン 20GB", dataGB: 20, monthlyFeeYen: 2190, callBundle: "none", addOn5MinYen: 770, addOnUnlimitedYen: 1400, hasPhysicalStores: false, balancedPick: false, notes: "ドコモ回線" },
  { id: "mvno-aeon-10", carrierGroup: "mvno", carrier: "イオンモバイル", planName: "音声プラン 10GB", dataGB: 10, monthlyFeeYen: 1518, callBundle: "none", addOn5MinYen: 850, addOnUnlimitedYen: 1400, hasPhysicalStores: true, balancedPick: false, notes: "ドコモ/au回線選択可・イオン店舗でサポートあり" },
  { id: "mvno-aeon-20", carrierGroup: "mvno", carrier: "イオンモバイル", planName: "音声プラン 20GB", dataGB: 20, monthlyFeeYen: 2178, callBundle: "none", addOn5MinYen: 850, addOnUnlimitedYen: 1400, hasPhysicalStores: true, balancedPick: false, notes: "ドコモ/au回線選択可・イオン店舗でサポートあり" },
  { id: "mvno-jcom-5", carrierGroup: "mvno", carrier: "J:COMモバイル", planName: "5GB", dataGB: 5, monthlyFeeYen: 1595, callBundle: "none", addOn5MinYen: 850, addOnUnlimitedYen: 1400, hasPhysicalStores: true, balancedPick: false, notes: "au回線・J:COM契約者向け割引は本MVP未反映" },
];
