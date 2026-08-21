import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
  affiliateConfigFromEnv,
  affiliateDisclosure,
  decodeTrip,
  engineCapabilities,
  planTrip,
} from "./engine/index.js";
import { checkBasicAuth } from "./src/lib/basic-auth.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const envPath = join(root, ".env");

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf8");

  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const { config } = await import("./src/config/index.js");

/**
 * The Japan Football Intelligence product is mounted under `config.basePath`
 * (default `/intel`) so the deployed Japan Talent Desk landing page at `/` is
 * untouched. Loading it lazily keeps the static site serving even if the
 * intelligence layer fails to start.
 */
let intelHandler = null;
let intelHandlerFailedAt = 0;
// A startup failure is retried after a cooldown instead of being cached
// forever — a transient issue (e.g. a briefly locked SQLite file) at the
// very first request must not disable /intel for the rest of the process.
const INTEL_RETRY_COOLDOWN_MS = 30_000;

async function getIntelHandler() {
  if (intelHandler) return intelHandler;
  if (intelHandler === false && Date.now() - intelHandlerFailedAt < INTEL_RETRY_COOLDOWN_MS) {
    return false;
  }

  try {
    const { createRequestHandler } = await import("./src/web/server.js");
    intelHandler = createRequestHandler();
  } catch (error) {
    console.error("Japan Football Intelligence routes unavailable:", error?.message || error);
    intelHandler = false;
    intelHandlerFailedAt = Date.now();
  }

  return intelHandler;
}

const port = Number(process.env.PORT || 3000);
const brevoApiKey = process.env.BREVO_API_KEY;
const brevoNewsletterListId = Number(process.env.BREVO_LIST_ID_JAPAN_MARKET_WEEKLY || 0);

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function resolvePath(urlPath) {
  const cleanPath = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  if (cleanPath === "/") {
    return join(root, "index.html");
  }

  const directPath = join(root, cleanPath);

  if (existsSync(directPath) && statSync(directPath).isDirectory()) {
    return join(directPath, "index.html");
  }

  if (!extname(directPath)) {
    const directoryIndexPath = join(root, cleanPath, "index.html");

    if (existsSync(directoryIndexPath)) {
      return directoryIndexPath;
    }
  }

  return directPath;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 100_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createBrevoContact(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = httpsRequest(
      "https://api.brevo.com/v3/contacts",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let raw = "";

        response.on("data", (chunk) => {
          raw += chunk;
        });

        response.on("end", () => {
          let data = null;

          if (raw) {
            try {
              data = JSON.parse(raw);
            } catch {
              data = raw;
            }
          }

          resolve({
            ok: (response.statusCode || 500) >= 200 && (response.statusCode || 500) < 300,
            statusCode: response.statusCode || 500,
            data,
          });
        });
      }
    );

    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function handleNewsletterSignup(request, response) {
  if (!brevoApiKey || !brevoNewsletterListId) {
    sendJson(response, 503, {
      ok: false,
      message: "Newsletter signup is not configured yet.",
    });
    return;
  }

  let payload;

  try {
    const rawBody = await readRequestBody(request);
    payload = JSON.parse(rawBody || "{}");
  } catch {
    sendJson(response, 400, {
      ok: false,
      message: "Invalid request body.",
    });
    return;
  }

  const firstName = String(payload.firstName || "").trim();
  const club = String(payload.club || "").trim();
  const role = String(payload.role || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const website = String(payload.website || "").trim();

  // Quietly accept bot submissions to avoid giving the spammer feedback.
  if (website) {
    sendJson(response, 200, {
      ok: true,
      message: "Thanks. You are on the list.",
    });
    return;
  }

  if (!isValidEmail(email)) {
    sendJson(response, 400, {
      ok: false,
      message: "Please enter a valid email address.",
    });
    return;
  }

  try {
    const attributes = {};

    if (firstName) {
      attributes.FIRSTNAME = firstName;
    }

    if (club) {
      attributes.CLUB = club;
    }

    if (role) {
      attributes.ROLE = role;
    }

    const brevoResponse = await createBrevoContact({
      email,
      attributes,
      listIds: [brevoNewsletterListId],
      updateEnabled: true,
    });

    if (!brevoResponse.ok) {
      const brevoError =
        brevoResponse.data && typeof brevoResponse.data === "object"
          ? brevoResponse.data
          : null;
      const message =
        brevoError?.message ||
        "Brevo signup failed. Please check the API key and list ID.";

      sendJson(response, 502, {
        ok: false,
        message,
      });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      message: "Thanks. You are on the Japan Market Weekly list.",
    });
  } catch {
    sendJson(response, 502, {
      ok: false,
      message: "Could not reach Brevo right now. Please try again.",
    });
  }
}

const MAX_TRIP_TEXT_LENGTH = 2000;

function respondWithPlan(response, text, overrides) {
  const plan = planTrip(text, {
    overrides,
    affiliateConfig: affiliateConfigFromEnv(),
  });

  sendJson(response, 200, {
    ok: true,
    request: plan.request,
    result: plan.result,
    shareToken: plan.shareToken,
    disclosure: affiliateDisclosure,
  });
}

async function handleTravelPlan(request, response) {
  let payload;

  try {
    const rawBody = await readRequestBody(request);
    payload = JSON.parse(rawBody || "{}");
  } catch {
    sendJson(response, 400, { ok: false, message: "Invalid request body." });
    return;
  }

  const text = String(payload.text || "").slice(0, MAX_TRIP_TEXT_LENGTH).trim();
  const overrides = payload.overrides && typeof payload.overrides === "object" ? payload.overrides : {};

  if (!text && Object.keys(overrides).length === 0) {
    sendJson(response, 400, {
      ok: false,
      message: "旅行の希望を入力してください。 / Please describe the trip you want.",
    });
    return;
  }

  respondWithPlan(response, text, overrides);
}

function handleSharedTrip(response, token) {
  const overrides = decodeTrip(token);

  if (!overrides) {
    sendJson(response, 404, { ok: false, message: "この共有リンクは読み取れませんでした。 / This shared link could not be read." });
    return;
  }

  respondWithPlan(response, "", overrides);
}

/**
 * Operator portal: one page linking to every product on this domain plus the
 * sibling Payment Intelligence portal on ai-orchestra, so the one person
 * running all of this doesn't have to remember URLs. Gated the same way as
 * JFI's own /intel/admin — 404 (not a login prompt) when JFI_ADMIN_PASSWORD
 * is unset, so the route's existence isn't confirmed to an unauthenticated
 * caller, and reuses the same credential rather than adding a second
 * password to manage.
 */
function opsPortalPage() {
  const links = [
    {
      name: "Japan Talent Desk",
      href: "/",
      note: "公開LP・ニュースレター登録（B2B、欧州クラブ向け）",
    },
    {
      name: "Japan Football Intelligence（JFI）",
      href: config.basePath,
      note: "無料の一般消費者向けダッシュボード（海外組の日本人選手動向）",
    },
    {
      name: "JFI 運用ダッシュボード",
      href: `${config.basePath}/admin`,
      note: "収集ジョブの状態・手動実行（同じ認証情報）",
    },
    {
      name: "Travel Decision Engine",
      href: "/travel/",
      note: "旅行先の自動推薦ツール",
    },
  ];

  const rows = links
    .map(
      (link) => `
        <li class="card">
          <a href="${link.href}">${link.name}</a>
          <p>${link.note}</p>
        </li>`
    )
    .join("");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex, nofollow" />
<title>Ops Portal — Japan Talent Desk group</title>
<style>
  body { font-family: system-ui, -apple-system, "Noto Sans JP", sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1.5rem; color: #1a2330; }
  h1 { font-size: 1.4rem; }
  ul { list-style: none; padding: 0; display: grid; gap: 0.75rem; }
  .card { border: 1px solid #d8dee6; border-radius: 8px; padding: 0.9rem 1.1rem; }
  .card a { font-weight: 600; text-decoration: none; color: #14324f; }
  .card a:hover { text-decoration: underline; }
  .card p { margin: 0.35rem 0 0; color: #55606e; font-size: 0.92rem; }
  .external { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #d8dee6; }
</style>
</head>
<body>
  <h1>Japan Talent Desk group — Ops Portal</h1>
  <ul>${rows}</ul>
  <div class="external">
    <p>決済インテリジェンス事業（AI Orchestra / Payment Intelligence）は別ドメイン:</p>
    <ul><li class="card"><a href="https://ai-orchestra.work/admin">ai-orchestra.work/admin</a></li></ul>
  </div>
</body>
</html>`;
}

function handleOpsPortal(request, response) {
  if (!config.admin.enabled) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  if (!checkBasicAuth(request.headers.authorization, config.admin.user, config.admin.password)) {
    response.writeHead(401, {
      "content-type": "text/plain; charset=utf-8",
      "www-authenticate": 'Basic realm="jtd-ops"',
    });
    response.end("Authentication required.");
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(opsPortalPage());
}

createServer((request, response) => {
  const requestPath = (request.url || "/").split("?")[0];

  if (requestPath === "/ops") {
    handleOpsPortal(request, response);
    return;
  }

  if (request.method === "POST" && requestPath === "/api/travel/plan") {
    handleTravelPlan(request, response).catch((error) => {
      console.error("Trip planning failed unexpectedly:", error);
      sendJson(response, 500, { ok: false, message: "Trip planning failed unexpectedly." });
    });
    return;
  }

  if (request.method === "GET" && requestPath === "/api/travel/plan") {
    const token = new URLSearchParams((request.url || "").split("?")[1] || "").get("t");
    handleSharedTrip(response, token);
    return;
  }

  if (request.method === "GET" && requestPath === "/api/travel/meta") {
    sendJson(response, 200, { ok: true, ...engineCapabilities() });
    return;
  }

  if (requestPath === config.basePath || requestPath.startsWith(`${config.basePath}/`)) {
    getIntelHandler()
      .then((handler) => {
        if (!handler) {
          response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
          response.end("Japan Football Intelligence is not available.");
          return;
        }
        handler(request, response);
      })
      .catch((error) => {
        console.error("Intelligence route failed:", error);
        if (!response.headersSent) {
          response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        }
        response.end("Internal error");
      });
    return;
  }

  if (request.method === "POST" && request.url === "/api/newsletter") {
    handleNewsletterSignup(request, response).catch((error) => {
      console.error("Newsletter signup failed unexpectedly:", error);
      sendJson(response, 500, {
        ok: false,
        message: "Newsletter signup failed unexpectedly.",
      });
    });
    return;
  }

  const filePath = resolvePath(request.url || "/");

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    "content-type": types[extname(filePath)] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Japan Talent Desk site + Travel Decision Engine running on port ${port} · JFI mounted at ${config.basePath}`);
});
