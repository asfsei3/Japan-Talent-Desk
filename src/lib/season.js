/**
 * Where the European football calendar is in its year, for content ordering
 * only — never for fetch cadence, which stays fixed per `60-automation-plan.md`.
 *
 * Deliberately two phases, not the finer six-phase calendar (pre-season,
 * post-season, etc.) a real football calendar has. Exact transfer-window and
 * pre-season dates are set per league, per year, and shift — asserting a
 * precise sub-phase here would be exactly the kind of unsupported precision
 * `docs/strategy/positioning.md` rules out everywhere else in this product.
 * Two mutually exclusive, date-only phases are defensible; six would not be.
 * See `docs/strategy/jfi/70-quote-and-season.md`.
 *
 * Scope: this reads the top-5 European leagues' calendar, because JFI tracks
 * Japanese players abroad there. J.League runs Feb-Dec and this function does
 * not describe it.
 */
import { todayInTimezone } from "./time.js";

export const SEASON_PHASES = {
  TRANSFER_WINDOW: {
    key: "transfer_window",
    label: "Transfer window",
    labelJa: "移籍市場",
  },
  IN_SEASON: {
    key: "in_season",
    label: "In season",
    labelJa: "シーズン中",
  },
};

/**
 * @param {string} [date] `YYYY-MM-DD`, JST. Defaults to today.
 * @returns {typeof SEASON_PHASES.TRANSFER_WINDOW}
 */
export function seasonPhase(date = todayInTimezone()) {
  const [, month, day] = String(date).split("-").map(Number);
  const monthDay = month * 100 + day;

  // Winter window: Jan 1 - Feb 3 (approx.; exact deadline shifts by league/year).
  if (monthDay <= 203) return SEASON_PHASES.TRANSFER_WINDOW;
  // In season: Feb 4 - May 31.
  if (monthDay <= 531) return SEASON_PHASES.IN_SEASON;
  // Summer window (incl. pre-season): Jun 1 - Sep 1.
  if (monthDay <= 901) return SEASON_PHASES.TRANSFER_WINDOW;
  // In season: Sep 2 - Dec 31.
  return SEASON_PHASES.IN_SEASON;
}

export default { seasonPhase, SEASON_PHASES };
