import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { BuildingState, FieldId, RoadTier, ZoneType } from '../../src/shared/types';
import type { BuildingCatalogEntry, DemandLevels, GridState } from '../../src/shared/types';
import { createRng } from '../../src/core/rng';
import { BuildingRegistry } from '../../src/sim/buildings';
import { GROWTH_INTERVAL, GrowthSystem } from '../../src/sim/growth';
import type { Rng } from '../../src/sim/growth';
import { createGrid } from '../../src/world/grid';
import { catalog } from '../support/sim';

/**
 * Residential, commercial and industrial growth at every milestone, on a
 * prepared street (power, water and drains everywhere, best land value, every
 * school): what each paintable zone spawns, and the highest level a building
 * of it reaches once it has ground to grow into.
 */

interface ZoneCase {
  name: string;
  zone: ZoneType;
  /** The milestone the zone's palette card unlocks at, and its first kind spawns. */
  from: number;
  /** The highest level a building reaches at each milestone from `from` to 6, with free ground beside it. */
  top: readonly number[];
}

const ZONE_CASES: readonly ZoneCase[] = [
  { name: 'residential low', zone: ZoneType.ResLow, from: 0, top: [3, 3, 3, 3, 3, 3, 3] },
  { name: 'residential medium row', zone: ZoneType.ResMediumRow, from: 1, top: [3, 3, 3, 3, 3, 3] },
  { name: 'residential medium', zone: ZoneType.ResMedium, from: 2, top: [3, 3, 3, 3, 3] },
  { name: 'residential high', zone: ZoneType.ResHigh, from: 4, top: [1, 3, 3] },
  { name: 'commercial low', zone: ZoneType.ComLow, from: 0, top: [3, 3, 3, 3, 3, 3, 3] },
  { name: 'commercial high', zone: ZoneType.ComHigh, from: 4, top: [2, 3, 3] },
  { name: 'mixed use', zone: ZoneType.Mixed, from: 3, top: [1, 1, 3, 3] },
  { name: 'industrial', zone: ZoneType.Industrial, from: 0, top: [3, 3, 3, 3, 3, 3, 3] },
  { name: 'heavy industrial', zone: ZoneType.IndHeavy, from: 2, top: [3, 3, 3, 3, 3] },
];

const MILESTONES = [0, 1, 2, 3, 4, 5, 6];
const demand: DemandLevels = { res: 0.5, com: 0.5, ind: 0.5 };
const ROAD_Z = 50;

/** An rng that never lets a spawn through or a conversion happen: only level-ups move. */
const noChance: Rng = {
  next: () => 0.9999,
  int: (n: number) => Math.floor(0.9999 * n),
  range: (a: number, b: number) => a + 0.9999 * (b - a),
  fork: () => noChance,
};

function street(): GridState {
  const g = createGrid();
  for (let x = 4; x < 252; x++) g.roadTier[tileIndex(x, ROAD_Z)] = RoadTier.TwoLane;
  return g;
}

/** Zones and serves the w x d block at (x0, z0) with the best land value and every school. */
function prepare(g: GridState, zone: ZoneType, x0: number, z0: number, w: number, d: number): void {
  for (let z = z0; z < z0 + d; z++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = tileIndex(x, z);
      g.zone[i] = zone;
      g.power[i] = 1;
      g.watered[i] = 1;
      g.sewered[i] = 1;
      for (const f of [
        FieldId.LandValue,
        FieldId.Education,
        FieldId.MiddleEducation,
        FieldId.HighEducation,
        FieldId.CollegeEducation,
      ]) {
        g.fields[f]![i] = 255;
      }
    }
  }
}

const levelOneKinds = (zone: ZoneType, milestone: number): BuildingCatalogEntry[] =>
  catalog.filter(
    (e) =>
      e.zone === zone &&
      e.level === 1 &&
      e.bodyFootprint === undefined &&
      e.stacked === undefined &&
      e.unlockMilestone <= milestone,
  );

/** What a zone spawns on a street over `passes` growth passes at `milestone`. */
function spawnedAt(zone: ZoneType, milestone: number, passes: number): BuildingCatalogEntry[] {
  const g = street();
  prepare(g, zone, 20, ROAD_Z - 8, 40, 7);
  prepare(g, zone, 20, ROAD_Z + 1, 40, 7);
  const registry = new BuildingRegistry(catalog);
  const growth = new GrowthSystem(catalog, createRng(7), () => true);
  const seen: BuildingCatalogEntry[] = [];
  for (let t = 0; t <= passes * GROWTH_INTERVAL; t++) {
    for (const b of growth.tick(g, registry, demand, milestone, t).added) {
      seen.push(catalog.find((e) => e.id === b.catalogId)!);
    }
  }
  return seen;
}

/**
 * Every level-1 kind of a zone standing alone on ground it may grow into, south
 * of the street, left to level up: the highest level any of them reaches.
 */
function topLevelWithRoom(zone: ZoneType, milestone: number): number {
  const kinds = levelOneKinds(zone, milestone);
  let top = 0;
  for (let chunk = 0; chunk < kinds.length; chunk += 9) {
    const g = street();
    const registry = new BuildingRegistry(catalog);
    const growth = new GrowthSystem(catalog, noChance, () => true);
    kinds.slice(chunk, chunk + 9).forEach((e, i) => {
      const x0 = 8 + i * 26;
      prepare(g, zone, x0, ROAD_Z + 1, 24, 14);
      registry.place(g, e, x0, ROAD_Z + 1, 0, BuildingState.Active);
    });
    for (let t = 0; t <= 40 * GROWTH_INTERVAL; t++) growth.tick(g, registry, demand, milestone, t);
    top = Math.max(top, ...registry.all().map((b) => b.level));
  }
  return top;
}

describe('every zone grows at every milestone it is painted at', () => {
  for (const c of ZONE_CASES) {
    describe(c.name, () => {
      it(`spawns nothing before milestone ${c.from} and only unlocked level-1 kinds from it`, () => {
        if (c.from > 0) expect(spawnedAt(c.zone, c.from - 1, 40)).toEqual([]);
        for (const m of [c.from, 6]) {
          const seen = spawnedAt(c.zone, m, 40);
          expect(seen.length).toBeGreaterThan(0);
          for (const e of seen) expect(e.unlockMilestone).toBeLessThanOrEqual(m);
          expect(seen.some((e) => e.level === 1)).toBe(true);
        }
      });

      it('reaches exactly the highest level each milestone allows, with room beside it', () => {
        for (const m of MILESTONES.filter((k) => k >= c.from)) {
          expect(topLevelWithRoom(c.zone, m), `milestone ${m}`).toBe(c.top[m - c.from]);
        }
      });
    });
  }
});
