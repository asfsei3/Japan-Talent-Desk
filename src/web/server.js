/**
 * The `/intel` HTTP surface: router wiring, request dispatch, and the
 * in-process scheduler (`10-architecture.md` "Primary: in-process tick").
 *
 * `createRequestHandler()` is what `server.js` at the repo root imports and
 * mounts under `config.basePath` alongside the static Japan Talent Desk site —
 * see that file's `getIntelHandler()`. `startServer()` is only for running
 * this layer standalone (`npm run jfi -- serve`), which is convenient for
 * local development and is not the Railway deployment path.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { config, rootDir } from "../config/index.js";
import { migrate } from "../db/client.js";
import { createLogger } from "../lib/logger.js";
import { getIntelligence } from "./data.js";
import { createRouter } from "./router.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerPublicRoutes } from "./routes/public.js";
import { runPipelineTick } from "./scheduler.js";

const log = createLogger("web");

let migrated = false;
function ensureSchema() {
  if (migrated) return;
  migrate();
  migrated = true;
}

function buildRouter() {
  const router = createRouter({ basePath: config.basePath });
  registerPublicRoutes(router);
  registerApiRoutes(router);
  registerAdminRoutes(router);
  return router;
}

function notFoundPage() {
  return (
    "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\" />" +
    "<title>ページが見つかりません｜日本サッカー・インテリジェンス</title></head>" +
    "<body><h1>ページが見つかりません</h1><p>お探しのページは存在しないか、移動しました。</p>" +
    `<p><a href="${config.basePath}">トップに戻る</a></p></body></html>`
  );
}

function sendText(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers });
  response.end(body);
}

function sendResult(response, status, result) {
  const headers = { "cache-control": "no-store", ...(result?.headers ?? {}) };
  const body = result?.body;

  if (typeof body === "string") {
    response.writeHead(status, { "content-type": result?.type ?? "text/html; charset=utf-8", ...headers });
    response.end(body);
    return;
  }

  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body ?? null));
}

let tickStarted = false;

/** One handler instance backs every request; the tick starts the first time it is built. */
export function createRequestHandler() {
  ensureSchema();
  const router = buildRouter();

  if (!tickStarted) {
    tickStarted = true;
    startScheduler();
  }

  return async function handleRequest(request, response) {
    let url;
    try {
      url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    } catch {
      sendText(response, 400, "Bad request");
      return;
    }

    const pathname = url.pathname;

    // Admin is 404, not 401, when no password is configured: a route that
    // answers "unauthorized" still confirms the path exists.
    const adminPrefix = `${config.basePath}/admin`;
    if ((pathname === adminPrefix || pathname.startsWith(`${adminPrefix}/`)) && !config.admin.enabled) {
      sendText(response, 404, "Not found");
      return;
    }

    const { handler, params, allowed } = router.match(request.method ?? "GET", pathname);

    if (!handler) {
      if (allowed?.length) {
        sendText(response, 405, `Method not allowed. Allowed: ${allowed.join(", ")}`, { allow: allowed.join(", ") });
        return;
      }
      response.writeHead(404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(notFoundPage());
      return;
    }

    const intel = await getIntelligence();

    const ctx = {
      request,
      response,
      params,
      query: url.searchParams,
      origin: `${url.protocol}//${url.host}`,
      log,
      intel,
    };

    try {
      const result = await handler(ctx);
      if (result === null || result === undefined) {
        response.writeHead(404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(notFoundPage());
        return;
      }
      sendResult(response, result.status ?? 200, result);
    } catch (error) {
      log.error("request handler failed", { pathname, error: error?.message || String(error) });
      if (!response.headersSent) sendText(response, 500, "Internal error");
      else response.end();
    }
  };
}

function startScheduler() {
  if (config.env === "test") return; // tests drive the pipeline explicitly

  const CHECK_INTERVAL_MS = 60_000;
  const firedSlots = new Set();

  setInterval(() => {
    runPipelineTick({ firedSlots, log }).catch((error) => {
      log.error("scheduler tick failed", { error: error?.message || String(error) });
    });
  }, CHECK_INTERVAL_MS).unref();

  log.info("scheduler started", { checkIntervalMs: CHECK_INTERVAL_MS });
}

const STATIC_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
};

/**
 * `/assets/*` only — the standalone server is for local JFI development, not
 * a general static site host. The Railway deployment path is the root
 * `server.js`, which already serves the whole repo and mounts this module's
 * `createRequestHandler()` under `config.basePath`; duplicating that here
 * would be two static-file implementations to keep in sync for no reason.
 */
function serveAsset(request, response) {
  const pathname = (request.url ?? "/").split("?")[0];
  if (!pathname.startsWith("/assets/")) return false;

  const cleanPath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(rootDir, cleanPath);
  if (!filePath.startsWith(join(rootDir, "assets")) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    return false;
  }

  response.writeHead(200, {
    "content-type": STATIC_TYPES[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "public, max-age=3600",
  });
  createReadStream(filePath).pipe(response);
  return true;
}

export function startServer() {
  const handler = createRequestHandler();
  createServer((request, response) => {
    if (serveAsset(request, response)) return;
    handler(request, response);
  }).listen(config.port, () => {
    log.info("JFI standalone server listening", { port: config.port, basePath: config.basePath });
  });
}

export default { createRequestHandler, startServer };
