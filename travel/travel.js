/**
 * Travel Decision Engine — front end.
 *
 * Renders the decision, not just a list. Every card shows the true total, its breakdown, the
 * score components behind the ranking, and what the trade-off is — because the product's claim
 * is that the reasoning is the value, so the reasoning has to be visible.
 */

const PREFERENCES_KEY = "tde.preferences.v1";

const interestLabels = {
  beach: { ja: "海", en: "Beach" },
  onsen: { ja: "温泉", en: "Onsen" },
  snow: { ja: "雪・スキー", en: "Snow" },
  themepark: { ja: "テーマパーク", en: "Theme park" },
  nature: { ja: "自然", en: "Nature" },
  city: { ja: "街歩き", en: "City" },
  food: { ja: "グルメ", en: "Food" },
  culture: { ja: "歴史・文化", en: "Culture" },
  resort: { ja: "リゾート", en: "Resort" },
  shopping: { ja: "買い物", en: "Shopping" },
};

const breakdownLabels = {
  transport: { ja: "交通", en: "Transport" },
  accommodation: { ja: "宿泊", en: "Lodging" },
  meals: { ja: "食事", en: "Food" },
  localTransport: { ja: "現地交通", en: "Local transport" },
  activities: { ja: "アクティビティ", en: "Activities" },
  contingency: { ja: "予備費", en: "Contingency" },
};

const scoreLabels = {
  travelValue: { ja: "総合スコア", en: "Travel Value" },
  interest: { ja: "希望との一致", en: "Interest fit" },
  budget: { ja: "予算適合", en: "Budget fit" },
  time: { ja: "移動時間", en: "Travel time" },
  convenience: { ja: "移動の楽さ", en: "Convenience" },
  family: { ja: "子連れ適性", en: "Family" },
  comfort: { ja: "宿の快適さ", en: "Comfort" },
  value: { ja: "コスパ", en: "Value" },
};

const monthNames = {
  ja: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

const tierLabels = {
  budget: { ja: "エコノミー", en: "Budget" },
  standard: { ja: "スタンダード", en: "Standard" },
  family: { ja: "ファミリー", en: "Family" },
};

/**
 * Presets fill the structured fields directly, the way an OTA's "popular searches" row does —
 * not the free-text box. Each is a partial `collectOverrides()`-shaped object.
 */
const quickPresets = {
  family: {
    originId: "tokyo",
    month: 9,
    nightsPreset: "2",
    adults: 2,
    childCount: 2,
    childAges: [null, null],
    budgetBand: "150000",
    interests: ["beach", "onsen"],
    constraints: { easyTransport: true },
  },
  snow: {
    originId: "osaka",
    month: 2,
    nightsPreset: "3",
    adults: 2,
    childCount: 0,
    childAges: [],
    budgetBand: "200000",
    interests: ["snow"],
    constraints: {},
  },
  onsen: {
    originId: "nagoya",
    month: 11,
    nightsPreset: "2",
    adults: 2,
    childCount: 1,
    childAges: [5],
    budgetBand: "150000",
    interests: ["onsen"],
    constraints: { noCar: true },
  },
};

/** Child age options: 0–17, plus an explicit "unknown" that keeps the child's position. */
const childAgeMax = 17;

let language = "ja";
let lastPayload = null;
let capabilities = null;

const form = document.getElementById("planner");
const originSelect = document.getElementById("origin");
const monthSelect = document.getElementById("month");
const nightsPresetSelect = document.getElementById("nights-preset");
const nightsCustomInput = document.getElementById("nights-custom");
const budgetBandSelect = document.getElementById("budget-band");
const adultsInput = document.getElementById("adults");
const childCountInput = document.getElementById("child-count");
const childAgesContainer = document.getElementById("child-ages");
const childAgesRow = document.getElementById("child-ages-row");
const textInput = document.getElementById("trip-text");
const submitButton = document.getElementById("submit-button");
const statusArea = document.getElementById("status-area");
const statusMessage = document.getElementById("status-message");
const resultsSection = document.getElementById("results");
const summaryElement = document.getElementById("summary");
const categoriesElement = document.getElementById("categories");
const compareTable = document.getElementById("compare");
const shareElement = document.getElementById("share");
const disclosureElement = document.getElementById("disclosure");
const languageToggle = document.getElementById("lang-toggle");

function text(entry) {
  if (!entry) {
    return "";
  }

  return entry[language] ?? entry.ja ?? entry.en ?? "";
}

function formatYen(value) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  if (language === "ja") {
    return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
  }

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function originName(originId) {
  const origin = capabilities?.origins?.find((entry) => entry.id === originId);

  return origin ? text(origin.name) : originId || "—";
}

function tierName(tier) {
  return text(tierLabels[tier] || { ja: tier, en: tier });
}

function element(tag, className, textContent) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (textContent !== undefined) {
    node.textContent = textContent;
  }

  return node;
}

/**
 * A pure numeric/currency figure, set in the numeric font (AI Orchestra's Inter, reserved for
 * exactly this) rather than mixed into surrounding Japanese text. Never wrap a JP counter
 * phrase like "4名" or "2時間30分" in this — those read as one idiomatic unit and splitting the
 * digit into a different face makes them look more broken, not less.
 */
function numSpan(value) {
  return element("span", "num", value);
}

/* ---------- Static localisation ---------- */

function applyLanguage() {
  for (const node of document.querySelectorAll("[data-ja][data-en]")) {
    node.textContent = language === "ja" ? node.dataset.ja : node.dataset.en;
  }

  languageToggle.textContent = language === "ja" ? "EN" : "日本語";
  languageToggle.setAttribute("aria-pressed", String(language === "en"));
  document.documentElement.lang = language;

  if (lastPayload) {
    render(lastPayload);
  }
}

/* ---------- Form setup ---------- */

function populateControls(meta) {
  for (const origin of meta.origins) {
    const option = element("option", null, text(origin.name));
    option.value = origin.id;
    originSelect.append(option);
  }

  for (let month = 1; month <= 12; month += 1) {
    const option = element("option", null, monthNames[language][month - 1]);
    option.value = String(month);
    option.dataset.month = String(month);
    monthSelect.append(option);
  }

  const chips = document.getElementById("interest-chips");

  for (const tag of meta.interests) {
    const label = element("label", "chip");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = tag;
    input.dataset.interest = tag;
    const span = element("span", null, text(interestLabels[tag] || { ja: tag, en: tag }));
    span.dataset.ja = interestLabels[tag]?.ja ?? tag;
    span.dataset.en = interestLabels[tag]?.en ?? tag;
    label.append(input, span);
    chips.append(label);
  }
}

/* ---------- Party size steppers ---------- */

function clampStepperValue(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);

  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function wireSteppers() {
  form.addEventListener("click", (event) => {
    const button = event.target.closest(".stepper-btn");

    if (!button) {
      return;
    }

    const stepper = button.closest(".stepper");
    const input = stepper.querySelector("input");
    input.value = clampStepperValue(input) + Number(button.dataset.step);
    input.value = clampStepperValue(input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  for (const input of [adultsInput, childCountInput]) {
    input.addEventListener("change", () => {
      input.value = clampStepperValue(input);
    });
  }

  childCountInput.addEventListener("input", () => renderChildAgeSelects());
}

/* ---------- Dynamic child age selects ---------- */

/**
 * Rebuilds one age <select> per child, keeping any ages already chosen when the count changes
 * so that growing or shrinking the party doesn't discard what was already picked.
 *
 * @param {Array<number|null>} [presetAges] Ages to apply instead of what is already on screen —
 *   used only when a quick preset or a shared link is filling the form programmatically.
 */
function renderChildAgeSelects(presetAges) {
  const count = clampStepperValue(childCountInput);
  const existing = presetAges ?? readChildAges();

  childAgesRow.replaceChildren();
  childAgesContainer.hidden = count === 0;

  for (let index = 0; index < count; index += 1) {
    const field = element("div", "child-age-field");
    const label = element(
      "span",
      null,
      language === "ja" ? `${index + 1}人目` : `Child ${index + 1}`
    );
    label.dataset.childIndex = String(index);

    const select = document.createElement("select");
    select.dataset.childAge = String(index);

    const unknown = element("option", null, language === "ja" ? "不明" : "Unknown");
    unknown.value = "";
    select.append(unknown);

    for (let age = 0; age <= childAgeMax; age += 1) {
      const option = element("option", null, language === "ja" ? `${age}歳` : String(age));
      option.value = String(age);
      select.append(option);
    }

    const existingAge = existing[index];

    if (existingAge !== null && existingAge !== undefined) {
      select.value = String(existingAge);
    }

    field.append(label, select);
    childAgesRow.append(field);
  }
}

function readChildAges() {
  return [...childAgesRow.querySelectorAll("[data-child-age]")].map((select) =>
    select.value === "" ? null : Number(select.value)
  );
}

/* ---------- Nights preset ---------- */

function wireNightsPreset() {
  nightsPresetSelect.addEventListener("change", () => {
    nightsCustomInput.hidden = nightsPresetSelect.value !== "other";

    if (!nightsCustomInput.hidden) {
      nightsCustomInput.focus();
    }
  });
}

function readNights() {
  if (nightsPresetSelect.value === "other") {
    return Number(nightsCustomInput.value);
  }

  return Number(nightsPresetSelect.value);
}

/* ---------- Quick presets ---------- */

function applyPreset(preset) {
  originSelect.value = preset.originId;
  monthSelect.value = String(preset.month);
  nightsPresetSelect.value = preset.nightsPreset;
  nightsCustomInput.hidden = preset.nightsPreset !== "other";
  adultsInput.value = preset.adults;
  childCountInput.value = preset.childCount;
  budgetBandSelect.value = preset.budgetBand;

  for (const input of document.querySelectorAll("[data-interest]")) {
    input.checked = preset.interests.includes(input.value);
  }

  document.getElementById("easy-transport").checked = Boolean(preset.constraints.easyTransport);
  document.getElementById("no-car").checked = Boolean(preset.constraints.noCar);
  document.getElementById("stroller").checked = Boolean(preset.constraints.stroller);

  renderChildAgeSelects(preset.childAges);
  textInput.value = "";
}

function wireQuickPresets() {
  document.getElementById("quick-presets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");

    if (!button) {
      return;
    }

    const preset = quickPresets[button.dataset.preset];

    if (preset) {
      applyPreset(preset);
    }
  });
}

function collectOverrides() {
  const overrides = {};
  const originId = originSelect.value;
  const month = monthSelect.value;
  const budget = budgetBandSelect.value;

  if (originId) {
    overrides.originId = originId;
  }

  if (month) {
    overrides.month = Number(month);
  }

  overrides.nights = readNights();
  overrides.adults = clampStepperValue(adultsInput);
  overrides.childCount = clampStepperValue(childCountInput);
  overrides.childAges = readChildAges();

  if (budget !== "") {
    overrides.budgetYen = Number(budget);
  }

  const interests = [...document.querySelectorAll("[data-interest]:checked")].map((input) => input.value);

  if (interests.length > 0) {
    overrides.interests = interests;
  }

  const constraints = {};

  if (document.getElementById("easy-transport").checked) {
    constraints.easyTransport = true;
  }

  if (document.getElementById("no-car").checked) {
    constraints.noCar = true;
  }

  if (document.getElementById("stroller").checked) {
    constraints.stroller = true;
  }

  if (Object.keys(constraints).length > 0) {
    overrides.constraints = constraints;
  }

  return overrides;
}

/* ---------- Saved preferences ---------- */

function savePreferences() {
  if (!document.getElementById("remember").checked) {
    return;
  }

  const preferences = {
    originId: originSelect.value,
    month: monthSelect.value,
    nightsPreset: nightsPresetSelect.value,
    nightsCustom: nightsCustomInput.value,
    adults: adultsInput.value,
    childCount: childCountInput.value,
    childAges: readChildAges(),
    budgetBand: budgetBandSelect.value,
  };

  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in private windows. A lost preference is not worth an error.
  }
}

function restorePreferences() {
  let preferences = null;

  try {
    preferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null");
  } catch {
    preferences = null;
  }

  if (!preferences) {
    return;
  }

  originSelect.value = preferences.originId || "";
  monthSelect.value = preferences.month || "";
  nightsPresetSelect.value = preferences.nightsPreset || "2";
  nightsCustomInput.hidden = nightsPresetSelect.value !== "other";
  nightsCustomInput.value = preferences.nightsCustom || "5";
  adultsInput.value = preferences.adults || "2";
  childCountInput.value = preferences.childCount || "0";
  budgetBandSelect.value = preferences.budgetBand || "";
  document.getElementById("remember").checked = true;
  renderChildAgeSelects(preferences.childAges || []);
}

/* ---------- Rendering ---------- */

function renderSummary(payload) {
  const request = payload.request;
  const result = payload.result;

  summaryElement.replaceChildren();

  const people = request.adults + request.children.length;
  const facts = [
    [language === "ja" ? "出発地" : "From", originName(request.originId), false],
    [language === "ja" ? "時期" : "Month", request.month ? monthNames[language][request.month - 1] : "—", false],
    [language === "ja" ? "宿泊" : "Nights", String(request.nights), true],
    [language === "ja" ? "人数" : "Party", language === "ja" ? `${people}名` : `${people}`, false],
    [language === "ja" ? "予算" : "Budget", request.budgetYen ? formatYen(request.budgetYen) : "—", Boolean(request.budgetYen)],
    [
      language === "ja" ? "検討数" : "Compared",
      language === "ja"
        ? `${result.consideredDestinations}件 / ${result.consideredConfigurations}通り`
        : `${result.consideredDestinations} destinations, ${result.consideredConfigurations} combinations`,
      false,
    ],
  ];

  for (const [label, value, isNumeric] of facts) {
    const item = element("span");
    item.append(`${label}: `);
    item.append(element("strong", isNumeric ? "num" : null, value));
    summaryElement.append(item);
  }

  const notes = [...(request.assumptions || []), ...(request.warnings || [])];

  if (notes.length > 0) {
    const noteBox = element("p", "summary-notes", notes.map((note) => text(note)).join(" "));
    summaryElement.append(noteBox);
  }
}

function renderScores(scores) {
  const container = element("div", "scores");
  const order = ["travelValue", "interest", "budget", "time", "convenience", "family", "comfort", "value"];

  for (const key of order) {
    const value = scores[key];

    if (value === null || value === undefined) {
      continue;
    }

    const row = element("div", "score-row");
    row.append(element("span", null, text(scoreLabels[key])));

    const meter = element("div", key === "travelValue" ? "meter headline" : "meter");
    const bar = element("span");
    bar.style.width = `${Math.max(0, Math.min(100, value))}%`;
    meter.append(bar);
    row.append(meter, element("span", "num", String(value)));
    container.append(row);
  }

  return container;
}

/**
 * Renders the "you could go cheaper by shifting" advice.
 *
 * Only appears when the engine found a month that is both meaningfully cheaper and still in
 * season, so an empty slot here is a positive signal: the month asked for is the right one.
 */
function renderTiming(timing) {
  if (!timing || !timing.suggestion) {
    return null;
  }

  const suggestion = timing.suggestion;
  const box = element("div", "timing");

  const heading = element("p", "timing-headline");

  if (language === "ja") {
    heading.append(`${monthNames.ja[suggestion.month - 1]}なら `, numSpan(formatYen(suggestion.savingsYen)), " 安い");
  } else {
    heading.append(`${monthNames.en[suggestion.month - 1]} is `, numSpan(formatYen(suggestion.savingsYen)), " cheaper");
  }

  box.append(heading);

  box.append(element("p", "timing-body", text(suggestion.message)));

  if (suggestion.note) {
    box.append(element("p", "timing-note", text(suggestion.note)));
  }

  return box;
}

function renderBreakdown(cost) {
  const list = element("dl", "breakdown");

  for (const line of cost.breakdown) {
    const row = element("div");
    row.append(element("dt", null, text(breakdownLabels[line.key])), element("dd", "num", formatYen(line.yen)));
    list.append(row);
  }

  return list;
}

function renderCard(category) {
  const recommendation = category.recommendation;
  const card = element("article", "card");

  card.append(element("span", "card-tag", text(category.label)));

  const heading = element("div");
  heading.append(element("h3", null, text(recommendation.name)));
  heading.append(element("p", "prefecture", text(recommendation.prefecture)));
  card.append(heading);

  const priceBlock = element("div");
  priceBlock.append(element("p", "price num", formatYen(recommendation.cost.totalYen)));

  const priceRange = element("p", "price-range");
  priceRange.append(
    numSpan(`${formatYen(recommendation.cost.rangeYen.low)} – ${formatYen(recommendation.cost.rangeYen.high)}`),
    ` · ${language === "ja" ? "1人あたり" : "per person"} `,
    numSpan(formatYen(recommendation.cost.perPersonYen))
  );
  priceBlock.append(priceRange);

  if (recommendation.withinBudget === false) {
    priceBlock.append(element("p", "over-budget", language === "ja" ? "予算オーバー" : "Over budget"));
  }

  card.append(priceBlock);
  card.append(renderBreakdown(recommendation.cost));

  const routeLine = element(
    "p",
    "alternatives",
    `${text(recommendation.route.label)} · ${formatDuration(recommendation.route.doorToDoorMinutes)} ${
      language === "ja" ? "片道" : "each way"
    }`
  );
  card.append(routeLine);

  card.append(renderScores(recommendation.scores));

  const timing = renderTiming(recommendation.timing);

  if (timing) {
    card.append(timing);
  }

  const explain = element("div", "explain");

  for (const paragraph of recommendation.explanation.paragraphs) {
    explain.append(element("p", null, text(paragraph)));
  }

  card.append(explain);

  const prosCons = element("div", "pros-cons");
  const prosList = element("ul");

  for (const advantage of recommendation.explanation.advantages) {
    prosList.append(element("li", "pro", text(advantage)));
  }

  for (const caution of recommendation.explanation.cautions) {
    prosList.append(element("li", "con", text(caution)));
  }

  prosCons.append(prosList);
  card.append(prosCons);

  if (recommendation.alternatives.length > 0) {
    const alternatives = recommendation.alternatives
      .map((alternative) => `${tierName(alternative.tierName)} ${formatYen(alternative.totalYen)}`)
      .join(" / ");
    card.append(
      element("p", "alternatives", `${language === "ja" ? "他の組み合わせ" : "Other combinations"} — ${alternatives}`)
    );
  }

  const links = element("div", "links");

  for (const link of recommendation.bookingLinks) {
    const anchor = element("a", null, text(link.provider));
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener nofollow sponsored";
    links.append(anchor);
  }

  card.append(links);

  return card;
}

function renderCompareTable(ranked) {
  compareTable.replaceChildren();

  const headers = [
    language === "ja" ? "行き先" : "Destination",
    language === "ja" ? "総額" : "Total",
    language === "ja" ? "片道" : "Each way",
    language === "ja" ? "乗換" : "Transfers",
    language === "ja" ? "宿" : "Lodging",
    language === "ja" ? "総合" : "Score",
    language === "ja" ? "子連れ" : "Family",
  ];

  const head = element("thead");
  const headRow = element("tr");

  for (const header of headers) {
    headRow.append(element("th", null, header));
  }

  head.append(headRow);
  compareTable.append(head);

  const body = element("tbody");

  for (const recommendation of ranked) {
    const row = element("tr");
    row.append(element("td", null, text(recommendation.name)));
    row.append(element("td", "numeric num", formatYen(recommendation.cost.totalYen)));
    row.append(element("td", "numeric", formatDuration(recommendation.route.doorToDoorMinutes)));
    row.append(element("td", "numeric num", String(recommendation.route.transfers)));
    row.append(element("td", null, tierName(recommendation.tierName)));
    row.append(element("td", "numeric num", String(recommendation.scores.travelValue)));
    row.append(
      element(
        "td",
        recommendation.scores.family === null ? "numeric" : "numeric num",
        recommendation.scores.family === null ? "—" : String(recommendation.scores.family)
      )
    );
    body.append(row);
  }

  compareTable.append(body);
}

function renderShare(payload) {
  shareElement.replaceChildren();

  const shareUrl = `${location.origin}/travel/?t=${encodeURIComponent(payload.shareToken)}`;

  shareElement.append(element("span", null, language === "ja" ? "この条件を共有・保存" : "Share or save this trip"));

  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = true;
  input.value = shareUrl;
  shareElement.append(input);

  const button = element("button", null, language === "ja" ? "コピー" : "Copy");
  button.type = "button";
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      button.textContent = language === "ja" ? "コピーしました" : "Copied";
    } catch {
      input.select();
      button.textContent = language === "ja" ? "手動でコピーしてください" : "Copy manually";
    }
  });

  shareElement.append(button);
}

function render(payload) {
  lastPayload = payload;
  const result = payload.result;

  statusArea.hidden = true;
  statusMessage.className = "notice";

  if (!result.ok) {
    resultsSection.hidden = true;
    statusArea.hidden = false;
    statusMessage.classList.add("error");
    statusMessage.textContent = text(result.message);
    return;
  }

  if (result.budgetFit && !result.budgetFit.feasible) {
    statusArea.hidden = false;
    statusMessage.textContent = text(result.budgetFit.message);
  }

  renderSummary(payload);

  categoriesElement.replaceChildren();

  for (const category of result.categories) {
    categoriesElement.append(renderCard(category));
  }

  renderCompareTable(result.ranked);
  renderShare(payload);

  disclosureElement.textContent = text(payload.disclosure);
  resultsSection.hidden = false;
}

/* ---------- Requests ---------- */

async function requestPlan(body) {
  submitButton.disabled = true;
  statusArea.hidden = false;
  statusMessage.className = "notice";
  statusMessage.textContent = language === "ja" ? "比較しています…" : "Comparing options…";

  try {
    const response = await fetch("/api/travel/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      statusMessage.classList.add("error");
      statusMessage.textContent = payload.message || (language === "ja" ? "うまくいきませんでした。" : "Something went wrong.");
      return;
    }

    render(payload);
    savePreferences();
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    statusMessage.classList.add("error");
    statusMessage.textContent =
      language === "ja" ? "通信に失敗しました。時間をおいて再度お試しください。" : "Request failed. Please try again shortly.";
  } finally {
    submitButton.disabled = false;
  }
}

async function loadSharedTrip(token) {
  const response = await fetch(`/api/travel/plan?t=${encodeURIComponent(token)}`);
  const payload = await response.json();

  if (response.ok && payload.ok) {
    render(payload);
  }
}

/* ---------- Wiring ---------- */

form.addEventListener("submit", (event) => {
  event.preventDefault();
  requestPlan({ text: textInput.value, overrides: collectOverrides() });
});

wireSteppers();
wireNightsPreset();
wireQuickPresets();

languageToggle.addEventListener("click", () => {
  language = language === "ja" ? "en" : "ja";
  renderChildAgeSelects(readChildAges());
  applyLanguage();
});

async function init() {
  try {
    const response = await fetch("/api/travel/meta");
    const meta = await response.json();

    if (meta.ok) {
      capabilities = meta;
      populateControls(meta);
    }
  } catch {
    // The form still works with the built-in defaults if the metadata call fails.
  }

  renderChildAgeSelects();
  restorePreferences();
  applyLanguage();

  const token = new URLSearchParams(location.search).get("t");

  if (token) {
    loadSharedTrip(token);
  }
}

init();
