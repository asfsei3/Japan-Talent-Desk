/**
 * The HTML document shell.
 *
 * Server-rendered strings, no build step, no client framework. The only external
 * request is the Google Fonts stylesheet the Japan Talent Desk landing page
 * already loads — no CJK webfont is added, because the file weight is not worth
 * it when every target device has a good system Japanese face.
 */
import { config } from "../config/index.js";
import { escapeHtml } from "../lib/text.js";
import { attr } from "./components.js";

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap";

export const SITE_NAME_JA = "日本サッカー・インテリジェンス";

export const NAV = [
  { href: "", label: "今日の変化" },
  { href: "/players", label: "選手一覧" },
  { href: "/transfer-radar", label: "移籍レーダー" },
  { href: "/about", label: "このサイトについて" },
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
 * @param {boolean} [options.noindex] Admin and query-filtered pages set this.
 * @param {string} [options.lang]     Admin is an operator tool and stays English.
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
  lang = "ja",
  siteName = SITE_NAME_JA,
  chrome = true,
} = {}) {
  const fullTitle = `${title}｜${siteName}`;
  const canonical = origin && canonicalPath ? `${origin}${canonicalPath}` : "";

  const header = chrome
    ? `<header class="intel-header">
      <div class="container intel-header-inner">
        <a class="brand" href="${attr(path(""))}"><span class="brand-flag" aria-hidden="true">🇯🇵</span>${escapeHtml(siteName)}</a>
        <nav class="intel-nav" aria-label="メインナビゲーション">${navHtml(current)}</nav>
        <a class="intel-header-link" href="/">${escapeHtml(config.b2bName)}</a>
      </div>
    </header>`
    : "";

  const footer = chrome
    ? `<footer class="intel-footer">
      <div class="container intel-footer-inner">
        <div class="footer-block">
          <p class="footer-brand">${escapeHtml(siteName)}</p>
          <p>
            本サイトは初期スクリーニングであり、獲得の最終判断ではありません。移籍金・給与・移籍可能性・
            フィジカル面の数値は、いずれも直接確認が必要な要確認事項です。
          </p>
        </div>
        <div class="footer-block">
          <p class="footer-label">方法論</p>
          <ul class="footer-list">
            <li><a href="${attr(path("/about#confidence"))}">信頼度とスコアの考え方</a></li>
            <li><a href="${attr(path("/about#corrections"))}">訂正ポリシー</a></li>
            <li><a href="${attr(path("/api/health"))}">API ステータス</a></li>
          </ul>
        </div>
        <div class="footer-block">
          <p class="footer-label">運営</p>
          <ul class="footer-list">
            <li><a href="/">${escapeHtml(config.b2bName)}</a></li>
            <li><a href="mailto:scout@ai-orchestra.work">scout@ai-orchestra.work</a></li>
          </ul>
          <p class="footer-fine">
            見出しとリンクのみを掲載しています。記事全文は転載せず、すべての記述は元の出典へリンクします。
          </p>
        </div>
      </div>
    </footer>`
    : "";

  return `<!doctype html>
<html lang="${attr(lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(fullTitle)}</title>
    ${metaTag("description", description)}
    ${noindex ? '<meta name="robots" content="noindex, nofollow" />' : ""}
    ${canonical ? `<link rel="canonical" href="${attr(canonical)}" />` : ""}
    <meta name="theme-color" content="#0f241b" />
    ${metaTag("og:type", "website", { property: true })}
    ${metaTag("og:locale", lang === "ja" ? "ja_JP" : "en_GB", { property: true })}
    ${metaTag("og:site_name", siteName, { property: true })}
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
    <link rel="stylesheet" href="/assets/intel.css" />
    ${headExtra}
  </head>
  <body class="intel-body${bodyClass ? ` ${attr(bodyClass)}` : ""}">
    <a class="skip-link" href="#main">本文へスキップ</a>
${header}
    <main id="main" class="intel-main">
${body}
    </main>
${footer}
  </body>
</html>
`;
}

export default { renderPage, path, originFrom, NAV, SITE_NAME_JA };
