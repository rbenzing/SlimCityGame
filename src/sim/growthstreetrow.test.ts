import { describe, expect, it } from 'vitest';
import { tileIndex } from '../shared/constants';
import { BuildingState, FieldId, RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, DemandLevels, GridState } from '../shared/types';
import { createGrid } from '../world/grid';
import { BuildingRegistry } from './buildings';
import { GrowthSystem, type Rng } from './growth';

type Side = 'N' | 'S' | 'W' | 'E';

const demand: DemandLevels = { res: 0.5, com: 0.5, ind: 0.5 };
const rng: Rng = {
  next: () => 0,
  int: () => 0,
  range: (a: number) => a,
  fork: () => rng,
};

/** Land value by row from the street on the lone served street: row 1, 2, 3 with both services. */
const ROWS = [141, 139, 135] as const;
const ROAD = 128;
const ALONG = 110;
const LOT_LENGTH = 3;

function entryOf(level: number, w: number, d: number): BuildingCatalogEntry {
  return {
    id: `home-${w}x${d}-l${level}`,
    name: `home ${w}x${d} level ${level}`,
    category: 'res',
    zone: ZoneType.ResLow,
    level,
    footprint: { w, d },
    height: 5,
    color: 0,
    residents: 4,
    powerUse: 0.1,
    waterUse: 0.1,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
}

interface Case {
  g: GridState;
  registry: BuildingRegistry;
  growth: GrowthSystem;
  id: number;
  /** The tiles of the lot's street row. */
  streetRow: number[];
}

/**
 * A lot `depth` rows deep and three tiles along a straight street, on `side`
 * of it, standing at `level`, with land value set row by row from the street.
 */
function lot(side: Side, depth: number, level: number, landValue: (row: number) => number): Case {
  const horizontal = side === 'N' || side === 'S';
  const w = horizontal ? LOT_LENGTH : depth;
  const d = horizontal ? depth : LOT_LENGTH;
  const catalog = [1, 2, 3].map((l) => entryOf(l, w, d));
  const g = createGrid();
  const lv = g.fields[FieldId.LandValue]!;
  const at = (along: number, across: number): number =>
    horizontal ? tileIndex(along, across) : tileIndex(across, along);
  for (let along = 100; along <= 140; along++) {
    g.roadTier[at(along, ROAD)] = RoadTier.TwoLane;
    for (let row = 1; row <= 3; row++) {
      lv[at(along, ROAD - row)] = landValue(row);
      lv[at(along, ROAD + row)] = landValue(row);
    }
  }
  const low = side === 'N' || side === 'W';
  const start = low ? ROAD - depth : ROAD + 1;
  const x = horizontal ? ALONG : start;
  const z = horizontal ? start : ALONG;
  const registry = new BuildingRegistry(catalog);
  const inst = registry.place(g, catalog[level - 1]!, x, z, 0, BuildingState.Active)!;
  const streetRow: number[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const i = tileIndex(x + dx, z + dz);
      g.zone[i] = ZoneType.ResLow;
      g.power[i] = 1;
      g.watered[i] = 1;
      g.sewered[i] = 1;
      const row = horizontal ? (low ? d - dz : dz + 1) : low ? w - dx : dx + 1;
      if (row === 1) streetRow.push(i);
    }
  }
  return {
    g,
    registry,
    growth: new GrowthSystem(catalog, rng, () => true),
    id: inst.id,
    streetRow,
  };
}

const rose = (c: Case, toLevel: number): boolean =>
  c.growth.tick(c.g, c.registry, demand, 6, 0).added.some((b) => b.level === toLevel);

const SIDES: Side[] = ['N', 'S', 'W', 'E'];

describe('a level-up reads the lot at its street row, on every side of the street', () => {
  it.each(SIDES.flatMap((side) => [1, 2, 3].map((depth) => [side, depth] as const)))(
    'a %s-side lot %i deep reaches level 2 on the 141 its street row reads',
    (side, depth) => {
      expect(
        rose(
          lot(side, depth, 1, (row) => ROWS[row - 1]!),
          2,
        ),
      ).toBe(true);
    },
  );

  it.each(SIDES.flatMap((side) => [2, 3].map((depth) => [side, depth] as const)))(
    'a %s-side lot %i deep is held by a street row under level 2 just as every other side is',
    (side, depth) => {
      expect(
        rose(
          lot(side, depth, 1, (row) => (row === 1 ? 140 : 200)),
          2,
        ),
      ).toBe(false);
    },
  );

  it.each(SIDES.flatMap((side) => [1, 2, 3].map((depth) => [side, depth] as const)))(
    'a %s-side lot %i deep reads the school test for level 3 at its street row',
    (side, depth) => {
      const c = lot(side, depth, 2, () => 220);
      for (const i of c.streetRow) c.g.fields[FieldId.Education]![i] = 150;
      expect(rose(c, 3)).toBe(true);
      const bare = lot(side, depth, 2, () => 220);
      expect(rose(bare, 3)).toBe(false);
    },
  );

  it('does the same thing in two runs', () => {
    const run = (): boolean[] =>
      SIDES.map((s) =>
        rose(
          lot(s, 3, 1, (row) => ROWS[row - 1]!),
          2,
        ),
      );
    expect(run()).toEqual(run());
  });
});
