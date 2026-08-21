/**
 * Curated landing page generator.
 *
 * The product spec is explicit: generate useful landing pages, but do not mass-generate
 * low-quality AI pages. This script therefore works from a hand-written allowlist rather than
 * a cross-product of cities and destinations, and every page is built from real engine output
 * — monthly cost tables and ranked comparisons — so each one carries structured information a
 * reader could not get from the page title alone.
 *
 * Two rules keep it honest, and both are enforced below rather than left to discipline:
 *   1. `pages` is an allowlist. Adding a page is a deliberate edit, not a loop bound.
 *   2. A page that cannot be filled with enough real data is skipped, not published thin.
 *
 * Run with `npm run seo`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTripRequest } from "../engine/parse-request.js";
import { recommendTrips } from "../engine/recommend.js";
import { estimateTripCost } from "../engine/cost-model.js";
import { getDestination } from "../engine/data/destinations.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "travel", "guides");

/** A page must carry at least this many rows of real comparison data to be published. */
const MINIMUM_ROWS = 4;

const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const pages = [
  {
    slug: "tokyo-to-okinawa",
    kind: "destination",
    destinationId: "okinawa-main",
    query: "東京から3泊、大人2人、子供2人（8歳と5歳）",
    title: "東京から沖縄本島｜家族4人の総額を月別に比較",
    description: "東京発・沖縄本島の家族旅行を、航空券と宿だけでなく食事・レンタカー・アクティビティまで含めた総額で月別に比較します。",
    intro: "沖縄旅行の費用は「航空券が高い月」だけでは決まりません。レンタカー代、食費、アクティビティまで含めた本当の総額で、行く月による差を出しました。",
  },
  {
    slug: "tokyo-to-hokkaido",
    kind: "destination",
    destinationId: "sapporo-otaru",
    query: "東京から3泊、大人2人、子供2人（8歳と5歳）",
    title: "東京から札幌・小樽｜家族4人の総額を月別に比較",
    description: "東京発・札幌小樽の家族旅行の総額を、航空券・宿・食事・現地交通を合算した実質費用で月別に比較します。",
    intro: "札幌は市内が公共交通で回れるため、レンタカー前提の旅行先とは費用の構造が変わります。車なしを前提にした総額で月別に並べました。",
  },
  {
    slug: "tokyo-3-day-trip",
    kind: "ranking",
    query: "東京から2泊、大人2人で15万円",
    title: "東京発2泊3日｜総額で比べる旅行先ランキング",
    description: "東京発2泊3日の旅行先を、交通・宿・食事・現地交通を合算した総額と移動時間で比較します。",
    intro: "2泊3日では、移動に片道5時間かける旅行先と2時間で着く旅行先では現地で過ごせる時間がまったく違います。総額と移動時間の両方で並べました。",
  },
  {
    slug: "cheap-weekend-trips-from-tokyo",
    kind: "ranking",
    query: "東京から週末に1泊、大人2人で6万円",
    title: "東京発の安い週末旅行｜1泊の総額が安い順",
    description: "東京から1泊で行ける旅行先を、交通費と宿代だけでなく食事と現地交通まで含めた総額の安い順に比較します。",
    intro: "週末旅行は宿代よりも「移動にいくらかかるか」で総額が変わります。1泊の実質的な総額が安い順に並べました。",
  },
  {
    slug: "tokyo-family-beach-trip",
    kind: "ranking",
    query: "東京から9月に2泊、大人2人、子供2人（8歳と5歳）で15万円。海。移動はできるだけ楽に。",
    title: "東京発・子連れの海旅行｜9月の総額と子連れ適性で比較",
    description: "東京発の子連れ海旅行を、総額・移動時間・子連れ適性スコアで比較します。",
    intro: "小さい子ども連れの海旅行は、海のきれいさだけでは決められません。移動時間と現地の過ごしやすさを含めて比較しました。",
  },
  {
    slug: "osaka-family-trip",
    kind: "ranking",
    query: "大阪から9月に2泊、大人2人、子供2人（8歳と5歳）で15万円",
    title: "大阪発・家族旅行｜総額と子連れ適性で比べる旅行先",
    description: "大阪発の家族旅行を、交通・宿・食事・現地交通を合算した総額と子連れ適性で比較します。",
    intro: "大阪からは近鉄・特急で行ける旅行先が多く、飛行機前提の旅行先とは費用の構造が変わります。総額で並べました。",
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatYen(value) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
}

/** Month-by-month total for one destination: the structured fact the page exists to deliver. */
function buildMonthlyRows(page) {
  const destination = getDestination(page.destinationId);
  const request = parseTripRequest(page.query);
  const routes = destination.access?.[request.originId] || [];

  if (routes.length === 0) {
    return { destination, rows: [] };
  }

  const route = routes[0];
  const rows = [];

  for (let month = 1; month <= 12; month += 1) {
    const monthlyRequest = { ...request, month };
    const cost = estimateTripCost(monthlyRequest, destination, route, destination.hotels.standard);

    rows.push({
      month,
      totalYen: cost.totalYen,
      transportYen: cost.transport.yen,
      accommodationYen: cost.accommodation.yen,
      note: destination.seasonNotes?.[month]?.ja || "",
    });
  }

  const cheapest = Math.min(...rows.map((row) => row.totalYen));

  for (const row of rows) {
    row.cheapest = row.totalYen === cheapest;
  }

  return { destination, route, rows, request };
}

function renderMonthlyTable(rows) {
  const body = rows
    .map(
      (row) => `        <tr${row.cheapest ? ' class="best"' : ""}>
          <td>${monthNames[row.month - 1]}</td>
          <td class="numeric num">${formatYen(row.totalYen)}</td>
          <td class="numeric num">${formatYen(row.transportYen)}</td>
          <td class="numeric num">${formatYen(row.accommodationYen)}</td>
          <td>${escapeHtml(row.note)}</td>
        </tr>`
    )
    .join("\n");

  return `      <table class="compare">
        <thead>
          <tr><th>月</th><th>総額</th><th>うち交通</th><th>うち宿泊</th><th>メモ</th></tr>
        </thead>
        <tbody>
${body}
        </tbody>
      </table>`;
}

function renderRankingTable(ranked) {
  const body = ranked
    .map(
      (recommendation) => `        <tr>
          <td>${escapeHtml(recommendation.name.ja)}</td>
          <td>${escapeHtml(recommendation.prefecture.ja)}</td>
          <td class="numeric num">${formatYen(recommendation.cost.totalYen)}</td>
          <td class="numeric">${formatDuration(recommendation.route.doorToDoorMinutes)}</td>
          <td class="numeric num">${recommendation.route.transfers}</td>
          <td class="numeric num">${recommendation.scores.travelValue}</td>
          <td class="numeric${recommendation.scores.family === null ? "" : " num"}">${recommendation.scores.family === null ? "—" : recommendation.scores.family}</td>
        </tr>`
    )
    .join("\n");

  return `      <table class="compare">
        <thead>
          <tr><th>行き先</th><th>県</th><th>総額</th><th>片道</th><th>乗換</th><th>総合</th><th>子連れ</th></tr>
        </thead>
        <tbody>
${body}
        </tbody>
      </table>`;
}

function renderDetailSections(ranked) {
  return ranked
    .slice(0, 3)
    .map((recommendation) => {
      const advantages = recommendation.explanation.advantages
        .map((advantage) => `          <li class="pro">${escapeHtml(advantage.ja)}</li>`)
        .join("\n");
      const cautions = recommendation.explanation.cautions
        .map((caution) => `          <li class="con">${escapeHtml(caution.ja)}</li>`)
        .join("\n");
      const paragraphs = recommendation.explanation.paragraphs
        .map((paragraph) => `        <p>${escapeHtml(paragraph.ja)}</p>`)
        .join("\n");

      return `      <section class="guide-detail">
        <h3>${escapeHtml(recommendation.name.ja)}</h3>
${paragraphs}
        <ul class="pros-cons-list">
${advantages}
${cautions}
        </ul>
      </section>`;
    })
    .join("\n");
}

function renderPage(page, main) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(page.description)}" />
    <meta name="theme-color" content="#0f241b" />
    <title>${escapeHtml(page.title)}</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/travel/travel.css" />
    <link rel="stylesheet" href="/travel/guides/guide.css" />
  </head>
  <body>
    <header class="topbar">
      <div class="wrap topbar-inner">
        <a class="brand" href="/travel/">旅行決定エンジン</a>
      </div>
    </header>

    <main class="wrap guide">
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.intro)}</p>

${main}

      <section class="guide-cta">
        <h2>自分の条件で比べる</h2>
        <p>人数・予算・時期を変えると結果は変わります。条件を入れて比較してください。</p>
        <p><a class="button-primary" href="/travel/">条件を入れて比較する</a></p>
      </section>

      <section class="disclaimer">
        <h2>この数字について</h2>
        <p>
          掲載している金額と所要時間は、独自に整備したデータをもとにした概算です。実際の価格ではありません。
          予約前に必ず各予約サイトでご確認ください。
        </p>
        <p class="fine">生成日: ${new Date().toISOString().slice(0, 10)}</p>
      </section>
    </main>

    <footer class="site-footer">
      <div class="wrap"><p class="fine">Travel Decision Engine — MVP</p></div>
    </footer>
  </body>
</html>
`;
}

function buildDestinationPage(page) {
  const { destination, route, rows, request } = buildMonthlyRows(page);

  if (rows.length < MINIMUM_ROWS) {
    return null;
  }

  const cheapest = rows.find((row) => row.cheapest);
  const dearest = [...rows].sort((a, b) => b.totalYen - a.totalYen)[0];
  const people = request.adults + request.children.length;

  const main = `      <section>
        <h2>月別の総額（${people}名・${request.nights}泊・スタンダードクラスの宿）</h2>
        <p class="guide-note">
          ${escapeHtml(route.label.ja)}／片道の目安 ${formatDuration(route.doorToDoorMinutes)}。
          最も安いのは${monthNames[cheapest.month - 1]}の${formatYen(cheapest.totalYen)}、
          最も高いのは${monthNames[dearest.month - 1]}の${formatYen(dearest.totalYen)}で、
          差は${formatYen(dearest.totalYen - cheapest.totalYen)}です。
        </p>
${renderMonthlyTable(rows)}
      </section>

      <section>
        <h2>${escapeHtml(destination.name.ja)}の良い点と注意点</h2>
        <ul class="pros-cons-list">
${destination.advantages.map((advantage) => `          <li class="pro">${escapeHtml(advantage.ja)}</li>`).join("\n")}
${destination.cautions.map((caution) => `          <li class="con">${escapeHtml(caution.ja)}</li>`).join("\n")}
        </ul>
      </section>`;

  return renderPage(page, main);
}

function buildRankingPage(page) {
  const request = parseTripRequest(page.query);
  const result = recommendTrips(request, { limit: 10 });

  if (!result.ok || result.ranked.length < MINIMUM_ROWS) {
    return null;
  }

  const main = `      <section>
        <h2>総額で比べた結果</h2>
        <p class="guide-note">
          ${result.consideredDestinations}件の行き先について${result.consideredConfigurations}通りの組み合わせを比較しました。
          金額は交通・宿泊・食事・現地交通・アクティビティ・予備費を合算した総額です。
        </p>
${renderRankingTable(result.ranked)}
      </section>

      <section>
        <h2>上位3件の詳細</h2>
${renderDetailSections(result.ranked)}
      </section>`;

  return renderPage(page, main);
}

const guideStylesheet = `/* Extra styles for generated guide pages, layered on /travel/travel.css. */

.guide {
  padding-block: 2.5rem 1rem;
}

.guide h1 {
  font-size: clamp(1.5rem, 3.4vw, 2.2rem);
  line-height: 1.3;
}

.guide h2 {
  margin-top: 2.5rem;
  font-size: 1.15rem;
}

.guide h3 {
  font-size: 1.05rem;
  margin-bottom: 0.5rem;
}

.guide .compare {
  margin-top: 1rem;
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  min-width: 0;
  width: 100%;
  display: table;
}

.guide .compare th,
.guide .compare td {
  white-space: normal;
}

.guide .compare tr.best td {
  background: rgba(184, 148, 85, 0.16);
  font-weight: 600;
}

.guide-note {
  margin-top: 0.75rem;
  color: var(--ink-760);
  line-height: 1.8;
  font-size: 0.92rem;
}

.guide-detail {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1.1rem 1.25rem;
  margin-top: 1rem;
}

.guide-detail p {
  color: var(--ink-760);
  line-height: 1.8;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.pros-cons-list {
  margin: 0.75rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
  line-height: 1.7;
}

.pros-cons-list li {
  list-style: none;
}

.guide-cta {
  margin-top: 3rem;
  background: var(--green-950);
  color: var(--cream-140);
  border-radius: 14px;
  padding: 1.5rem;
}

.guide-cta h2 {
  margin-top: 0;
  color: var(--white);
}

.guide-cta p {
  margin-top: 0.6rem;
  line-height: 1.7;
  font-size: 0.92rem;
}

.guide-cta .button-primary {
  display: inline-block;
  margin-top: 0.5rem;
  background: var(--gold-560);
  color: var(--green-980);
  text-decoration: none;
}

@media (max-width: 720px) {
  .guide .compare {
    font-size: 0.8rem;
  }
}
`;

function generate() {
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(join(outputRoot, "guide.css"), guideStylesheet, "utf8");

  const written = [];
  const skipped = [];

  for (const page of pages) {
    const html = page.kind === "destination" ? buildDestinationPage(page) : buildRankingPage(page);

    if (!html) {
      skipped.push(page.slug);
      continue;
    }

    const directory = join(outputRoot, page.slug);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "index.html"), html, "utf8");
    written.push(page.slug);
  }

  const index = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="総額で比べる旅行ガイド一覧。" />
    <title>旅行ガイド一覧｜旅行決定エンジン</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/travel/travel.css" />
    <link rel="stylesheet" href="/travel/guides/guide.css" />
  </head>
  <body>
    <header class="topbar">
      <div class="wrap topbar-inner"><a class="brand" href="/travel/">旅行決定エンジン</a></div>
    </header>
    <main class="wrap guide">
      <h1>総額で比べる旅行ガイド</h1>
      <p class="lead">交通・宿・食事・現地交通を合算した総額で比較したページの一覧です。</p>
      <ul class="pros-cons-list">
${written
  .map((slug) => {
    const page = pages.find((entry) => entry.slug === slug);

    return `        <li><a href="/travel/guides/${slug}/">${escapeHtml(page.title)}</a></li>`;
  })
  .join("\n")}
      </ul>
    </main>
    <footer class="site-footer"><div class="wrap"><p class="fine">Travel Decision Engine — MVP</p></div></footer>
  </body>
</html>
`;

  writeFileSync(join(outputRoot, "index.html"), index, "utf8");

  console.log(`Generated ${written.length} guide page(s): ${written.join(", ")}`);

  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} page(s) for insufficient data: ${skipped.join(", ")}`);
  }
}

generate();
