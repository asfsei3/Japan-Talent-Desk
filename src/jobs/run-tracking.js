/**
 * Wraps a job function with a `job_runs` row, so a scheduler-triggered run is
 * exactly as auditable as `npm run jfi -- <cmd>` (`10-architecture.md`
 * "Every job is also a CLI command... an in-process run is as auditable as a
 * cron run"). Shared by `src/cli.js` and `src/web/scheduler.js` so there is
 * one place that decides what a job run row looks like.
 */
import { run } from "../db/client.js";

export async function withJobRun(jobName, fn) {
  const { lastInsertRowid } = run("INSERT INTO job_runs (job_name) VALUES (?)", jobName);
  const jobId = Number(lastInsertRowid);
  try {
    const stats = (await fn()) ?? {};
    run(
      "UPDATE job_runs SET finished_at = datetime('now'), status = 'ok', stats = ? WHERE id = ?",
      JSON.stringify(stats), jobId
    );
    return stats;
  } catch (error) {
    run(
      "UPDATE job_runs SET finished_at = datetime('now'), status = 'error', error = ? WHERE id = ?",
      error?.message || String(error), jobId
    );
    throw error;
  }
}

export default { withJobRun };
