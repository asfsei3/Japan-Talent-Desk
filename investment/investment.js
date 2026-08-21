const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const statusArea = document.getElementById("status-area");
const statusMessage = document.getElementById("status-message");
const resultsArea = document.getElementById("results-area");
const resultsList = document.getElementById("results-list");
const companyArea = document.getElementById("company-area");
const companyCard = document.getElementById("company-card");

const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
  statusArea.hidden = false;
}

function hideStatus() {
  statusArea.hidden = true;
}

function hideResults() {
  resultsArea.hidden = true;
  resultsList.innerHTML = "";
}

function hideCompany() {
  companyArea.hidden = true;
  companyCard.innerHTML = "";
}

/** Large USD figures as e.g. "$383.3B" — readable at a glance, still exact enough to compare companies. */
function formatUsd(value) {
  if (value === null || value === undefined) return null;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return null;
  return `${(value * 100).toFixed(1)}%`;
}

function formatEps(value) {
  if (value === null || value === undefined) return null;
  return `$${value.toFixed(2)}`;
}

function metricHtml(label, formatted, { signed = false, rawValue = null } = {}) {
  if (formatted === null) {
    return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value unavailable">データなし</div></div>`;
  }
  const signClass = signed && rawValue !== null ? (rawValue >= 0 ? " positive" : " negative") : "";
  return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value num${signClass}">${formatted}</div></div>`;
}

function renderResults(results) {
  hideCompany();
  if (results.length === 0) {
    resultsList.innerHTML = "";
    resultsArea.hidden = true;
    showStatus("該当する企業が見つかりませんでした。米国SEC提出義務のある上場企業のみ対応しています。");
    return;
  }

  hideStatus();
  resultsList.innerHTML = results
    .map(
      (r) => `
        <li class="result-item">
          <button type="button" data-ticker="${escapeHtml(r.ticker)}">
            <span class="result-ticker num">${escapeHtml(r.ticker)}</span>
            <span class="result-name">${escapeHtml(r.name)}</span>
          </button>
        </li>`
    )
    .join("");
  resultsArea.hidden = false;
}

function renderCompany(page) {
  hideResults();
  const m = page.metrics;
  const asOf = m.fiscalYearEnd ? `会計年度末: ${m.fiscalYearEnd}（10-K提出: ${m.filedAt ?? "—"}）` : "直近10-Kのデータが見つかりませんでした";

  companyCard.innerHTML = `
    <h2>${escapeHtml(m.entityName ?? page.ticker)} <span class="num">(${escapeHtml(page.ticker)})</span></h2>
    <p class="company-meta">${escapeHtml(asOf)}</p>
    <div class="metric-grid">
      ${metricHtml("売上高（直近会計年度）", formatUsd(m.revenue))}
      ${metricHtml("売上成長率（前期比）", formatPercent(m.revenueGrowth), { signed: true, rawValue: m.revenueGrowth })}
      ${metricHtml("EPS（希薄化後）", formatEps(m.epsDiluted), { signed: true, rawValue: m.epsDiluted })}
      ${metricHtml("売上総利益率", formatPercent(m.grossMargin))}
      ${metricHtml("営業利益率", formatPercent(m.operatingMargin), { signed: true, rawValue: m.operatingMargin })}
      ${metricHtml("純利益", formatUsd(m.netIncome), { signed: true, rawValue: m.netIncome })}
      ${metricHtml("現在の株価", null)}
      ${metricHtml("時価総額", null)}
      ${metricHtml("PER", null)}
    </div>
    <div class="fact-tags">
      <span class="fact-tag">FACT（SEC提出書類由来）</span>
    </div>
  `;
  companyArea.hidden = false;
}

async function runSearch(query) {
  hideResults();
  hideCompany();
  showStatus("検索しています…");

  try {
    const res = await fetch(`/api/investment/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || "search_failed");
    renderResults(data.results);
  } catch (error) {
    console.error("Investment search failed", error);
    showStatus("検索中にエラーが発生しました。しばらくしてから再度お試しください。", true);
  }
}

async function loadCompany(ticker) {
  hideResults();
  showStatus("読み込んでいます…");

  try {
    const res = await fetch(`/api/investment/company/${encodeURIComponent(ticker)}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showStatus(data.message || "この銘柄は見つかりませんでした。", true);
      return;
    }
    hideStatus();
    renderCompany(data);
  } catch (error) {
    console.error("Investment company lookup failed", error);
    showStatus("読み込み中にエラーが発生しました。しばらくしてから再度お試しください。", true);
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  runSearch(query);
});

resultsList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-ticker]");
  if (!button) return;
  loadCompany(button.getAttribute("data-ticker"));
});
