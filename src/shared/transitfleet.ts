/**
 * The transit fleet arithmetic: how long a line's round trip takes at a
 * vehicle's real operating speed, how many vehicles a line asks for, how a
 * mode's depots share their fleet out when the lines ask for more than they
 * hold, and what every vehicle in service costs a month. One source for the
 * sim, which runs the lines, and the renderer, which draws the sim's count.
 * Pure: no three.js, no DOM, no random draw, no clock.
 */
import { TILE_METERS } from './constants';
import type { TransitMode } from './types';

/** Average commercial speed, m/s: 20 km/h for a bus or a tram in traffic, 48 km/h for a train. */
export const COMMERCIAL_SPEED_MPS: Readonly<Record<TransitMode, number>> = {
  bus: 5.56,
  tram: 5.56,
  rail: 13.3,
};

/** Terminal recovery added to a round trip, the middle of the published 10–20%. */
export const LAYOVER_FRACTION = 0.15;

/** The peak hour's share of a day's boardings. */
export const PEAK_HOUR_SHARE = 0.1;

/** The headway at which riders stop consulting a timetable, minutes. */
export const TARGET_HEADWAY_MIN = 10;

/** Riders a vehicle carries: a bus, a two-car tram set, a three-car bilevel train set. */
export const RIDERS_PER_VEHICLE: Readonly<Record<TransitMode, number>> = {
  bus: 48,
  tram: 150,
  rail: 450,
};

/** The share of a depot's fleet held back as spares (FTA Circular 5010). */
export const SPARE_RATIO = 0.2;

/** A month's operating cost of one vehicle in service, ¢, from NTD cost per revenue hour. */
export const RUNNING_COST_CENTS: Readonly<Record<TransitMode, number>> = {
  bus: 40,
  tram: 70,
  rail: 142,
};

/** The vehicles a depot holding `fleet` puts on the road: all but the spare fifth. */
export function fieldsOf(fleet: number): number {
  if (!(fleet > 0)) return 0;
  // A fleet of ten is eight exactly; the epsilon keeps 0.8 × 10 from reading as 7.
  return Math.floor(fleet * (1 - SPARE_RATIO) + 1e-9);
}

/** A round trip out and back along `lengthTiles` of route, with layover, in seconds. */
export function cycleSeconds(mode: TransitMode, lengthTiles: number): number {
  if (!(lengthTiles > 0)) return 0;
  return ((2 * lengthTiles * TILE_METERS) / COMMERCIAL_SPEED_MPS[mode]) * (1 + LAYOVER_FRACTION);
}

/**
 * The fleet a line asks for when the player has not set one: the larger of
 * the fleet that holds the target headway and the fleet that carries the peak
 * hour of `ridership` daily boardings. A line with no route asks for nothing.
 */
export function defaultFleet(mode: TransitMode, ridership: number, lengthTiles: number): number {
  const cycle = cycleSeconds(mode, lengthTiles);
  if (cycle <= 0) return 0;
  const cycleMin = cycle / 60;
  const cycleHours = cycle / 3600;
  const forFrequency = Math.ceil(cycleMin / TARGET_HEADWAY_MIN);
  const peak = Math.max(0, ridership) * PEAK_HOUR_SHARE;
  const forCapacity = Math.ceil((peak * cycleHours) / RIDERS_PER_VEHICLE[mode]);
  return Math.max(forFrequency, forCapacity);
}

/**
 * Shares `pool` vehicles out over `requests`, in the order given (ascending
 * line id). Every line gets what it asked for when the pool covers the lot;
 * otherwise each gets its proportional floor and the vehicles the floors left
 * over go one at a time down the list, so the served counts sum to exactly
 * `min(pool, Σ requests)` and nothing is lost or invented to rounding. An
 * empty pool serves nobody.
 */
export function allocate(requests: readonly number[], pool: number): number[] {
  const wanted = requests.map((r) => Math.max(0, Math.floor(r)));
  const total = wanted.reduce((sum, r) => sum + r, 0);
  const have = Math.max(0, Math.floor(pool));
  if (total <= have) return wanted;
  if (have === 0) return wanted.map(() => 0);

  const served = wanted.map((r) => Math.floor((have * r) / total));
  let left = have - served.reduce((sum, s) => sum + s, 0);
  for (let i = 0; i < served.length && left > 0; i += 1) {
    const got = served[i]!;
    if (got < wanted[i]!) {
      served[i] = got + 1;
      left -= 1;
    }
  }
  return served;
}

/** Minutes between vehicles on a line running `served` of them; 0 when none runs. */
export function headwayMin(mode: TransitMode, lengthTiles: number, served: number): number {
  if (!(served > 0)) return 0;
  return cycleSeconds(mode, lengthTiles) / 60 / served;
}

/** The month's charge for `served` vehicles of `mode` in service, ¢. */
export function runningCost(mode: TransitMode, served: number): number {
  return RUNNING_COST_CENTS[mode] * Math.max(0, served);
}
