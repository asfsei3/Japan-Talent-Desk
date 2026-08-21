/**
 * Entity resolution, with ambiguity as the headline case.
 *
 * The seed data really does contain three players who romanise to "Ito", so the
 * wrong-attribution failure mode is reproducible rather than hypothetical.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dbPath = fileURLToPath(new URL("../var/test-resolve.db", import.meta.url));
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
process.env.JFI_DB_PATH = dbPath;
process.env.JFI_LOG_LEVEL = "error";

const { get, migrate } = await import("../src/db/client.js");
const { seed } = await import("../src/db/seed.js");
const { buildEntityIndex, resolveEntities, resolveEntitiesDetailed, MATCH_SCORES } =
  await import("../src/pipeline/resolve.js");

migrate();
seed({ verbose: false });

const index = buildEntityIndex();

function playerId(slug) {
  return get("SELECT id FROM players WHERE slug = ?", slug).id;
}

function clubId(slug) {
  return get("SELECT id FROM clubs WHERE slug = ?", slug).id;
}

function players(matches) {
  return matches.filter((match) => match.entity_type === "player");
}

test("the index reports what it built", () => {
  assert.ok(index.stats.players >= 31);
  assert.ok(index.stats.clubs >= 37);
  assert.ok(index.stats.ambiguousAliases >= 1);
});

test("a full name in the title is the strongest match", () => {
  const matches = resolveEntities("Kaoru Mitoma out for six weeks with ankle ligament damage", index);
  const player = players(matches)[0];

  assert.equal(player.entity_id, playerId("kaoru-mitoma"));
  assert.equal(player.score, MATCH_SCORES.fullName.title);
  assert.equal(player.match_field, "title");
});

test("the same name scores lower in an excerpt than in a title", () => {
  const title = resolveEntities("Kaoru Mitoma injured", index, { field: "title" });
  const excerpt = resolveEntities("Kaoru Mitoma injured", index, { field: "excerpt" });
  assert.ok(players(excerpt)[0].score < players(title)[0].score);
  assert.equal(players(excerpt)[0].match_field, "excerpt");
});

test("either name order and stripped macrons still match", () => {
  for (const text of ["Mitoma Kaoru scored again", "Hiroki Itō starts at centre-back for Bayern Munich"]) {
    assert.ok(players(resolveEntities(text, index)).length >= 1, text);
  }
});

test("kanji names match inside spaceless Japanese text", () => {
  const matches = resolveEntities("日本代表DF伊藤洋輝がバイエルンで復帰した", index);
  assert.equal(players(matches)[0].entity_id, playerId("hiroki-ito"));
});

test("伊東 and 伊藤 are different players and do not cross-match", () => {
  const junya = players(resolveEntities("伊東純也がゴールを決めた", index));
  const hiroki = players(resolveEntities("伊藤洋輝が先発した", index));
  assert.equal(junya[0].entity_id, playerId("junya-ito"));
  assert.equal(hiroki[0].entity_id, playerId("hiroki-ito"));
});

test("word boundaries are respected in Latin text", () => {
  // "Kubota" must not match the alias "Kubo".
  assert.equal(players(resolveEntities("Kubota Corporation sponsors the league", index)).length, 0);
});

test('"Ito" is marked ambiguous at index build time', () => {
  const candidates = index.ambiguous.get("ito");
  assert.ok(candidates, "expected an ambiguous entry for the alias 'ito'");
  assert.ok(candidates.length >= 2);
  assert.ok(index.players.get("ito").every((entry) => entry.ambiguous));
});

test("an ambiguous surname with no context resolves to nobody, with a reason", () => {
  const { matches, unresolved } = resolveEntitiesDetailed(
    "Ito targeted by Premier League clubs after impressive season",
    index
  );

  assert.equal(players(matches).length, 0, "no player may be credited on an ambiguous surname alone");
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].alias_norm, "ito");
  assert.equal(unresolved[0].reason, "ambiguous_no_context");
  assert.ok(unresolved[0].candidates.includes("hiroki-ito"));
  assert.ok(unresolved[0].candidates.includes("junya-ito"));
});

test("a matching club in the same text disambiguates the surname", () => {
  const { matches, unresolved } = resolveEntitiesDetailed(
    "Reims duo Ito and Nakamura shine in Ligue 1 win at Lens",
    index
  );

  const ito = players(matches).find((match) => match.entity_id === playerId("junya-ito"));
  assert.ok(ito, "Junya Ito plays for Reims and should be the resolved candidate");
  assert.equal(ito.score, MATCH_SCORES.disambiguated.title);
  assert.equal(unresolved.length, 0);

  // And never the other Itos.
  assert.ok(!players(matches).some((match) => match.entity_id === playerId("hiroki-ito")));
});

test("a disambiguated surname scores below a full-name match", () => {
  assert.ok(MATCH_SCORES.disambiguated.title < MATCH_SCORES.surname.title);
  assert.ok(MATCH_SCORES.surname.title < MATCH_SCORES.fullName.title);
  assert.ok(MATCH_SCORES.club.title < MATCH_SCORES.disambiguated.title);
});

test("the full name elsewhere in the text settles an ambiguous surname", () => {
  const { matches, unresolved } = resolveEntitiesDetailed(
    "Hiroki Ito returns: Ito has not played since May",
    index
  );

  assert.equal(players(matches).length, 1);
  assert.equal(players(matches)[0].entity_id, playerId("hiroki-ito"));
  assert.equal(players(matches)[0].score, MATCH_SCORES.fullName.title);
  assert.equal(unresolved.length, 0);
});

test('a surname shared by three players ("Suzuki") is never silently resolved', () => {
  const { matches, unresolved } = resolveEntitiesDetailed("Suzuki impresses again", index);
  assert.equal(players(matches).length, 0);
  assert.ok(unresolved[0].candidates.length >= 3);
});

test("club-only text produces a club match and no player", () => {
  const matches = resolveEntities("Brighton beat Everton at the Amex", index);
  assert.equal(players(matches).length, 0);
  const club = matches.find((match) => match.entity_id === clubId("brighton"));
  assert.equal(club.score, MATCH_SCORES.club.title);
});

test("a nested club alias does not drag in a second club", () => {
  // レアル is Real Madrid's alias and a substring of レアル・ソシエダ.
  const matches = resolveEntities("久保建英、レアル・ソシエダと契約延長で合意へ", index);
  const clubs = matches.filter((match) => match.entity_type === "club");
  assert.deepEqual(clubs.map((match) => match.entity_id), [clubId("real-sociedad")]);
});

test("empty input is safe", () => {
  assert.deepEqual(resolveEntities("", index), []);
  assert.deepEqual(resolveEntities("Kaoru Mitoma", null), []);
});
