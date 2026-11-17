import { describe, expect, it } from 'vitest';
import { TILE_METERS } from '../shared/constants';
import { RoadTier, ZoneType, BuildingState } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance } from '../shared/types';
import { carriagewayHalfWidthMeters } from './roadsmesh';
import { vergeDepthMeters } from './frontage';
import { planFarm } from './farmlot';

const entry: BuildingCatalogEntry = {
  id: 'farm-crops-1',
  name: 'crops',
  category: 'ind',
  zone: ZoneType.Agriculture,
  level: 1,
  kind: 'crops',
  footprint: { w: 4, d: 5 },
  height: 9,
  color: 0x7a3a2c,
  residents: 4,
  jobs: 1,
  powerUse: 0.2,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};
const at: BuildingInstance = {
  id: 7,
  catalogId: 'farm',
  x: 10,
  z: 10,
  rotation: 0,
  level: 1,
  state: BuildingState.Active,
  problems: 0,
};
const GATE_M = 16 * 0.3048;

describe('a farm drive meets its dirt road', () => {
  it('reaches the road edge across the verge, one farm gate wide', () => {
    const verge = vergeDepthMeters(RoadTier.Gravel);
    const half = carriagewayHalfWidthMeters(RoadTier.Gravel);
    expect(verge).toBeGreaterThan(0);
    const plan = planFarm(at, entry, (_x, z) => z === 9)!;
    // Gate on the north edge: the drive runs north past the lot line to the road's edge.
    const roadEdge = 9 * TILE_METERS + TILE_METERS / 2 + half;
    expect(plan.drive.z0).toBeCloseTo(roadEdge, 6);
    expect(plan.drive.z0).toBeCloseTo(plan.lot.z0 - verge, 6);
    expect(plan.drive.x1 - plan.drive.x0).toBeCloseTo(GATE_M, 6);
  });

  it('meets the road from every side', () => {
    const verge = vergeDepthMeters(RoadTier.Gravel);
    const lot = { x0: 200, z0: 200, x1: 280, z1: 300 };
    const roads = {
      N: (_x: number, z: number) => z === 9,
      S: (_x: number, z: number) => z === 15,
      W: (x: number) => x === 9,
      E: (x: number) => x === 14,
    };
    for (const side of ['N', 'S', 'W', 'E'] as const) {
      const plan = planFarm(at, entry, roads[side] as never)!;
      expect(plan.lot).toEqual(lot);
      const out = {
        N: lot.z0 - plan.drive.z0,
        S: plan.drive.z1 - lot.z1,
        W: lot.x0 - plan.drive.x0,
        E: plan.drive.x1 - lot.x1,
      }[side];
      expect(out, side).toBeCloseTo(verge, 6);
    }
  });

  it('paves nothing outside the lot where no road is next to it', () => {
    const plan = planFarm(at, entry, (_x, z) => z === 8)!;
    expect(plan.drive.z0).toBeCloseTo(plan.lot.z0, 6);
    const none = planFarm(at, entry, () => false)!;
    expect(none.drive.z0).toBeCloseTo(none.lot.z0, 6);
  });
});
