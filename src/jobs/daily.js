/**
 * The 05:30 JST job (blueprint §25 "Daily").
 *
 * Composes pipeline calls only — no domain logic lives here (`10-architecture.md`
 * module map). `signals.recomputeSignals()` already writes the `signal_history`
 * snapshot for the day, so this job's own work is: build the brief, then draft
 * (never post) a small number of social posts from today's highest-importance
 * changes. `config.social.requireHumanApproval` gates posting, not drafting —
 * every row lands as `status = 'draft'` and stays there until a person approves it.
 */
import { all, run } from "../db/client.js";
import { withinWordingRules } from "../pipeline/changes.js";
import { buildDailyBrief } from "../pipeline/intelligence.js";
import { recomputeSignals } from "../pipeline/signals.js";
import { createLogger } from "../lib/logger.js";
import { todayInTimezone } from "../lib/time.js";

const log = createLogger("jobs:daily");

const MAX_DRAFTS = 5;
const MAX_BODY_LENGTH = 280;

function truncate(text, max) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** One line per change: headline, confidence-appropriate hedge, no invented numbers. */
function draftBody(item) {
  const headline = item.headlineJa || item.headline;
  if (!headline) return null;
  const body = truncate(`${headline} #JFI #海外組`, MAX_BODY_LENGTH);
  return withinWordingRules(body) ? body : null;
}

function draftSocialPosts(brief) {
  const candidates = Object.values(brief.sections)
    .flat()
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, MAX_DRAFTS);

  let drafted = 0;
  let skippedWording = 0;

  for (const item of candidates) {
    const body = draftBody(item);
    if (!body) {
      skippedWording += 1;
      continue;
    }
    // UNIQUE(as_of_date, platform, body) makes a re-run of the same day idempotent.
    const result = run(
      `INSERT OR IGNORE INTO social_drafts (as_of_date, platform, body, language, change_id, status)
       VALUES (?, 'x', ?, 'ja', ?, 'draft')`,
      brief.asOfDate, body, item.id
    );
    if (result.changes > 0) drafted += 1;
  }

  return { drafted, skippedWording, consideredCount: candidates.length };
}

export async function runDaily({ asOfDate } = {}) {
  const date = asOfDate ?? todayInTimezone();
  log.info("daily job starting", { date });

  // The tick may not have run signals yet today (e.g. a manual `jfi daily`
  // invocation) — recomputing is cheap and idempotent, so do it unconditionally
  // rather than trusting a prior run happened.
  const signals = recomputeSignals({ asOfDate: date });

  const brief = buildDailyBrief({ asOfDate: date });
  const social = draftSocialPosts(brief);

  const stats = {
    asOfDate: date,
    changesInBrief: brief.counts.changes,
    playersAffected: brief.counts.playersAffected,
    reviewOpen: brief.counts.reviewOpen,
    signalsRecomputed: signals?.transferUpdated ?? 0,
    socialDrafted: social.drafted,
    socialSkippedWording: social.skippedWording,
  };

  log.info("daily job finished", stats);
  return stats;
}

export default { runDaily };
