/**
 * The in-process tick: `10-architecture.md` "Primary: in-process tick" and the
 * schedule table in `60-automation-plan.md`. All times below are JST.
 *
 *   pipeline        02:00, then every 2h from 06:00 to 22:00  (10 runs/day)
 *   daily           05:30  — snapshot signals, build the brief, draft social
 *   weekly          Monday 07:00 — draft Japan Market Weekly
 *   sources:check   Sunday 03:00 — validate feeds, robots.txt, parseability
 *   backup          03:30 — VACUUM INTO, 14-day retention
 *
 * `server.js` calls `runPipelineTick()` once a minute; this module decides
 * whether "now" matches a slot and, if so, runs that job exactly once. A
 * `firedSlots` set (keyed by job + JST date + hour:minute) is the guard
 * against a slow job or a delayed tick causing a double fire in the same
 * minute — this is a courtesy, not the correctness mechanism: every job body
 * is already idempotent per JST day at the database level (`UNIQUE` on
 * `signal_history`, `changes`, `newsletter_issues.issue_date`, etc.), so a
 * second fire in the same slot is wasted work, not wrong output.
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

import { config } from "../config/index.js";
import { exec } from "../db/client.js";
import { withJobRun } from "../jobs/run-tracking.js";
import { todayInTimezone } from "../lib/time.js";

const PIPELINE_HOURS = new Set([2, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
const BACKUP_RETENTION_DAYS = 14;

function jstNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const dowByName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour: Number(get("hour")), minute: Number(get("minute")), dow: dowByName[get("weekday")] ?? -1 };
}

function backupDatabase() {
  const dir = join(dirname(config.database.file), "backup");
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `jfi-${todayInTimezone()}.db`);
  // `VACUUM INTO` takes a string literal, not a bind parameter; the path is
  // server-derived (never request input), so escaping the one quote class is
  // sufficient rather than a security gap.
  exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const name of readdirSync(dir)) {
    const filePath = join(dir, name);
    if (existsSync(filePath) && statSync(filePath).mtimeMs < cutoff) unlinkSync(filePath);
  }

  return { file: target };
}

const SLOTS = [
  { job: "pipeline", matches: ({ hour }) => PIPELINE_HOURS.has(hour), minute: 0 },
  { job: "daily", matches: ({ hour }) => hour === 5, minute: 30 },
  { job: "weekly", matches: ({ hour, dow }) => hour === 7 && dow === 1, minute: 0 },
  { job: "sources:check", matches: ({ hour, dow }) => hour === 3 && dow === 0, minute: 0 },
  { job: "backup", matches: ({ hour }) => hour === 3, minute: 30 },
];

async function runJob(job) {
  return withJobRun(job, async () => {
    if (job === "pipeline") return (await import("../jobs/pipeline.js")).runPipeline({});
    if (job === "daily") return (await import("../jobs/daily.js")).runDaily({});
    if (job === "weekly") return (await import("../jobs/weekly.js")).runWeekly({});
    if (job === "sources:check") return (await import("../pipeline/collect.js")).checkSources();
    if (job === "backup") return backupDatabase();
    throw new Error(`unknown scheduled job: ${job}`);
  });
}

/**
 * @param {object} deps
 * @param {Set<string>} deps.firedSlots  Persists across calls; the caller owns its lifetime.
 * @param {{ info: Function, error: Function }} deps.log
 */
export async function runPipelineTick({ firedSlots, log }) {
  const now = jstNow();
  const date = todayInTimezone();

  for (const slot of SLOTS) {
    if (now.minute !== slot.minute || !slot.matches(now)) continue;
    const key = `${slot.job}|${date}|${now.hour}:${now.minute}`;
    if (firedSlots.has(key)) continue;
    firedSlots.add(key);

    log.info("scheduled job firing", { job: slot.job, jst: `${now.hour}:${String(now.minute).padStart(2, "0")}` });
    try {
      await runJob(slot.job);
    } catch (error) {
      log.error("scheduled job failed", { job: slot.job, error: error?.message || String(error) });
    }
  }

  // Bound the set's lifetime — a process can run for weeks and this should
  // not accumulate one entry per job per day forever.
  if (firedSlots.size > 500) {
    for (const key of firedSlots) {
      if (!key.includes(`|${date}|`)) firedSlots.delete(key);
    }
  }
}

export default { runPipelineTick };
