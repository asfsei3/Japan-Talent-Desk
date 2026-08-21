import "./helpers/test-env.js";

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { all, get } from "../src/db/client.js";
import { buildClubAliases, buildPlayerAliases } from "../src/db/seed.js";
import { freshDb } from "./helpers/db.js";

freshDb();

describe("seed data", () => {
  it("loads the tracked player roster with clubs and leagues attached", () => {
    const players = get("SELECT COUNT(*) AS n FROM players WHERE tracked = 1").n;
    assert.ok(players >= 30, `expected the seeded roster, got ${players}`);

    const orphaned = get("SELECT COUNT(*) AS n FROM players WHERE current_club_id IS NULL").n;
    assert.equal(orphaned, 0);
  });

  it("never publishes seeded rows as verified", () => {
    const verified = get("SELECT COUNT(*) AS n FROM players WHERE data_status <> 'seed_unverified'").n;
    assert.equal(verified, 0);

    const contracts = get("SELECT COUNT(*) AS n FROM players WHERE contract_confidence <> 'unverified'").n;
    assert.equal(contracts, 0);
  });

  it("queues every seeded player for human verification", () => {
    const queued = get(
      "SELECT COUNT(*) AS n FROM review_queue WHERE item_type = 'player' AND reason = 'seed_verification'"
    ).n;
    const players = get("SELECT COUNT(*) AS n FROM players").n;
    assert.equal(queued, players);
  });

  it("builds multilingual aliases including the reversed name order", () => {
    const aliases = buildPlayerAliases({
      name_en: "Kaoru Mitoma",
      name_ja: "三笘薫",
      name_kana: "みとまかおる",
      aliases: ["Mitoma", "三笘"],
    }).map((entry) => entry.alias_norm);

    assert.ok(aliases.includes("kaoru mitoma"));
    assert.ok(aliases.includes("mitoma kaoru"));
    assert.ok(aliases.includes("三笘薫"));
    assert.ok(aliases.includes("みとまかおる"));
  });

  it("drops alias fragments too short to match safely", () => {
    const aliases = buildPlayerAliases({ name_en: "Ao Tanaka", aliases: ["Ao"] }).map((e) => e.alias_norm);
    assert.ok(!aliases.includes("ao"), "two-letter Latin fragments would match ordinary prose");
  });

  it("keeps club aliases in both scripts", () => {
    const aliases = buildClubAliases({
      name_en: "Brighton & Hove Albion",
      name_ja: "ブライトン",
      short_name: "Brighton",
      aliases: ["BHAFC"],
    }).map((entry) => entry.alias_norm);

    assert.ok(aliases.includes("brighton hove albion"));
    assert.ok(aliases.includes("ブライトン"));
    assert.ok(aliases.includes("bhafc"));
  });

  it("records the romanised-surname collision the resolver has to handle", () => {
    // Hiroki Ito (伊藤洋輝) and Junya Ito (伊東純也) are different people.
    const owners = all(
      "SELECT DISTINCT player_id FROM player_aliases WHERE alias_norm = 'ito'"
    );
    assert.ok(owners.length >= 2, "expected the surname 'ito' to be ambiguous in the seed data");
  });

  it("seeds sources with licence and tier metadata", () => {
    const unknown = get("SELECT COUNT(*) AS n FROM sources WHERE commercial_use = 'unknown'").n;
    assert.equal(unknown, 0, "every source needs an explicit commercial-use flag");

    const tiers = all("SELECT DISTINCT tier FROM sources ORDER BY tier").map((row) => row.tier);
    assert.deepEqual(tiers, [1, 2, 3, 4]);
  });
});
