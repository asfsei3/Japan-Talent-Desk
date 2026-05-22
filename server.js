import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

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
  const requestPath = cleanPath === "/" ? "/index.html" : cleanPath;
  return join(root, requestPath);
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

createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/newsletter") {
    handleNewsletterSignup(request, response);
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
  console.log(`Japan Talent Desk static site running on port ${port}`);
});
