# Intelligence Platform — Strategy v1.0

Last updated: 2026-08-20
Status: Current source-of-truth. Supersedes `00-master-blueprint.md` wherever the two disagree.

## 0. Founding idea

Build several self-updating **Intelligence Platforms** on one engine.

```
世界中の情報を自動収集 → AIで構造化 → Entity単位で蓄積 → 変更を検知
→ 日本語で分かりやすく表示 → SEO / Direct traffic でユーザー獲得
→ 広告 / Affiliate / Subscription / B2B で収益化
```

Not a media business. Nobody writes a daily article. The goal is an online asset where
information, users, proprietary data and revenue accumulate largely on their own.

## 1. What changed from the master blueprint

The blueprint remains correct about architecture, confidence and the B2B endpoint. Five things
change, and they change the build.

| | Blueprint | v1.0 |
|---|---|---|
| First-language UI | English | **Japanese**. English is not built first. |
| Free layer | Lead generation and SEO | **A daily-use product in its own right**, with advertising and affiliate revenue |
| First user | European clubs | **The founder**, every morning |
| MVP | Thirteen Phase-1 items | **Five** (§4) |
| Cost ceiling | Implicit | **¥10,000/month**, then ¥30k, then ¥50k |

## 2. Positioning

日本人選手の海外移籍・ニュース・怪我・契約・出場状況などを、世界中の情報源から自動収集し、
日本語で一目で把握できる Daily Football Intelligence Platform。

Not a news roundup. "海外組の移籍情報まとめ" already exists — サッカー海外組ナビ tracks Japanese
players abroad with sources and a timeline; GOAL and サッカーキング both run continuously updated
transfer roundups. **Aggregating transfer news is not a differentiator.**

The differentiator is the shape of the output:

```
News                    ではなく
What changed?  →  How important?  →  Why?  →  What should I watch next?
```

A personal Bloomberg terminal for Japanese players abroad, not a football news site.

Timing helps: the 2026/27 season has ten Japanese players in the Premier League alone, and demand
for following 海外組 in Japanese is correspondingly large.

## 3. The founder is the first power user

This is a product-development mechanism, not a convenience.

Build until the founder opens it every morning and finds it genuinely useful. At that point he
knows, from use rather than speculation:

- which information actually matters
- which players he wants tracked
- which notifications he wants
- which news is noise

He becomes the first power user and the de facto product manager. Nothing ships against a guess
that could have been settled by using the thing.

## 4. MVP — five things, not thirteen

1. 日本人海外組データベース
2. 世界中からの自動収集
3. **昨日から何が変わったか**
4. 選手ページ
5. 日本語UI

That is the whole MVP. Advertising and affiliate slots are built as empty, config-driven
placeholders and only filled once the product is worth opening daily.

### The daily dashboard

```
🇯🇵 JAPAN FOOTBALL INTELLIGENCE — TODAY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔥 今日の重要ニュース 5件
🔄 移籍     ・○○ → 新クラブの関心   ・○○ 契約延長交渉   ・○○ ローン復帰
🏥 怪我     ・三笘：リハビリ状況更新  ・○○：復帰見込み変更
📈 Trending ・中村敬斗 ↑   ・○○ ↑↑
🇯🇵 日本人海外組   Premier League 10人 / Bundesliga 8人 / La Liga 6人 …
⚡ What Changed Since Yesterday
📰 Sources  BBC / Sky / L'Équipe / クラブ公式 / 日本メディア
```

`What Changed Since Yesterday` is the reason a user returns daily. It is the core feature, not a
supporting one.

## 5. Japanese first

- UI, summaries and search are Japanese.
- Foreign sources go 原文 → AI要約 → 日本語. These are **summaries of extracted facts, not
  translations of the article** — which is also what keeps the copyright position defensible.
- Player, club and league names render bilingually where both exist.
- The admin tool stays in English. It is an operator surface, not the product.

Why Japanese first: the founder can use it; 日本人海外組 is a clearly bounded niche; merging
Japanese-language and foreign-language sources is itself the value; Japan commercial data is easier
to collect from inside the market; and it feeds Japan Talent Desk directly.

The **language advantage is the actual moat**. Japanese-only sources that European clubs cannot
read are not a nice-to-have — they are the thing no competitor can trivially copy.

Underneath, the model stays country-independent: `Country / Language / Entity / Club / League /
Market / Source / Event`. Japan is a filter, never a hard-coded assumption.

## 6. Monetisation of the free layer

```
FREE  日本人海外組一覧 / 最新移籍 / 移籍噂 / 怪我 / 契約 / 出場状況
      今日の重要ニュース / What Changed / 選手ページ / リーグ別 / チーム別
        ↓
💰    広告  +  アフィリエイト  +  スポンサー
```

Affiliate placements that fall out naturally:

- Player page → 関連商品: club shirt, national-team shirt, player goods, boots, equipment
- Match/fixture context → この試合を見る → streaming services (Premier League on U-NEXT, other major
  European leagues on DAZN and others in the Japanese market)

**Constraints, in priority order:**

1. Monetisation must never compromise the core UX or make the site feel like an affiliate site.
2. No monetised element may sit between a claim and its sources.
3. Every monetised block carries a visible 広告 / PR label.
4. Nothing above the fold on the dashboard. The first thing on screen is always what changed.
5. Prefer affiliate programmes that are publicly open to self-signup. Do not make the business
   depend on individual commercial negotiations, affiliate approvals or partnerships in phase one.

**The core product must remain useful and viable if all affiliate revenue and every external
partnership is zero.** Advertising, affiliate, Pro and B2B stack on top of a product that already
works without them.

## 7. Pro — later, and only on demand

¥980–¥2,980/month once enough real value exists: watchlists, transfer/injury/contract alerts,
custom notifications, advanced timelines, historical data, player comparison, advanced transfer
intelligence, ad-free.

Building paid features is not itself a goal. Grow free users first, then implement what they
actually ask for.

## 8. B2B — Japan Talent Desk

The funnel is `Free Football Intelligence → B2B Intelligence`. Japan Talent Desk supplies European
clubs with recruitment intelligence, transfer feasibility, Japan-side contract/agent/market context,
player-side openness to Europe, and Japan commercial potential.

## 9. Japan Commercial Intelligence

Design this in from the start. The question is not how good the player is, but:

> この日本人選手を獲得したら日本市場でどんな価値があるか？

Inputs: Instagram / X / YouTube / TikTok followings, Google search interest, Japanese media
mentions and article volume, media reach, engagement, club popularity, merchandise signals, search
trends.

Output is a **range plus named drivers plus confidence** — never a point estimate. 「この選手を獲得
するとシャツが○枚売れる」 is exactly the unsupported claim the product refuses to make.

This develops into club-facing comparison:

| 指標 | Player A | Player B |
|---|---|---|
| Japan Social Reach | High | Medium |
| Media Attention | High | High |
| Search Interest | High | Medium |
| Merchandise Potential | Medium | High |
| Japan Sponsorship Relevance | High | High |

`Recruitment Intelligence × Commercial Intelligence` is the position no incumbent occupies.

## 10. Shared Intelligence Engine

```
                Intelligence Engine
                       │
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
    Football       AI Companies    Japan Market
       │               │               │
       ↓               ↓               ↓
   Player DB       Company DB      Company DB
```

Shared components: source collector, RSS parser, web ingestion, entity resolution, deduplication,
LLM classification, fact extraction, change detection, confidence scoring, database, search,
notifications, admin dashboard, SEO generation, newsletter generation, cost monitoring.

One engine, several assets — not three sites at three times the effort.

## 11. Portfolio and sequencing

```
                 AI Intelligence Company
                         │
       ┌─────────────────┼─────────────────┐
       ↓                 ↓                 ↓
 Football           AI/Tech           Japan Market
 Intelligence      Intelligence       Intelligence
 Consumer/B2B       Consumer/B2B          B2B
                         +
                 Payment Intelligence (B2B SaaS)
```

- **Phase 1 — ⚽ Japan Football Intelligence.** Highest priority. Founder uses it daily, clear niche,
  Japanese market, SEO, affiliate, advertising, Pro, and a path to B2B.
- **Phase 2 — 🤖 AI Company Intelligence.** Reuses the engine. Funding, valuation, headcount,
  products, pricing, Japan presence, Japan jobs, customers, partnerships, competitors, launches.
- **Phase 3 — 🌏 Japan Market Intelligence.** B2B lead generation: what a foreign company is doing in
  Japan — hiring, office, customers, partnerships, pricing, localisation, media, competitors,
  regulatory signals. Revenue order: paid report (¥30k–¥100k+) → subscription (¥30k–¥300k/mo) →
  enterprise (¥300k–¥1M+/mo), and only after free-tier demand validates it.
- **Parallel — 💳 Payment Intelligence.** Continues independently as B2B SaaS
  (¥19,800 / ¥49,800 / ¥98,000 / Enterprise). Shares the data-processing base where it genuinely
  overlaps.

Do not develop all four at once.

## 12. Automation target

90–95%+ automated. Humans do: system improvement, correcting material errors, adding sources,
product strategy, B2B sales, exception handling. Nobody writes daily articles.

## 13. Cost discipline

Record every external service as `Free / Free Tier / Paid / Usage Based / Requires Partnership /
Manual`, with fixed cost, usage cost, free allowance, expected monthly volume and expected monthly
spend. See `40-api-costs.md`.

Budget: **≤ ¥10,000/month** initially, then ¥30,000, then ¥50,000. Do not adopt expensive APIs at
volume before revenue or users exist.

## 14. Prioritisation rule

This corrects a common misreading of cost discipline. "Defer what does not earn" does **not** mean
"do not build what does not earn".

| | Criteria | Action |
|---|---|---|
| A | High user value + low implementation cost | Build now |
| B | Directly monetizable + low implementation cost | Build now |
| C | Important as future proprietary data | Include in the schema from day one |
| D | Low value + high cost | Defer |

Judgement is not "does this make money today" alone. "Will someone want to use this every day" carries
equal weight. If a feature is high-value and cheap to automate, build it before monetisation exists —
especially if it is needed for the founder to use the product daily.

## 15. SEO

One durable page per entity: `/player/kaoru-mitoma`, `/club/brighton`, `/league/premier-league`,
`/transfers`. Later `/company/elevenlabs`, `/japan/elevenlabs`.

Index only pages with real information, real update frequency and proprietary data. No mass
AI-generated thin pages.

## 16. Success metrics

Page views are not the KPI.

- **Football**: DAU, returning users, watchlists, alert subscriptions, affiliate revenue, Pro
  conversion, B2B leads
- **AI**: organic traffic, affiliate conversion, watchlists, Pro conversion
- **Japan Market**: qualified leads, report requests, paid customers, MRR
- **Shared**: **Revenue ÷ API cost**

## 17. Targets

¥100,000/month largely automated, then ¥500,000 → ¥2,000,000 → ¥5,000,000+ across services.
Ambition: a small AI intelligence company at ¥10M–¥100M+ annual revenue.

## 18. Standing instruction

> Do not optimize for building the most features. Optimize for building the smallest system that
> creates recurring user value and can eventually monetize.
>
> Prioritize features that are either: (1) high user value + low implementation cost,
> (2) directly monetizable + low implementation cost, (3) critical for accumulating proprietary
> structured data, or (4) critical for future automation.
>
> Do not build a feature merely because it sounds impressive. However, do not reject a feature merely
> because it does not monetize immediately if it materially increases daily utility, retention, SEO,
> data quality, or future monetization potential.
>
> For every external API/service, document cost, free tier, usage limits, commercial requirements,
> and whether it requires a partnership. Prefer self-controlled/free sources wherever practical.
>
> Avoid making the business dependent on individual commercial negotiations, affiliate approvals, or
> third-party partnerships in the initial phase. Such channels can be added opportunistically once
> traffic exists.
>
> **The core product must remain useful and viable even if all affiliate revenue and external
> partnerships are zero.**
