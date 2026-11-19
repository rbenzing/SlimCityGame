/**
 * The simulation's car park and the renderer's lot plan for one placed
 * building are the same layout, whichever plan its tile picks.
 */
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from '../shared/types';
import { holdsLotParkingAt, lotParkingAt } from '../shared/lotparking';
import { planVariantAt, STREET_PLAN_SETBACK_M, type PlanVariant } from '../shared/planvariant';
import { BIN_M } from '../shared/lotgrounds';
import { MIN_FRONT_WALK_M } from '../shared/parkingcode';
import { AWNING_OUT_M, CANOPY_DEPTH_M } from './buildingkit';
import { lotPlanAt, lotPlanFor } from './lotplan';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const shop = catalog.find((e) => e.id === 'com-shop-2-lot2x2')!;

/** A road along the north edge of every lot placed on row 10. */
const roadAt = (x: number, z: number): boolean => z === 9 && x >= 0;

/** The first tile on row 10 whose lot takes `variant`. */
function tileWith(variant: PlanVariant): number {
  for (let x = 10; ; x++) if (planVariantAt(x, 10) === variant) return x;
}

describe('a placed commercial lot lays one plan in the simulation and the renderer', () => {
  it.each(['street', 'carpark-front'] as const)('the %s plan matches', (variant) => {
    const x = tileWith(variant);
    for (const rotation of [0, 1] as const) {
      const sim = lotParkingAt(shop, x, 10, rotation, roadAt, null)!;
      const drawn = lotPlanFor(shop, x, 10, roadAt, rotation, null)!;
      const site = lotPlanAt(shop, { x, z: 10, rotation }, roadAt, null, null)!;
      expect(drawn.layout).toEqual(sim.layout);
      expect(site.layout).toEqual(sim.layout);
      expect(holdsLotParkingAt(shop, x, 10, rotation, roadAt, null)).toBe(sim.layout.fits);
    }
  });

  it('stands a street building back far enough that its awnings stay on its lot', () => {
    expect(STREET_PLAN_SETBACK_M).toBeGreaterThanOrEqual(AWNING_OUT_M);
    expect(STREET_PLAN_SETBACK_M).toBeGreaterThanOrEqual(CANOPY_DEPTH_M);
    expect(STREET_PLAN_SETBACK_M).toBeGreaterThanOrEqual(MIN_FRONT_WALK_M + BIN_M.depth);
  });

  it('stands the building nearer the street on a street lot than on its neighbour', () => {
    const street = lotParkingAt(shop, tileWith('street'), 10, 0, roadAt, null)!.layout;
    const behind = lotParkingAt(shop, tileWith('carpark-front'), 10, 0, roadAt, null)!.layout;
    expect(street.fits).toBe(true);
    expect(behind.fits).toBe(true);
    expect(street.body.v0).toBeLessThan(behind.body.v0);
    expect(street.provided).toBe(behind.provided);
  });
});
