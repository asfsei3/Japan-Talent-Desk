# Legal & Compliance Risks

Status: Planning-stage risk notes, not legal advice. Get actual counsel
before launching Investment or Shopping verticals, or before publishing
automated player profiles for JTD — this document exists so those
conversations start from an informed list, not from zero.

## 1. Content collection — general rules (all verticals)

Per spec §3, before adding any Source:

- Check `robots.txt` and the site's Terms of Service for the specific pages
  being ingested — a permissive robots.txt does not override a restrictive
  ToS, and vice versa.
- Prefer official API / RSS over scraping, in that order (spec §3's stated
  priority) — scraping is the fallback, not a default.
- Never store or display full article text. Store `title`, `url`, `source`,
  `date`, a short original summary, and structured facts extracted from the
  article — always link back to the original source. This is both a
  copyright-risk mitigation and the product's actual value proposition
  (spec §3: "structured facts... user to the original").
- Respect rate limits even where technically unenforced — a Source going
  down because of platform traffic is both a ToS violation and a
  self-inflicted data-quality problem.
- Track attribution requirements per Source in the `Source` entity
  (`architecture.md` §2) so attribution isn't a per-article manual decision.

## 2. Investment Intelligence

### Investment-advice regulation

The single highest-risk decision in this vertical is **whether the product
counts as investment advice** under applicable securities law (in the US:
Investment Advisers Act of 1940; in Japan: 金融商品取引法 / Financial
Instruments and Exchange Act investment advisory business registration).
Registration as an investment adviser is expensive and heavily regulated —
avoiding the trigger, not complying with it, should be the design goal for
an MVP.

Mitigations already baked into the product design in `architecture.md` §3:

- Never output a Buy/Sell/Hold recommendation or a price target as the
  product's own claim.
- Tag every AI output FACT / INTERPRETATION / AI_INFERENCE and keep
  AI_INFERENCE framed as "things to consider," not a recommendation —
  Bull Case / Bear Case / Risks / Catalysts, not "you should buy this."
  This mirrors the spec's own explicit instruction (§5, §6, §11).
- Carry a visible, standard disclaimer on every AI-generated section:
  *"This is not investment advice. Information is provided for research
  purposes only and may be incomplete or delayed. Verify independently
  before making investment decisions."* Placement matters — a disclaimer
  buried in a footer is weaker evidence of good-faith design than one
  attached to the AI output itself.
- 要確認: get actual counsel on whether this framing is sufficient in each
  target jurisdiction before launch — self-assessment is not a substitute.

### Market data licensing

Real-time and even 15-minute-delayed exchange data commonly carries
redistribution restrictions separate from the API's own ToS (exchanges
license their data even when a data vendor makes it available via API).
Read each provider's data-redistribution clause specifically, not just its
API rate-limit terms, before displaying prices publicly. This is a known
gap in the research done for `data-sources.md` — flagged there as needing
direct confirmation.

### SEC EDGAR data

U.S. government works are not copyrightable, so filing content itself is
freely usable; the SEC's own guidance asks only that use not imply agency
endorsement. Low risk relative to commercial data vendors, but still
subject to the general fair-access/rate-limit rules (10 req/sec, identify
your crawler via `User-Agent`).

## 3. Shopping Intelligence

### Retailer API terms

Each retailer's affiliate/API terms typically require:

- Using the API's own product data (not scraping the retailer's site
  directly) once API access exists
- Linking to the retailer's product page via the provided affiliate link
  format, not a generic URL
- Not caching/displaying prices as current beyond the retailer's stated
  freshness requirement (a stale advertised price is both a ToS problem and
  a user-trust problem)
- Disclosing the affiliate relationship to users — required both by
  retailer program terms and, independently, by consumer-protection law in
  most markets (in Japan: 景品表示法 stealth-marketing rules that took
  effect in 2023 require clear "PR"/"広告" disclosure on
  compensation-linked recommendations; in the US: FTC endorsement guides)

### Amazon specifically

PA-API/Creators API access is gated behind qualifying sales (see
`data-sources.md`) — this is a business-development constraint, not a
legal one, but it shapes what's legally safe to do in the interim: **do
not scrape Amazon product/price pages to fill the gap.** Amazon's ToS
explicitly prohibits automated data collection outside the API, and
enforcement (IP blocks, legal action in extreme cases) is well documented
industry-wide. Launch Amazon coverage only once API access is legitimately
available.

### Price accuracy liability

Displaying a wrong price (stale, mis-scraped, or a currency error) that a
user relies on can create consumer-protection exposure depending on
jurisdiction. Always link through to the retailer for final price/purchase
rather than presenting the platform's cached price as transactable.

## 4. JTD / Football Intelligence

`docs/strategy/positioning.md` already encodes the most important legal
guardrail for this vertical: **do not position JTD as an agent or broker.**
This is not just brand positioning — it's a real regulatory boundary.
Football intermediary/agent activity is regulated (FIFA Football Agent
Regulations and national federation rules; in some jurisdictions, formal
licensing is required to represent players or clubs in transfer
negotiations, and unlicensed intermediary activity can carry real
penalties). JTD's current framing — "Japan-side context layer," "recruitment
risk filter," explicitly not a longlist/agent/broker service — keeps it on
the information-provider side of that line. Any future feature (e.g. a
direct introduction/deal-facilitation feature) should be checked against
agent-regulation exposure specifically before being built, not assumed safe
because the rest of the product is content-only.

Automated player profile pages (per `architecture.md` §5) raise a smaller,
separate concern: aggregating publicly reported transfer/performance data
is lower risk than the agent-status question above, but attribution and
"verify directly" framing (already required by `positioning.md`) should
carry through into any automated page, not just manually written notes.

## 5. Cross-cutting: user-generated Watchlist/Alert data

Once Watchlist/Alert (spec §7, §17, §22) stores user preferences tied to
companies/products/players, that's personal data under GDPR (EU users) and
APPI (Japan) at minimum. Scope for an MVP: standard consent/privacy-policy
practice, data minimization (don't store more than the feature needs), and
a clear data-deletion path. Full compliance program is out of scope for an
MVP but the schema should not make deletion structurally hard later (e.g.
avoid baking user identifiers into immutable historical AI-analysis rows
that can't be redacted).
