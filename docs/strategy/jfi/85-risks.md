# JFI Risks

Last updated: 2026-08-20
Status: Living document. Each risk names the mitigation actually implemented, and separately
what remains open — do not let this file collapse into a list of things that sound handled.

## Entity misattribution

`伊藤` and `伊東` are different kanji that romanise identically. Three tracked players are
surnamed `Suzuki`. An unqualified alias match on either surname resolves confidently to the wrong
player if treated as certain. **Mitigated**: `buildEntityIndex()` marks these aliases `ambiguous`
and `article_entities.score` lets a weak match be stored without being trusted by the classifier
or shown as fact (`20-data-model.md`, `90-decision-log.md` D7). **Open**: the mitigation is a flag,
not a solved problem — a wrong high-confidence attribution reaching the daily brief is a
credibility failure for both the free product and the B2B one, and there is no automated check
that catches it after the fact. A human noticing a wrong name on a familiar player is the current
backstop.

## Copyright exposure from article content

The product's entire value depends on ingesting other outlets' reporting. **Mitigated**: no
`body` column exists anywhere in the schema; `articles.excerpt` stores `text.toExcerpt()` output —
a short factual summary, never the article. This caps extraction recall in exchange for legal
safety, deliberately (`20-data-model.md` rule 2). Every public page links to the original source.
**Open**: "short factual summary" is a product policy, not a legal opinion. `40-api-costs.md`'s
`VERIFY` markers on commercial-use terms per source are not yet cleared with counsel, and none
should be treated as cleared until they are.

## Stealth-marketing law on monetised blocks (景品表示法)

Japan's misleading-representation rules treat unlabelled advertising as a violation, and this
product is aimed at a Japanese consumer audience specifically. **Mitigated**: `40-api-costs.md`
requires every monetised block to carry a visible 広告 / PR label as a non-negotiable rule, and
`src/web/monetization.js` renders nothing at all for an unconfigured slot rather than a fallback
placeholder that could be mistaken for content. **Open**: the exact labelling wording and
placement requirement is not yet confirmed with Japanese counsel. Do not enable a real affiliate
or ad placement before that confirmation lands, regardless of how ready the slot code is.

## Overstating confidence — transfers, injuries, commercial impact

`docs/strategy/positioning.md`'s banned-phrase list ("final recommendation", "hidden gem",
"guaranteed", "risk-free") exists because a transfer rumour, an injury status, or a commercial
estimate stated too confidently is the product's core credibility risk with both audiences.
**Mitigated**: `changes.js` enforces `withinWordingRules()` against `FORBIDDEN_PHRASES` as a gate
before a headline can publish, not as a style guide a writer might skip. `commercial_estimates`
has no `value` column — only `band` + `basis`, and `basis` is `NOT NULL` (`20-data-model.md`).
**Open**: the gate catches banned phrases, not banned implications — a headline can be
technically compliant and still read as more certain than the underlying source count supports.
Confidence labels (`CONFIRMED` / `STRONGLY REPORTED` / `REPORTED` / `RUMORED` / `UNVERIFIED`) are
the primary defence against that, and they are only as good as the tier and independent-source
count feeding them.

## Correcting a published claim

A retraction carries legal weight distinct from an ordinary edit — it is an admission the
original claim was wrong, potentially about a specific person's career or a club's negotiating
position. **Not automated, by design**: `60-automation-plan.md` lists this explicitly under "what
is deliberately not automated." No pipeline stage supersedes or deletes a published `changes` row
outside the normal `event.status = 'superseded'` lifecycle; a genuine correction is a human
decision, made by hand. **Open**: there is not yet a documented correction procedure (who decides,
what gets shown at the corrected URL, whether the original is struck through or removed). Write
one before the first correction is needed, not after.

## LLM cost runaway

A classification loop or a misbehaving source that floods the pipeline with matching articles
could spend the monthly budget in a single day. **Mitigated**: `config.llm.dailyCostBudgetUsd`
and `dailyCallBudget` both stop new LLM calls when hit; `llm_cache` prevents re-spending on
identical content; `40-api-costs.md`'s monthly review cadence checks `cost_ledger` actuals against
the model. The cost budget default was corrected from $5/day to $1.50/day specifically because the
old value would not have caught a runaway before real damage (`90-decision-log.md` D4). **Open**:
the budget stops *new* spend; it does not alert anyone that it fired. `60-automation-plan.md`'s
alert table should page a human when a budget stop occurs, and that alert path is not yet wired
to anything beyond the log line.

## Source terms of service and robots.txt

Ingesting a source that forbids it, commercially or at all, is both a legal risk and a
reputational one for a product whose pitch depends on being trustworthy. **Mitigated**:
`config.http.respectRobots` defaults `true` and is checked before every fetch;
`sources.commercial_use` defaults `unknown` (meaning "not cleared for anything beyond internal
signal") rather than defaulting to allowed; `sources:check` runs weekly and disables a source after
3 consecutive errors. Scraping a source with no feed is explicitly out of bounds
(`30-source-strategy.md`). **Open**: `commercial_use` is a flag a human sets, not something the
pipeline infers from a terms-of-service page — a source added without that step being done
correctly is a silent liability until someone reviews it.

## Reliance on generated Japanese text

`title_ja` / `headline_ja` / `summary_ja` are AI-generated Japanese renderings of English-sourced
facts, not human translations. **Mitigated**: the product framing is explicit that these are
generated summaries of extracted facts, not translations of the article (`10-architecture.md`);
the confidence framework applies to the underlying event, not the language it is rendered in.
**Open**: a generation error that changes the meaning of a fact (wrong club, wrong direction of a
transfer signal) is not currently distinguishable from a correct-but-awkward translation by any
automated check. This is the same class of risk as entity misattribution, on the text side rather
than the resolution side.
