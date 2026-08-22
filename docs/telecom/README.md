# Telecom Optimization — MVP implementation notes

Status: Household diagnosis (multi-line) implemented and unit-tested. No
live pricing feed — this is a curated snapshot dataset by design (see
"Design commitments" below).

## What this is

"通信費見直し診断" — not a SIM comparison table, a savings *diagnosis*.
The user enters what they currently pay and use, per phone line (their own,
plus family members if they want), and gets back three recommendations per
line — cheapest, balanced, and "stay with your current carrier but switch
plans" — each with the estimated annual yen savings, plus a household total
when more than one line is entered.

This is deliberately **not** "build a 格安SIM比較サイト." The market for a
plain comparison table is saturated (価格.com, Selectra, マイベスト, and
dozens of carrier-affiliate sites already do this well). The differentiated
angle is computing an actual **年間削減額** against the user's real current
spend, and doing it per-household rather than per-line — see the framing
discussion that led to this MVP for the full reasoning.

Served at `/telecom/` in this same repo, following the same pattern as
`/travel/` and `/investment/` — one Node process, one more product.

## What it does

- **Household diagnosis** (`POST /api/telecom/diagnose`): takes 1–8 phone
  lines, each with a current carrier label, current monthly fee, monthly
  data usage (GB), and a call-usage tier (none / occasional 5-minute calls
  / need unlimited calling). Returns, per line:
  - **① 最安 (cheapest)** — the lowest-cost eligible plan across the whole
    dataset that covers the stated data usage and call need.
  - **② バランス重視 (balanced)** — the cheapest plan among a curated
    subset tagged `balancedPick: true` (major-carrier submrands and MVNOs
    with either physical store support or a well-known national network —
    e.g. ahamo, UQ mobile, Y!mobile, Rakuten最強プラン, IIJmio 20GB), so the
    "cheapest possible" option and the "sensible tradeoff" option are both
    visible.
  - **③ 今のキャリア維持 (stay with current carrier)** — the cheapest plan
    within the *same* carrier group as what the user entered (e.g. docomo →
    ahamo/irumo), shown only when the entered carrier label is recognized
    and isn't already an MVNO.
  - Each pick includes `annualSavingsYen` = `(current monthly fee − new
    monthly cost) × 12`.
- When more than one line is submitted, the response also returns
  household-level totals: current combined monthly spend, the combined
  monthly cost under the "all cheapest" and "all balanced" strategies, and
  the resulting annual savings for each.

## What it deliberately does not do (yet)

Per the same "don't overbuild" discipline as the Investment Intelligence
MVP (`docs/investment/README.md`):

- **No home internet / set discounts / family discounts / card points /
  device installment payoff.** The pasted framing discussion that spawned
  this MVP explicitly names these as real cost factors, but folding them in
  now would mean guessing at a much larger and faster-changing dataset
  before the core loop (enter current spend → see savings) is proven. The
  disclaimer on `/telecom/` says this outright so the numbers aren't
  mistaken for a final quote.
- **No account creation, saved profile, or price-change monitoring.** The
  framing discussion's "Personal Telecom Optimizer" vision (save your
  current contract, get notified when your carrier raises prices or a
  cheaper option appears) is real future work, but it needs the shared
  platform's Entity/Alert layer (`docs/platform/architecture.md` §2), which
  doesn't exist in this repo yet — same reasoning the Investment MVP used to
  defer Watchlist/Alert.
- **No scraping, no live carrier API.** The plan dataset
  (`engine/telecom/plans.js`) is a manually curated snapshot, in the same
  spirit as the Travel Decision Engine's design commitment
  (`docs/data-sources.md`: "No scraping. Commercial travel sites are never
  scraped."). Every figure is labelled an estimate, not a live price.
- **No AI-generated explanation text yet.** The "なぜこのプランなのか" copy
  on each pick is a static template (plan notes + tier label), not an
  AI_INFERENCE. Fine for this MVP; a real explanation layer is future work
  once there's a reason to add LLM spend here.

## Design commitments

- **¥0 marginal cost.** No third-party API call sits on the request path —
  `diagnose()` is a pure in-memory computation over a bundled dataset, same
  cost profile as the Travel Decision Engine (`docs/cost-model.md`).
- **Estimates are labelled as estimates.** The dataset's `ASOF` string
  (`engine/telecom/plans.js`) is surfaced in every API response and shown
  on the page, and the disclaimer section tells the user to verify current
  pricing before switching — never presented as a live quote.
- **No affiliate link in this MVP.** The framing discussion's monetization
  plan (SEO → free diagnosis → affiliate/lead-gen to carriers) is real, but
  wiring actual affiliate IDs is a follow-up once the diagnosis loop itself
  is validated — see `docs/platform/monetization.md` for the general
  affiliate-disclosure pattern to follow when that's added.

## Dataset

`engine/telecom/plans.js` — roughly 25 plans spanning docomo (docomo /
ahamo / irumo), au (au / povo2.0 / UQ mobile), SoftBank (SoftBank / LINEMO
/ Y!mobile), 楽天モバイル, and eight MVNOs (IIJmio, mineo, OCN モバイル
ONE, BIGLOBEモバイル, NUROモバイル, HISモバイル, イオンモバイル,
J:COMモバイル). Each entry has its data allowance, base monthly fee, what
call tier is bundled free, the cost to add a higher call tier, whether the
carrier has physical store support, and whether it's tagged as a
`balancedPick`. See the file header for the exact field meanings.

Refreshing the dataset means re-checking each carrier's published pricing
page and editing `plans.js` directly — there's no automated update path by
design (see "No scraping" above).

## Configuration

None. No environment variables, no external API, nothing to set before
this runs locally or in production.

## Testing

`test/telecom-recommend.test.js` unit-tests the pure recommendation logic
(`engine/telecom/recommend.js`) against a small fixture dataset — call
add-on pricing, data-sufficiency filtering, cheapest/balanced/stay-with-
carrier selection, and household aggregation — plus `diagnose()`'s input
validation against the real bundled dataset.

## Next steps

1. Decide whether to add affiliate link wiring once real traffic validates
   the diagnosis loop (see `docs/platform/monetization.md`).
2. Consider adding light home-internet set-discount awareness as a second
   slice, once the mobile-only loop is validated — flagged, not started.
3. Link a saved-profile / price-change-alert feature to the shared
   platform's Entity/Alert layer once that exists (`docs/platform/architecture.md`).
4. Periodically re-check `engine/telecom/plans.js` against each carrier's
   current published pricing — there is no freshness guarantee beyond the
   `ASOF` label.
