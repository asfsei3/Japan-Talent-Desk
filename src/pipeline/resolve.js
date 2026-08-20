/**
 * Entity resolution: article text -> tracked players and clubs.
 *
 * Two properties matter more than recall here. First, matching has to work
 * across kanji, kana, romaji and either name order, which is why everything is
 * folded through `text.normalizeAlias` before comparison. Second, an ambiguous
 * name must never be silently resolved: Hiroki Ito (伊藤洋輝), Junya Ito
 * (伊東純也) and Ryotaro Ito (伊藤涼太郎) all romanise to "Ito", and attaching a
 * transfer report to the wrong player is the single most damaging mistake this
 * system can make. Ambiguity is therefore detected at index build time and
 * resolved only against corroborating context.
 */
import { all } from "../db/client.js";
import { containsAlias, containsJapanese, normalize, normalizeAlias } from "../lib/text.js";
import { nowIso } from "../lib/time.js";

/**
 * Match scores. Deliberately coarse and ordered rather than tuned: a full name
 * in a headline is strong evidence, a surname that needed context to resolve is
 * weak evidence, and a club with no player is the weakest thing worth keeping.
 */
export const MATCH_SCORES = {
  fullName: { title: 100, excerpt: 70 },
  surname: { title: 65, excerpt: 45 },
  disambiguated: { title: 45, excerpt: 30 },
  club: { title: 25, excerpt: 15 },
};

const SURNAME_KINDS = new Set(["surname"]);

function isJapaneseAlias(alias, lang) {
  return lang === "ja" || lang === "kana" || containsJapanese(alias);
}

/** Surname implied by a two-part romanised name, e.g. "Ao Tanaka" -> "tanaka". */
function derivedSurname(nameEn) {
  const parts = normalize(nameEn).split(" ").filter(Boolean);
  if (parts.length !== 2) return null;
  const surname = parts[1];
  return surname.length >= 3 ? surname : null;
}

function pushEntry(map, key, entry) {
  const entries = map.get(key);
  if (entries) entries.push(entry);
  else map.set(key, [entry]);
}

export function buildEntityIndex() {
  const playerRows = all(
    `SELECT id, slug, name_en, name_ja, current_club_id, league_id, tracked, status
       FROM players WHERE status = 'active'`
  );
  const clubRows = all("SELECT id, slug, name_en, name_ja, league_id FROM clubs");

  const playerById = new Map(playerRows.map((row) => [row.id, row]));
  const clubById = new Map(clubRows.map((row) => [row.id, row]));

  const players = new Map();
  const clubs = new Map();

  for (const row of all("SELECT id, player_id, alias, alias_norm, lang, kind FROM player_aliases")) {
    if (!playerById.has(row.player_id)) continue;
    pushEntry(players, row.alias_norm, {
      id: row.id,
      playerId: row.player_id,
      alias: row.alias,
      aliasNorm: row.alias_norm,
      lang: row.lang,
      kind: row.kind,
      ambiguous: false,
      derived: false,
      isJapanese: isJapaneseAlias(row.alias, row.lang),
    });
  }

  /**
   * Surnames derived from full names are added ONLY where they collide with
   * another player. The seed loader deliberately does not derive surnames
   * (they generate false positives against ordinary prose), so this must not
   * widen the matching surface — it exists so that "Suzuki", curated for one
   * player but shared by three, is seen as ambiguous instead of resolving to
   * whichever player happened to be seeded with the alias.
   */
  const surnameOwners = new Map();
  for (const row of playerRows) {
    const surname = derivedSurname(row.name_en);
    if (!surname) continue;
    if (surnameOwners.has(surname)) surnameOwners.get(surname).add(row.id);
    else surnameOwners.set(surname, new Set([row.id]));
  }

  for (const [surname, owners] of surnameOwners) {
    const existing = players.get(surname);
    const distinct = new Set(owners);
    for (const entry of existing ?? []) distinct.add(entry.playerId);
    if (distinct.size < 2) continue;

    for (const playerId of owners) {
      if (existing?.some((entry) => entry.playerId === playerId)) continue;
      pushEntry(players, surname, {
        id: null,
        playerId,
        alias: playerById.get(playerId).name_en.split(" ").slice(-1)[0],
        aliasNorm: surname,
        lang: "en",
        kind: "surname",
        ambiguous: true,
        derived: true,
        isJapanese: false,
      });
    }
  }

  // An alias that points at more than one player is ambiguous for every one of them.
  const ambiguous = new Map();
  for (const [aliasNorm, entries] of players) {
    const candidates = [...new Set(entries.map((entry) => entry.playerId))];
    if (candidates.length < 2) continue;
    ambiguous.set(aliasNorm, candidates);
    for (const entry of entries) entry.ambiguous = true;
  }

  for (const row of all("SELECT id, club_id, alias, alias_norm, lang FROM club_aliases")) {
    if (!clubById.has(row.club_id)) continue;
    pushEntry(clubs, row.alias_norm, {
      id: row.id,
      clubId: row.club_id,
      alias: row.alias,
      aliasNorm: row.alias_norm,
      lang: row.lang,
      isJapanese: isJapaneseAlias(row.alias, row.lang),
    });
  }

  return {
    players,
    clubs,
    ambiguous,
    playerById,
    clubById,
    builtAt: nowIso(),
    stats: {
      players: playerById.size,
      clubs: clubById.size,
      playerAliases: players.size,
      clubAliases: clubs.size,
      ambiguousAliases: ambiguous.size,
    },
  };
}

/**
 * Japanese has no word boundaries, so aliases are matched against a
 * space-stripped copy of the text while Latin aliases keep boundary checking.
 * Mixed-script headlines are normal in Japanese football media, hence both.
 */
function haystacks(text) {
  const latin = normalize(text);
  return { latin, japanese: latin.replace(/\s+/g, "") };
}

function best(map, key, candidate) {
  const current = map.get(key);
  if (!current || candidate.score > current.score) map.set(key, candidate);
}

/**
 * @param {string} text
 * @param {object} index result of buildEntityIndex()
 * @param {{ field?: "title"|"excerpt", unresolved?: Array }} [opts]
 *        `unresolved` collects `{ alias, candidates, reason }` for names that were
 *        seen but deliberately not resolved, so the prefilter can explain itself.
 */
export function resolveEntities(text, index, opts = {}) {
  const { field = "title", unresolved } = opts;
  if (!text || !index) return [];

  const hay = haystacks(text);
  const matched = new Map();

  const hit = (entry) =>
    containsAlias(entry.isJapanese ? hay.japanese : hay.latin, entry.aliasNorm, entry.isJapanese);

  // Clubs first: they are the main corroborating context for ambiguous names.
  const matchedClubIds = new Set();
  for (const entries of index.clubs.values()) {
    for (const entry of entries) {
      if (!hit(entry)) continue;
      matchedClubIds.add(entry.clubId);
      best(matched, `club:${entry.clubId}`, {
        entity_type: "club",
        entity_id: entry.clubId,
        matched_text: entry.alias,
        match_field: field,
        score: MATCH_SCORES.club[field],
      });
    }
  }

  const directPlayerIds = new Set();
  const ambiguousHits = new Map();

  for (const [aliasNorm, entries] of index.players) {
    const hitEntry = entries.find(hit);
    if (!hitEntry) continue;

    if (index.ambiguous.has(aliasNorm)) {
      ambiguousHits.set(aliasNorm, hitEntry);
      continue;
    }

    directPlayerIds.add(hitEntry.playerId);
    const bucket = SURNAME_KINDS.has(hitEntry.kind) ? MATCH_SCORES.surname : MATCH_SCORES.fullName;
    best(matched, `player:${hitEntry.playerId}`, {
      entity_type: "player",
      entity_id: hitEntry.playerId,
      matched_text: hitEntry.alias,
      match_field: field,
      score: bucket[field],
    });
  }

  for (const [aliasNorm, hitEntry] of ambiguousHits) {
    const candidates = index.ambiguous.get(aliasNorm) ?? [];

    // The full name appearing elsewhere in the text already settled it.
    const byFullName = candidates.filter((playerId) => directPlayerIds.has(playerId));
    if (byFullName.length === 1) continue;

    const byClub = candidates.filter((playerId) => {
      const clubId = index.playerById.get(playerId)?.current_club_id;
      return clubId && matchedClubIds.has(clubId);
    });

    if (byClub.length === 1) {
      best(matched, `player:${byClub[0]}`, {
        entity_type: "player",
        entity_id: byClub[0],
        matched_text: hitEntry.alias,
        match_field: field,
        score: MATCH_SCORES.disambiguated[field],
      });
      continue;
    }

    // No corroboration, or corroboration for more than one candidate: emit
    // nothing. A wrong player attribution is worse than a missed article.
    unresolved?.push({
      alias: hitEntry.alias,
      alias_norm: aliasNorm,
      match_field: field,
      candidates: candidates.map((playerId) => index.playerById.get(playerId)?.slug ?? playerId),
      reason: byClub.length > 1 || byFullName.length > 1 ? "ambiguous_multiple_candidates" : "ambiguous_no_context",
    });
  }

  return [...matched.values()].sort((a, b) => b.score - a.score);
}

/** Same matching, but also returns what was deliberately left unresolved. */
export function resolveEntitiesDetailed(text, index, opts = {}) {
  const unresolved = [];
  const matches = resolveEntities(text, index, { ...opts, unresolved });
  return { matches, unresolved };
}

export function normalizeForMatching(value) {
  return normalizeAlias(value);
}

export default { buildEntityIndex, resolveEntities, resolveEntitiesDetailed, MATCH_SCORES };
