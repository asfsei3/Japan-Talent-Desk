# JFI Automation Plan

Last updated: 2026-08-20
Status: Current working source-of-truth. Living document.

## The constraint this document exists to honour

`docs/newsletter/operations.md` sets an automation boundary and it is not advisory:

> **Allowed:** AI-assisted draft · Sei review · scheduled delivery
> **Not allowed:** fully automated scrape · AI write · send without verification

**Fully automated sending is forbidden.** The pipeline drafts. A human approves. This is honoured
mechanically by `config.newsletter.requireHumanApproval`, which defaults `true`, and by
`newsletter_issues.status` moving `draft → approved → sent` with `approved_by` and `approved_at`
recorded separately from `sent_at`. `getEmailProvider().sendCampaign()` must refuse to run against
an issue whose status is not `approved`.

The same gate applies to social: `config.social.requireHumanApproval`, `social_drafts.status`
`draft → approved → posted`. Blueprint §35 contemplates eventually automating "low-risk updates".
That is not adopted. See `90-decision-log.md`.

`01-strategy-v1.md` §12 targets 90–95% automation and says nobody writes daily articles. Both
things are true at once: the *writing* is automated, the *sending* is not. The human gate is one
approval click per week, not an editorial job.

## Schedule

All times JST. `time.todayInTimezone()` defines the business day; see `90-decision-log.md`.

| Job | Cadence | Command | What it does |
| --- | --- | --- | --- |
| `pipeline` | every 2h, 06:00–22:00 JST (9 runs/day) | `jfi pipeline` | collect → prefilter → classify → signals → changes |
| `pipeline` (overnight) | 02:00 JST | `jfi pipeline` | catches European late-evening reporting before the JST morning |
| `daily` | 05:30 JST | `jfi daily` | snapshot `signal_history`, build the daily brief, draft social posts |
| `weekly` | Monday 07:00 JST | `jfi weekly` | draft Japan Market Weekly into `newsletter_issues` as `draft` |
| `sources:check` | Sunday 03:00 JST | `jfi sources:check` | validate every feed URL, robots.txt and parseability |
| `backup` | 03:30 JST | `VACUUM INTO` | 14-day retention |

Ten pipeline runs a day, not the blueprint's "every 1–3 hours" round the clock. Reasoning:
between 22:00 and 02:00 JST almost nothing publishes in either Japan or Europe, and a fetch that
returns nothing still costs a request against every source's politeness budget. The 02:00 run
exists specifically because European evening kick-offs and their transfer follow-ups land in that
window, and they must be in the 05:30 brief.

Concentrating the daily job at 05:30 is the whole point of the JST boundary: the founder opens
the product in the morning (`01-strategy-v1.md` §3) and "what changed since yesterday" must
already be true when he does.

## What each job does

### `pipeline` — unattended

```
collect()            → fetch enabled sources, dedupe, insert articles
prefilterPending()   → score, gate at config.prefilter.minRelevanceScore
classifyPending()    → triage → extract → escalate, write events + event_sources
recomputeSignals()   → transfer signal, Japan Market Score, per changed player
detectChanges()      → changes rows for the JST day
```

Runs with no human present. Every stage is idempotent: `articles.url_hash` is unique,
`events.dedupe_key` is unique, `changes.dedupe_key` is unique per JST day. Running the pipeline
twice in an hour produces no duplicate output, which is what makes an unattended retry safe.

The only thing `pipeline` cannot do is publish something a human has not seen, because it does
not publish. It writes to the database; `src/web/` reads it.

### `daily` — unattended, produces drafts

Writes `signal_history` snapshots (this is what makes Transfer Momentum computable), builds the
daily brief, and drafts social posts into `social_drafts` with `status = 'draft'`.

Nothing posts. The drafts sit until approved.

### `weekly` — unattended draft, gated send

Builds the Japan Market Weekly draft from the week's `changes` and `events`, following the section
list in `docs/newsletter/operations.md`:

- three Japan-side signals this week
- two U25 profiles to monitor
- one role-specific note
- injury / availability watch
- transfer / loan / contract signal
- youth / national-team note
- Japan-side context note

And its editorial rule, which the generator must enforce per item: **what changed · why it matters
for recruitment · what should be verified.** An item that cannot answer the third is not an item.
This maps directly onto the schema — `changes.before_value/after_value` answers the first, the
event's `payload` and `importance` the second, and `confidence` plus the gap between claimed and
tier-1-confirmed answers the third.

Then it stops. `status = 'draft'`. `runWeekly()` must never call the email provider.

## Unattended versus stops for a human

| Runs unattended | Stops for a human |
| --- | --- |
| Fetching, dedupe, prefilter | Sending the newsletter |
| LLM triage, extraction, escalation | Posting to social |
| Creating and merging `events` | Promoting a source's tier |
| Computing signals and bands | Marking a seeded player `verified` |
| Detecting changes | Resolving a contradiction between tier-2 sources |
| Publishing to `/intel` at confidence ≥ `strongly_reported` | Publishing anything at `unverified` |
| Drafting the newsletter and social posts | Correcting or retracting a published claim |
| Disabling a failing source after 5 consecutive errors | Re-enabling it |

The publishing line deserves stating plainly: **the public site renders unreviewed events**, with
their confidence label and sources attached. That is deliberate — a product that waited for human
review before showing anything would not update daily and would not be automatable. What protects
it is that the confidence label is always shown, `unverified` claims are not published at all, and
the review queue catches the high-impact subset before anyone acts on it.

## Review-queue triggers

`review_queue` is the only human interface into the pipeline. It must stay small or the automation
target is lost. Blueprint §26 lists the categories; here they are as conditions.

### Conditional trigger

**Both** must hold — this is an `AND`, not an `OR`:

```
events.importance >= config.review.autoQueueImportance   (4)
AND confidenceRank(events.confidence) <= confidenceRank(config.review.queueConfidenceCeiling)  (reported)
```

High impact **and** weakly sourced. A tier-1-confirmed transfer at importance 5 does not need a
human — it is a fact from the club. A single tier-3 rumour at importance 2 does not need one
either — it is labelled `rumored` and nobody will act on it. The dangerous cell is the corner:
a big claim on thin sourcing.

Reading this as `OR` would queue most events. `50-cost-model.md` shows that at 5,000 articles/day
the `OR` reading produces 50+ items a day, over an hour of review, and fills
`config.review.maxOpenItems` (250) within a week. The `AND` reading produces ~7. This is the
single decision that determines whether the automation target is reachable.

### Unconditional triggers

Regardless of importance or confidence:

| Reason | Priority | Why |
| --- | --- | --- |
| `contradiction` | 5 | Two independent tier-2 sources assert incompatible facts. Never auto-resolve. |
| `ambiguous_entity` | 5 | An alias flagged `ambiguous` matched with no disambiguator. `ito` matches two tracked players. Guessing puts the wrong person on a public page. |
| `new_player_entity` | 4 | The extractor named a Japanese player not in `players`. Adding a person to the database is a human decision. |
| `confidence_downgrade` | 4 | An event's confidence fell after a source was retracted or reclassified. Something published may now be wrong. |
| `seed_verification` | 2 | Every seeded player, from `seed.js`. 31 open at install. |
| `source_promotion` | 2 | A source cleared reliability ≥ 80 over ≥ 30 resolutions. |
| `licence_unknown` | 3 | A source reached `enabled = 1` with `commercial_use = 'unknown'`. |

### Queue hygiene

- `maxOpenItems` is 250 and the seed opens 31 immediately. At ~7 items/day accrual with no
  resolution the cap is reached in about a month. **The cap is an instruction to clear the queue
  weekly**, not a safety margin.
- When the queue is full, the pipeline must keep running and stop queueing, logging a `partial`
  `job_runs` status. It must not stop collecting. A full queue is an operator problem, not a data
  loss event.
- Priority 5 items are worked first, always. They are the ones that can put a wrong claim about a
  named person on a public page.

## Human-minutes budget

Blueprint §23 targets under 10–20 minutes/day after stabilisation. `01-strategy-v1.md` §12 targets
90–95% automation. Here is the budget that satisfies both, and how it is measured rather than
asserted.

| Task | Frequency | Unit time | Min/day |
| --- | --- | --- | --- |
| Review queue, priority 4–5 | ~4/day | 90s | 6.0 |
| Review queue, priority 1–3 | ~3/day | 45s | 2.3 |
| Daily brief skim | daily | 3 min | 3.0 |
| Social draft approval | 3–5 drafts | 20s | 1.3 |
| Source health check (`jfi status`) | daily | 1 min | 1.0 |
| Newsletter review and approval | weekly | 25 min | 3.6 |
| Weekly `sources:check` triage | weekly | 10 min | 1.4 |
| **Total** | | | **18.6** |

That is at the top of the blueprint's range, at 1,000 articles/day, with the queue behaving. The
path to under 10 minutes is not working faster — it is fewer queue items, which means better
entity resolution and better source independence detection. Those are engineering tasks, not
discipline tasks.

Excluded, deliberately: B2B selling, source curation, product decisions. Those are the work, not
the maintenance. Blueprint §23 and v1.0 §12 both say the same.

### How it is measured

No new table. Compute from timestamps already recorded:

```
human_minutes(day) =
    count(review_queue where date(resolved_at) = day) × 75s
  + count(newsletter_issues where date(approved_at) = day) × 25min
  + count(social_drafts where status='approved' and date = day) × 20s
  + 4 min fixed          -- brief skim + status check
```

75 seconds is an assumption — the blended median across priorities. Validate it once by timing
twenty real resolutions, then replace the constant. Report the figure weekly in the admin
dashboard alongside cost, per blueprint §41's "human minutes/day" automation metric.

The measurement has a known blind spot: it counts resolutions, not attention. A day where the
operator stares at a hard contradiction for ten minutes and resolves nothing scores zero. Accept
it — the alternative is a timer the operator has to remember to start, which will not happen.

## Alerting and failure handling

Delivery: one digest email through the existing Brevo integration, plus `job_runs` rows. No
monitoring vendor in Phase 1–2 (`40-api-costs.md`).

| Condition | Threshold | Action | Severity |
| --- | --- | --- | --- |
| **Consecutive source errors** | `sources.consecutive_errors >= collect.MAX_CONSECUTIVE_ERRORS` (5) | Set `enabled = 0`, queue a `source_error` review item, include in the digest | warn |
| Source disabled itself | any | Name it in the digest with `last_error` | warn |
| **Budget breach** | daily `cost_ledger` sum ≥ 80% of `config.llm.dailyCostBudgetUsd` | Alert while there is still room to act | warn |
| Budget exhausted | ≥ 100% | `classifyPending()` stops making calls, returns `skipped`, job status `partial` | **critical** |
| Call budget exhausted | ≥ `config.llm.dailyCallBudget` | Same | **critical** |
| **Empty pipeline** | a `pipeline` run inserts 0 articles across all sources | Alert immediately — this is a total collection failure, not a quiet news day | **critical** |
| Quiet pipeline | fewer than 5 articles in 24h | Alert | warn |
| No events in 24h | `events` created = 0 | Alert — usually a classify or extraction regression | warn |
| Job failure | `job_runs.status = 'error'` | Digest with the error message | warn |
| **Job stuck** | `job_runs.status = 'running'` older than 30 min | Alert. A crashed process leaves this row behind. | **critical** |
| Review queue full | open items ≥ `config.review.maxOpenItems` | Alert daily until cleared | warn |
| Newsletter draft unapproved | `draft` older than 48h | Remind | info |
| Feed rot | `sources:check` failures > 20% of enabled sources | Alert | **critical** |

Two notes on failure philosophy:

- **An empty pipeline is critical; a quiet one is not.** Zero articles from every source at once
  is always infrastructure — DNS, egress, a wedged process. Two articles on a Tuesday in July is
  football.
- **Failures degrade, they do not halt.** A source that errors is skipped and the run continues.
  A budget breach stops LLM calls but not collection — articles keep landing and get classified
  the next day when the budget resets. The only thing that stops the whole pipeline is a database
  it cannot write to.

### Retry policy

`config.http.retries` is 2, with the per-host delay at 1,200ms. Beyond that, a failed fetch is a
failed fetch — the next scheduled run is 2 hours away and RSS feeds carry a lookback window
(`config.collect.lookbackDays` = 7), so nothing is lost by waiting. Do not build a retry queue
for something the next run will pick up anyway.

## What is deliberately not automated

- **Sending the newsletter.** `docs/newsletter/operations.md`.
- **Posting to social.** Same boundary, same reasoning.
- **Correcting a published claim.** A retraction is a decision with legal weight. See `85-risks.md`.
- **Adding a player to `players`.** The extractor proposes; a human inserts.
- **Promoting a source tier.** The ledger proposes; a human decides.
- **Deciding what to verify next.** The system can list what is unconfirmed. Which of those a
  client should spend a phone call on is judgement, and it is the thing JTD sells.
