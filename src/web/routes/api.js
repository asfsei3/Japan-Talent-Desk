/**
 * JSON API — a thin read layer over the same functions the public pages use.
 *
 * No separate query logic lives here: every handler calls `ctx.intel.module`
 * or `src/web/data.js`, exactly like `routes/public.js`, so the API can never
 * disagree with what the page shows. Handlers return `{ status, body }`; the
 * server dispatcher (`src/web/server.js`) serialises `body` as JSON.
 */
import {
  getLeagueBySlug,
  getPlayerBySlug,
  listLeagues,
  listPlayers,
} from "../data.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(status, data) {
  return { status, body: data };
}

function safeDate(value, fallback) {
  return ISO_DATE.test(String(value ?? "")) ? String(value) : fallback;
}

function playerSummary(row) {
  return {
    slug: row.slug,
    nameJa: row.name_ja,
    nameEn: row.name_en,
    position: row.position,
    club: row.club_name ?? row.club_name_ja ?? null,
    league: row.league_name ?? null,
    transferBand: row.transfer_band ?? null,
    japanMarketBand: row.japan_band ?? null,
  };
}

function health(ctx) {
  return json(200, {
    ok: true,
    service: "japan-football-intelligence",
    intelligenceAvailable: ctx.intel.available,
    time: new Date().toISOString(),
  });
}

function changesToday(ctx) {
  const date = safeDate(ctx.query.get("date"), undefined);
  try {
    const brief = ctx.intel.module.buildDailyBrief(date ? { asOfDate: date } : {});
    return json(200, { ok: true, data: brief });
  } catch (error) {
    ctx.log.error("api changesToday failed", { error: error?.message || String(error) });
    return json(503, { ok: false, message: "Daily brief is not available right now." });
  }
}

function playersIndex(ctx) {
  const league = String(ctx.query.get("league") ?? "").slice(0, 64) || undefined;
  const position = String(ctx.query.get("position") ?? "").slice(0, 8).toUpperCase() || undefined;
  const limit = Math.min(Number(ctx.query.get("limit")) || 100, 500);
  const rows = listPlayers({ league, position, limit });
  return json(200, { ok: true, count: rows.length, data: rows.map(playerSummary) });
}

function playerDetail(ctx) {
  const slug = String(ctx.params.slug ?? "");
  const player = getPlayerBySlug(slug);
  if (!player) return json(404, { ok: false, message: "Player not found." });

  try {
    const dossier = ctx.intel.module.buildPlayerDossier(slug);
    return json(200, { ok: true, data: dossier ?? { player } });
  } catch (error) {
    ctx.log.error("api playerDetail failed", { slug, error: error?.message || String(error) });
    return json(200, { ok: true, degraded: true, data: { player } });
  }
}

function leaguesIndex() {
  return json(200, { ok: true, data: listLeagues() });
}

function leagueDetail(ctx) {
  const slug = String(ctx.params.slug ?? "");
  const league = getLeagueBySlug(slug);
  if (!league) return json(404, { ok: false, message: "League not found." });
  return json(200, { ok: true, data: league });
}

function transferRadar(ctx) {
  try {
    const rows = ctx.intel.module.buildTransferRadar({ limit: 40 });
    return json(200, { ok: true, count: rows?.length ?? 0, data: rows ?? [] });
  } catch (error) {
    ctx.log.error("api transferRadar failed", { error: error?.message || String(error) });
    return json(503, { ok: false, message: "Transfer radar is not available right now." });
  }
}

export function registerApiRoutes(router) {
  router.get("/api/health", health);
  router.get("/api/changes", changesToday);
  router.get("/api/players", playersIndex);
  router.get("/api/players/:slug", playerDetail);
  router.get("/api/leagues", leaguesIndex);
  router.get("/api/leagues/:slug", leagueDetail);
  router.get("/api/transfer-radar", transferRadar);
  return router;
}

export default { registerApiRoutes };
