/**
 * The HTML document shell.
 *
 * Server-rendered strings, no build step, no client framework. The only
 * external request is the Google Fonts stylesheet the Japan Talent Desk landing
 * page already loads, so the intelligence pages are a sibling of that design
 * rather than a stranger to it.
 */
import { config } from "../config/index.js";
import { escapeHtml } from "../lib/text.js";
import { attr } from "./components.js";

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap";

export const NAV = [
  { href: "", label: "What changed" },
  { href: "/players", label: "Players" },
  { href: "/transfer-radar", label: "Transfer radar" },
  { href: "/about", label: "About" },
];

export function path(suffix = "") {
  return `${config.basePath}${suffix}`;
}

/** Canonical origin comes from config; the request host is only a fallback. */
export function originFrom(request) {
  if (config.canonicalOrigin) return config.canonicalOrigin.replace(/\/$/, "");
  const host = String(request?.headers?.host ?? "").replace(/[^\w.:\-]/g, "");
  if (!host) return "";
  const proto = String(request?.headers?.["x-forwarded-proto"] ?? "").split(",")[0].trim() || "http";
  return `${/^https?$/.test(proto) ? proto : "http"}://${host}`;
}

function metaTag(name, content, { property = false } = {}) {
  if (!content) return "";
  return `<meta ${property ? "property" : "name"}="${attr(name)}" content="${attr(content)}" />`;
}

function navHtml(current) {
  return NAV.map((item) => {
    const href = path(item.href);
    const isCurrent = current === item.href || (item.href === "" && current === "/");
    return `<a href="${attr(href)}"${isCurrent ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`;
  }).join("");
}

/**
 * @param {object} options
 * @param {string} options.title      Page <title>, without the site suffix.
 * @param {string} options.body       Pre-escaped HTML for <main>.
 * @param {string} [options.description]
 * @param {string} [options.canonicalPath] Path (including base path) for the canonical URL.
 * @param {boolean} [options.noindex] Admin and query-filtered pages set this.
 */
export function renderPage({
  title,
  body,
  description = "",
  canonicalPath = "",
  origin = "",
  current = "",
  noindex = false,
  bodyClass = "",
  headExtra = "",
} = {}) {
  const fullTitle = `${title} | ${config.siteName}`;
  const canonical = origin && canonicalPath ? `${origin}${canonicalPath}` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(fullTitle)}</title>
    ${metaTag("description", description)}
    ${noindex ? '<meta name="robots" content="noindex, nofollow" />' : ""}
    ${canonical ? `<link rel="canonical" href="${attr(canonical)}" />` : ""}
    <meta name="theme-color" content="#0f241b" />
    ${metaTag("og:type", "website", { property: true })}
    ${metaTag("og:site_name", config.siteName, { property: true })}
    ${metaTag("og:title", fullTitle, { property: true })}
    ${metaTag("og:description", description, { property: true })}
    ${canonical ? metaTag("og:url", canonical, { property: true }) : ""}
    ${metaTag("twitter:card", "summary")}
    ${metaTag("twitter:title", fullTitle)}
    ${metaTag("twitter:description", description)}
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${attr(FONTS_HREF)}" rel="stylesheet" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/assets/intel.css" />
    ${headExtra}
  </head>
  <body class="intel-body${bodyClass ? ` ${attr(bodyClass)}` : ""}">
    <a class="skip-link" href="#main">Skip to content</a>

    <header class="intel-header">
      <div class="container intel-header-inner">
        <a class="brand" href="${attr(path(""))}">${escapeHtml(config.siteName)}</a>
        <nav class="intel-nav" aria-label="Primary navigation">${navHtml(current)}</nav>
        <a class="intel-header-link" href="/">${escapeHtml(config.b2bName)}</a>
      </div>
    </header>

    <main id="main" class="intel-main">
${body}
    </main>

    <footer class="intel-footer">
      <div class="container intel-footer-inner">
        <div class="footer-block">
          <p class="footer-brand">${escapeHtml(config.siteName)}</p>
          <p>
            An initial role-specific screen, not a final recruitment recommendation. Transfer fee,
            salary, availability and physical benchmarks should be treated as verification items.
          </p>
        </div>
        <div class="footer-block">
          <p class="footer-label">Method</p>
          <ul class="footer-list">
            <li><a href="${attr(path("/about"))}">How confidence and scores work</a></li>
            <li><a href="${attr(path("/about#corrections"))}">Correction policy</a></li>
            <li><a href="${attr(path("/api/health"))}">API health</a></li>
          </ul>
        </div>
        <div class="footer-block">
          <p class="footer-label">Desk</p>
          <ul class="footer-list">
            <li><a href="/">${escapeHtml(config.b2bName)}</a></li>
            <li><a href="mailto:scout@ai-orchestra.work">scout@ai-orchestra.work</a></li>
          </ul>
          <p class="footer-fine">
            Headlines and links only. Full articles are never reproduced; every claim links back to
            its original source.
          </p>
        </div>
      </div>
    </footer>
  </body>
</html>
`;
}

export default { renderPage, path, originFrom, NAV };
