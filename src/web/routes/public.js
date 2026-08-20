/**
 * The public product — Japanese-first.
 *
 * `/intel` is written for one person reading it every morning: a dense terminal
 * screen answering "what changed since yesterday", not a news list and not a
 * marketing page. Everything else exists to answer the follow-up questions:
 * who is this player, how reliable is this, and what should be verified next.
 */
import { config } from "../../config/index.js";
import { escapeHtml } from "../../lib/text.js";
import { shiftDate, todayInTimezone } from "../../lib/time.js";
import {
  attr,
  changeCard,
  confidenceChip,
  dataStatusNote,
  emptyState,
  entityName,
  jstDateTime,
  momentumIndicator,
  normalizeChange,
  normalizeConfidence,
  pick,
  positionName,
  preferJa,
  scoreMeter,
  signalBandPill,
  sourceList,
  statTile,
  timeTag,
} from "../components.js";
import {
  getLeagueBySlug,
  getPlayerBySlug,
  listEnabledSources,
  listLeagueChanges,
  listLeagues,
  listPlayerEvents,
  listPlayerSources,
  listPlayers,
  listPositions,
} from "../data.js";
import { adSlot, affiliateBlock, streamingBlock } from "../monetization.js";
import { path, renderPage } from "../layout.js";

const SECTIONS = [
  { key: "transfer", icon: "🔄", label: "移籍", blurb: "移籍シグナルの変動、新たな関心クラブ、報じられた打診。" },
  { key: "injury", icon: "🏥", label: "怪我", blurb: "出場可否の変化。起用可否は直接確認が必要です。" },
  { key: "contract", icon: "📄", label: "契約", blurb: "契約に関する状況。契約内容は直接確認が必要です。" },
  { key: "performance", icon: "⚽", label: "出場", blurb: "直近の一軍での出場リズム（報道ベース）。" },
  { key: "market", icon: "🇯🇵", label: "日本市場", blurb: "日本メディア・検索・SNSでの動き。" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function safeDate(value, fallback) {
  return ISO_DATE.test(String(value ?? "")) ? String(value) : fallback;
}

/** Rows come from either the pipeline module or raw SQL; accept both spellings. */
function sectionRows(brief, key) {
  const sections = pick(brief, "sections") || {};
  const rows = sections[key] ?? sections[`${key}Changes`] ?? [];
  return Array.isArray(rows) ? rows : [];
}

function allChanges(brief) {
  return SECTIONS.flatMap((section) => sectionRows(brief, section.key));
}

function pageIntro({ eyebrow, title, lead, aside = "" }) {
  return (
    `<section class="page-head">
      <div class="container page-head-inner">
        <div class="page-head-copy">
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(title)}</h1>
          ${lead ? `<p class="page-lead">${lead}</p>` : ""}
        </div>
        ${aside ? `<div class="page-head-aside">${aside}</div>` : ""}
      </div>
    </section>`
  );
}

function unavailableNotice(intel) {
  if (intel.available) return "";
  return (
    `<p class="notice notice-degraded"><strong>インテリジェンス処理が稼働していません。</strong>` +
    `この環境では変化検出パイプラインの出力がまだありません。推測で埋めることはせず、空の状態を表示しています。</p>`
  );
}

/** Dense one-line form of a change, for the daily terminal rows. */
function changeRow(input) {
  const change = normalizeChange(input);
  if (!change) return "";

  const name = entityName(change.player.nameJa, change.player.nameEn, { className: "row-player-name" });
  const link = change.player.slug
    ? `<a class="row-player" href="${attr(path(`/players/${change.player.slug}`))}">${name}</a>`
    : `<span class="row-player">${name}</span>`;

  const sources = change.sources.length
    ? `<details class="row-sources"><summary>出典 ${change.sources.length}件</summary>${sourceList(change.sources)}</details>`
    : `<span class="row-nosource">出典未記録</span>`;

  return (
    `<li class="change-row">` +
    `<span class="row-bullet" aria-hidden="true">・</span>` +
    link +
    `<span class="row-headline">${escapeHtml(change.headline)}</span>` +
    confidenceChip(change.confidence, { compact: true }) +
    sources +
    `</li>`
  );
}

// ---------------------------------------------------------------------------
// 今日の変化 — the daily terminal
// ---------------------------------------------------------------------------

function renderDailyBrief(ctx) {
  const today = todayInTimezone();
  const asOfDate = safeDate(ctx.query.get("date"), today);
  const previousDate = shiftDate(asOfDate, -1);

  const build = (date) => {
    try {
      return ctx.intel.module.buildDailyBrief({ asOfDate: date }) ?? null;
    } catch (error) {
      ctx.log.error("buildDailyBrief failed", { date, error: error?.message || String(error) });
      return null;
    }
  };

  const brief = build(asOfDate);
  const previousBrief = build(previousDate);

  const counts = pick(brief, "counts") || {};
  const updatedAt = pick(brief, "updatedAt", "updated_at");
  const trending = Array.isArray(pick(brief, "trending")) ? brief.trending : [];
  const changes = allChanges(brief);
  const headline = changes
    .map(normalizeChange)
    .filter(Boolean)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5);

  const leagues = listLeagues().filter((league) => league.player_count > 0);
  const sources = listEnabledSources();

  const dateNav =
    `<form class="date-nav" method="get" action="${attr(path(""))}">
      <a class="date-step" href="${attr(`${path("")}?date=${previousDate}`)}" rel="prev">← 前日</a>
      <div class="field field-inline">
        <label for="date">表示する日付</label>
        <input type="date" id="date" name="date" value="${attr(asOfDate)}" max="${attr(today)}" />
      </div>
      <button class="button button-primary" type="submit">表示</button>
      ${asOfDate < today ? `<a class="date-step" href="${attr(`${path("")}?date=${shiftDate(asOfDate, 1)}`)}" rel="next">翌日 →</a>` : ""}
    </form>`;

  const terminalBar =
    `<div class="terminal-bar">
      <p class="terminal-title"><span aria-hidden="true">🇯🇵</span> JAPAN FOOTBALL INTELLIGENCE — TODAY</p>
      <p class="terminal-stamp">${timeTag(`${asOfDate}T00:00:00Z`)}${
        updatedAt ? ` ・ 最終更新 ${escapeHtml(jstDateTime(updatedAt))}` : " ・ この日のパイプライン実行記録はありません"
      }</p>
    </div>`;

  const statStrip =
    `<div class="stat-strip">
      ${statTile({ label: "記録された変化", value: counts.changes ?? changes.length })}
      ${statTile({ label: "追跡中の選手", value: counts.players ?? "—" })}
      ${statTile({ label: "有効なソース", value: counts.sources ?? sources.length })}
      ${statTile({ label: "収集記事", value: counts.articles ?? "—", note: "見出しとリンクのみ" })}
    </div>`;

  const headlineBlock =
    `<section class="brief-section brief-headline" aria-labelledby="headline-heading">
      <div class="section-bar">
        <h2 id="headline-heading"><span aria-hidden="true">🔥</span> 今日の重要ニュース ${headline.length}件</h2>
      </div>
      ${
        headline.length
          ? `<div class="change-grid">${headline.map((change) => changeCard(change, { headingLevel: 3 })).join("")}</div>`
          : emptyState("この日付で記録された変化はありません。", {
              hint: "別の日付を選ぶか、パイプラインが実行済みか確認してください。",
            })
      }
    </section>`;

  const sectionsHtml = SECTIONS.map((section) => {
    const rows = sectionRows(brief, section.key);
    return (
      `<section class="brief-section brief-row" id="${attr(section.key)}" aria-labelledby="${attr(`${section.key}-heading`)}">
        <div class="section-bar">
          <h2 id="${attr(`${section.key}-heading`)}"><span aria-hidden="true">${section.icon}</span> ${escapeHtml(section.label)}</h2>
          <p class="section-count">${rows.length}件</p>
          <p class="section-blurb">${escapeHtml(section.blurb)}</p>
        </div>
        ${
          rows.length
            ? `<ul class="change-rows">${rows.map(changeRow).join("")}</ul>`
            : `<p class="row-empty">${escapeHtml(`${section.label}に関する変化は記録されていません。`)}</p>`
        }
      </section>`
    );
  }).join("");

  const trendingHtml = trending.length
    ? `<ol class="trending-list">${trending
        .map((entry) => {
          const player = pick(entry, "player") || {};
          const slug = pick(player, "slug");
          const name = entityName(
            pick(player, "nameJa", "name_ja"),
            pick(player, "name", "name_en"),
            { className: "trending-name-inner" }
          );
          const club = pick(player, "clubJa", "club_name_ja") ?? pick(player, "club", "club_name");
          return (
            `<li class="trending-item">
              <p class="trending-name">${slug ? `<a href="${attr(path(`/players/${slug}`))}">${name}</a>` : name}</p>` +
            (club ? `<p class="trending-club">${escapeHtml(String(club))}</p>` : "") +
            `<p class="trending-meta">${signalBandPill({ band: pick(entry, "band"), label: "移籍" })}` +
            momentumIndicator(pick(entry, "momentum") ?? null) +
            `<span class="meta-dot" aria-hidden="true">・</span>` +
            `<span>出典 ${escapeHtml(String(pick(entry, "sourceCount", "source_count") ?? 0))}件</span></p>
            </li>`
          );
        })
        .join("")}</ol>`
    : emptyState("この日付で上昇中の選手はいません。", {
        hint: "トレンドの算出には、期間内に実測されたシグナルの変動が必要です。",
      });

  const yesterdayBlock = (() => {
    const rows = SECTIONS.map((section) => {
      const now = sectionRows(brief, section.key).length;
      const before = sectionRows(previousBrief, section.key).length;
      const delta = now - before;
      const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
      return (
        `<tr><th scope="row">${escapeHtml(`${section.icon} ${section.label}`)}</th>` +
        `<td>${now}</td><td>${before}</td>` +
        `<td class="delta delta-${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}">${escapeHtml(
          `${sign}${Math.abs(delta)}`
        )}</td></tr>`
      );
    }).join("");

    return (
      `<section class="brief-section" aria-labelledby="yesterday-heading">
        <div class="section-bar">
          <h2 id="yesterday-heading"><span aria-hidden="true">⚡</span> 昨日からの変化</h2>
          <p class="section-blurb">${escapeHtml(`${asOfDate} と ${previousDate} の記録件数の比較。`)}</p>
        </div>
        <div class="scroll-x"><table class="data-table compact-table">
          <thead><tr><th scope="col">カテゴリ</th><th scope="col">当日</th><th scope="col">前日</th><th scope="col">差分</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>`
    );
  })();

  const leagueBlock =
    `<section class="brief-section" aria-labelledby="abroad-heading">
      <div class="section-bar">
        <h2 id="abroad-heading"><span aria-hidden="true">🇯🇵</span> 日本人海外組</h2>
        <p class="section-blurb">リーグ別の追跡人数。各リーグページで所属選手と直近の変化を確認できます。</p>
      </div>
      ${
        leagues.length
          ? `<ul class="league-counts">${leagues
              .map(
                (league) =>
                  `<li><a href="${attr(path(`/leagues/${league.slug}`))}">` +
                  entityName(league.name_ja, league.name_en, { className: "league-name" }) +
                  `<span class="league-count">${league.player_count}人</span></a></li>`
              )
              .join("")}</ul>`
          : emptyState("リーグ別の集計はまだありません。")
      }
    </section>`;

  const sourceBlock =
    `<section class="brief-section" aria-labelledby="sources-heading">
      <div class="section-bar">
        <h2 id="sources-heading"><span aria-hidden="true">📰</span> 収集ソース</h2>
        <p class="section-blurb">現在有効なフィード。記事全文は保存せず、見出しとリンクのみを扱います。</p>
      </div>
      ${
        sources.length
          ? `<ul class="source-strip">${sources
              .map(
                (source) =>
                  `<li class="source-chip tier-chip-${Number(source.tier) || 0}" lang="en">${escapeHtml(
                    String(source.name)
                  )}<span class="source-chip-tier" lang="ja">T${escapeHtml(String(source.tier))}</span></li>`
              )
              .join("")}</ul>`
          : emptyState("有効なソースがありません。")
      }
    </section>`;

  const body =
    `<div class="container dashboard">
      ${terminalBar}
      ${unavailableNotice(ctx.intel)}
      ${headlineBlock}
      ${sectionsHtml}
      <section class="brief-section" aria-labelledby="trending-heading">
        <div class="section-bar">
          <h2 id="trending-heading"><span aria-hidden="true">📈</span> Trending</h2>
          <p class="section-blurb">記事の本数ではなく、実測された移籍シグナルの変動量で並べています。</p>
        </div>
        ${trendingHtml}
      </section>
      ${leagueBlock}
      ${yesterdayBlock}
      ${sourceBlock}
      ${dateNav}
      ${statStrip}
      ${adSlot("dashboard-leaderboard")}
    </div>`;

  return {
    body: renderPage({
      title: `今日の変化 ${asOfDate}`,
      description:
        "海外でプレーする日本人選手について、今日何が変わったかを一画面で。移籍・怪我・契約・出場・日本市場の動きを、" +
        "信頼度と出典つきで毎日更新しています。",
      canonicalPath: path(""),
      origin: ctx.origin,
      current: "",
      noindex: asOfDate !== today,
      bodyClass: "is-dashboard",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// 選手一覧
// ---------------------------------------------------------------------------

function playerRow(row) {
  return (
    `<tr>
      <th scope="row"><a href="${attr(path(`/players/${row.slug}`))}">${entityName(row.name_ja, row.name_en, {
        className: "row-player-name",
      })}</a></th>
      <td>${escapeHtml(String(positionName(row.position) || row.position || "—"))}</td>
      <td>${escapeHtml(String(row.club_name_ja || row.club_name || "未登録"))}</td>
      <td>${
        row.league_slug
          ? `<a href="${attr(path(`/leagues/${row.league_slug}`))}">${escapeHtml(
              String(row.league_name_ja || row.league_name)
            )}</a>`
          : "—"
      }</td>
      <td>${row.transfer_band ? signalBandPill({ band: row.transfer_band }) : '<span class="pill pill-empty">未算出</span>'}</td>
      <td>${row.japan_band ? signalBandPill({ band: row.japan_band }) : '<span class="pill pill-empty">未算出</span>'}</td>
      <td>${
        row.data_status === "seed_unverified"
          ? '<span class="badge badge-unverified">初期登録・未確認</span>'
          : '<span class="badge badge-verified">確認済み</span>'
      }</td>
    </tr>`
  );
}

function playersTable(rows) {
  if (!rows.length) {
    return emptyState("条件に一致する選手はいません。", { hint: "絞り込みを解除するか、リーグから探してください。" });
  }
  return (
    `<div class="scroll-x"><table class="data-table">
      <caption>追跡中の選手 ${rows.length}名。移籍シグナルと日本市場スコアはいずれも算術計算によるバンド表示です。</caption>
      <thead><tr>
        <th scope="col">選手</th><th scope="col">ポジション</th><th scope="col">所属</th>
        <th scope="col">リーグ</th><th scope="col">移籍シグナル</th>
        <th scope="col">日本市場スコア</th><th scope="col">ロースター情報</th>
      </tr></thead>
      <tbody>${rows.map(playerRow).join("")}</tbody>
    </table></div>`
  );
}

function renderPlayerIndex(ctx) {
  const league = String(ctx.query.get("league") ?? "").slice(0, 64);
  const position = String(ctx.query.get("position") ?? "").slice(0, 8).toUpperCase();
  const search = String(ctx.query.get("q") ?? "").slice(0, 64);

  const rows = listPlayers({ league, position, query: search });
  const leagues = listLeagues();
  const positions = listPositions();
  const filtered = Boolean(league || position || search);

  const leagueOptions = leagues
    .map(
      (row) =>
        `<option value="${attr(row.slug)}"${row.slug === league ? " selected" : ""}>${escapeHtml(
          `${row.name_ja || row.name_en}（${row.player_count}人）`
        )}</option>`
    )
    .join("");

  const positionOptions = positions
    .map(
      (row) =>
        `<option value="${attr(row.position)}"${row.position === position ? " selected" : ""}>${escapeHtml(
          `${row.position}・${positionName(row.position) || "ポジション"}`
        )}</option>`
    )
    .join("");

  const body =
    pageIntro({
      eyebrow: "選手一覧",
      title: "日本人海外組",
      lead:
        "追跡中のすべての選手と、現在の移籍シグナル・日本市場スコアのバンド。" +
        "「初期登録・未確認」のロースター情報は、まだ公式ソースとの照合が済んでいません。",
    }) +
    `<div class="container page-body">
      <form class="filter-bar" method="get" action="${attr(path("/players"))}">
        <div class="field">
          <label for="filter-league">リーグ</label>
          <select id="filter-league" name="league"><option value="">すべてのリーグ</option>${leagueOptions}</select>
        </div>
        <div class="field">
          <label for="filter-position">ポジション</label>
          <select id="filter-position" name="position"><option value="">すべてのポジション</option>${positionOptions}</select>
        </div>
        <div class="field">
          <label for="filter-q">名前で検索</label>
          <input type="search" id="filter-q" name="q" value="${attr(search)}" placeholder="例：三笘" />
        </div>
        <button class="button button-primary" type="submit">絞り込む</button>
        ${filtered ? `<a class="text-link" href="${attr(path("/players"))}">条件をクリア</a>` : ""}
      </form>
      ${playersTable(rows)}
      <section class="league-links" aria-labelledby="league-links-heading">
        <h2 id="league-links-heading">リーグから探す</h2>
        <ul class="chip-list">
          ${leagues
            .filter((row) => row.player_count > 0)
            .map(
              (row) =>
                `<li><a class="chip chip-link" href="${attr(path(`/leagues/${row.slug}`))}">${escapeHtml(
                  String(row.name_ja || row.name_en)
                )} <span class="chip-count">${row.player_count}</span></a></li>`
            )
            .join("")}
        </ul>
      </section>
    </div>`;

  return {
    body: renderPage({
      title: "日本人海外組 選手一覧",
      description:
        "海外でプレーする日本人選手の一覧。リーグ・ポジションで絞り込み、移籍シグナルと日本市場スコアのバンドを確認できます。",
      canonicalPath: path("/players"),
      origin: ctx.origin,
      current: "/players",
      noindex: filtered,
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// 選手ページ
// ---------------------------------------------------------------------------

function definitionRow(term, value, { confidence, note } = {}) {
  const chip = confidence ? ` ${confidenceChip(confidence, { compact: true })}` : "";
  return (
    `<div class="def-row"><dt>${escapeHtml(term)}</dt>` +
    `<dd>${value}${chip}${note ? `<span class="def-note">${escapeHtml(note)}</span>` : ""}</dd></div>`
  );
}

function eventList(events, { emptyText }) {
  const rows = Array.isArray(events) ? events : [];
  if (!rows.length) return emptyState(emptyText);

  return `<ul class="event-list">${rows
    .map((event) => {
      const headline =
        preferJa(event, "headlineJa", "headline_ja") ||
        pick(event, "headline", "summary") ||
        "情報を記録";
      const when = pick(event, "occurredAt", "occurred_at", "detectedAt", "detected_at");
      const sources = pick(event, "sources") ?? [];
      return (
        `<li class="event-item">
          <p class="event-headline">${escapeHtml(String(headline))}</p>
          <p class="event-meta">${confidenceChip(pick(event, "confidence"))}` +
        (when ? `<span class="meta-dot" aria-hidden="true">・</span>${timeTag(when)}` : "") +
        `</p>` +
        (Array.isArray(sources) && sources.length
          ? `<details class="event-sources"><summary>出典 ${sources.length}件</summary>${sourceList(sources)}</details>`
          : `<p class="source-empty">この項目の出典は記録されていません。</p>`) +
        `</li>`
      );
    })
    .join("")}</ul>`;
}

/**
 * 要確認事項 is derived, not asserted: each item points at something the data
 * itself says is missing or thin. This is the positioning promise — 判断の前に確認.
 */
function verificationItems({ playerRow: row, dossier }) {
  const items = [];

  if (!row || row.data_status === "seed_unverified") {
    items.push("所属クラブ・ポジション・在籍状況をクラブ公式の情報で確認してください。この行は初期登録データです。");
  }

  const contract = pick(dossier, "contract") || {};
  const contractUntil = pick(contract, "until") ?? row?.contract_until;
  const contractConfidence = normalizeConfidence(pick(contract, "confidence") ?? row?.contract_confidence);
  if (!contractUntil || contractConfidence.rank < 3) {
    items.push("契約満了時期は本サイトでは確定していません。契約内容は直接確認が必要です。");
  }

  const injury = pick(dossier, "injury") || {};
  if (normalizeConfidence(pick(injury, "confidence")).rank < 3) {
    items.push("コンディションと起用可否は、クラブに直接確認が必要です。");
  }

  const clubsLinked = pick(dossier, "transfer")?.clubsLinked ?? [];
  for (const link of Array.isArray(clubsLinked) ? clubsLinked : []) {
    if (normalizeConfidence(pick(link, "confidence")).rank <= 2) {
      items.push(
        `${String(pick(link, "club", "name") ?? "あるクラブ")}との関連は低ティアの報道のみに基づきます。裏付けが取れるまで噂として扱ってください。`
      );
    }
  }

  const japan = pick(dossier, "japanMarket", "japan_market") || {};
  const coverage = Number(pick(japan, "coverage"));
  if (Number.isFinite(coverage) && coverage < config.japanMarketScore.minCoverage) {
    items.push(
      `日本市場スコアは暫定値です。加重入力のうち実測できているのは ${Math.round(coverage * 100)}% にとどまります。`
    );
  }

  items.push("移籍金・給与・フィジカル指標は本サイトの算出対象外です。直接確認してください。");
  return items;
}

function renderPlayerPage(ctx) {
  const slug = String(ctx.params.slug ?? "");
  const row = getPlayerBySlug(slug);

  let dossier = null;
  try {
    dossier = ctx.intel.module.buildPlayerDossier(slug) ?? null;
  } catch (error) {
    ctx.log.error("buildPlayerDossier failed", { slug, error: error?.message || String(error) });
  }

  if (!row && !dossier) return null; // 404, handled by the server

  const player = pick(dossier, "player") || {};
  const nameEn = String(pick(player, "name", "name_en") ?? row?.name_en ?? slug);
  const nameJa = String(pick(player, "nameJa", "name_ja") ?? row?.name_ja ?? "");
  const displayName = nameJa || nameEn;
  const position = pick(player, "position") ?? row?.position ?? "";
  const clubObject = pick(player, "club");
  const clubName =
    (clubObject && typeof clubObject === "object" ? pick(clubObject, "nameJa", "name") : clubObject) ??
    row?.club_name_ja ??
    row?.club_name ??
    "";
  const leagueObject = pick(player, "league");
  const leagueName =
    (leagueObject && typeof leagueObject === "object" ? pick(leagueObject, "nameJa", "name") : leagueObject) ??
    row?.league_name_ja ??
    row?.league_name ??
    "";
  const leagueSlug =
    (leagueObject && typeof leagueObject === "object" ? pick(leagueObject, "slug") : "") ?? row?.league_slug ?? "";
  const dataStatus = pick(player, "dataStatus", "data_status") ?? row?.data_status ?? "seed_unverified";

  const transfer = pick(dossier, "transfer") || {};
  const japan = pick(dossier, "japanMarket", "japan_market") || {};
  const contract = pick(dossier, "contract") || {};
  const injury = pick(dossier, "injury") || {};

  // Without the pipeline module the DB is still the honest source for events.
  const fallbackEvents = dossier ? [] : listPlayerEvents(row?.id ?? 0);
  const fallbackSources = dossier ? [] : listPlayerSources(row?.id ?? 0);
  const timeline = Array.isArray(pick(dossier, "timeline")) ? dossier.timeline : fallbackEvents;
  const allSources = Array.isArray(pick(dossier, "sources")) ? dossier.sources : fallbackSources;
  const clubsLinked = Array.isArray(pick(transfer, "clubsLinked", "clubs_linked"))
    ? (transfer.clubsLinked ?? transfer.clubs_linked)
    : [];

  const basics =
    `<dl class="def-list">
      ${definitionRow(
        "ポジション",
        escapeHtml(String(positionName(position) || position || "未登録")),
        { note: position ? String(position) : undefined }
      )}
      ${definitionRow("所属クラブ", escapeHtml(String(clubName || "未登録")))}
      ${definitionRow(
        "リーグ",
        leagueSlug
          ? `<a href="${attr(path(`/leagues/${leagueSlug}`))}">${escapeHtml(String(leagueName))}</a>`
          : escapeHtml(String(leagueName || "未登録"))
      )}
      ${definitionRow("契約満了", escapeHtml(String(pick(contract, "until") ?? row?.contract_until ?? "未登録")), {
        confidence: pick(contract, "confidence") ?? row?.contract_confidence ?? "unverified",
      })}
      ${definitionRow(
        "代表",
        escapeHtml(String(pick(player, "nationalTeam", "national_team") ?? row?.national_team ?? "未登録")),
        { confidence: "unverified" }
      )}
      ${definitionRow(
        "ロースター情報の状態",
        dataStatus === "seed_unverified"
          ? '<span class="badge badge-unverified">初期登録・未確認</span>'
          : '<span class="badge badge-verified">確認済み</span>'
      )}
    </dl>`;

  const clubsLinkedHtml = clubsLinked.length
    ? `<ul class="linked-clubs">${clubsLinked
        .map(
          (link) =>
            `<li><span class="linked-club-name">${escapeHtml(
              String(pick(link, "clubJa", "club", "name") ?? "クラブ名不明")
            )}</span>` +
            confidenceChip(pick(link, "confidence"), { compact: true }) +
            `<span class="linked-club-count">出典 ${escapeHtml(
              String(pick(link, "sourceCount", "source_count") ?? 0)
            )}件</span>` +
            (Array.isArray(pick(link, "sources")) && link.sources.length
              ? `<details><summary>出典を見る</summary>${sourceList(link.sources)}</details>`
              : "") +
            `</li>`
        )
        .join("")}</ul>`
    : emptyState("関心クラブの記録はありません。");

  const timelineHtml = timeline.length
    ? `<ol class="timeline">${timeline
        .map((entry) => {
          const when = pick(entry, "date", "occurredAt", "occurred_at", "detectedAt", "detected_at");
          const sources = pick(entry, "sources") ?? [];
          const headline =
            preferJa(entry, "headlineJa", "headline_ja") || pick(entry, "headline", "summary") || "情報を記録";
          return (
            `<li class="timeline-item">
              <p class="timeline-date">${when ? timeTag(when) : "日付未記録"}</p>
              <p class="timeline-type">${escapeHtml(String(pick(entry, "type") ?? "event"))}</p>
              <p class="timeline-headline">${escapeHtml(String(headline))}</p>
              <p class="timeline-meta">${confidenceChip(pick(entry, "confidence"))}</p>` +
            (Array.isArray(sources) && sources.length
              ? `<details><summary>出典 ${sources.length}件</summary>${sourceList(sources)}</details>`
              : "") +
            `</li>`
          );
        })
        .join("")}</ol>`
    : emptyState("この選手のタイムラインはまだ記録されていません。");

  const verify = verificationItems({ playerRow: row, dossier });

  const body =
    pageIntro({
      eyebrow: "選手インテリジェンス",
      title: displayName,
      lead:
        (nameJa && nameEn && nameJa !== nameEn
          ? `<span class="head-en" lang="en">${escapeHtml(nameEn)}</span> ・ `
          : "") +
        escapeHtml([positionName(position) || position, clubName, leagueName].filter(Boolean).join(" ・ ")),
      aside:
        `<div class="head-signals">` +
        signalBandPill({ band: pick(transfer, "band") ?? row?.transfer_band, label: "移籍シグナル" }) +
        momentumIndicator(pick(transfer, "momentum") ?? null) +
        `</div>`,
    }) +
    `<div class="container page-body player-page">
      ${unavailableNotice(ctx.intel)}
      ${dataStatusNote(dataStatus)}

      <section aria-labelledby="basics-heading" class="panel">
        <h2 id="basics-heading">基本情報</h2>
        ${basics}
      </section>

      <section aria-labelledby="verify-heading" class="panel panel-verify" id="verify">
        <h2 id="verify-heading">要確認事項</h2>
        <p class="panel-lead">本ページは初期スクリーニングであり、獲得の最終判断ではありません。</p>
        <ul class="verify-list">${verify.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>

      <section aria-labelledby="transfer-heading" class="panel">
        <h2 id="transfer-heading">移籍状況</h2>
        ${scoreMeter({
          label: "移籍シグナル",
          score: pick(transfer, "score") ?? row?.transfer_score,
          band: pick(transfer, "band") ?? row?.transfer_band,
          coverage: pick(transfer, "coverage") ?? row?.transfer_coverage,
          inputs: pick(transfer, "inputs"),
          note: "バンド表示のみです。移籍確率をパーセンテージで示すことはしません。",
        })}
        <h3>関心が報じられたクラブ</h3>
        ${clubsLinkedHtml}
      </section>

      <section aria-labelledby="japan-heading" class="panel">
        <h2 id="japan-heading">日本市場スコア</h2>
        ${scoreMeter({
          label: "日本市場スコア",
          score: pick(japan, "score") ?? row?.japan_score,
          band: pick(japan, "band") ?? row?.japan_band,
          coverage: pick(japan, "coverage") ?? row?.japan_coverage,
          provisional: pick(japan, "provisional") === true,
          inputs: pick(japan, "inputs"),
          note: "競技面の価値と日本市場での価値は別の指標であり、分けて表示しています。",
        })}
      </section>

      <section aria-labelledby="performance-heading" class="panel">
        <h2 id="performance-heading">出場</h2>
        ${eventList(pick(dossier, "performance")?.events ?? fallbackEvents.filter((event) => event.type === "performance"), {
          emptyText: "出場に関する記録はまだありません。",
        })}
      </section>

      <section aria-labelledby="injury-heading" class="panel">
        <h2 id="injury-heading">怪我・出場可否</h2>
        <p class="panel-lead">状態：${escapeHtml(String(pick(injury, "status") ?? "未記録"))} ${confidenceChip(
          pick(injury, "confidence")
        )}</p>
        ${eventList(pick(injury, "events") ?? fallbackEvents.filter((event) => event.type === "injury"), {
          emptyText: "怪我に関する記録はまだありません。",
        })}
      </section>

      <section aria-labelledby="media-heading" class="panel">
        <h2 id="media-heading">メディア</h2>
        ${eventList(pick(dossier, "media")?.events ?? fallbackEvents.filter((event) => event.type === "media"), {
          emptyText: "メディア露出の記録はまだありません。",
        })}
      </section>

      <section aria-labelledby="timeline-heading" class="panel">
        <h2 id="timeline-heading">タイムライン</h2>
        ${timelineHtml}
      </section>

      <section aria-labelledby="sources-heading" class="panel">
        <h2 id="sources-heading">出典</h2>
        <p class="panel-lead">上記のすべての記述はいずれかの出典に紐づきます。見出しとリンクのみで、記事全文は転載しません。</p>
        ${sourceList(allSources, { emptyText: "この選手に紐づく出典はまだ記録されていません。" })}
      </section>

      ${streamingBlock({ league: leagueSlug })}
      ${affiliateBlock({ kind: "club_shirt", player: displayName, club: clubName, league: leagueName })}
      ${affiliateBlock({ kind: "player_goods", player: displayName, club: clubName, league: leagueName })}
      ${adSlot("player-rectangle")}
    </div>`;

  return {
    body: renderPage({
      title: displayName,
      description: `${displayName} の移籍状況・出場可否・日本市場スコア・タイムラインと出典を、それぞれの信頼度つきでまとめています。`,
      canonicalPath: path(`/players/${slug}`),
      origin: ctx.origin,
      current: "/players",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// 移籍レーダー
// ---------------------------------------------------------------------------

function renderTransferRadar(ctx) {
  let rows = [];
  try {
    rows = ctx.intel.module.buildTransferRadar({ limit: 40 }) ?? [];
  } catch (error) {
    ctx.log.error("buildTransferRadar failed", { error: error?.message || String(error) });
  }
  if (!Array.isArray(rows)) rows = [];

  const tableRows = rows
    .map((entry, index) => {
      const player = pick(entry, "player") || {};
      const slug = pick(player, "slug");
      const name = entityName(pick(player, "nameJa", "name_ja"), pick(player, "name", "name_en"), {
        className: "row-player-name",
      });
      const lastChange = pick(entry, "lastChange", "last_change");
      return (
        `<tr>
          <td class="rank">${index + 1}</td>
          <th scope="row">${slug ? `<a href="${attr(path(`/players/${slug}`))}">${name}</a>` : name}</th>
          <td>${escapeHtml(String(pick(player, "clubJa", "club_name_ja") ?? pick(player, "club", "club_name") ?? "—"))}</td>
          <td>${signalBandPill({ band: pick(entry, "band") })}</td>
          <td>${momentumIndicator(pick(entry, "momentum") ?? null)}</td>
          <td>${escapeHtml(String(pick(entry, "clubsLinked", "clubs_linked") ?? 0))}</td>
          <td>${escapeHtml(String(pick(entry, "sourceCount", "source_count") ?? 0))}</td>
          <td>${
            lastChange
              ? `${escapeHtml(
                  String(preferJa(lastChange, "headlineJa", "headline_ja") || pick(lastChange, "headline") || "変化を記録")
                )} ${confidenceChip(pick(lastChange, "confidence"), { compact: true })}`
              : '<span class="missing">変化の記録なし</span>'
          }</td>
        </tr>`
      );
    })
    .join("");

  const body =
    pageIntro({
      eyebrow: "移籍レーダー",
      title: "注視すべき選手",
      lead:
        "実測された移籍シグナルと、その変化の方向で並べています。バンド表示のみで、移籍確率のパーセンテージは出しません。" +
        "データがそれを支えないためです。",
    }) +
    `<div class="container page-body">
      ${unavailableNotice(ctx.intel)}
      ${
        rows.length
          ? `<div class="scroll-x"><table class="data-table">
              <caption>移籍シグナルは、報道量・ソースの質・関心クラブ数・契約状況・選手side のシグナル・クラブ状況からの算術計算です。</caption>
              <thead><tr>
                <th scope="col">#</th><th scope="col">選手</th><th scope="col">所属</th>
                <th scope="col">シグナル</th><th scope="col">変化</th><th scope="col">関心クラブ</th>
                <th scope="col">出典</th><th scope="col">直近の変化</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table></div>`
          : emptyState("移籍シグナルはまだ算出されていません。", {
              hint: "パイプラインが報道を収集・スコアリングすると表示されます。",
            })
      }
    </div>`;

  return {
    body: renderPage({
      title: "移籍レーダー",
      description: "日本人海外組を実測の移籍シグナルと変化量で並べた一覧。出典件数と信頼度つき。",
      canonicalPath: path("/transfer-radar"),
      origin: ctx.origin,
      current: "/transfer-radar",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// リーグページ
// ---------------------------------------------------------------------------

function renderLeaguePage(ctx) {
  const slug = String(ctx.params.slug ?? "");
  const league = getLeagueBySlug(slug);
  if (!league) return null;

  const leagueName = league.name_ja || league.name_en;
  const rows = listPlayers({ league: slug, limit: 500 });
  const changes = listLeagueChanges(league.id, 12);
  const positionCounts = rows.reduce((counts, row) => {
    const key = row.position || "—";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const withSignal = rows.filter((row) => row.transfer_band).length;
  const unverified = rows.filter((row) => row.data_status === "seed_unverified").length;

  const body =
    pageIntro({
      eyebrow: "リーグ",
      title: `${leagueName}の日本人選手`,
      lead: escapeHtml(
        `追跡中${rows.length}名。このリーグの日本での認知度は ${league.jp_visibility}/100 と評価しており、` +
          "日本市場スコアの構成要素のひとつになっています。"
      ),
      aside:
        `<div class="stat-strip stat-strip-compact">
          ${statTile({ label: "追跡中の選手", value: `${rows.length}人` })}
          ${statTile({ label: "シグナル算出済み", value: `${withSignal}人` })}
          ${statTile({ label: "未確認のロースター", value: `${unverified}人`, note: "初期登録データ" })}
        </div>`,
    }) +
    `<div class="container page-body">
      <section aria-labelledby="squad-heading" class="panel">
        <h2 id="squad-heading">所属選手</h2>
        ${playersTable(rows)}
      </section>

      <section aria-labelledby="shape-heading" class="panel">
        <h2 id="shape-heading">ポジション構成</h2>
        <ul class="chip-list">
          ${Object.entries(positionCounts)
            .sort((a, b) => b[1] - a[1])
            .map(
              ([code, count]) =>
                `<li><a class="chip chip-link" href="${attr(
                  `${path("/players")}?league=${encodeURIComponent(slug)}&position=${encodeURIComponent(code)}`
                )}">${escapeHtml(positionName(code) || code)} <span class="chip-count">${count}</span></a></li>`
            )
            .join("")}
        </ul>
      </section>

      <section aria-labelledby="league-changes-heading" class="panel">
        <h2 id="league-changes-heading">直近の変化</h2>
        ${
          changes.length
            ? `<div class="change-grid">${changes
                .map((change) =>
                  changeCard(
                    {
                      ...change,
                      player: {
                        slug: change.player_slug,
                        name_en: change.player_name,
                        name_ja: change.player_name_ja,
                        position: change.position,
                        league: leagueName,
                      },
                    },
                    { headingLevel: 3 }
                  )
                )
                .join("")}</div>`
            : emptyState("このリーグの選手に関する変化はまだ記録されていません。")
        }
      </section>

      ${streamingBlock({ league: slug })}
      ${affiliateBlock({ kind: "club_shirt", league: leagueName })}
      ${adSlot("league-rectangle")}
    </div>`;

  return {
    body: renderPage({
      title: `${leagueName}の日本人選手`,
      description: `${leagueName}でプレーする日本人選手の一覧。移籍シグナル・日本市場スコアのバンドと、直近の記録された変化。`,
      canonicalPath: path(`/leagues/${slug}`),
      origin: ctx.origin,
      current: "/players",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// このサイトについて
// ---------------------------------------------------------------------------

function renderAbout(ctx) {
  const ladder = [
    ["confirmed", "クラブ・リーグ・協会の公式ソースが完了した事実として発表している。"],
    ["strongly_reported", "独立したティア1報道機関2社以上（別ソース・別ドメイン）が報じている。"],
    ["reported", "ティア1報道機関1社、または信頼できるメディア2社以上が報じている。"],
    ["rumored", "信頼できるメディア1社のみの報道で、裏付けがない。"],
    ["unverified", "アグリゲーター、SNS、または単一の低ティア言及のみ。事実として扱わない。"],
  ];

  const body =
    pageIntro({
      eyebrow: "このサイトについて",
      title: "何をするサイトで、何をしないサイトか",
      lead:
        "海外でプレーする日本人選手に関する膨大な情報を、日付と出典のついた少数の「変化」に変換しています。" +
        "判断を代行するサービスではありません。",
    }) +
    `<div class="container page-body prose">
      <section aria-labelledby="is-heading" class="panel">
        <h2 id="is-heading">できること</h2>
        <ul>
          <li>海外組の選手ごとに、今日何が変わったかを毎日記録する。</li>
          <li>日本側の文脈を、実務で使える言葉に翻訳する。</li>
          <li>出場可否や契約状況など、判断前に確認すべき項目を明示する。</li>
          <li>最初の絞り込みを、狭く・速くする。</li>
        </ul>
      </section>

      <section aria-labelledby="isnt-heading" class="panel">
        <h2 id="isnt-heading">できないこと・やらないこと</h2>
        <ul>
          <li>ニュースアグリゲーターでも、汎用のスカウティングDBでもありません。</li>
          <li>代理人・仲介業ではなく、映像スカウティングサービスでもありません。</li>
          <li>獲得の最終判断は示しません。「この選手を獲得すべき」と書くページはありません。</li>
          <li>移籍確率のパーセンテージは出しません。示すのはバンドだけです。</li>
        </ul>
      </section>

      <section aria-labelledby="confidence-heading" class="panel" id="confidence">
        <h2 id="confidence-heading">信頼度の考え方</h2>
        <p>
          すべての記述は5段階の信頼度と、最低1件の出典を持ちます。信頼度は最良のソースのティアが定める上限を
          超えられません。アグリゲーターがいくつ同じ話を繰り返しても、それは「未確認」のままです。
          独立とは、別のソースかつ別のドメインであることを指し、アグリゲーターは独立件数に数えません。
        </p>
        <div class="scroll-x"><table class="data-table">
          <thead><tr><th scope="col">段階</th><th scope="col">成立条件</th></tr></thead>
          <tbody>${ladder
            .map(([key, rule]) => `<tr><th scope="row">${confidenceChip(key)}</th><td>${escapeHtml(rule)}</td></tr>`)
            .join("")}</tbody>
        </table></div>
      </section>

      <section aria-labelledby="scores-heading" class="panel" id="scores">
        <h2 id="scores-heading">スコアの算出方法</h2>
        <p>
          2つのスコアはいずれも算術計算です。AIは記事から事実を抽出することはありますが、スコア・確率・
          信頼性の数値を生成することは一切ありません。構成要素と重みは各選手ページで公開しています。
        </p>
        <h3>移籍シグナル</h3>
        <p>
          報道量、ソースの質、関心クラブ数、契約状況の圧力、選手side のシグナル、クラブ状況の加重和です。
          古い報道は半減期${escapeHtml(String(config.transferSignal.halfLifeDays))}日で減衰し、対象期間は
          ${escapeHtml(String(config.transferSignal.windowDays))}日間。出力は 低 / 中 / 高 / 非常に高い のバンドです。
        </p>
        <h3>日本市場スコア</h3>
        <p>
          日本のSNSフォロワーと成長率、日本メディアでの露出、日本国内の検索関心度、代表での重要度、
          リーグの日本での認知度の加重和です。欠けている入力は推定で埋めず、除外してカバレッジを下げます。
          カバレッジが${escapeHtml(String(Math.round(config.japanMarketScore.minCoverage * 100)))}%を下回る場合は
          暫定値として明示します。
        </p>
      </section>

      <section aria-labelledby="data-heading" class="panel" id="data">
        <h2 id="data-heading">データの出どころと、未確認の範囲</h2>
        <p>
          ソースはRSSと公式フィードで、信頼性によってティア分けしています。保存するのはメタデータ・見出し・
          リンク・短い事実要約のみで、記事全文を転載することはありません。すべての記述は元記事へリンクします。
        </p>
        <p class="notice notice-seed">
          <strong>ご注意：</strong>初期の選手リスト（所属クラブ・ポジション・在籍・契約の各項目）は作業用リストから
          登録したもので、<strong>人による確認が済むまで未確認です</strong>。該当する行はサイト全体で
          「初期登録・未確認」と表示しています。確定情報として扱わないでください。
        </p>
      </section>

      <section aria-labelledby="corrections-heading" class="panel" id="corrections">
        <h2 id="corrections-heading">訂正ポリシー</h2>
        <ul>
          <li>影響の大きい項目と信頼度の低い項目は、公開前に内部のレビューキューを通します。</li>
          <li>報道が否定された場合は削除ではなく信頼度を下げ、タイムラインには両方の記録を残します。</li>
          <li>誤りがあればページを取り繕うのではなく、元データを直します。</li>
          <li>訂正のご連絡は <a href="mailto:scout@ai-orchestra.work">scout@ai-orchestra.work</a> まで、選手名とページURLを添えてお送りください。</li>
        </ul>
        <p>移籍可能性は直接確認が必要です。移籍金・給与・フィジカル指標は本システムの出力ではなく、要確認事項です。</p>
      </section>
    </div>`;

  return {
    body: renderPage({
      title: "このサイトについて",
      description:
        "日本サッカー・インテリジェンスが何をするサイトか、信頼度の5段階、移籍シグナルと日本市場スコアの算出方法、訂正ポリシー。",
      canonicalPath: path("/about"),
      origin: ctx.origin,
      current: "/about",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// robots.txt / sitemap.xml
// ---------------------------------------------------------------------------

function renderRobots(ctx) {
  const origin = ctx.origin || "";
  const lines = [
    "User-agent: *",
    `Allow: ${path("")}`,
    `Disallow: ${path("/admin")}`,
    `Disallow: ${path("/api")}`,
    "",
    origin ? `Sitemap: ${origin}${path("/sitemap.xml")}` : "",
  ];

  return { type: "text/plain; charset=utf-8", body: `${lines.join("\n")}\n` };
}

function renderSitemap(ctx) {
  const origin = ctx.origin || "";
  const today = todayInTimezone();
  const entries = [
    { loc: path(""), changefreq: "daily", priority: "1.0" },
    { loc: path("/players"), changefreq: "daily", priority: "0.9" },
    { loc: path("/transfer-radar"), changefreq: "daily", priority: "0.8" },
    { loc: path("/about"), changefreq: "monthly", priority: "0.4" },
    ...listLeagues()
      .filter((league) => league.player_count > 0)
      .map((league) => ({ loc: path(`/leagues/${league.slug}`), changefreq: "weekly", priority: "0.7" })),
    ...listPlayers({ limit: 1000 }).map((player) => ({
      loc: path(`/players/${player.slug}`),
      changefreq: "daily",
      priority: "0.8",
    })),
  ];

  const urls = entries
    .map(
      (entry) =>
        `  <url><loc>${escapeHtml(`${origin}${entry.loc}`)}</loc><lastmod>${escapeHtml(
          today
        )}</lastmod><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`
    )
    .join("\n");

  return {
    type: "application/xml; charset=utf-8",
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  };
}

export function registerPublicRoutes(router) {
  router.get("/", renderDailyBrief);
  router.get("/players", renderPlayerIndex);
  router.get("/players/:slug", renderPlayerPage);
  router.get("/transfer-radar", renderTransferRadar);
  router.get("/leagues/:slug", renderLeaguePage);
  router.get("/about", renderAbout);
  router.get("/robots.txt", renderRobots);
  router.get("/sitemap.xml", renderSitemap);
  return router;
}

export default { registerPublicRoutes };
