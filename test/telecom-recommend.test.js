import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  carrierGroupFromLabel,
  planTotalCost,
  eligiblePlans,
  recommendForLine,
  recommendForHousehold,
} from "../engine/telecom/recommend.js";
import { diagnose } from "../engine/telecom/index.js";

const FIXTURE_PLANS = [
  { id: "a", carrierGroup: "docomo", carrier: "docomo", planName: "A 3GB", dataGB: 3, monthlyFeeYen: 3000, callBundle: "none", addOn5MinYen: 800, addOnUnlimitedYen: 1600, hasPhysicalStores: true, balancedPick: false },
  { id: "b", carrierGroup: "mvno", carrier: "MVNO-B", planName: "B 3GB", dataGB: 3, monthlyFeeYen: 900, callBundle: "none", addOn5MinYen: 700, addOnUnlimitedYen: 1400, hasPhysicalStores: false, balancedPick: false },
  { id: "c", carrierGroup: "mvno", carrier: "MVNO-C", planName: "C 20GB", dataGB: 20, monthlyFeeYen: 2000, callBundle: "5min", addOn5MinYen: null, addOnUnlimitedYen: 1200, hasPhysicalStores: true, balancedPick: true },
  { id: "d", carrierGroup: "docomo", carrier: "ahamo", planName: "D 30GB", dataGB: 30, monthlyFeeYen: 2970, callBundle: "5min", addOn5MinYen: null, addOnUnlimitedYen: 1100, hasPhysicalStores: false, balancedPick: true },
];

describe("carrierGroupFromLabel", () => {
  it("recognizes docomo variants", () => {
    assert.equal(carrierGroupFromLabel("docomo"), "docomo");
    assert.equal(carrierGroupFromLabel("ドコモ"), "docomo");
    assert.equal(carrierGroupFromLabel("ahamo"), "docomo");
  });

  it("recognizes au variants", () => {
    assert.equal(carrierGroupFromLabel("au"), "au");
    assert.equal(carrierGroupFromLabel("povo"), "au");
    assert.equal(carrierGroupFromLabel("UQ mobile"), "au");
  });

  it("recognizes softbank variants", () => {
    assert.equal(carrierGroupFromLabel("SoftBank"), "softbank");
    assert.equal(carrierGroupFromLabel("ワイモバイル"), "softbank");
    assert.equal(carrierGroupFromLabel("LINEMO"), "softbank");
  });

  it("recognizes rakuten", () => {
    assert.equal(carrierGroupFromLabel("楽天モバイル"), "rakuten");
  });

  it("falls back to mvno for anything else, and null for empty", () => {
    assert.equal(carrierGroupFromLabel("IIJmio"), "mvno");
    assert.equal(carrierGroupFromLabel(""), null);
    assert.equal(carrierGroupFromLabel(undefined), null);
  });
});

describe("planTotalCost", () => {
  const plan = FIXTURE_PLANS[0]; // callBundle: none, addOn5Min 800, addOnUnlimited 1600

  it("charges base price when call need is already covered", () => {
    assert.equal(planTotalCost(plan, "none"), 3000);
  });

  it("adds the 5-minute add-on when needed and not bundled", () => {
    assert.equal(planTotalCost(plan, "5min"), 3800);
  });

  it("adds the unlimited add-on when needed and not bundled", () => {
    assert.equal(planTotalCost(plan, "unlimited"), 4600);
  });

  it("does not double-charge when the bundle already meets a lower need", () => {
    const bundled5min = FIXTURE_PLANS[2]; // callBundle: 5min
    assert.equal(planTotalCost(bundled5min, "none"), 2000);
    assert.equal(planTotalCost(bundled5min, "5min"), 2000);
  });

  it("returns null when the required add-on isn't offered", () => {
    const bundled5min = FIXTURE_PLANS[2]; // addOn5MinYen: null
    assert.equal(planTotalCost(bundled5min, "unlimited"), 3200);
    const noAddOn = { ...bundled5min, addOnUnlimitedYen: null };
    assert.equal(planTotalCost(noAddOn, "unlimited"), null);
  });
});

describe("eligiblePlans", () => {
  it("filters out plans with insufficient data and sorts cheapest first", () => {
    const priced = eligiblePlans(FIXTURE_PLANS, { dataUsageGB: 5, callNeed: "none" });
    const ids = priced.map((p) => p.plan.id);
    assert.deepEqual(ids, ["c", "d"]); // only c (20GB) and d (30GB) cover 5GB usage
    assert.equal(priced[0].plan.id, "c"); // 2000 < 2970
  });

  it("excludes plans that cannot satisfy the call need", () => {
    const priced = eligiblePlans(
      [{ ...FIXTURE_PLANS[2], addOnUnlimitedYen: null }],
      { dataUsageGB: 1, callNeed: "unlimited" }
    );
    assert.equal(priced.length, 0);
  });
});

describe("recommendForLine", () => {
  it("recommends the cheapest eligible plan and computes annual savings", () => {
    const result = recommendForLine(FIXTURE_PLANS, {
      carrierLabel: "docomo",
      currentMonthlyFeeYen: 7000,
      dataUsageGB: 5,
      callNeed: "none",
    });

    assert.equal(result.cheapest.plan.id, "c");
    assert.equal(result.cheapest.annualSavingsYen, (7000 - 2000) * 12);
  });

  it("picks a balanced-tagged plan over a cheaper non-balanced one when both are eligible", () => {
    const result = recommendForLine(FIXTURE_PLANS, {
      carrierLabel: "",
      currentMonthlyFeeYen: 5000,
      dataUsageGB: 2,
      callNeed: "none",
    });
    // eligible for 2GB: a(3GB,3000), b(3GB,900), c(20GB,2000), d(30GB,2970)
    assert.equal(result.cheapest.plan.id, "b"); // cheapest overall
    assert.equal(result.balanced.plan.id, "c"); // cheapest among balancedPick: true
  });

  it("suggests staying with the current carrier group when recognized", () => {
    const result = recommendForLine(FIXTURE_PLANS, {
      carrierLabel: "docomo",
      currentMonthlyFeeYen: 7000,
      dataUsageGB: 5,
      callNeed: "none",
    });
    assert.equal(result.stayWithCarrier.plan.id, "d"); // only docomo-group plan covering 5GB
  });

  it("omits stayWithCarrier when the carrier is unrecognized or is already an mvno", () => {
    const unknown = recommendForLine(FIXTURE_PLANS, {
      carrierLabel: "適当なキャリア",
      currentMonthlyFeeYen: 3000,
      dataUsageGB: 1,
      callNeed: "none",
    });
    assert.equal(unknown.stayWithCarrier, null);
  });
});

describe("recommendForHousehold", () => {
  it("sums current and recommended totals across lines", () => {
    const household = recommendForHousehold(FIXTURE_PLANS, [
      { carrierLabel: "docomo", currentMonthlyFeeYen: 7000, dataUsageGB: 5, callNeed: "none" },
      { carrierLabel: "au", currentMonthlyFeeYen: 6000, dataUsageGB: 2, callNeed: "none" },
    ]);

    assert.equal(household.currentTotalMonthlyYen, 13000);
    assert.equal(household.cheapestTotalMonthlyYen, 2000 + 900); // line1 -> c (2000), line2 -> b (900)
    assert.equal(household.cheapestAnnualSavingsYen, (13000 - 2900) * 12);
    assert.equal(household.perLine.length, 2);
  });
});

describe("diagnose (public API, input validation)", () => {
  it("rejects an empty or oversized line list", () => {
    assert.equal(diagnose([]).ok, false);
    assert.equal(diagnose(null).ok, false);
    const tooMany = Array.from({ length: 9 }, () => ({ currentMonthlyFeeYen: 1000, dataUsageGB: 1 }));
    assert.equal(diagnose(tooMany).ok, false);
  });

  it("rejects invalid fee or data values", () => {
    assert.equal(diagnose([{ currentMonthlyFeeYen: -1, dataUsageGB: 1 }]).ok, false);
    assert.equal(diagnose([{ currentMonthlyFeeYen: 3000, dataUsageGB: -1 }]).ok, false);
    assert.equal(diagnose([{ currentMonthlyFeeYen: "not-a-number", dataUsageGB: 1 }]).ok, false);
  });

  it("returns a full recommendation for valid input against the real dataset", () => {
    const response = diagnose([
      { carrierLabel: "docomo", currentMonthlyFeeYen: 7980, dataUsageGB: 5, callNeed: "none" },
    ]);
    assert.equal(response.ok, true);
    assert.ok(response.asOf);
    assert.ok(response.result.cheapestAnnualSavingsYen > 0);
    assert.equal(response.result.perLine.length, 1);
  });

  it("defaults an unrecognized callNeed to none instead of throwing", () => {
    const response = diagnose([{ currentMonthlyFeeYen: 3000, dataUsageGB: 1, callNeed: "bogus" }]);
    assert.equal(response.ok, true);
    assert.equal(response.result.perLine[0].callNeed, "none");
  });
});
