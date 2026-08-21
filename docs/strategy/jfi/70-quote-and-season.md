# Manager & Player Quote Intelligence, and the Year-Round Content Calendar

Last updated: 2026-08-21
Status: Current working source-of-truth.

Two additions, added together because they answer the same complaint: a product framed around
"移籍情報" (transfer news) goes quiet the moment a transfer window closes. Both exist to give the
daily brief something worth opening in October as much as in July.

## 1. Manager & Player Quote Intelligence

### What it is

A manager's press conference or a player's interview is classified as a `media` event with
subtype `manager_comment` or `player_comment` — not discarded as "not an event" the way a preview
or a match report with no incident is. `classify.js`'s `EXTRACT_SYSTEM` prompt (`QUOTE_RULES`)
asks the model to extract, as ordinary `facts[]` entries (same `{field, value, supporting_sentence}`
shape every other fact uses):

- `speaker` — who is quoted.
- `sentiment` — `positive` / `negative` / `neutral`, read from the tone of what was said about the
  player, never from the match result.
- `selection_signal` — `positive` (implies a regular starter), `negative` (implies out of favour,
  an unclear role, or a squad omission the article frames as unusual), or omitted.
- `transfer_signal_indirect` — `positive` only when the quote or situation itself implies a
  possible future away from the club **without an explicit transfer report existing yet** — a
  manager declining to guarantee a player's future, a player questioned about his future, a squad
  omission, a replacement being lined up. Omitted otherwise, never inferred from silence.

### No schema change

`events.payload` already stores `{ facts: [...] }` (`persist.js`'s `persistExtraction()`), and
`facts[].field` is a free string. Every field above is just a new field name in that array. The
only "new" schema items are two `subtype` string values under the existing `media` type, and
`10-architecture.md`'s module map already calls the schema "market-agnostic" for exactly this
reason: a value in a free-text column is data, not structure.

### Two consumers, deliberately separate

**Manager Sentiment Signal** (`computeManagerSentimentSignal()`, `signals.js`) answers "what is the
tone around this player right now" — its own `signal_type = 'manager_sentiment'` row in
`signals`/`signal_history`, its own bands (`config.managerSentiment.bands`: NEGATIVE / MIXED /
POSITIVE / VERY POSITIVE), its own half-life (14 days — opinion drifts slower than a transfer
rumour cycle) and window (45 days). A player with no quote coverage in the window gets **no row at
all**, never a fabricated neutral 50 — `signals.score`/`band` are `NOT NULL`, so `recomputeSignals()`
skips the write entirely when `computeManagerSentimentSignal()` returns `score: null`.

**Indirect transfer signal** is a sixth, small input into the existing Transfer Signal
(`computeTransferSignal()`), not a new signal. `config.transferSignal.weights.indirectSignal = 6`
is deliberately the smallest of the six weights — `reportVolume` (23) and `sourceQuality` (19) were
each trimmed by 3 to make room for it, keeping the total at 100. A hedging quote is real evidence,
but it must never be able to move the band the way an explicit transfer report can.

These are different questions with different answers on purpose: a manager can be full of public
praise for a player he is simultaneously trying to sell. Folding sentiment into the transfer number
would make neither number mean one thing.

### Where it surfaces

- Dashboard: `manager_comment`/`player_comment` route to the **performance** section
  (`QUOTE_SUBTYPE_SECTION` in `intelligence.js`), not the generic `media` → market bucket other
  `media` events fall into — a quote about a player's standing at his club reads closer to
  "出場・パフォーマンス" than to Japan-market attention. The section's label and blurb were updated
  to say so ("出場・コメント").
- Player page: a dedicated `🎙️ 監督・選手コメント` panel (`renderPlayerPage` in `routes/public.js`),
  with a `scoreMeter()` for the sentiment band when there is coverage, and the raw quote events
  otherwise. `buildPlayerDossier()` exposes this as `dossier.quotes` — `{ sentiment, events }` — a
  slice of the existing `media` events, not a new event type, so nothing double-counts against
  `dossier.media.events`.

### Wording discipline carries over unchanged

`changes.js`'s `withinWordingRules()` gate against `FORBIDDEN_PHRASES` applies to quote-derived
headlines exactly as it does to a transfer report. The extraction prompt is explicit that this
describes what was said, not a prediction: "Do not present any of this as a fact about what will
happen; it describes what was said."

## 2. The year-round content calendar

### Two phases, not six

The founder's brainstorm described six phases (in-season, just-after-season, transfer window,
pre-season, just-before-kickoff, season-start). `src/lib/season.js` implements two:
`transfer_window` and `in_season`, as a pure function of the calendar date, in JST.

This is a deliberate narrowing, not a shortcut taken to save time. Exact transfer-window and
pre-season dates are set per league, per year, and shift — Deadline Day is not the same date every
season and is not the same date in every top-5 league. Asserting a precise sub-phase from a bare
date would be exactly the kind of unsupported precision `docs/strategy/positioning.md` rules out
everywhere else in this product ("never estimate a fee, a salary or a probability"). Two
mutually-exclusive, date-only phases — winter window Jan 1–Feb 3, in-season Feb 4–May 31, summer
window (which absorbs pre-season) Jun 1–Sep 1, in-season Sep 2–Dec 31 — cover the full year with no
gap and no overlap, and every boundary is defensible without a per-league calendar the product does
not have.

**Scope**: this describes the top-5 European leagues' calendar, because JFI tracks Japanese players
abroad there. J.League runs February–December and `seasonPhase()` does not describe it. If J.League
coverage becomes a first-class product surface, this function needs a second, league-relative
phase — not a global one.

**What it changes, and what it does not.** Section order on the daily brief changes:
`transfer, contract, performance, injury, market` during a transfer window;
`performance, injury, market, transfer, contract` otherwise (`sectionsForPhase()` in
`routes/public.js`). The dashboard also shows a small badge (🔥 移籍市場 / ⚽ シーズン中). Nothing
about fetch cadence changes — `60-automation-plan.md`'s fixed 2-hourly schedule stands regardless
of phase; `90-decision-log.md` already rejected varying collection frequency by calendar, and this
does not revisit that.

## 3. A pre-existing bug this work surfaced and fixed

Building a real fixture for this feature (`test/fixtures/feeds/guardian-football.xml`, the "Bayern
head coach" item) turned up a genuine, unrelated defect: `normalize()` in `src/lib/text.js` deleted
apostrophes outright, so `"Ito's future"` normalised to `"itos future"` — merging the possessive
`'s` into the name and destroying the word boundary `containsAlias()` requires. Every possessive
mention of a tracked player's name — "Mitoma's injury", "Ito's future" — was silently failing to
resolve to that player, in both the prefilter's entity-candidate matching and `resolve.js`. This
was live before this work touched it; nothing here introduced it.

Fixed by splitting a trailing `'s` into a separate token before the blanket apostrophe strip
(`([a-z])['’`´]s\b` → `"$1 s"`), so `"ito's"` becomes `"ito s"` — restoring the boundary — rather
than merging into `"itos"`. A name that genuinely contains an apostrophe (O'Neill, N'Golo) is
unaffected: no seed data contains one, and the rule only fires on the specific `<letter>'s<boundary>`
possessive pattern. Regression tests: `test/lib-text.test.js` ("splits a possessive 's rather than
merging it into the name", "matches a name in possessive form, as normalize() now hands it over").
