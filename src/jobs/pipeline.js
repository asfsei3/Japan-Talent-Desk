/**
 * `collect -> prefilter -> classify -> signals -> changes`, composed once.
 *
 * Three callers need exactly this sequence: the CLI's `pipeline` command, the
 * admin dashboard's manual "Run pipeline" button, and the scheduler's 2-hourly
 * tick. This module exists so the sequence is defined in one place instead of
 * three, per `src/jobs/` "Compose pipeline calls; add no logic" in
 * `10-architecture.md`'s module map.
 */
import { collect } from "../pipeline/collect.js";
import { prefilterPending } from "../pipeline/prefilter.js";
import { classifyPending } from "../pipeline/classify.js";
import { recomputeSignals } from "../pipeline/signals.js";
import { detectChanges } from "../pipeline/changes.js";

export async function runPipeline({ limit } = {}) {
  const collectStats = await collect({ limit });
  const prefilterStats = prefilterPending({});
  const classifyStats = await classifyPending({ limit });
  const signalsStats = recomputeSignals({});
  const changesStats = detectChanges({});

  return {
    collect: collectStats,
    prefilter: prefilterStats,
    classify: classifyStats,
    signals: signalsStats,
    changes: changesStats,
  };
}

export default { runPipeline };
