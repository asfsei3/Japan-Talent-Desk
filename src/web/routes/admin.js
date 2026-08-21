/**
 * Operator dashboard. English, plain HTML, no client JS — this is a tool for
 * the one person running the pipeline, not a product surface.
 *
 * Gated by HTTP Basic Auth against `config.admin.user` / `config.admin.password`.
 * `config.admin.enabled` is false whenever `JFI_ADMIN_PASSWORD` is unset, and
 * `src/web/server.js` 404s the whole `/admin` subtree in that case — an admin
 * route that merely renders "disabled" would still confirm the path exists.
 *
 * `POST /admin/run?job=` is the documented backup scheduling path
 * (`10-architecture.md` "Backup: external trigger") for when the in-process
 * tick is suspected wedged or a run needs to be forced by hand.
 */
import { all, get } from "../../db/client.js";
import { config } from "../../config/index.js";
import { withJobRun } from "../../jobs/run-tracking.js";
import { checkBasicAuth } from "../../lib/basic-auth.js";
import { createLogger } from "../../lib/logger.js";
import { todayInTimezone } from "../../lib/time.js";

const log = createLogger("admin");

const RUNNABLE_JOBS = new Set(["collect", "prefilter", "classify", "signals", "changes", "pipeline", "daily", "weekly", "sources:check"]);

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="robots" content="noindex, nofollow" />
<title>${escape(title)} · JFI Admin</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 2rem; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 1.1rem; margin-bottom: 1.5rem; }
  h2 { font-size: 0.95rem; margin-top: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.3rem 0.6rem; border-bottom: 1px solid #eee; font-size: 0.85rem; }
  nav a { margin-right: 1rem; font-size: 0.85rem; }
  code { background: #eee; padding: 0 0.3rem; }
  form { display: inline; }
  button { font: inherit; padding: 0.2rem 0.6rem; }
</style>
</head>
<body>
<nav><a href="${escape(config.basePath)}/admin">Status</a><a href="${escape(config.basePath)}/admin/review">Review queue</a><a href="${escape(config.basePath)}/admin/cost">Cost</a><a href="${escape(config.basePath)}">← Public site</a></nav>
<h1>${escape(title)}</h1>
${body}
</body>
</html>`;
}

function requireAuth(ctx) {
  return checkBasicAuth(ctx.request.headers.authorization, config.admin.user, config.admin.password);
}

function unauthorized() {
  return {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="jfi-admin"' },
    body: "Authentication required.",
    type: "text/plain; charset=utf-8",
  };
}

function statusView(ctx) {
  const today = todayInTimezone();
  const rows = {
    "Tracked players": get("SELECT COUNT(*) AS n FROM players WHERE tracked = 1").n,
    "Enabled sources": get("SELECT COUNT(*) AS n FROM sources WHERE enabled = 1").n,
    "Articles total": get("SELECT COUNT(*) AS n FROM articles").n,
    "Articles today": get("SELECT COUNT(*) AS n FROM articles WHERE date(detected_at) = ?", today).n,
    "Active events": get("SELECT COUNT(*) AS n FROM events WHERE status = 'active'").n,
    "Changes today": get("SELECT COUNT(*) AS n FROM changes WHERE as_of_date = ?", today).n,
    "Review queue (open)": get("SELECT COUNT(*) AS n FROM review_queue WHERE status = 'open'").n,
    "Cost today (USD)": get("SELECT COALESCE(ROUND(SUM(cost_usd), 4), 0) AS n FROM cost_ledger WHERE as_of_date = ?", today).n,
  };

  const statTable = Object.entries(rows)
    .map(([label, value]) => `<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`)
    .join("");

  const recentJobs = all(
    "SELECT id, job_name, started_at, finished_at, status, error FROM job_runs ORDER BY id DESC LIMIT 20"
  );
  const jobRows = recentJobs
    .map(
      (row) =>
        `<tr><td>${row.id}</td><td>${escape(row.job_name)}</td><td>${escape(row.started_at)}</td>` +
        `<td>${escape(row.finished_at ?? "running")}</td><td>${escape(row.status ?? "running")}</td>` +
        `<td>${escape(row.error ?? "")}</td></tr>`
    )
    .join("");

  const runForm = [...RUNNABLE_JOBS]
    .map(
      (job) =>
        `<form method="post" action="${escape(config.basePath)}/admin/run?job=${encodeURIComponent(job)}">` +
        `<button type="submit">Run ${escape(job)}</button></form>`
    )
    .join(" ");

  return {
    body: page(
      "Status",
      `<h2>Health</h2><table>${statTable}</table>` +
        `<h2>Run a job now</h2><p>${runForm}</p>` +
        `<h2>Recent job runs</h2><table><tr><th>id</th><th>job</th><th>started</th><th>finished</th><th>status</th><th>error</th></tr>${jobRows}</table>`
    ),
    type: "text/html; charset=utf-8",
  };
}

function reviewView() {
  const rows = all(
    `SELECT id, item_type, item_id, reason, priority, status, substr(detail, 1, 200) AS detail, created_at
       FROM review_queue WHERE status = 'open' ORDER BY priority DESC, created_at LIMIT 100`
  );
  const body = rows
    .map(
      (row) =>
        `<tr><td>${row.id}</td><td>${escape(row.item_type)}</td><td>${row.item_id}</td>` +
        `<td>${escape(row.reason)}</td><td>${row.priority}</td><td>${escape(row.detail ?? "")}</td>` +
        `<td>${escape(row.created_at)}</td></tr>`
    )
    .join("");
  return {
    body: page(
      "Review queue",
      `<p>${rows.length} open item(s). This queue is the human-minutes budget in ` +
        `<code>docs/strategy/jfi/60-automation-plan.md</code> — resolving items, not staring at them, is what counts.</p>` +
        `<table><tr><th>id</th><th>type</th><th>item</th><th>reason</th><th>priority</th><th>detail</th><th>created</th></tr>${body}</table>`
    ),
    type: "text/html; charset=utf-8",
  };
}

function costView(ctx) {
  const days = Math.min(Number(ctx.query.get("days")) || 14, 90);
  const rows = all(
    `SELECT as_of_date, provider, operation, model, SUM(calls) AS calls,
            SUM(input_units) AS input_units, SUM(output_units) AS output_units,
            ROUND(SUM(cost_usd), 4) AS cost_usd
       FROM cost_ledger
      WHERE as_of_date >= date('now', ?)
      GROUP BY as_of_date, provider, operation, model
      ORDER BY as_of_date DESC, cost_usd DESC`,
    `-${days} days`
  );
  const total = rows.reduce((sum, row) => sum + (row.cost_usd || 0), 0);
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escape(row.as_of_date)}</td><td>${escape(row.provider)}</td><td>${escape(row.operation)}</td>` +
        `<td>${escape(row.model)}</td><td>${row.calls}</td><td>${row.input_units}</td><td>${row.output_units}</td>` +
        `<td>$${row.cost_usd}</td></tr>`
    )
    .join("");
  return {
    body: page(
      "Cost ledger",
      `<p>Last ${days} days · total $${total.toFixed(4)}. See <code>docs/strategy/jfi/40-api-costs.md</code> for budget targets.</p>` +
        `<table><tr><th>date</th><th>provider</th><th>op</th><th>model</th><th>calls</th><th>in</th><th>out</th><th>cost</th></tr>${body}</table>`
    ),
    type: "text/html; charset=utf-8",
  };
}

const JOB_RUNNERS = {
  daily: () => import("../../jobs/daily.js").then((m) => m.runDaily({})),
  weekly: () => import("../../jobs/weekly.js").then((m) => m.runWeekly({})),
  pipeline: () => import("../../jobs/pipeline.js").then((m) => m.runPipeline({})),
  "sources:check": () => import("../../pipeline/collect.js").then((m) => m.checkSources()),
  collect: () => import("../../pipeline/collect.js").then((m) => m.collect({})),
  prefilter: () => import("../../pipeline/prefilter.js").then((m) => m.prefilterPending({})),
  classify: () => import("../../pipeline/classify.js").then((m) => m.classifyPending({})),
  signals: () => import("../../pipeline/signals.js").then((m) => m.recomputeSignals({})),
  changes: () => import("../../pipeline/changes.js").then((m) => m.detectChanges({})),
};

async function runJob(ctx) {
  const job = String(ctx.query.get("job") ?? "");
  if (!RUNNABLE_JOBS.has(job)) {
    return { status: 400, type: "text/plain; charset=utf-8", body: `Unknown job: ${job}` };
  }

  // Wrapped the same way the CLI and the scheduler wrap it, so a manual run
  // from this dashboard shows up in "Recent job runs" like any other run.
  try {
    await withJobRun(job, JOB_RUNNERS[job]);
    log.info("admin-triggered job finished", { job });
  } catch (error) {
    log.error("admin-triggered job failed", { job, error: error?.message || String(error) });
  }

  return { status: 303, headers: { location: `${config.basePath}/admin` }, body: "" };
}

export function registerAdminRoutes(router) {
  router.get("/admin", (ctx) => (requireAuth(ctx) ? statusView(ctx) : unauthorized()));
  router.get("/admin/review", (ctx) => (requireAuth(ctx) ? reviewView(ctx) : unauthorized()));
  router.get("/admin/cost", (ctx) => (requireAuth(ctx) ? costView(ctx) : unauthorized()));
  router.post("/admin/run", (ctx) => (requireAuth(ctx) ? runJob(ctx) : unauthorized()));
  return router;
}

export default { registerAdminRoutes };
