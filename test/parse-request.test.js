import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTripRequest, parserInternals } from "../engine/parse-request.js";

describe("parseTripRequest", () => {
  it("parses the canonical Japanese request from the product spec", () => {
    const request = parseTripRequest("東京から9月の3連休に大人2人、子供2人で15万円以内。海か温泉。移動はできるだけ楽に。");

    assert.equal(request.originId, "tokyo");
    assert.equal(request.month, 9);
    assert.equal(request.nights, 2, "a 3連休 is a three-day weekend, which is two nights away");
    assert.equal(request.adults, 2);
    assert.equal(request.children.length, 2);
    assert.equal(request.budgetYen, 150000);
    assert.deepEqual(request.interests, ["beach", "onsen"]);
    assert.equal(request.constraints.easyTransport, true);
  });

  it("parses the equivalent English request", () => {
    const request = parseTripRequest("From Tokyo in September, 2 adults 2 kids, budget 150000, beach, easy transport");

    assert.equal(request.originId, "tokyo");
    assert.equal(request.month, 9);
    assert.equal(request.adults, 2);
    assert.equal(request.children.length, 2);
    assert.equal(request.budgetYen, 150000);
    assert.ok(request.interests.includes("beach"));
    assert.equal(request.constraints.easyTransport, true);
  });

  it("reads kanji numerals for length and budget", () => {
    const request = parseTripRequest("名古屋発、二泊三日、大人2名、予算十万円、温泉");

    assert.equal(request.originId, "nagoya");
    assert.equal(request.nights, 2);
    assert.equal(request.budgetYen, 100000);
    assert.deepEqual(request.interests, ["onsen"]);
  });

  it("distinguishes the several ways a trip length is written", () => {
    assert.equal(parseTripRequest("3泊").nights, 3);
    assert.equal(parseTripRequest("2泊3日").nights, 2);
    assert.equal(parseTripRequest("3連休").nights, 2);
    assert.equal(parseTripRequest("日帰り").nights, 0);
    assert.equal(parseTripRequest("週末").nights, 1);
    assert.equal(parseTripRequest("3 nights").nights, 3);
  });

  it("does not read 北海道 as a request for the beach", () => {
    // 北海道 contains 海. Without per-tag masking this was scored as a beach request.
    const request = parseTripRequest("大阪から北海道に3泊、大人2人");

    assert.ok(!request.interests.includes("beach"));
  });

  it("still reads 海鮮 as a food signal while masking it for the beach", () => {
    // Regression: masking 海鮮 globally suppressed the food tag it should have triggered.
    const request = parseTripRequest("東京から車で日帰り、海鮮が食べたい");

    assert.deepEqual(request.interests, ["food"]);
  });

  it("detects a refusal to drive across its common phrasings", () => {
    for (const phrase of ["運転はしません", "運転できません", "車なし", "ペーパードライバーです", "we can't drive"]) {
      const request = parseTripRequest(`大阪から2泊 ${phrase}`);

      assert.equal(request.constraints.noCar, true, `expected noCar for "${phrase}"`);
      assert.equal(request.constraints.car, false, `expected car false for "${phrase}"`);
    }
  });

  it("collects child ages and infers stroller use for a toddler", () => {
    const request = parseTripRequest("東京から2泊、大人2人、子供2人（8歳と2歳）");

    assert.deepEqual(request.children.map((child) => child.age), [8, 2]);
    assert.equal(request.constraints.stroller, true);
    assert.ok(request.assumptions.some((assumption) => assumption.code === "stroller-inferred"));
  });

  it("warns rather than guessing when the origin is unknown", () => {
    const request = parseTripRequest("9月に3泊で海に行きたい");

    assert.equal(request.originId, null);
    assert.ok(request.warnings.some((warning) => warning.code === "origin-missing"));
  });

  it("records the assumptions it made instead of hiding them", () => {
    const request = parseTripRequest("東京から海に行きたい");

    assert.equal(request.adults, 2);
    assert.equal(request.nights, 2);
    assert.ok(request.assumptions.some((assumption) => assumption.code === "adults-default"));
    assert.ok(request.assumptions.some((assumption) => assumption.code === "nights-default"));
    assert.ok(request.warnings.some((warning) => warning.code === "budget-missing"));
  });

  it("lets structured overrides win over the parsed text", () => {
    const request = parseTripRequest("東京から9月に3泊、15万円", {
      originId: "osaka",
      month: 12,
      nights: 1,
      budgetYen: 80000,
    });

    assert.equal(request.originId, "osaka");
    assert.equal(request.month, 12);
    assert.equal(request.nights, 1);
    assert.equal(request.budgetYen, 80000);
  });

  it("normalises full-width digits and kanji numbers", () => {
    assert.equal(parserInternals.normalize("１５万円"), "15万円");
    assert.equal(parserInternals.convertKanjiNumbers("三泊"), "3泊");
    assert.equal(parserInternals.convertKanjiNumbers("十五人"), "15人");
    assert.equal(parserInternals.convertKanjiNumbers("二十人"), "20人");
  });

  it("clamps hostile numeric overrides instead of hanging", () => {
    // childCount drives a loop and arrives straight from request JSON, so an unbounded value
    // is a denial of service rather than merely a silly answer.
    const started = Date.now();
    const request = parseTripRequest("東京から2泊", {
      childCount: 1e9,
      adults: 1e9,
      nights: 1e9,
      budgetYen: 1e18,
    });

    assert.ok(Date.now() - started < 1000, "clamping must happen before any allocation");
    assert.equal(request.children.length, parserInternals.limits.childCount.max);
    assert.equal(request.adults, parserInternals.limits.adults.max);
    assert.equal(request.nights, parserInternals.limits.nights.max);
    assert.equal(request.budgetYen, parserInternals.limits.budgetYen.max);
  });

  it("treats an absent numeric value as absent rather than as zero", () => {
    // Number(null) is 0, not NaN. Clamping it would silently become the lower bound and
    // suppress the stated default.
    assert.equal(parserInternals.clampInteger(null, { min: 1, max: 12 }), null);
    assert.equal(parserInternals.clampInteger(undefined, { min: 1, max: 12 }), null);
    assert.equal(parserInternals.clampInteger("", { min: 1, max: 12 }), null);
    assert.equal(parserInternals.clampInteger("abc", { min: 1, max: 12 }), null);
    assert.equal(parserInternals.clampInteger(5, { min: 1, max: 12 }), 5);

    const request = parseTripRequest("東京から2泊", { adults: null });

    assert.equal(request.adults, 2, "a null override must fall through to the stated default");
    assert.ok(request.assumptions.some((assumption) => assumption.code === "adults-default"));
  });

  it("ignores unknown interest tags supplied through overrides", () => {
    const request = parseTripRequest("東京から2泊", { interests: ["beach", "__proto__", "nonsense"] });

    assert.deepEqual(request.interests, ["beach"]);
  });

  it("survives empty and junk input without throwing", () => {
    for (const input of ["", "   ", null, undefined, "!!!???"]) {
      const request = parseTripRequest(input);

      assert.equal(typeof request.nights, "number");
      assert.ok(Array.isArray(request.warnings));
    }
  });
});
