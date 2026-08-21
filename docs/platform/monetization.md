# Monetization

Status: Planning. No billing integration exists in this repo yet.

## Funnel (shared across verticals)

```
Landing page
  → Free search / tool (no signup required)
    → Useful result
      → Save / Watchlist (signup gate)
        → Alert (email/push opt-in)
          → Account
            → Premium subscription  or  Affiliate click-through
```

The gate is deliberately placed at *Watchlist*, not at *Search*: search
results are the SEO/no-sales acquisition surface (spec §1, §27) and must stay
ungated, or the funnel loses its top before it starts. Signup should feel
like "save this so I don't lose it," not "pay to see the answer."

## Per-vertical monetization mix

| Vertical | Primary revenue leg | Secondary | Notes |
|---|---|---|---|
| JTD (Football) | Direct/retainer (B2B) | none currently | Not a self-serve funnel today — see `business-strategy.md`. A public free layer (player profiles) can feed the existing outbound motion as a lead-qualification tool, not a payment mechanism |
| Investment | Premium subscription | none (no affiliate model fits "not investment advice" positioning without care — see `legal-risks.md`) | Affiliate-adjacent options (brokerage referral) exist but carry disclosure/registration risk; treat as a later, carefully-reviewed addition, not a default |
| Shopping | Affiliate (primary) | Premium (price alerts, unlimited watchlist) | Matches spec §18: affiliate first, premium second |
| Career (future) | Premium (candidate side) or B2B sourcing fee (employer side) | Affiliate (resume/interview-prep tools) | Out of scope for this MVP round |

## Investment — Premium tier (candidate, unvalidated)

Free:
- Company search
- Basic company page (price, market cap, headline fundamentals)
- Latest news list (titles + links to source, no AI synthesis)
- Watchlist capped at N companies (e.g. 5)

Premium (¥980 / ¥1,980 / ¥2,980 per month — spec's three candidates,
unvalidated against willingness-to-pay):
- Unlimited watchlist
- Daily brief across watchlist
- "What changed" AI synthesis (Bull/Bear/Risks/Catalysts)
- Earnings history comparison
- Alerts (email at minimum; push/Slack/Telegram per `architecture.md` §3)

Pricing choice should be tested, not assumed — start at the middle tier
(¥1,980) with the lowest tier as an anchor, and revisit after the first
100 paying users rather than before.

## Shopping — Affiliate-first model

Free (everything, no paywall):
- Product search & comparison
- Retailer price comparison (Amazon / Rakuten / Yahoo Shopping, contingent
  on affiliate program approval — see `data-sources.md`)
- Basic price history

Premium (later, optional):
- Price-drop alerts below a threshold
- Multi-retailer price-drop digests

Sponsored placement (spec §18) is explicitly deferred: mixing sponsored
results into "best value" rankings before the product has organic trust is
a fast way to poison the affiliate/organic trust that the SEO strategy
depends on. Revisit only after the comparison engine has enough organic
traffic that a clearly-labeled sponsored slot doesn't look like the
default ranking.

## Cross-vertical Premium bundling (future)

Section 21 of the spec proposes a shared User ID across verticals. Once two
or more verticals are live with their own Premium tiers, evaluate a bundled
"Platform Premium" price against the sum of per-vertical prices — but not
before: bundling before there's more than one paid vertical just adds
pricing-page complexity with no user benefit.

## What "revenue per user vs. infra cost per user" needs before it's real

Section 25/26 of the spec calls for a cost/revenue dashboard. That requires,
at minimum: per-user API call attribution, Claude token spend attribution
(see `api-costs.md`), and Premium/affiliate revenue events landed in the
same store as usage events. None of this exists yet — flagging it here so
it's treated as a build item for whichever vertical ships first, not an
afterthought bolted on once costs are already unpredictable.
