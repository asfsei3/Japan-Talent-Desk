import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTripRequest } from "../engine/parse-request.js";
import { recommendTrips } from "../engine/recommend.js";
import { decodeTrip, encodeTrip } from "../engine/share.js";
import { affiliateConfigFromEnv, affiliateDisclosure, buildBookingLinks } from "../engine/affiliate.js";

describe("share tokens", () => {
  it("round-trips a request through a URL-safe token", () => {
    const original = parseTripRequest("東京から9月の3連休に大人2人、子供2人（8歳と5歳）で15万円以内。海か温泉。");
    const restored = parseTripRequest("", decodeTrip(encodeTrip(original)));

    assert.equal(restored.originId, original.originId);
    assert.equal(restored.month, original.month);
    assert.equal(restored.nights, original.nights);
    assert.equal(restored.adults, original.adults);
    assert.deepEqual(restored.children.map((child) => child.age), original.children.map((child) => child.age));
    assert.equal(restored.budgetYen, original.budgetYen);
    assert.deepEqual(restored.interests, original.interests);
  });

  it("produces a token safe to put in a URL unescaped", () => {
    const token = encodeTrip(parseTripRequest("東京から9月に2泊、大人2人、15万円、海"));

    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  it("reproduces the same recommendation from a shared token", () => {
    const original = parseTripRequest("大阪から2月に大人2人で3泊、雪が見たい。予算20万円。");
    const restored = parseTripRequest("", decodeTrip(encodeTrip(original)));

    assert.equal(
      recommendTrips(restored).categories[0].recommendation.destinationId,
      recommendTrips(original).categories[0].recommendation.destinationId
    );
  });

  it("returns null for an unreadable token instead of throwing", () => {
    for (const token of ["", "!!!", "zzzz", null, undefined, "eyJ2Ijo5OTk5fQ"]) {
      assert.equal(decodeTrip(token), null);
    }
  });
});

describe("booking links", () => {
  const result = recommendTrips(parseTripRequest("東京から9月に2泊、大人2人、子供2人で15万円。海。"));
  const candidate = result.categories[0].recommendation;

  it("always offers at least one hotel provider", () => {
    assert.ok(candidate.bookingLinks.some((link) => link.category === "hotel"));
  });

  it("emits untracked public links when no affiliate id is configured", () => {
    for (const link of candidate.bookingLinks) {
      assert.equal(link.tracked, false);
      assert.ok(link.url.startsWith("https://"));
    }
  });

  it("flags every provider template as needing verification before launch", () => {
    for (const link of candidate.bookingLinks) {
      assert.equal(link.verificationStatus, "unverified");
    }
  });

  it("reads affiliate identifiers from the environment, absent by default", () => {
    assert.deepEqual(affiliateConfigFromEnv({}), {
      rakutenAffiliateId: undefined,
      valueCommerceId: undefined,
      accessTradeId: undefined,
    });

    assert.equal(affiliateConfigFromEnv({ RAKUTEN_AFFILIATE_ID: "abc" }).rakutenAffiliateId, "abc");
  });

  it("adds tracking only once an identifier exists", () => {
    const raw = { destination: { name: { ja: "箱根" } }, route: { mode: "shinkansen" }, cost: { localTransport: { mode: "transit" } } };
    const tracked = buildBookingLinks(raw, { rakutenAffiliateId: "abc" });

    assert.ok(tracked.some((link) => link.tracked && link.url.includes("abc")));
  });

  it("carries a disclosure in both languages", () => {
    assert.ok(affiliateDisclosure.ja.length > 0);
    assert.ok(affiliateDisclosure.en.length > 0);
  });
});
