#!/usr/bin/env node
/**
 * JFI operator CLI.
 *
 * Every scheduled job is also a CLI command, so anything cron does can be run
 * and inspected by hand. Run `npm run jfi -- help` for the list.
 */
import { config } from "./config/index.js";
import { all, closeDb, get, migrate } from "./db/client.js";
import { withJobRun } from "./jobs/run-tracking.js";
import { createLogger } from "./lib/logger.js";
import { todayInTimezone } from "./lib/time.js";

const log = createLogger("cli");

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const token of argv) {
    if (token.startsWith("--")) {
      const [key, value] = token.slice(2).split("=");
      flags[key] = value === undefined ? true : value;
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

const commands = {
  async migrate() {
    migrate();
    log.info("schema applied", { database: config.database.file });
  },

  async seed() {
    migrate();
    const { seed } = await import("./db/seed.js");
    return seed();
  },

  async collect(flags) {
    const { collect } = await import("./pipeline/collect.js");
    return withJobRun("collect", () =>
      collect({
        sourceSlugs: flags.source ? String(flags.source).split(",") : undefined,
        limit: flags.limit ? Number(flags.limit) : undefined,
      })
    );
  },

  async prefilter(flags) {
    const { prefilterPending } = await import("./pipeline/prefilter.js");
    return withJobRun("prefilter", () => prefilterPending({ limit: flags.limit ? Number(flags.limit) : undefined }));
  },

  async classify(flags) {
    const { classifyPending } = await import("./pipeline/classify.js");
    return withJobRun("classify", () =>
      classifyPending({
        limit: flags.limit ? Number(flags.limit) : undefined,
        force: Boolean(flags.force),
      })
    );
  },

  async signals() {
    const { recomputeSignals } = await import("./pipeline/signals.js");
    return withJobRun("signals", () => recomputeSignals({}));
  },

  async changes(flags) {
    const { detectChanges } = await import("./pipeline/changes.js");
    return withJobRun("changes", () => detectChanges({ asOfDate: flags.date }));
  },

  /** The 2-hourly job (`60-automation-plan.md`). */
  async pipeline(flags) {
    const { runPipeline } = await import("./jobs/pipeline.js");
    return withJobRun("pipeline", () => runPipeline({ limit: flags.limit ? Number(flags.limit) : undefined }));
  },

  /** The daily job: snapshot signals, build the brief, draft social posts. */
  async daily(flags) {
    const { runDaily } = await import("./jobs/daily.js");
    return withJobRun("daily", () => runDaily({ asOfDate: flags.date }));
  },

  /** The weekly job: draft Japan Market Weekly. Never sends without approval. */
  async weekly(flags) {
    const { runWeekly } = await import("./jobs/weekly.js");
    return withJobRun("weekly", () => runWeekly({ asOfDate: flags.date }));
  },

  async "sources:check"() {
    const { checkSources } = await import("./pipeline/collect.js");
    return withJobRun("sources:check", () => checkSources());
  },

  async status() {
    const today = todayInTimezone();
    const rows = {
      players: get("SELECT COUNT(*) AS n FROM players WHERE tracked = 1").n,
      sources: get("SELECT COUNT(*) AS n FROM sources WHERE enabled = 1").n,
      articles: get("SELECT COUNT(*) AS n FROM articles").n,
      articlesToday: get("SELECT COUNT(*) AS n FROM articles WHERE date(detected_at) = ?", today).n,
      events: get("SELECT COUNT(*) AS n FROM events WHERE status = 'active'").n,
      changesToday: get("SELECT COUNT(*) AS n FROM changes WHERE as_of_date = ?", today).n,
      reviewOpen: get("SELECT COUNT(*) AS n FROM review_queue WHERE status = 'open'").n,
      costTodayUsd: get("SELECT COALESCE(SUM(cost_usd), 0) AS n FROM cost_ledger WHERE as_of_date = ?", today).n,
    };
    console.table(rows);
    return rows;
  },

  async cost(flags) {
    const days = Number(flags.days ?? 14);
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
    console.table(rows);
    return { rows: rows.length };
  },

  async review(flags) {
    const rows = all(
      `SELECT id, item_type, item_id, reason, priority, substr(detail, 1, 80) AS detail
         FROM review_queue WHERE status = 'open'
        ORDER BY priority DESC, created_at LIMIT ?`,
      Number(flags.limit ?? 20)
    );
    console.table(rows);
    return { open: rows.length };
  },

  async serve() {
    const { startServer } = await import("./web/server.js");
    startServer();
    return null; // keeps the process alive
  },

  async help() {
    console.log(`
Japan Football Intelligence — operator CLI

  npm run jfi -- <command> [--flags]

Setup
  migrate                  Apply the schema
  seed                     Load reference data, players, clubs and sources

Pipeline
  collect [--source=a,b] [--limit=N]   Fetch enabled feeds into the article store
  prefilter [--limit=N]                Rule-based relevance gate (runs before any LLM call)
  classify [--limit=N] [--force]       Tiered LLM classification and fact extraction
  signals                              Recompute transfer signal and Japan Market Score
  changes [--date=YYYY-MM-DD]          Detect what changed
  pipeline [--limit=N]                 collect -> prefilter -> classify -> signals -> changes

Jobs
  daily [--date=]          Snapshot signals, build the daily brief, draft social posts
  weekly [--date=]         Draft Japan Market Weekly (never sends without approval)

Operations
  status                   One-screen health check
  cost [--days=14]         Cost ledger summary
  review [--limit=20]      Open review queue items
  sources:check            Validate feed URLs, robots.txt and licence flags
  serve                    Start the web server
`);
    return null;
  },
};

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const name = positional[0] ?? "help";
  const command = commands[name];

  if (!command) {
    log.error(`unknown command: ${name}`);
    await commands.help();
    process.exitCode = 1;
    return;
  }

  const result = await command(flags, positional.slice(1));
  if (result && name !== "status" && name !== "cost" && name !== "review") {
    console.log(JSON.stringify(result, null, 2));
  }
  if (name !== "serve") closeDb();
}

main().catch((error) => {
  log.error("command failed", { error: error?.message || String(error) });
  if (process.env.JFI_LOG_LEVEL === "debug") console.error(error);
  process.exitCode = 1;
});
