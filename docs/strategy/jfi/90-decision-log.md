# JFI Decision Log

Last updated: 2026-08-20
Status: Current working source-of-truth. Append-only; do not rewrite past entries.

`00-master-blueprint.md` states the rule this file exists to satisfy: where a numbered document
contradicts the blueprint, the numbered document wins and the reason is recorded here. In
practice most entries below are a later document overriding an earlier reading of the blueprint,
not the blueprint itself — the distinction matters less than the record.

## Format

Each entry: what was decided, what it overrides or narrows, and which document depends on it. No
entry is removed; a later entry that reverses one says so explicitly and both stay.

## Entries

### D1 — The model is market-agnostic; "Japan" is data, not schema

The blueprint's Layer 3 is written as "Japan Market Intelligence". The schema does not have a
`japan_*` table anywhere. Japan is `countries.market_priority` and `metrics.market = 'JP'`, one
row among many the schema already supports. This is what makes the Asia/Global expansion in
blueprint §21 and §37 a data-loading exercise later rather than a rewrite. See `10-architecture.md`
and `20-data-model.md`.

### D2 — `as_of_date` is always JST, never UTC

`time.todayInTimezone()` defines the business day for every date-keyed table
(`signal_history`, `changes`, `newsletter_issues.issue_date`). A European evening report is
correctly attributed to the following JST day, because the audience reads it the next morning in
Japan. Depends on: `20-data-model.md`, `src/lib/time.js`.

### D3 — The review gate is AND, not OR

Blueprint §26 lists review triggers as a flat list, which reads as OR: `importance ≥ 4` **or**
`confidence ≤ reported`. Modelled at 5,000 articles/day (`50-cost-model.md` §"What actually breaks
first"), the OR reading produces 50+ items a day, over an hour of review, and fills
`config.review.maxOpenItems` (250) inside a week — directly against blueprint §23's automation
target. The AND reading — high-impact **and** weakly sourced, plus a short unconditional list
(new player entity, contradictory sources, ambiguous entity resolution) — holds the queue near
7 items/day at that volume. `src/pipeline/persist.js` implements AND. This is the single most
consequential reading decision in the cost model.

### D4 — `config.llm.dailyCostBudgetUsd` default corrected from $5 to $1.50

$5/day is $152/month (¥22,800), more than double the entire Phase 1 budget ceiling in
`50-cost-model.md` (¥10,000/month, all external spend). At that setting a runaway classification
loop could burn two months of budget in a single day before the guardrail fired. Corrected to
$1.50/day ($45.6/month), which leaves roughly ¥7,000/month for LLM spend against the ceiling with
~¥3,000/month left for hosting and other non-LLM costs. `config.llm.dailyCallBudget` (600/day) was
checked against the same ceiling and left unchanged — it binds at ~8,200 articles/day, well past
the volume the cost ceiling allows, so it was never the operative guardrail. See
`src/config/index.js` and `40-api-costs.md`.

### D5 — Railway scheduled jobs rejected as the primary scheduling mechanism

A Railway volume attaches to one service. A separate cron service would get a separate volume and
therefore a separate, empty database — the single most consequential deployment fact in
`10-architecture.md`. Primary mechanism is an in-process `setInterval` tick inside the same
process that serves HTTP and holds the volume (`src/web/scheduler.js`). A `POST
/intel/admin/run?job=` endpoint is kept as a backup trigger for a forced run or a suspected-wedged
tick, not as the default path.

### D6 — Automated sending stays rejected; blueprint §35 is not adopted

Blueprint §35 contemplates eventually automating "low-risk" social posting. `docs/newsletter/
operations.md`'s automation boundary — AI-assisted draft, human review, scheduled delivery; no
fully automated send — is treated as absolute, not a Phase 1 stepping stone. `config.newsletter.
requireHumanApproval` and `config.social.requireHumanApproval` both default `true` and there is no
code path from `draft` to `sent`/`posted` that skips a human-set `approved_by`. See
`60-automation-plan.md`.

### D7 — Ambiguous player aliases record a low-confidence match, never auto-resolve

`伊藤` (Ito) vs `伊東` (Ito, different kanji) and the three tracked players surnamed `Suzuki` are the
concrete cases. An unqualified surname match cannot be trusted to name the right player.
`buildEntityIndex()` in `src/pipeline/resolve.js` returns an `ambiguous` flag per alias, and
`article_entities.score` lets a weak match be recorded without being trusted downstream. The
resolution rule stays in `resolve.js`, not in the schema. See `20-data-model.md` and
`30-source-strategy.md`.

### D8 — Sibling product ideas from the founder's later brainstorm are out of scope, not adopted or rejected

Global Career Intelligence, AI Company Intelligence, Japan Market Intelligence (B2B lead-gen), and
Global News Intelligence Japan were proposed as products that could share JFI's collection →
structuring → intelligence → decision-support engine. None of them get a table in `20-data-model.md`
and none of their sources are seeded. They are parked in `80-product-ideas.md` precisely so a
future session does not accidentally fold their schema needs into JFI's — see that document for
why the boundary is there.
