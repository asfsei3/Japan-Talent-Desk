/**
 * The Monday 07:00 JST job (`60-automation-plan.md` schedule table).
 *
 * Drafts Japan Market Weekly into `newsletter_issues` with `status = 'draft'`.
 * `docs/newsletter/operations.md`'s automation boundary is absolute: "AI write"
 * is allowed only as a draft, sending is not. This job never touches
 * `getEmailProvider().sendCampaign()` and never sets `status` past `draft` —
 * that transition is `approved_by` + a human, by hand, in the admin UI.
 */
import { all, get, run } from "../db/client.js";
import { withinWordingRules } from "../pipeline/changes.js";
import { createLogger } from "../lib/logger.js";
import { shiftDate, todayInTimezone } from "../lib/time.js";

const log = createLogger("jobs:weekly");

const SECTION_ORDER = ["transfer", "injury", "contract", "performance", "market"];
const SECTION_LABELS_JA = {
  transfer: "移籍",
  injury: "怪我・出場可否",
  contract: "契約",
  performance: "出場・成績",
  market: "日本市場",
};

function weekWindow(asOfDate) {
  const end = asOfDate ?? todayInTimezone();
  const start = shiftDate(end, -6);
  return { start, end };
}

function sectionFor(changeType) {
  if (changeType === "signal_band" || changeType === "club_linked") return "transfer";
  if (SECTION_ORDER.includes(changeType)) return changeType;
  return "market";
}

function line(row) {
  const headline = row.headline_ja || row.headline;
  if (!headline || !withinWordingRules(headline)) return null;
  const name = row.name_ja || row.name_en || "不明な選手";
  return `- **${name}** — ${headline}`;
}

function buildMarkdown({ start, end }, rows) {
  const sections = Object.fromEntries(SECTION_ORDER.map((key) => [key, []]));
  for (const row of rows) {
    const rendered = line(row);
    if (!rendered) continue;
    sections[sectionFor(row.change_type)].push(rendered);
  }

  const body = SECTION_ORDER.filter((key) => sections[key].length).map(
    (key) => `## ${SECTION_LABELS_JA[key]}\n\n${sections[key].slice(0, 8).join("\n")}\n`
  );

  const header =
    `# Japan Market Weekly — ${start} 〜 ${end}\n\n` +
    "海外でプレーする日本人選手について、この一週間で確認された変化をまとめています。" +
    "移籍金・給与・移籍可能性・フィジカル指標は、いずれも直接確認が必要な要確認事項です。\n";

  if (body.length === 0) {
    return `${header}\n今週は確認された変化がありませんでした。\n`;
  }

  return `${header}\n${body.join("\n")}`;
}

export async function runWeekly({ asOfDate } = {}) {
  const window = weekWindow(asOfDate);
  log.info("weekly job starting", window);

  const rows = all(
    `SELECT c.change_type, c.headline, c.headline_ja, p.name_en, p.name_ja
       FROM changes c
       LEFT JOIN players p ON p.id = c.entity_id
      WHERE c.as_of_date BETWEEN ? AND ?
      ORDER BY c.importance DESC, c.id`,
    window.start, window.end
  );

  const markdown = buildMarkdown(window, rows);
  const subject = `Japan Market Weekly — ${window.start} 〜 ${window.end}`;

  // UNIQUE(issue_date) makes re-running the same Monday a no-op rather than a
  // second draft; `issue_date` is the week's end so it lines up with the run day.
  const existing = get("SELECT id, status FROM newsletter_issues WHERE issue_date = ?", window.end);
  if (existing) {
    log.info("weekly issue already exists, leaving it untouched", { id: existing.id, status: existing.status });
    return { issueDate: window.end, changesConsidered: rows.length, created: false, issueId: existing.id };
  }

  const { lastInsertRowid } = run(
    `INSERT INTO newsletter_issues (issue_date, subject, markdown, status)
     VALUES (?, ?, ?, 'draft')`,
    window.end, subject, markdown
  );

  const stats = { issueDate: window.end, changesConsidered: rows.length, created: true, issueId: Number(lastInsertRowid) };
  log.info("weekly job finished", stats);
  return stats;
}

export default { runWeekly };
