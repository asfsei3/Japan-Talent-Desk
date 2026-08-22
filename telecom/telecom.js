const linesList = document.getElementById("lines-list");
const addLineButton = document.getElementById("add-line");
const form = document.getElementById("telecom-form");
const statusArea = document.getElementById("status-area");
const statusMessage = document.getElementById("status-message");
const resultArea = document.getElementById("result-area");
const asOfNote = document.getElementById("asof-note");

const CARRIER_OPTIONS = [
  { value: "docomo", label: "docomo（ahamo / irumo含む）" },
  { value: "au", label: "au（povo / UQ mobile含む）" },
  { value: "SoftBank", label: "SoftBank（LINEMO / Y!mobile含む）" },
  { value: "楽天モバイル", label: "楽天モバイル" },
  { value: "", label: "格安SIM（MVNO）／わからない" },
];

const CALL_NEED_OPTIONS = [
  { value: "none", label: "ほとんど発信しない（LINE通話中心）" },
  { value: "5min", label: "たまに電話する（1回5分以内が多い）" },
  { value: "unlimited", label: "よく電話する（かけ放題が必要）" },
];

const yen = new Intl.NumberFormat("ja-JP");
let lineCount = 0;

const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function optionsHtml(options) {
  return options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
}

function addLine(defaultLabel) {
  lineCount += 1;
  const id = lineCount;
  const li = document.createElement("li");
  li.className = "line-card";
  li.dataset.lineId = String(id);
  li.innerHTML = `
    <div class="line-card-head">
      <input type="text" class="line-label" placeholder="名前・呼び方（例: 自分 / 父）" value="${escapeHtml(defaultLabel || "")}" maxlength="20" />
      <button type="button" class="remove-line" aria-label="この回線を削除">×</button>
    </div>
    <div class="line-fields">
      <label>現在のキャリア
        <select class="line-carrier">${optionsHtml(CARRIER_OPTIONS)}</select>
      </label>
      <label>現在の月額料金（円）
        <input type="number" class="line-fee" min="0" max="200000" step="1" placeholder="例: 7980" required />
      </label>
      <label>月間データ使用量（GB）
        <input type="number" class="line-data" min="0" max="1000" step="0.5" placeholder="例: 5" required />
      </label>
      <label>通話の使い方
        <select class="line-call">${optionsHtml(CALL_NEED_OPTIONS)}</select>
      </label>
    </div>`;
  linesList.appendChild(li);
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const cards = linesList.querySelectorAll(".line-card");
  cards.forEach((card) => {
    const button = card.querySelector(".remove-line");
    button.disabled = cards.length <= 1;
  });
}

function readLines() {
  return Array.from(linesList.querySelectorAll(".line-card")).map((card) => ({
    label: card.querySelector(".line-label").value.trim(),
    carrierLabel: card.querySelector(".line-carrier").value,
    currentMonthlyFeeYen: Number(card.querySelector(".line-fee").value),
    dataUsageGB: Number(card.querySelector(".line-data").value),
    callNeed: card.querySelector(".line-call").value,
  }));
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
  statusArea.hidden = false;
}

function hideStatus() {
  statusArea.hidden = true;
}

function pickHtml(title, pick, { note } = {}) {
  if (!pick) {
    return `<div class="pick pick-empty"><h4>${escapeHtml(title)}</h4><p class="fine">条件に合うプランが見つかりませんでした。</p></div>`;
  }
  const savings = pick.annualSavingsYen;
  const savingsClass = savings > 0 ? "positive" : savings < 0 ? "negative" : "";
  const savingsLabel = savings > 0 ? "年間削減額" : savings < 0 ? "年間差額（増加）" : "年間差額";
  return `
    <div class="pick">
      <h4>${escapeHtml(title)}</h4>
      <p class="pick-plan">${escapeHtml(pick.plan.carrier)} <span class="fine">${escapeHtml(pick.plan.planName)}</span></p>
      <p class="pick-price num">月額 ¥${yen.format(pick.totalCost)}</p>
      <p class="pick-savings num ${savingsClass}">${savingsLabel} ¥${yen.format(Math.abs(savings))}</p>
      ${note ? `<p class="fine">${escapeHtml(note)}</p>` : ""}
      ${pick.plan.notes ? `<p class="fine">${escapeHtml(pick.plan.notes)}</p>` : ""}
    </div>`;
}

function lineResultHtml(line, index) {
  const label = line.label || `回線${index + 1}`;
  return `
    <article class="line-result">
      <h3>${escapeHtml(label)} <span class="fine">現在 月額¥${yen.format(line.currentMonthlyFeeYen)}・${line.dataUsageGB}GB/月</span></h3>
      <div class="picks-grid">
        ${pickHtml("① 最安", line.cheapest)}
        ${pickHtml("② バランス重視", line.balanced, { note: "価格に加えて、店舗サポートや通信品質も考慮した候補" })}
        ${line.stayWithCarrier ? pickHtml("③ 今のキャリア維持（プラン変更のみ）", line.stayWithCarrier) : ""}
      </div>
    </article>`;
}

function renderResult(response, lines) {
  const { result, asOf } = response;
  asOfNote.textContent = asOf;

  const perLineHtml = result.perLine.map((line, i) => lineResultHtml(line, i)).join("");
  const isHousehold = result.perLine.length > 1;

  const summaryHtml = isHousehold
    ? `
    <article class="household-summary">
      <h2>世帯合計</h2>
      <table class="summary-table">
        <tbody>
          <tr><th>現在の合計月額</th><td class="num">¥${yen.format(result.currentTotalMonthlyYen)}</td></tr>
          <tr><th>最適化後（最安の組み合わせ）</th><td class="num">¥${yen.format(result.cheapestTotalMonthlyYen)}</td></tr>
          <tr class="highlight"><th>年間削減額（最安）</th><td class="num">¥${yen.format(result.cheapestAnnualSavingsYen)}</td></tr>
          <tr><th>最適化後（バランス重視の組み合わせ）</th><td class="num">¥${yen.format(result.balancedTotalMonthlyYen)}</td></tr>
          <tr class="highlight"><th>年間削減額（バランス重視）</th><td class="num">¥${yen.format(result.balancedAnnualSavingsYen)}</td></tr>
        </tbody>
      </table>
    </article>`
    : `
    <article class="household-summary">
      <p class="headline-savings num">年間 最大 <strong>¥${yen.format(Math.max(result.cheapestAnnualSavingsYen, 0))}</strong> 安くできる可能性があります</p>
    </article>`;

  resultArea.innerHTML = `${summaryHtml}<div class="lines-results">${perLineHtml}</div>`;
  resultArea.hidden = false;
}

async function runDiagnosis(lines) {
  hideStatus();
  resultArea.hidden = true;
  showStatus("診断しています…");

  try {
    const res = await fetch("/api/telecom/diagnose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showStatus(data.message || "診断中にエラーが発生しました。入力内容をご確認ください。", true);
      return;
    }
    hideStatus();
    renderResult(data, lines);
  } catch (error) {
    console.error("Telecom diagnosis failed", error);
    showStatus("診断中にエラーが発生しました。しばらくしてから再度お試しください。", true);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const lines = readLines();

  for (const line of lines) {
    if (!Number.isFinite(line.currentMonthlyFeeYen) || line.currentMonthlyFeeYen < 0) {
      showStatus("月額料金を正しく入力してください。", true);
      return;
    }
    if (!Number.isFinite(line.dataUsageGB) || line.dataUsageGB < 0) {
      showStatus("データ使用量を正しく入力してください。", true);
      return;
    }
  }

  runDiagnosis(lines);
});

addLineButton.addEventListener("click", () => addLine(""));

linesList.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-line");
  if (!button) return;
  const card = button.closest(".line-card");
  if (linesList.querySelectorAll(".line-card").length <= 1) return;
  card.remove();
  updateRemoveButtons();
});

addLine("自分");
