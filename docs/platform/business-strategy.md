# Vertical Evaluation — Business Strategy

Status: Planning. Scores below are directional judgment calls for
prioritization discussion, not measured data — this repo has no analytics
pipeline yet (see `docs/platform/README.md`).

## Evaluation framework

Every vertical (current or candidate) is scored 1 (weak) – 5 (strong) on:

1. No-sales user acquisition (organic/SEO/SNS reachable, no outbound needed)
2. SEO fit
3. SNS/community fit
4. Free → paid conversion potential
5. Affiliate potential
6. Subscription potential
7. Retention / repeat-use potential
8. Automatable update rate (how much stays fresh without a human)
9. API cost exposure
10. Data acquisition difficulty
11. Regulatory / copyright risk
12. Support load
13. Risk of being fully replaced by "just ask an AI"
14. Moat from proprietary data/history
15. Realistic revenue potential (3mo / 1yr / 3yr, qualitative)

## JTD (Football Intelligence) — current state, honestly scored

JTD is the platform's live product today, so it's the most important row —
and it is currently the **worst fit** for this framework's north star
(spec §0: "product-led growth, zero manual updates"). Naming that clearly
matters more than flattering it:

| # | Score | Why |
|---|---|---|
| 1. No-sales acquisition | 2 | Positioning doc frames JTD as a direct relationship product for European clubs (`docs/strategy/positioning.md`) — `docs/outbound/` exists because outbound is the actual current motion, not a fallback |
| 2. SEO fit | 2 | The public site is a newsletter landing page, not indexed content depth; the ICP (club recruitment staff) rarely search generically |
| 3. SNS/community fit | 2 | Recruitment intelligence is not a public sharing category — clubs won't repost "this is who we're scouting" |
| 4. Free→paid conversion | n/a | No free self-serve tier exists; this is currently a single-tier direct relationship, not a funnel |
| 5. Affiliate potential | 1 | No natural affiliate surface in B2B recruitment intelligence |
| 6. Subscription potential | 3 | Plausible (retainer/desk-access model) but unbuilt |
| 7. Retention | 4 | Real retention driver if it works — clubs that trust a source keep using it season over season |
| 8. Automatable update rate | 2 | The actual value driver (agent/player-side signal, deal realism — `positioning.md`) is explicitly *not* automatable; only the surrounding context (fixtures, official transfer news) is |
| 9. API cost exposure | 5 (low risk) | Minimal API spend today — Brevo only |
| 10. Data acquisition difficulty | 4 (hard) | The valuable layer is relationship/local-source-based, not scrapeable |
| 11. Regulatory/copyright risk | 3 | Must stay clearly non-agent (see `legal-risks.md`) or it risks looking like unlicensed intermediary activity in some jurisdictions |
| 12. Support load | 3 | Currently high-touch by design (a "desk"), which is fine at low volume, expensive at scale |
| 13. AI-replacement risk | 2 | Low — the moat is human-sourced local signal, which is exactly what a generic AI chat answer can't produce |
| 14. Moat from history | 4 | High potential (season-over-season player tracking) if it's actually captured structurally instead of living in one-off reports |
| 15. Revenue potential | 3mo: manual deals only · 1yr: a handful of retainers if outbound converts · 3yr: ceiling capped by support-load-per-club unless productized |

**Reading**: JTD is a real, differentiated B2B product, but it is currently
architected as a *service*, not a *platform vertical*. It scores well on
moat and retention and poorly on everything PLG-related. The platform
architecture (`architecture.md`) gives JTD a path to a searchable/free
top-of-funnel layer (public player profiles, a JTD-branded weekly digest)
that feeds the same outbound relationships it runs today — not a
replacement for outbound, a supplement that lowers acquisition cost per
club over time.

## Candidate verticals

| Vertical | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Investment Intelligence** | 4 | 5 | 4 | 4 | 2 | 4 | 4 | 4 | 3 | 3 | 3 | 3 | 2 | 4 | Best SEO fit of the set (ticker pages = high-intent search volume); regulatory risk is manageable if strictly research-framed (see `legal-risks.md`); AI-replacement risk is low *if* the product is structured facts + history, not "ask AI about a stock" |
| **Shopping Intelligence** | 4 | 4 | 3 | 3 | 5 | 2 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | Strongest affiliate fit; weakest subscription fit; commoditized category (many incumbents) raises AI-replacement and differentiation risk unless price-history/alerting moat is real |
| **Career Intelligence** (adjacent to JTD's own domain) | 3 | 3 | 3 | 3 | 2 | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 3 | 3 | Closest conceptual cousin to JTD (role/salary/location data); would compete for the same eng time as JTD's own roadmap — sequencing risk, not a strategic reason to avoid |
| **Global News Intelligence** | 3 | 3 | 3 | 2 | 1 | 3 | 2 | 4 | 3 | 4 | 2 | 3 | 1 | 2 | High AI-replacement risk — "summarize the news" is the single most commoditized AI use case; low priority unless narrowly scoped (e.g. Japan-market news, reusing JTD's existing sourcing muscle) |
| **Travel Intelligence** | 3 | 3 | 3 | 3 | 4 | 2 | 3 | 3 | 4 | 3 | 3 | 3 | 3 | 2 | Affiliate-viable but data acquisition (live pricing) is API-cost-heavy and dominated by incumbents (Google Flights/Hotels, Skyscanner) |
| **Insurance Intelligence** | 2 | 3 | 1 | 3 | 3 | 2 | 3 | 2 | 3 | 2 | 4 | 4 | 4 | 3 | Highest regulatory/support load of the set; long sales-adjacent cycles fight the "no human sales" goal directly |
| **Football Intelligence, rebuilt on platform (target state)** | 4 | 4 | 3 | 4 | 2 | 4 | 4 | 3 | 4 | 3 | 3 | 3 | 2 | 5 | What JTD becomes *if* migrated per `architecture.md` §5 — public player-profile pages driving inbound club interest, retainer/Premium tier for full desk access |

## Recommended sequencing

1. **JTD platform migration** (not a new vertical — turning the existing
   product into the first live instance of the shared architecture). Lowest
   risk: real revenue relationship already exists, and the migration itself
   (public Entity pages, structured player history) is useful even before
   any new vertical ships.
2. **Investment Intelligence** as the first genuinely new vertical: best
   SEO/no-sales fit in the candidate set, cleanest data-source landscape
   (SEC EDGAR is free/unlimited-ish, see `data-sources.md`), and the
   FACT/INTERPRETATION/AI_INFERENCE discipline required for compliance
   (`legal-risks.md`) is good practice to build into the shared pipeline
   early, since every later vertical benefits from it.
3. **Shopping Intelligence** once the pipeline exists: reuses ingestion +
   alert engine, adds the affiliate revenue leg the platform currently
   lacks entirely.
4. Career / Travel / Global News / Insurance: revisit after (1)–(3) prove
   the shared architecture actually reduces per-vertical build cost — that
   is the entire thesis of spec §0, and it should be checked against reality
   before vertical #4 is greenlit, not assumed.

## Explicit tension to track

Spec §0 requires "product-led growth, zero manual updates" as a top
priority, but JTD's own positioning doc requires the opposite for its core
value prop (`docs/strategy/positioning.md`: "player-side signal reader",
"availability should be verified directly" — i.e., a human-sourced,
non-automatable signal). This is not a contradiction to resolve by
automating away JTD's actual differentiator; it's a signal that **JTD and
future verticals will have different acquisition motions**, and the shared
architecture should support both (a high-touch B2B desk *and* a self-serve
PLG funnel) rather than forcing JTD into a PLG shape it isn't suited to.
