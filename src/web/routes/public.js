/**
 * The public product.
 *
 * The home page is deliberately not a news list. It leads with what moved, per
 * player, with confidence and source count attached — the blueprint's "What
 * Changed Today". Everything else exists to answer the follow-up questions:
 * who is this player, how reliable is this, and what should be verified next.
 */
import { config } from "../../config/index.js";
import { escapeHtml } from "../../lib/text.js";
import { dateDaysAgo, todayInTimezone } from "../../lib/time.js";
import {
  attr,
  changeCard,
  confidenceChip,
  dataStatusNote,
  emptyState,
  jstDateTime,
  momentumIndicator,
  normalizeConfidence,
  pick,
  positionName,
  safeUrl,
  scoreMeter,
  signalBandPill,
  sourceList,
  statTile,
  timeTag,
} from "../components.js";
import {
  getLeagueBySlug,
  getPlayerBySlug,
  listLeagueChanges,
  listLeagues,
  listPlayerEvents,
  listPlayerSources,
  listPlayers,
  listPositions,
} from "../data.js";
import { originFrom, path, renderPage } from "../layout.js";

const SECTIONS = [
  { key: "transfer", label: "Transfer", blurb: "Movement in transfer signal, new club links and reported approaches." },
  { key: "injury", label: "Injury", blurb: "Availability changes. Availability should be verified directly with the club." },
  { key: "contract", label: "Contract", blurb: "Contract context. Contract status requires direct confirmation." },
  { key: "performance", label: "Performance", blurb: "Recent first-team rhythm as reported by sources." },
  { key: "market", label: "Japan market", blurb: "Japanese media, search and audience movement." },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function safeDate(value, fallback) {
  return ISO_DATE.test(String(value ?? "")) ? String(value) : fallback;
}

function shiftDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Rows come from either the pipeline module or raw SQL; accept both spellings. */
function sectionRows(brief, key) {
  const sections = pick(brief, "sections") || {};
  const rows = sections[key] ?? sections[`${key}Changes`] ?? [];
  return Array.isArray(rows) ? rows : [];
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
    `<p class="notice notice-degraded"><strong>Intelligence layer not running.</strong> ` +
    `The change-detection pipeline has not produced output on this deployment yet, so nothing is ` +
    `shown below rather than something guessed at.</p>`
  );
}

// ---------------------------------------------------------------------------
// What Changed Today
// ---------------------------------------------------------------------------

function renderDailyBrief(ctx) {
  const today = todayInTimezone();
  const asOfDate = safeDate(ctx.query.get("date"), today);

  let brief = null;
  try {
    brief = ctx.intel.module.buildDailyBrief({ asOfDate });
  } catch (error) {
    ctx.log.error("buildDailyBrief failed", { error: error?.message || String(error) });
  }

  const counts = pick(brief, "counts") || {};
  const updatedAt = pick(brief, "updatedAt", "updated_at");
  const trending = Array.isArray(pick(brief, "trending")) ? brief.trending : [];
  const totalChanges = SECTIONS.reduce((sum, section) => sum + sectionRows(brief, section.key).length, 0);

  const dateNav =
    `<form class="date-nav" method="get" action="${attr(path(""))}">
      <a class="date-step" href="${attr(`${path("")}?date=${shiftDate(asOfDate, -1)}`)}" rel="prev">← Previous day</a>
      <div class="field field-inline">
        <label for="date">Show changes for</label>
        <input type="date" id="date" name="date" value="${attr(asOfDate)}" max="${attr(today)}" />
      </div>
      <button class="button button-primary" type="submit">View</button>
      ${asOfDate < today ? `<a class="date-step" href="${attr(`${path("")}?date=${shiftDate(asOfDate, 1)}`)}" rel="next">Next day →</a>` : ""}
    </form>`;

  const statStrip =
    `<div class="stat-strip">
      ${statTile({ label: "Changes recorded", value: counts.changes ?? totalChanges })}
      ${statTile({ label: "Players tracked", value: counts.players ?? "—" })}
      ${statTile({ label: "Sources enabled", value: counts.sources ?? "—" })}
      ${statTile({ label: "Articles seen", value: counts.articles ?? "—", note: "Headline and link only" })}
    </div>`;

  const sectionsHtml = SECTIONS.map((section) => {
    const rows = sectionRows(brief, section.key);
    const cards = rows.map((row) => changeCard(row, { headingLevel: 3 })).join("");
    return (
      `<section class="brief-section" id="${attr(section.key)}" aria-labelledby="${attr(`${section.key}-heading`)}">
        <div class="section-bar">
          <h2 id="${attr(`${section.key}-heading`)}">${escapeHtml(section.label)}</h2>
          <p class="section-blurb">${escapeHtml(section.blurb)}</p>
          <p class="section-count">${rows.length} change${rows.length === 1 ? "" : "s"}</p>
        </div>
        ${rows.length ? `<div class="change-grid">${cards}</div>` : emptyState(`No ${section.label.toLowerCase()} changes recorded for this date.`)}
      </section>`
    );
  }).join("");

  const trendingHtml = trending.length
    ? `<ol class="trending-list">${trending
        .map((entry) => {
          const player = pick(entry, "player") || {};
          const slug = pick(player, "slug");
          const name = escapeHtml(String(pick(player, "name", "name_en") ?? "Unnamed player"));
          const nameJa = pick(player, "nameJa", "name_ja");
          const club = pick(player, "club", "club_name");
          return (
            `<li class="trending-item">
              <p class="trending-name">${slug ? `<a href="${attr(path(`/players/${slug}`))}">${name}</a>` : name}` +
            (nameJa ? ` <span lang="ja" class="trending-ja">${escapeHtml(String(nameJa))}</span>` : "") +
            `</p>` +
            (club ? `<p class="trending-club">${escapeHtml(String(club))}</p>` : "") +
            `<p class="trending-meta">${signalBandPill({ band: pick(entry, "band"), label: "Transfer" })}` +
            momentumIndicator(pick(entry, "momentum") ?? null) +
            `<span class="meta-dot" aria-hidden="true">·</span>` +
            `<span>${escapeHtml(String(pick(entry, "sourceCount", "source_count") ?? 0))} sources</span></p>
            </li>`
          );
        })
        .join("")}</ol>`
    : emptyState("No trending players for this date.", {
        hint: "Trending needs at least one measured signal movement in the window.",
      });

  const body =
    pageIntro({
      eyebrow: "What changed",
      title: "What changed today",
      lead:
        "Not a news list. Per player: what moved, how strong the evidence is, and how many independent " +
        "sources carry it. Everything here is an initial screen, not a final recruitment recommendation.",
      aside: statStrip,
    }) +
    `<div class="container page-body">
      ${unavailableNotice(ctx.intel)}
      <p class="brief-stamp">Showing ${timeTag(`${asOfDate}T00:00:00Z`)}${
        updatedAt ? ` · last updated ${escapeHtml(jstDateTime(updatedAt))}` : " · no pipeline run recorded for this date"
      }</p>
      ${dateNav}
      ${totalChanges === 0 ? emptyState("No changes recorded for this date.", { hint: "Try an earlier date, or check the pipeline has run." }) : ""}
      ${sectionsHtml}
      <section class="brief-section" id="trending" aria-labelledby="trending-heading">
        <div class="section-bar">
          <h2 id="trending-heading">Trending players</h2>
          <p class="section-blurb">Ranked by movement in transfer signal, not by article volume.</p>
        </div>
        ${trendingHtml}
      </section>
    </div>`;

  return {
    body: renderPage({
      title: `What changed — ${asOfDate}`,
      description:
        "Daily record of what changed for Japanese players abroad: transfer, injury, contract, performance " +
        "and Japan-market movement, each with confidence and sources.",
      canonicalPath: path(""),
      origin: ctx.origin,
      current: "",
      noindex: asOfDate !== today,
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// Player index
// ---------------------------------------------------------------------------

function playerRow(row) {
  const name = escapeHtml(String(row.name_en));
  return (
    `<tr>
      <th scope="row"><a href="${attr(path(`/players/${row.slug}`))}">${name}</a>` +
    (row.name_ja ? ` <span lang="ja" class="row-ja">${escapeHtml(String(row.name_ja))}</span>` : "") +
    `</th>
      <td>${escapeHtml(String(row.position ?? "—"))}<span class="cell-note">${escapeHtml(positionName(row.position))}</span></td>
      <td>${escapeHtml(String(row.club_name ?? "Not recorded"))}</td>
      <td>${row.league_slug ? `<a href="${attr(path(`/leagues/${row.league_slug}`))}">${escapeHtml(String(row.league_name))}</a>` : "—"}</td>
      <td>${row.transfer_band ? signalBandPill({ band: row.transfer_band }) : '<span class="pill pill-empty">Not computed</span>'}</td>
      <td>${row.japan_band ? signalBandPill({ band: row.japan_band }) : '<span class="pill pill-empty">Not computed</span>'}</td>
      <td>${row.data_status === "seed_unverified" ? '<span class="badge badge-unverified">Seed, unverified</span>' : '<span class="badge badge-verified">Verified</span>'}</td>
    </tr>`
  );
}

function playersTable(rows) {
  if (!rows.length) {
    return emptyState("No players match these filters.", { hint: "Clear a filter, or browse by league." });
  }
  return (
    `<div class="scroll-x"><table class="data-table">
      <caption>${rows.length} tracked player${rows.length === 1 ? "" : "s"}. Transfer and Japan Market bands are arithmetic, never model-generated prose.</caption>
      <thead><tr>
        <th scope="col">Player</th><th scope="col">Position</th><th scope="col">Club</th>
        <th scope="col">League</th><th scope="col">Transfer signal</th>
        <th scope="col">Japan Market Score</th><th scope="col">Roster data</th>
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
          String(row.name_en)
        )} (${row.player_count})</option>`
    )
    .join("");

  const positionOptions = positions
    .map(
      (row) =>
        `<option value="${attr(row.position)}"${row.position === position ? " selected" : ""}>${escapeHtml(
          `${row.position} — ${positionName(row.position) || "Position"}`
        )}</option>`
    )
    .join("");

  const body =
    pageIntro({
      eyebrow: "Player index",
      title: "Japanese players abroad",
      lead:
        "Every player the desk tracks, with the current transfer signal band and Japan Market Score band. " +
        "Roster rows marked as seed data have not been checked against an official source yet.",
    }) +
    `<div class="container page-body">
      <form class="filter-bar" method="get" action="${attr(path("/players"))}">
        <div class="field">
          <label for="filter-league">League</label>
          <select id="filter-league" name="league"><option value="">All leagues</option>${leagueOptions}</select>
        </div>
        <div class="field">
          <label for="filter-position">Position</label>
          <select id="filter-position" name="position"><option value="">All positions</option>${positionOptions}</select>
        </div>
        <div class="field">
          <label for="filter-q">Name contains</label>
          <input type="search" id="filter-q" name="q" value="${attr(search)}" placeholder="e.g. Mitoma" />
        </div>
        <button class="button button-primary" type="submit">Apply filters</button>
        ${filtered ? `<a class="text-link" href="${attr(path("/players"))}">Clear</a>` : ""}
      </form>
      ${playersTable(rows)}
      <section class="league-links" aria-labelledby="league-links-heading">
        <h2 id="league-links-heading">Browse by league</h2>
        <ul class="chip-list">
          ${leagues
            .filter((row) => row.player_count > 0)
            .map(
              (row) =>
                `<li><a class="chip chip-link" href="${attr(path(`/leagues/${row.slug}`))}">${escapeHtml(
                  String(row.name_en)
                )} <span class="chip-count">${row.player_count}</span></a></li>`
            )
            .join("")}
        </ul>
      </section>
    </div>`;

  return {
    body: renderPage({
      title: "Japanese players abroad",
      description:
        "Index of Japanese players tracked abroad, filterable by league and position, each with transfer " +
        "signal and Japan Market Score bands.",
      canonicalPath: path("/players"),
      origin: ctx.origin,
      current: "/players",
      noindex: filtered,
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// Player intelligence page
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
      const headline = String(pick(event, "headline", "summary") ?? "Event recorded");
      const when = pick(event, "occurredAt", "occurred_at", "detectedAt", "detected_at");
      const sources = pick(event, "sources") ?? [];
      return (
        `<li class="event-item">
          <p class="event-headline">${escapeHtml(headline)}</p>
          <p class="event-meta">${confidenceChip(pick(event, "confidence"))}` +
        (when ? `<span class="meta-dot" aria-hidden="true">·</span>${timeTag(when)}` : "") +
        `</p>` +
        (Array.isArray(sources) && sources.length
          ? `<details class="event-sources"><summary>Sources (${sources.length})</summary>${sourceList(sources)}</details>`
          : `<p class="source-empty">No source recorded for this entry.</p>`) +
        `</li>`
      );
    })
    .join("")}</ul>`;
}

/**
 * "What to verify next" is derived, not asserted: each item points at something
 * the data itself says is missing or thin. This is the positioning promise —
 * verification before verdict.
 */
function verificationItems({ playerRow: row, dossier }) {
  const items = [];

  if (!row || row.data_status === "seed_unverified") {
    items.push("Confirm current club, position and squad status against the club's official channel. This roster row is seed data.");
  }

  const contract = pick(dossier, "contract") || {};
  const contractUntil = pick(contract, "until") ?? row?.contract_until;
  const contractConfidence = normalizeConfidence(pick(contract, "confidence") ?? row?.contract_confidence);
  if (!contractUntil || contractConfidence.rank < 3) {
    items.push("Contract end date is not confirmed here. Contract status requires direct confirmation.");
  }

  const injury = pick(dossier, "injury") || {};
  if (normalizeConfidence(pick(injury, "confidence")).rank < 3) {
    items.push("Current fitness and squad availability should be verified directly with the club.");
  }

  const clubsLinked = pick(dossier, "transfer", "transfers")?.clubsLinked ?? [];
  for (const link of Array.isArray(clubsLinked) ? clubsLinked : []) {
    if (normalizeConfidence(pick(link, "confidence")).rank <= 2) {
      items.push(
        `The link to ${String(pick(link, "club", "name") ?? "an unnamed club")} rests on low-tier reporting only. Treat it as a rumour until corroborated.`
      );
    }
  }

  const japan = pick(dossier, "japanMarket", "japan_market") || {};
  const coverage = Number(pick(japan, "coverage"));
  if (Number.isFinite(coverage) && coverage < config.japanMarketScore.minCoverage) {
    items.push(
      `The Japan Market Score is provisional: only ${Math.round(coverage * 100)}% of its weighted inputs are measured.`
    );
  }

  items.push("Transfer fee, salary expectation and physical benchmarks are not modelled here and should be verified directly.");
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
  const name = String(pick(player, "name", "name_en") ?? row?.name_en ?? slug);
  const nameJa = pick(player, "nameJa", "name_ja") ?? row?.name_ja ?? "";
  const position = pick(player, "position") ?? row?.position ?? "";
  const clubName = pick(pick(player, "club") || {}, "name") ?? pick(player, "club") ?? row?.club_name ?? "";
  const leagueName = pick(pick(player, "league") || {}, "name") ?? pick(player, "league") ?? row?.league_name ?? "";
  const leagueSlug = pick(pick(player, "league") || {}, "slug") ?? row?.league_slug ?? "";
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
    ? transfer.clubsLinked ?? transfer.clubs_linked
    : [];

  const basics =
    `<dl class="def-list">
      ${definitionRow("Position", escapeHtml(String(position || "Not recorded")), {
        note: positionName(position) || undefined,
      })}
      ${definitionRow("Club", escapeHtml(String(clubName || "Not recorded")))}
      ${definitionRow(
        "League",
        leagueSlug
          ? `<a href="${attr(path(`/leagues/${leagueSlug}`))}">${escapeHtml(String(leagueName))}</a>`
          : escapeHtml(String(leagueName || "Not recorded"))
      )}
      ${definitionRow(
        "Contract until",
        escapeHtml(String(pick(contract, "until") ?? row?.contract_until ?? "Not recorded")),
        { confidence: pick(contract, "confidence") ?? row?.contract_confidence ?? "unverified" }
      )}
      ${definitionRow(
        "National team",
        escapeHtml(String(pick(player, "nationalTeam", "national_team") ?? row?.national_team ?? "Not recorded")),
        { confidence: "unverified" }
      )}
      ${definitionRow("Roster data status", dataStatus === "seed_unverified" ? '<span class="badge badge-unverified">Seed, unverified</span>' : '<span class="badge badge-verified">Verified</span>')}
    </dl>`;

  const clubsLinkedHtml = clubsLinked.length
    ? `<ul class="linked-clubs">${clubsLinked
        .map(
          (link) =>
            `<li><span class="linked-club-name">${escapeHtml(String(pick(link, "club", "name") ?? "Unnamed club"))}</span>` +
            confidenceChip(pick(link, "confidence"), { compact: true }) +
            `<span class="linked-club-count">${escapeHtml(String(pick(link, "sourceCount", "source_count") ?? 0))} sources</span>` +
            (Array.isArray(pick(link, "sources")) && link.sources.length
              ? `<details><summary>Provenance</summary>${sourceList(link.sources)}</details>`
              : "") +
            `</li>`
        )
        .join("")}</ul>`
    : emptyState("No club link recorded.");

  const timelineHtml = timeline.length
    ? `<ol class="timeline">${timeline
        .map((entry) => {
          const when = pick(entry, "date", "occurredAt", "occurred_at", "detectedAt", "detected_at");
          const sources = pick(entry, "sources") ?? [];
          return (
            `<li class="timeline-item">
              <p class="timeline-date">${when ? timeTag(when) : "Date not recorded"}</p>
              <p class="timeline-type">${escapeHtml(String(pick(entry, "type") ?? "event"))}</p>
              <p class="timeline-headline">${escapeHtml(String(pick(entry, "headline", "summary") ?? "Event recorded"))}</p>
              <p class="timeline-meta">${confidenceChip(pick(entry, "confidence"))}</p>` +
            (Array.isArray(sources) && sources.length
              ? `<details><summary>Sources (${sources.length})</summary>${sourceList(sources)}</details>`
              : "") +
            `</li>`
          );
        })
        .join("")}</ol>`
    : emptyState("No timeline entries recorded for this player yet.");

  const verify = verificationItems({ playerRow: row, dossier });

  const body =
    pageIntro({
      eyebrow: "Player intelligence",
      title: name,
      lead:
        (nameJa ? `<span lang="ja" class="head-ja">${escapeHtml(String(nameJa))}</span> · ` : "") +
        escapeHtml([position, clubName, leagueName].filter(Boolean).join(" · ")),
      aside:
        `<div class="head-signals">` +
        signalBandPill({ band: pick(transfer, "band") ?? row?.transfer_band, label: "Transfer signal" }) +
        momentumIndicator(pick(transfer, "momentum") ?? null) +
        `</div>`,
    }) +
    `<div class="container page-body player-page">
      ${unavailableNotice(ctx.intel)}
      ${dataStatusNote(dataStatus)}

      <section aria-labelledby="basics-heading" class="panel">
        <h2 id="basics-heading">Basics</h2>
        ${basics}
      </section>

      <section aria-labelledby="verify-heading" class="panel panel-verify" id="verify">
        <h2 id="verify-heading">What to verify next</h2>
        <p class="panel-lead">This is an initial role-specific screen, not a final recruitment recommendation.</p>
        <ul class="verify-list">${verify.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>

      <section aria-labelledby="transfer-heading" class="panel">
        <h2 id="transfer-heading">Transfer state</h2>
        ${scoreMeter({
          label: "Transfer signal",
          score: pick(transfer, "score") ?? row?.transfer_score,
          band: pick(transfer, "band") ?? row?.transfer_band,
          coverage: pick(transfer, "coverage") ?? row?.transfer_coverage,
          inputs: pick(transfer, "inputs"),
          note: "Bands only. This product does not publish a transfer probability percentage.",
        })}
        <h3>Clubs linked</h3>
        ${clubsLinkedHtml}
      </section>

      <section aria-labelledby="japan-heading" class="panel">
        <h2 id="japan-heading">Japan Market Score</h2>
        ${scoreMeter({
          label: "Japan Market Score",
          score: pick(japan, "score") ?? row?.japan_score,
          band: pick(japan, "band") ?? row?.japan_band,
          coverage: pick(japan, "coverage") ?? row?.japan_coverage,
          provisional: pick(japan, "provisional") === true,
          inputs: pick(japan, "inputs"),
          note: "Football value and Japan market value are different measures and are shown separately.",
        })}
      </section>

      <section aria-labelledby="performance-heading" class="panel">
        <h2 id="performance-heading">Performance</h2>
        ${eventList(pick(dossier, "performance")?.events ?? fallbackEvents.filter((e) => e.type === "performance"), {
          emptyText: "No performance entries recorded yet.",
        })}
      </section>

      <section aria-labelledby="injury-heading" class="panel">
        <h2 id="injury-heading">Injury and availability</h2>
        <p class="panel-lead">Status: ${escapeHtml(String(pick(injury, "status") ?? "Not recorded"))} ${confidenceChip(
          pick(injury, "confidence")
        )}</p>
        ${eventList(pick(injury, "events") ?? fallbackEvents.filter((e) => e.type === "injury"), {
          emptyText: "No injury entries recorded yet.",
        })}
      </section>

      <section aria-labelledby="media-heading" class="panel">
        <h2 id="media-heading">Media</h2>
        ${eventList(pick(dossier, "media")?.events ?? fallbackEvents.filter((e) => e.type === "media"), {
          emptyText: "No media entries recorded yet.",
        })}
      </section>

      <section aria-labelledby="timeline-heading" class="panel">
        <h2 id="timeline-heading">Timeline</h2>
        ${timelineHtml}
      </section>

      <section aria-labelledby="sources-heading" class="panel">
        <h2 id="sources-heading">Sources</h2>
        <p class="panel-lead">Every claim above traces to one of these. Headlines and links only — full articles are not reproduced.</p>
        ${sourceList(allSources, { emptyText: "No sources recorded for this player yet." })}
      </section>
    </div>`;

  return {
    body: renderPage({
      title: name,
      description: `Japan-side intelligence on ${name}: transfer state, availability, Japan Market Score, timeline and sources, each with a confidence level.`,
      canonicalPath: path(`/players/${slug}`),
      origin: ctx.origin,
      current: "/players",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// Transfer radar
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
      const name = escapeHtml(String(pick(player, "name", "name_en") ?? "Unnamed player"));
      const lastChange = pick(entry, "lastChange", "last_change");
      return (
        `<tr>
          <td class="rank">${index + 1}</td>
          <th scope="row">${slug ? `<a href="${attr(path(`/players/${slug}`))}">${name}</a>` : name}` +
        (pick(player, "nameJa", "name_ja")
          ? ` <span lang="ja" class="row-ja">${escapeHtml(String(pick(player, "nameJa", "name_ja")))}</span>`
          : "") +
        `</th>
          <td>${escapeHtml(String(pick(player, "club", "club_name") ?? "—"))}</td>
          <td>${signalBandPill({ band: pick(entry, "band") })}</td>
          <td>${momentumIndicator(pick(entry, "momentum") ?? null)}</td>
          <td>${escapeHtml(String(pick(entry, "clubsLinked", "clubs_linked") ?? 0))}</td>
          <td>${escapeHtml(String(pick(entry, "sourceCount", "source_count") ?? 0))}</td>
          <td>${
            lastChange
              ? `${escapeHtml(String(pick(lastChange, "headline") ?? "Change recorded"))} ${confidenceChip(
                  pick(lastChange, "confidence"),
                  { compact: true }
                )}`
              : '<span class="missing">No change recorded</span>'
          }</td>
        </tr>`
      );
    })
    .join("");

  const body =
    pageIntro({
      eyebrow: "Transfer radar",
      title: "Profiles to monitor",
      lead:
        "Ranked by measured transfer signal and its direction of travel. Bands only — this product does not " +
        "publish a transfer probability percentage, because the data does not support one.",
    }) +
    `<div class="container page-body">
      ${unavailableNotice(ctx.intel)}
      ${
        rows.length
          ? `<div class="scroll-x"><table class="data-table">
              <caption>Transfer signal is arithmetic from report volume, source quality, clubs linked, contract pressure, player-side signal and club situation.</caption>
              <thead><tr>
                <th scope="col">#</th><th scope="col">Player</th><th scope="col">Club</th>
                <th scope="col">Signal</th><th scope="col">Momentum</th><th scope="col">Clubs linked</th>
                <th scope="col">Sources</th><th scope="col">Last change</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table></div>`
          : emptyState("No transfer signal has been computed yet.", {
              hint: "The radar populates once the pipeline has collected and scored reports.",
            })
      }
    </div>`;

  return {
    body: renderPage({
      title: "Transfer radar",
      description:
        "Japanese players abroad ranked by measured transfer signal and momentum, with source counts and confidence.",
      canonicalPath: path("/transfer-radar"),
      origin: ctx.origin,
      current: "/transfer-radar",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// League page
// ---------------------------------------------------------------------------

function renderLeaguePage(ctx) {
  const slug = String(ctx.params.slug ?? "");
  const league = getLeagueBySlug(slug);
  if (!league) return null;

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
      eyebrow: "League",
      title: `Japanese players in the ${league.name_en}`,
      lead: escapeHtml(
        `${rows.length} tracked player${rows.length === 1 ? "" : "s"}. Japan visibility for this league is rated ${
          league.jp_visibility
        }/100, which feeds one component of the Japan Market Score.`
      ),
      aside:
        `<div class="stat-strip stat-strip-compact">
          ${statTile({ label: "Tracked players", value: rows.length })}
          ${statTile({ label: "With a computed signal", value: withSignal })}
          ${statTile({ label: "Roster rows unverified", value: unverified, note: "Seed data" })}
        </div>`,
    }) +
    `<div class="container page-body">
      <section aria-labelledby="squad-heading" class="panel">
        <h2 id="squad-heading">Players</h2>
        ${playersTable(rows)}
      </section>

      <section aria-labelledby="shape-heading" class="panel">
        <h2 id="shape-heading">Positional shape</h2>
        <ul class="chip-list">
          ${Object.entries(positionCounts)
            .sort((a, b) => b[1] - a[1])
            .map(
              ([code, count]) =>
                `<li><a class="chip chip-link" href="${attr(
                  `${path("/players")}?league=${encodeURIComponent(slug)}&position=${encodeURIComponent(code)}`
                )}">${escapeHtml(code)} <span class="chip-count">${count}</span></a></li>`
            )
            .join("")}
        </ul>
      </section>

      <section aria-labelledby="league-changes-heading" class="panel">
        <h2 id="league-changes-heading">Recent recorded changes</h2>
        ${
          changes.length
            ? `<div class="change-grid">${changes
                .map((row) =>
                  changeCard(
                    {
                      ...row,
                      player: {
                        slug: row.player_slug,
                        name: row.player_name,
                        nameJa: row.player_name_ja,
                        position: row.position,
                        league: league.name_en,
                      },
                    },
                    { headingLevel: 3 }
                  )
                )
                .join("")}</div>`
            : emptyState("No changes recorded for players in this league yet.")
        }
      </section>
    </div>`;

  return {
    body: renderPage({
      title: `Japanese players in the ${league.name_en}`,
      description: `Japanese players tracked in the ${league.name_en}, with transfer signal bands, Japan Market Score bands and recent recorded changes.`,
      canonicalPath: path(`/leagues/${slug}`),
      origin: ctx.origin,
      current: "/players",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

function renderAbout(ctx) {
  const ladder = [
    ["Confirmed", "An official club, league or federation source states a completed action."],
    ["Strongly reported", "Two or more independent tier-1 reporting sources, on different domains."],
    ["Reported", "One tier-1 reporting source, or two or more credible media sources."],
    ["Rumored", "A single credible-media report, with nothing corroborating it."],
    ["Unverified", "Aggregator, social or single low-tier mention only. Never treat as fact."],
  ];

  const body =
    pageIntro({
      eyebrow: "About",
      title: "What this is, and what it is not",
      lead:
        "Japan Football Intelligence turns thousands of scattered information points about Japanese players " +
        "abroad into a small number of dated, sourced changes. It is a Japan-side context layer, not a verdict machine.",
    }) +
    `<div class="container page-body prose">
      <section aria-labelledby="is-heading" class="panel">
        <h2 id="is-heading">What it is</h2>
        <ul>
          <li>A daily record of what changed for Japanese players abroad, per player.</li>
          <li>A Japan-side context layer that translates local sources into practical club language.</li>
          <li>A recruitment risk filter: availability questions, deal realism, and what still needs verifying.</li>
          <li>An initial role-specific screen, meant to make the next conversation narrower.</li>
        </ul>
      </section>

      <section aria-labelledby="isnt-heading" class="panel">
        <h2 id="isnt-heading">What it is not</h2>
        <ul>
          <li>Not a football news aggregator, and not a generic scouting database.</li>
          <li>Not an agent or broker, and not a video scouting service.</li>
          <li>Not a final recruitment recommendation. No page here says "sign this player".</li>
          <li>Not a source of transfer probabilities. Bands, never percentages.</li>
        </ul>
      </section>

      <section aria-labelledby="confidence-heading" class="panel" id="confidence">
        <h2 id="confidence-heading">How confidence works</h2>
        <p>
          Every claim carries one of five levels and at least one source. A claim can never exceed the
          ceiling of its best source tier: an aggregator can only ever produce an unverified claim, no
          matter how many aggregators repeat it. Independence means a different source and a different
          domain; aggregators never count towards it.
        </p>
        <div class="scroll-x"><table class="data-table">
          <thead><tr><th scope="col">Level</th><th scope="col">What it takes</th></tr></thead>
          <tbody>${ladder
            .map(
              ([label, rule]) =>
                `<tr><th scope="row">${confidenceChip(label.toLowerCase().replace(/\s+/g, "_"))}</th><td>${escapeHtml(
                  rule
                )}</td></tr>`
            )
            .join("")}</tbody>
        </table></div>
      </section>

      <section aria-labelledby="scores-heading" class="panel" id="scores">
        <h2 id="scores-heading">How the scores are computed</h2>
        <p>
          Both scores are arithmetic. A language model may extract facts from an article; it never
          produces a score, a probability or a reliability figure. Every component and its weight is
          shown on the player page.
        </p>
        <h3>Transfer signal</h3>
        <p>
          Weighted from report volume, source quality, clubs linked, contract pressure, player-side signal
          and club situation. Older reports decay with a ${escapeHtml(
            String(config.transferSignal.halfLifeDays)
          )}-day half-life over a ${escapeHtml(String(config.transferSignal.windowDays))}-day window.
          Output is a band: LOW, MEDIUM, HIGH or VERY HIGH.
        </p>
        <h3>Japan Market Score</h3>
        <p>
          Weighted from Japanese social audience and growth, Japanese media mentions, Japanese search
          interest, national-team relevance and the league's visibility in Japan. A missing input is
          excluded and reduces the coverage figure rather than being guessed. Below
          ${escapeHtml(String(Math.round(config.japanMarketScore.minCoverage * 100)))}% coverage the score
          is published as provisional and labelled as such.
        </p>
      </section>

      <section aria-labelledby="data-heading" class="panel" id="data">
        <h2 id="data-heading">Where the data comes from, and what is unverified</h2>
        <p>
          Sources are RSS and official feeds, tiered by reliability. Only metadata, headline, link and a
          short factual summary are stored — full articles are never reproduced, and every claim links
          back to the original.
        </p>
        <p class="notice notice-seed">
          <strong>Be aware:</strong> the initial player roster — club, position, squad and contract fields —
          was seeded from a working list and is <strong>unverified until a human checks it</strong>. Rows in
          that state are labelled "Seed, unverified" throughout the product. Do not treat them as confirmed.
        </p>
      </section>

      <section aria-labelledby="corrections-heading" class="panel" id="corrections">
        <h2 id="corrections-heading">Correction policy</h2>
        <ul>
          <li>High-impact and low-confidence items go to an internal review queue before they carry weight.</li>
          <li>If a source is contradicted, the claim is downgraded rather than deleted, and the timeline keeps both entries.</li>
          <li>If we get something wrong, tell us and it is corrected at source, not patched at the page.</li>
          <li>Corrections go to <a href="mailto:scout@ai-orchestra.work">scout@ai-orchestra.work</a> with the player and the page.</li>
        </ul>
        <p>
          Availability should be verified directly. Transfer fee, salary and physical benchmarks are
          verification items, not outputs of this system.
        </p>
      </section>
    </div>`;

  return {
    body: renderPage({
      title: "About",
      description:
        "What Japan Football Intelligence is and is not, how its confidence levels work, how the transfer " +
        "signal and Japan Market Score are computed, and the correction policy.",
      canonicalPath: path("/about"),
      origin: ctx.origin,
      current: "/about",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// robots.txt and sitemap.xml
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
  ].filter((line) => line !== undefined);

  return { type: "text/plain; charset=utf-8", body: `${lines.join("\n")}\n` };
}

function renderSitemap(ctx) {
  const origin = ctx.origin || "";
  const today = todayInTimezone();
  const entries = [
    { loc: path(""), changefreq: "daily", priority: "1.0" },
    { loc: path("/players"), changefreq: "daily", priority: "0.9" },
    { loc: path("/transfer-radar"), changefreq: "daily", priority: "0.9" },
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

export default { registerPublicRoutes, originFrom, safeUrl };
