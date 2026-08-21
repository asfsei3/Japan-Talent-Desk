/**
 * Contract-shaped fixtures for `src/pipeline/intelligence.js`.
 *
 * Two exports matter:
 *   - `emptyIntelligence()` is what production falls back to when the pipeline
 *     module is missing. It returns valid but empty payloads so the pages say
 *     "no changes recorded" instead of inventing facts.
 *   - `sampleIntelligence()` is development and test data only. It is never
 *     wired in automatically; a caller has to pass it to `createRequestHandler`.
 *
 * The fixtures deliberately include hostile third-party strings (a source name
 * with markup in it) so the escaping tests have something real to catch.
 */
import { seasonPhase } from "../lib/season.js";
import { todayInTimezone } from "../lib/time.js";

export function emptyIntelligence() {
  return {
    buildDailyBrief({ asOfDate } = {}) {
      const date = asOfDate || todayInTimezone();
      return {
        asOfDate: date,
        updatedAt: null,
        sections: { transfer: [], injury: [], contract: [], performance: [], market: [] },
        trending: [],
        counts: { changes: 0, players: 0, sources: 0, articles: 0 },
        seasonPhase: seasonPhase(date),
      };
    },
    buildPlayerDossier() {
      return null;
    },
    buildTransferRadar() {
      return [];
    },
  };
}

function source(overrides = {}) {
  return {
    name: "Sample Wire",
    url: "https://example.com/sample-report",
    title: "Sample report headline",
    publishedAt: "2026-08-19T21:10:00Z",
    detectedAt: "2026-08-19T22:04:00Z",
    tier: 2,
    ...overrides,
  };
}

const SOURCES = {
  official: source({
    name: "Brighton & Hove Albion — Official",
    url: "https://example.com/official/statement",
    title: "Club statement: squad update",
    tier: 1,
  }),
  tier2: source({
    name: "The Guardian — Football",
    url: "https://example.com/guardian/report",
    title: "Bundesliga club renews interest in Japan international",
    tier: 2,
  }),
  // Deliberately hostile: this string must be escaped everywhere it renders.
  hostile: source({
    name: '<script>alert("xss")</script> & "Wire"',
    url: "https://example.com/aggregator/rumour",
    title: "<img src=x onerror=alert(1)> Transfer talk",
    tier: 4,
  }),
};

function change(overrides = {}) {
  return {
    id: 1,
    changeType: "new_event",
    headline: "New club linked",
    detail: "3 new reports · new club linked · contract context changed",
    beforeValue: null,
    afterValue: null,
    importance: 3,
    confidence: "reported",
    asOfDate: "2026-08-20",
    detectedAt: "2026-08-20T08:32:00Z",
    player: {
      id: 1,
      slug: "kaoru-mitoma",
      name: "Kaoru Mitoma",
      nameJa: "三笘薫",
      position: "LW",
      club: "Brighton & Hove Albion",
      league: "Premier League",
      leagueSlug: "premier-league",
    },
    signal: null,
    sourceCount: 3,
    sources: [SOURCES.tier2, SOURCES.hostile],
    ...overrides,
  };
}

export function sampleDailyBrief({ asOfDate } = {}) {
  const date = asOfDate || "2026-08-20";
  return {
    asOfDate: date,
    updatedAt: "2026-08-20T08:32:00Z",
    counts: { changes: 5, players: 31, sources: 8, articles: 214 },
    seasonPhase: seasonPhase(date),
    sections: {
      transfer: [
        change({
          id: 1,
          headline: "Transfer signal moved MEDIUM → HIGH",
          changeType: "signal_band",
          importance: 5,
          confidence: "strongly_reported",
          beforeValue: "MEDIUM",
          afterValue: "HIGH",
          signal: {
            type: "transfer",
            from: "MEDIUM",
            to: "HIGH",
            deltaPct: 0.42,
            direction: "up",
          },
          sourceCount: 4,
          sources: [SOURCES.tier2, SOURCES.hostile],
        }),
        change({
          id: 2,
          headline: "New club linked",
          confidence: "rumored",
          importance: 2,
          sourceCount: 1,
          sources: [SOURCES.hostile],
          player: {
            id: 2,
            slug: "takefusa-kubo",
            name: "Takefusa Kubo",
            nameJa: "久保建英",
            position: "RW",
            club: "Real Sociedad",
            league: "LaLiga",
            leagueSlug: "laliga",
          },
        }),
      ],
      injury: [
        change({
          id: 3,
          changeType: "injury",
          headline: "Returned to team training",
          confidence: "confirmed",
          importance: 4,
          sourceCount: 2,
          sources: [SOURCES.official],
          player: {
            id: 3,
            slug: "wataru-endo",
            name: "Wataru Endo",
            nameJa: "遠藤航",
            position: "DM",
            club: "Liverpool",
            league: "Premier League",
            leagueSlug: "premier-league",
          },
        }),
      ],
      contract: [
        change({
          id: 4,
          changeType: "contract",
          headline: "Contract context changed",
          detail: "Reported as entering the final 18 months.",
          confidence: "reported",
          sourceCount: 2,
          sources: [SOURCES.tier2],
        }),
      ],
      performance: [],
      market: [
        change({
          id: 5,
          changeType: "market",
          headline: "Japan media mentions rose over the last 30 days",
          confidence: "unverified",
          importance: 1,
          sourceCount: 0,
          sources: [],
        }),
      ],
    },
    trending: [
      {
        player: { id: 1, slug: "kaoru-mitoma", name: "Kaoru Mitoma", nameJa: "三笘薫", club: "Brighton & Hove Albion" },
        score: 61,
        band: "HIGH",
        sourceCount: 4,
        momentum: { current: 61, previous: 43, deltaPoints: 18, deltaPct: 0.42, direction: "up" },
      },
      {
        player: { id: 2, slug: "takefusa-kubo", name: "Takefusa Kubo", nameJa: "久保建英", club: "Real Sociedad" },
        score: 38,
        band: "MEDIUM",
        sourceCount: 2,
        momentum: null,
      },
    ],
  };
}

export function samplePlayerDossier(slugOrId) {
  const slug = String(slugOrId ?? "kaoru-mitoma");
  if (slug !== "kaoru-mitoma" && slug !== "1") return null;

  return {
    player: {
      id: 1,
      slug: "kaoru-mitoma",
      name: "Kaoru Mitoma",
      nameJa: "三笘薫",
      position: "LW",
      birthDate: "1997-05-20",
      nationality: "JP",
      club: { name: "Brighton & Hove Albion", slug: "brighton-hove-albion" },
      league: { name: "Premier League", slug: "premier-league" },
      nationalTeam: "senior",
      caps: 40,
      contractUntil: null,
      contractConfidence: "unverified",
      dataStatus: "seed_unverified",
    },
    transfer: {
      score: 61,
      band: "HIGH",
      coverage: 0.78,
      confidence: "strongly_reported",
      momentum: { current: 61, previous: 43, deltaPoints: 18, deltaPct: 0.42, direction: "up" },
      clubsLinked: [
        { club: "Bayer Leverkusen", confidence: "reported", sourceCount: 2, sources: [SOURCES.tier2] },
        { club: "Napoli", confidence: "rumored", sourceCount: 1, sources: [SOURCES.hostile] },
      ],
      inputs: {
        reportVolume: { raw: 6, normalized: 0.7, weight: 26, points: 18.2 },
        sourceQuality: { raw: 0.8, normalized: 0.8, weight: 22, points: 17.6 },
        clubsLinked: { raw: 2, normalized: 0.5, weight: 16, points: 8 },
        contractPressure: { raw: null, normalized: null, weight: 16, points: 0 },
        playerSideSignal: { raw: 0.6, normalized: 0.6, weight: 10, points: 6 },
        clubSituation: { raw: 0.5, normalized: 0.5, weight: 10, points: 5 },
      },
      events: [],
    },
    injury: {
      status: "available",
      confidence: "reported",
      events: [
        {
          id: 21,
          type: "injury",
          headline: "Returned to full training",
          confidence: "reported",
          occurredAt: "2026-08-11T00:00:00Z",
          detectedAt: "2026-08-11T09:20:00Z",
          sources: [SOURCES.tier2],
        },
      ],
    },
    contract: {
      until: null,
      confidence: "unverified",
      monthsRemaining: null,
      events: [],
    },
    performance: {
      note: "Recent first-team rhythm is derived from reported appearances only.",
      events: [
        {
          id: 31,
          type: "performance",
          headline: "Started and assisted in the league fixture",
          confidence: "reported",
          occurredAt: "2026-08-17T00:00:00Z",
          detectedAt: "2026-08-17T20:12:00Z",
          sources: [SOURCES.tier2],
        },
      ],
    },
    media: {
      events: [
        {
          id: 41,
          type: "media",
          headline: "Long-form interview in a Japanese outlet",
          confidence: "reported",
          occurredAt: "2026-08-15T00:00:00Z",
          detectedAt: "2026-08-15T11:00:00Z",
          sources: [SOURCES.hostile],
        },
      ],
    },
    japanMarket: {
      score: 72,
      band: "HIGH",
      coverage: 0.52,
      provisional: true,
      inputs: {
        japanSocialAudience: { raw: 2_100_000, normalized: 0.86, weight: 26, points: 22.4 },
        socialGrowth30d: { raw: 0.031, normalized: 0.26, weight: 14, points: 3.6 },
        japanMediaMentions30d: { raw: 74, normalized: 0.88, weight: 22, points: 19.4 },
        japanSearchInterest: { raw: null, normalized: null, weight: 16, points: 0 },
        nationalTeamRelevance: { raw: 88, normalized: 0.88, weight: 14, points: 12.3 },
        leagueVisibilityInJapan: { raw: 100, normalized: 1, weight: 8, points: 8 },
      },
    },
    timeline: [
      {
        date: "2026-08-20",
        type: "transfer",
        headline: "Transfer signal moved MEDIUM → HIGH",
        confidence: "strongly_reported",
        sources: [SOURCES.tier2, SOURCES.hostile],
      },
      {
        date: "2026-08-17",
        type: "performance",
        headline: "Started and assisted in the league fixture",
        confidence: "reported",
        sources: [SOURCES.tier2],
      },
      {
        date: "2026-08-11",
        type: "injury",
        headline: "Returned to full training",
        confidence: "reported",
        sources: [SOURCES.tier2],
      },
    ],
    sources: [SOURCES.tier2, SOURCES.hostile, SOURCES.official],
  };
}

export function sampleTransferRadar({ limit = 20 } = {}) {
  const rows = [
    {
      player: { id: 1, slug: "kaoru-mitoma", name: "Kaoru Mitoma", nameJa: "三笘薫", position: "LW", club: "Brighton & Hove Albion", league: "Premier League" },
      score: 61,
      band: "HIGH",
      momentum: { current: 61, previous: 43, deltaPoints: 18, deltaPct: 0.42, direction: "up" },
      clubsLinked: 2,
      sourceCount: 4,
      lastChange: { headline: "Transfer signal moved MEDIUM → HIGH", asOfDate: "2026-08-20", confidence: "strongly_reported" },
    },
    {
      player: { id: 2, slug: "takefusa-kubo", name: "Takefusa Kubo", nameJa: "久保建英", position: "RW", club: "Real Sociedad", league: "LaLiga" },
      score: 38,
      band: "MEDIUM",
      momentum: null,
      clubsLinked: 1,
      sourceCount: 2,
      lastChange: { headline: "New club linked", asOfDate: "2026-08-19", confidence: "rumored" },
    },
    {
      player: { id: 3, slug: "wataru-endo", name: "Wataru Endo", nameJa: "遠藤航", position: "DM", club: "Liverpool", league: "Premier League" },
      score: 12,
      band: "LOW",
      momentum: { current: 12, previous: 19, deltaPoints: -7, deltaPct: -0.37, direction: "down" },
      clubsLinked: 0,
      sourceCount: 1,
      lastChange: null,
    },
  ];
  return rows.slice(0, limit);
}

/** Injectable stand-in for the pipeline module. Development and tests only. */
export function sampleIntelligence() {
  return {
    buildDailyBrief: (options) => sampleDailyBrief(options),
    buildPlayerDossier: (slugOrId) => samplePlayerDossier(slugOrId),
    buildTransferRadar: (options) => sampleTransferRadar(options ?? {}),
  };
}

export default { emptyIntelligence, sampleIntelligence, sampleDailyBrief, samplePlayerDossier, sampleTransferRadar };
