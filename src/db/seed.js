/**
 * Seed loader.
 *
 * Seed rows are deliberately marked `seed_unverified`. Squad membership and
 * contract dates go stale, and the product's whole credibility rests on never
 * presenting unverified data as fact — so seeded players are queued for human
 * verification instead of being published as confirmed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { rootDir } from "../config/index.js";
import { all, get, run, transaction } from "./client.js";
import { createLogger } from "../lib/logger.js";
import { normalize, normalizeAlias, containsJapanese, reversedNameVariants, romajiVariants } from "../lib/text.js";

const log = createLogger("seed");

function readSeed(name) {
  return JSON.parse(readFileSync(join(rootDir, "data", "seeds", name), "utf8"));
}

/** Every string a source might use to refer to this player. */
export function buildPlayerAliases(player) {
  const aliases = new Map();

  /**
   * `minLength` differs by provenance. Derived variants need four characters
   * before they are safe against ordinary prose; a curated alias was chosen
   * deliberately, so a real three-letter surname like "Ito" is allowed through
   * and the resolver disambiguates it at match time.
   */
  const add = (value, lang, kind = "name", minLength = 4) => {
    if (!value) return;
    const norm = normalizeAlias(value);
    if (norm.length < (containsJapanese(value) ? 2 : minLength)) return;
    const key = `${norm}::${lang}`;
    if (!aliases.has(key)) aliases.set(key, { alias: value, alias_norm: norm, lang, kind });
  };

  add(player.name_en, "en");
  add(player.name_ja, "ja");
  add(player.name_kana, "kana");

  for (const variant of reversedNameVariants(player.name_en)) add(variant, "en", "nickname");
  for (const variant of romajiVariants(player.name_en)) add(variant, "romaji", "misspelling");

  for (const alias of player.aliases ?? []) {
    const lang = containsJapanese(alias) ? "ja" : "en";
    const parts = normalize(alias).split(" ").filter(Boolean);
    add(alias, lang, parts.length === 1 && lang === "en" ? "surname" : "nickname", 3);
  }

  return [...aliases.values()];
}

export function buildClubAliases(club) {
  const aliases = new Map();
  const add = (value, lang) => {
    if (!value) return;
    const norm = normalizeAlias(value);
    if (norm.length < (containsJapanese(value) ? 2 : 3)) return;
    const key = `${norm}::${lang}`;
    if (!aliases.has(key)) aliases.set(key, { alias: value, alias_norm: norm, lang });
  };

  add(club.name_en, "en");
  add(club.name_ja, "ja");
  add(club.short_name, "en");
  for (const alias of club.aliases ?? []) add(alias, containsJapanese(alias) ? "ja" : "en");
  return [...aliases.values()];
}

export function seed({ verbose = true } = {}) {
  const reference = readSeed("reference.json");
  const clubs = readSeed("clubs.json");
  const players = readSeed("players.json");
  const sources = readSeed("sources.json");

  const stats = { countries: 0, leagues: 0, clubs: 0, players: 0, sources: 0, aliases: 0, queued: 0 };

  transaction(() => {
    for (const country of reference.countries) {
      run(
        `INSERT INTO countries (code, name_en, name_ja, confederation, market_priority)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET name_en = excluded.name_en, name_ja = excluded.name_ja,
           confederation = excluded.confederation, market_priority = excluded.market_priority`,
        country.code, country.name_en, country.name_ja, country.confederation, country.market_priority
      );
      stats.countries += 1;
    }

    for (const league of reference.leagues) {
      run(
        `INSERT INTO leagues (slug, name_en, name_ja, country_code, tier, confederation, jp_visibility)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET name_en = excluded.name_en, name_ja = excluded.name_ja,
           country_code = excluded.country_code, tier = excluded.tier,
           confederation = excluded.confederation, jp_visibility = excluded.jp_visibility`,
        league.slug, league.name_en, league.name_ja, league.country_code,
        league.tier, league.confederation, league.jp_visibility
      );
      stats.leagues += 1;
    }

    const leagueIdBySlug = new Map(all("SELECT id, slug FROM leagues").map((row) => [row.slug, row.id]));

    for (const club of clubs) {
      run(
        `INSERT INTO clubs (slug, name_en, name_ja, short_name, country_code, league_id, website, data_status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'seed_unverified', datetime('now'))
         ON CONFLICT(slug) DO UPDATE SET name_en = excluded.name_en, name_ja = excluded.name_ja,
           short_name = excluded.short_name, country_code = excluded.country_code,
           league_id = excluded.league_id, updated_at = datetime('now')`,
        club.slug, club.name_en, club.name_ja, club.short_name, club.country_code,
        leagueIdBySlug.get(club.league) ?? null, club.website ?? null
      );
      stats.clubs += 1;

      const clubId = get("SELECT id FROM clubs WHERE slug = ?", club.slug).id;
      for (const alias of buildClubAliases(club)) {
        run(
          `INSERT INTO club_aliases (club_id, alias, alias_norm, lang) VALUES (?, ?, ?, ?)
           ON CONFLICT(club_id, alias_norm, lang) DO NOTHING`,
          clubId, alias.alias, alias.alias_norm, alias.lang
        );
        stats.aliases += 1;
      }
    }

    const clubRows = all("SELECT id, slug, league_id FROM clubs");
    const clubBySlug = new Map(clubRows.map((row) => [row.slug, row]));

    for (const player of players) {
      const club = clubBySlug.get(player.club);
      run(
        `INSERT INTO players (slug, name_en, name_ja, name_kana, birth_date, position, nationality,
            current_club_id, league_id, contract_until, contract_confidence, national_team, data_status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'JP', ?, ?, ?, 'unverified', ?, 'seed_unverified', datetime('now'))
         ON CONFLICT(slug) DO UPDATE SET name_en = excluded.name_en, name_ja = excluded.name_ja,
           name_kana = excluded.name_kana, birth_date = excluded.birth_date, position = excluded.position,
           national_team = excluded.national_team, updated_at = datetime('now')`,
        player.slug, player.name_en, player.name_ja, player.name_kana, player.birth_date ?? null,
        player.position ?? null, club?.id ?? null, club?.league_id ?? null,
        player.contract_until ?? null, player.national_team ?? "none"
      );
      stats.players += 1;

      const playerId = get("SELECT id FROM players WHERE slug = ?", player.slug).id;
      for (const alias of buildPlayerAliases(player)) {
        run(
          `INSERT INTO player_aliases (player_id, alias, alias_norm, lang, kind) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(player_id, alias_norm, lang) DO NOTHING`,
          playerId, alias.alias, alias.alias_norm, alias.lang, alias.kind
        );
        stats.aliases += 1;
      }

      // Seeded squad membership is a claim, not a fact. Send it to a human.
      run(
        `INSERT INTO review_queue (item_type, item_id, reason, detail, priority)
         VALUES ('player', ?, 'seed_verification', ?, 2)
         ON CONFLICT(item_type, item_id, reason) DO NOTHING`,
        playerId,
        `Verify club, league and contract status for ${player.name_en}. Seeded from a static roster and never published as confirmed until checked.`
      );
      stats.queued += 1;
    }

    for (const source of sources) {
      const tierReliability = { 1: 92, 2: 78, 3: 58, 4: 35 }[source.tier] ?? 50;
      run(
        `INSERT INTO sources (slug, name, kind, homepage, feed_url, provider, country_code, language, tier,
            reliability_score, commercial_use, licence_note, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET name = excluded.name, kind = excluded.kind,
           homepage = excluded.homepage, feed_url = excluded.feed_url, provider = excluded.provider,
           tier = excluded.tier, commercial_use = excluded.commercial_use,
           licence_note = excluded.licence_note`,
        source.slug, source.name, source.kind, source.homepage, source.feed_url,
        source.provider ?? "rss", source.country_code, source.language, source.tier,
        tierReliability, source.commercial_use ?? "unknown", source.licence_note ?? null,
        source.enabled ?? 0
      );
      stats.sources += 1;
    }
  });

  if (verbose) log.info("seed complete", stats);
  return stats;
}

export default seed;
