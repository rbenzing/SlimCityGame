import { describe, expect, it } from 'vitest';
import { tileIndex } from '../shared/constants';
import { BuildingState, Problem, RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, DemandLevels, GridState } from '../shared/types';
import { createGrid } from '../world/grid';
import { BuildingRegistry } from './buildings';
import { GROWTH_INTERVAL, GrowthSystem } from './growth';
import type { Rng } from './growth';

const STREET = 30;
const demand: DemandLevels = { res: 0.5, com: 0.5, ind: 0.5 };

const rng: Rng = {
  next: () => 0,
  int: () => 0,
  range: (a: number) => a,
  fork: () => rng,
};

function shop(w: number, d: number, level = 1): BuildingCatalogEntry {
  return {
    id: `shop-${w}x${d}-${level}`,
    name: 'Shop',
    category: 'com',
    zone: ZoneType.ComHigh,
    kind: 'shop',
    level,
    footprint: { w, d },
    height: 12,
    color: 0x336699,
    jobs: 10,
    powerUse: 0.1,
    waterUse: 0.1,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
}

type Side = 'N' | 'S' | 'W' | 'E';

/** A street across the map along z (or along x for W/E sides) and a served building of w*d standing flush on `side` of it. */
function standing(side: Side, w: number, d: number, entry = shop(w, d)) {
  const g: GridState = createGrid();
  const alongZ = side === 'W' || side === 'E';
  for (let i = 5; i < 60; i++) {
    g.roadTier[alongZ ? tileIndex(STREET, i) : tileIndex(i, STREET)] = RoadTier.TwoLane;
  }
  const x = side === 'W' ? STREET - w : side === 'E' ? STREET + 1 : 40;
  const z = side === 'N' ? STREET - d : side === 'S' ? STREET + 1 : 40;
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = tileIndex(x + dx, z + dz);
      g.power[idx] = 1;
      g.watered[idx] = 1;
      g.sewered[idx] = 1;
    }
  }
  const registry = new BuildingRegistry([entry]);
  const inst = registry.place(g, entry, x, z, 0, BuildingState.Active)!;
  const growth = new GrowthSystem([entry], rng, () => true);
  const passes = (n: number): void => {
    for (let p = 1; p <= n; p++) growth.tick(g, registry, demand, 0, p * GROWTH_INTERVAL);
  };
  return { g, registry, id: inst.id, passes };
}

describe('a building judged from its whole footprint for a road', () => {
  const sides: Side[] = ['N', 'S', 'W', 'E'];

  for (const depth of [4, 5]) {
    for (const side of sides) {
      it(`a ${depth}-deep building on the ${side} side of its street keeps its road`, () => {
        const { registry, id, passes } = standing(side, 4, depth);
        // The depth runs away from the street: on W/E sides it is the width.
        passes(50);
        const b = registry.get(id)!;
        expect(b.problems & Problem.NoRoad).toBe(0);
        expect(b.state).toBe(BuildingState.Active);
      });
    }
  }

  for (const side of ['W', 'E'] as const) {
    it(`a 4-wide, 2-deep lot beside a north-south street on the ${side} side keeps its road`, () => {
      const { registry, id, passes } = standing(side, 4, 2);
      passes(50);
      const b = registry.get(id)!;
      expect(b.problems & Problem.NoRoad).toBe(0);
      expect(b.state).toBe(BuildingState.Active);
    });
  }

  it('a building with no street within three tiles of any tile still goes NoRoad and is abandoned', () => {
    const { g, registry, id, passes } = standing('N', 4, 4);
    // Move the street one tile away so the nearest road tile is 4 from every tile.
    for (let i = 0; i < 60; i++) {
      g.roadTier[tileIndex(i, STREET)] = RoadTier.None;
      g.roadTier[tileIndex(i, STREET - 8)] = RoadTier.TwoLane;
    }
    passes(5);
    const b = registry.get(id)!;
    expect(b.problems & Problem.NoRoad).toBe(Problem.NoRoad);
    expect(b.state).toBe(BuildingState.Abandoned);
  });
});
