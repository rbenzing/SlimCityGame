/**
 * Which plan a commercial lot lays: its building at the street with the car
 * park behind or beside it, or its building behind the car park. The lot's
 * anchor tile picks, so the simulation and the renderer agree and nothing is
 * saved. Pure.
 */

export type PlanVariant = 'street' | 'carpark-front';

/** One lot in this many stands its building at the street. */
export const STREET_PLAN_ONE_IN = 3;

/**
 * The least a street-plan building stands from the street line: its awnings
 * reach 1.5 m out and a store's canopy 1.9 m, and both stay on the lot; a 0.6 m
 * bin or bench against its wall leaves the 0.914 m clear walk.
 */
export const STREET_PLAN_SETBACK_M = 1.9;

/** A 32-bit avalanche mix of a tile's coordinates, in [0, 1). */
function tileUnit(x: number, z: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The plan of the lot anchored at tile (x, z). */
export function planVariantAt(x: number, z: number): PlanVariant {
  return tileUnit(x, z) < 1 / STREET_PLAN_ONE_IN ? 'street' : 'carpark-front';
}
