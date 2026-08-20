/**
 * Shared pricing assumptions for the True Trip Cost model.
 *
 * Every number here is a planning estimate, not a quoted price. They are grouped in one
 * module so that the assumptions behind a cost estimate can be reviewed in a single place
 * rather than hunted through the scoring code.
 *
 * When a real pricing API replaces part of this model, the corresponding block should be
 * deleted rather than left to drift out of date alongside live data.
 */

/**
 * Age bands. Japanese travel pricing is built around these boundaries, and they differ by
 * mode, which is exactly why fare policy is a table rather than a single discount rate.
 */
export const ageBands = {
  infantMaxAge: 2,
  childMaxAge: 11,
};

/**
 * Fare policies by transport mode.
 *
 * `infantRate` and `childRate` are multipliers on the adult fare. The boundaries reflect the
 * published structures of the respective operators:
 * - Domestic flights: under 3 travels free on a lap; 3-11 pays a reduced child fare.
 * - JR (shinkansen and limited express): under 6 free without a reserved seat; 6-11 pays half.
 * - Highway bus: child fare is typically half from age 6.
 * - Self drive: cost is per vehicle, so passengers do not add fare.
 */
export const farePolicies = {
  "domestic-flight": {
    perPerson: true,
    infantMaxAge: 2,
    infantRate: 0,
    childMaxAge: 11,
    childRate: 0.6,
  },
  "jr-shinkansen": {
    perPerson: true,
    infantMaxAge: 5,
    infantRate: 0,
    childMaxAge: 11,
    childRate: 0.5,
  },
  "jr-limited-express": {
    perPerson: true,
    infantMaxAge: 5,
    infantRate: 0,
    childMaxAge: 11,
    childRate: 0.5,
  },
  "highway-bus": {
    perPerson: true,
    infantMaxAge: 5,
    infantRate: 0,
    childMaxAge: 11,
    childRate: 0.5,
  },
  ferry: {
    perPerson: true,
    infantMaxAge: 0,
    infantRate: 0,
    childMaxAge: 11,
    childRate: 0.5,
  },
  "self-drive": {
    perPerson: false,
    infantMaxAge: 2,
    infantRate: 0,
    childMaxAge: 11,
    childRate: 0,
  },
};

/**
 * Daily food spend per person, as a multiplier on the destination's meal index.
 *
 * Children eat less and are frequently served from a child menu; infants are mostly covered
 * by what the adults order.
 */
export const mealRates = {
  adult: 1,
  child: 0.6,
  infant: 0.2,
};

/**
 * Value of one included breakfast, per person, as a share of the destination meal index.
 * Used to discount hotels that include breakfast so that "cheaper room" does not
 * automatically win over "slightly dearer room with two included meals".
 */
export const includedBreakfastShare = 0.22;

/**
 * Activity spend multipliers by requested activity level. Applied to the destination's
 * per-person day rate.
 */
export const activityLevelMultipliers = {
  low: 0.5,
  medium: 1,
  high: 1.6,
};

/**
 * Share of trip days on which the party pays for paid activities. A three night trip does
 * not contain four full days of paid attractions: arrival and departure days are largely
 * consumed by travel.
 */
export const activeDayShare = 0.7;

/**
 * Contingency added to the subtotal. Covers souvenirs, drinks, coin laundry, an unplanned
 * taxi, and the general tendency of trips to cost more than planned. Presented to the user
 * as a named line rather than hidden inside other categories.
 */
export const contingencyRate = 0.06;

/**
 * Room occupancy rules.
 *
 * Japanese family rooms and ryokan commonly sleep four, and many properties let young
 * children share bedding at no charge (添い寝無料). Both facts materially change which
 * option is actually cheapest for a family, which is why they are modelled rather than
 * approximated with "party size divided by two".
 */
export const occupancy = {
  standardRoomCapacity: 2,
  familyRoomCapacity: 4,
  defaultChildSleepFreeUnderAge: 6,
};

/**
 * Rental car sizing. A party of five or more needs a larger vehicle, which costs more per day.
 */
export const rentalCar = {
  compactCapacity: 5,
  largeVehicleSurcharge: 1.35,
};

/**
 * Width of the reported cost range, as a fraction either side of the point estimate.
 *
 * Deliberately wide. The engine's own confidence in a number is lower than the precision a
 * single yen figure implies, and presenting a range is the honest way to say so. Narrow this
 * only for cost components backed by a live pricing API.
 */
export const estimateBand = {
  low: 0.88,
  high: 1.18,
};
