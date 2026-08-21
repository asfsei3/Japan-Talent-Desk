/**
 * Polite HTTP client for source collection.
 *
 * Compliance behaviour is built in rather than left to callers: identifying
 * user agent, per-host rate limiting, robots.txt checks, conditional GETs and a
 * response size cap.
 */
import { config } from "../config/index.js";
import { createLogger } from "./logger.js";

const log = createLogger("http");
const lastRequestByHost = new Map();
const robotsCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(host) {
  const last = lastRequestByHost.get(host) ?? 0;
  const wait = config.http.perHostDelayMs - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  lastRequestByHost.set(host, Date.now());
}

async function readCapped(response) {
  const reader = response.body?.getReader?.();
  if (!reader) return await response.text();

  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > config.http.maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeded ${config.http.maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

/**
 * @returns {Promise<{ok:boolean,status:number,body:string,headers:Headers|null,notModified:boolean,error:string|null}>}
 */
export async function fetchText(url, options = {}) {
  const { etag, lastModified, accept = "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8" } = options;
  const target = new URL(url);
  const retries = options.retries ?? config.http.retries;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await throttle(target.host);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.http.timeoutMs);

    try {
      const headers = {
        "user-agent": config.http.userAgent,
        accept,
        "accept-language": options.acceptLanguage ?? "en,ja;q=0.9",
      };
      if (etag) headers["if-none-match"] = etag;
      if (lastModified) headers["if-modified-since"] = lastModified;

      const response = await fetch(target, { headers, signal: controller.signal, redirect: "follow" });

      if (response.status === 304) {
        return { ok: true, status: 304, body: "", headers: response.headers, notModified: true, error: null };
      }

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = response.ok ? await readCapped(response) : "";
      return {
        ok: response.ok,
        status: response.status,
        body,
        headers: response.headers,
        notModified: false,
        error: response.ok ? null : `HTTP ${response.status}`,
      };
    } catch (error) {
      const message = error?.name === "AbortError" ? "timeout" : error?.message || String(error);
      if (attempt === retries) {
        log.warn("fetch failed", { url, error: message });
        return { ok: false, status: 0, body: "", headers: null, notModified: false, error: message };
      }
      await sleep(500 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, status: 0, body: "", headers: null, notModified: false, error: "unreachable" };
}

/** Very small robots.txt evaluator: enough to honour explicit disallows. */
export async function isAllowedByRobots(url) {
  if (!config.http.respectRobots) return { allowed: true, checked: false };

  const target = new URL(url);
  const origin = target.origin;
  let rules = robotsCache.get(origin);

  if (!rules) {
    const response = await fetchText(`${origin}/robots.txt`, { accept: "text/plain", retries: 0 });
    rules = parseRobots(response.ok ? response.body : "");
    robotsCache.set(origin, rules);
  }

  return { allowed: pathAllowed(rules, target.pathname), checked: true };
}

export function parseRobots(text) {
  const groups = [];
  let current = null;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawField, ...rest] = line.split(":");
    const field = rawField.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (field === "user-agent") {
      if (!current || current.hasRules) {
        current = { agents: [], disallow: [], allow: [], hasRules: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (field === "disallow" || field === "allow")) {
      current.hasRules = true;
      if (value) current[field].push(value);
      else if (field === "disallow") current.allow.push("/");
    }
  }

  return groups;
}

export function pathAllowed(groups, path) {
  const agentName = config.http.userAgent.split("/")[0].toLowerCase();
  const specific = groups.find((group) => group.agents.some((agent) => agentName.includes(agent) && agent !== "*"));
  const wildcard = groups.find((group) => group.agents.includes("*"));
  const group = specific ?? wildcard;
  if (!group) return true;

  const matchLength = (patterns) =>
    patterns.reduce((best, pattern) => {
      const prefix = pattern.replace(/\*.*$/, "");
      return path.startsWith(prefix) ? Math.max(best, prefix.length) : best;
    }, -1);

  const disallow = matchLength(group.disallow);
  const allow = matchLength(group.allow);
  if (disallow === -1) return true;
  return allow >= disallow;
}

export default { fetchText, isAllowedByRobots, parseRobots, pathAllowed };
