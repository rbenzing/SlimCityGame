import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { LEVEL_UP_FLOOR_JOBS, tileIndex } from '../shared/constants';
import { SoilGrade } from '../shared/soil';
import { BuildingState, FieldId, RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, DemandLevels, GridState } from '../shared/types';
import { createGrid } from '../world/grid';
import { BuildingRegistry } from './buildings';
import { GrowthSystem, UNMETERED_SUPPLY } from './growth';
import type { Rng } from './growth';
import type { JobsBySector } from './economy';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;

function constantRng(value: number): Rng {
  const self: Rng = {
    next: () => value,
    int: (maxExclusive: number) => Math.floor(value * maxExclusive),
    range: (a: number, b: number) => a + value * (b - a),
    fork: () => constantRng(value),
  };
  return self;
}

const MILESTONE = 6;
const onZone = (zone: ZoneType) => (g: GridState, x: number, z: number, w: number, d: number) => {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      if (g.zone[tileIndex(x + dx, z + dz)] !== zone) return false;
    }
  }
  return true;
};

/** A street along z = 0 and a served block of `zone` `width` wide and `depth` deep below it, on the best land, with every school built. */
function block(zone: ZoneType, width: number, depth: number): GridState {
  const g = createGrid();
  g.fields[FieldId.LandValue]!.fill(255);
  g.fields[FieldId.MiddleEducation]!.fill(255);
  g.fields[FieldId.HighEducation]!.fill(255);
  for (let x = 0; x < width + 2; x++) {
    const i = tileIndex(x, 0);
    g.roadTier[i] = RoadTier.TwoLane;
    g.roadMask[i] = (x > 0 ? 8 : 0) | (x < width + 1 ? 2 : 0);
  }
  for (let z = 1; z <= depth; z++) {
    for (let x = 1; x <= width; x++) {
      const i = tileIndex(x, z);
      g.zone[i] = zone;
      g.power[i] = 1;
      g.watered[i] = 1;
      g.sewered[i] = 1;
    }
  }
  return g;
}

interface Town {
  g: GridState;
  registry: BuildingRegistry;
  growth: GrowthSystem;
  ids: number[];
  pass: (demand: DemandLevels, room: JobsBySector) => void;
}

/** A town of `zone` with the given buildings standing active at (x, 1), and a growth system over the whole catalog; with `beyond`, the blocks from x = 7 on are of that zone. */
function town(zone: ZoneType, standing: [string, number][], beyond?: ZoneType): Town {
  const g = block(zone, 12, 4);
  if (beyond !== undefined) {
    for (let z = 1; z <= 4; z++) for (let x = 7; x <= 12; x++) g.zone[tileIndex(x, z)] = beyond;
  }
  const registry = new BuildingRegistry(catalog);
  const ids = standing.map(
    ([id, x]) => registry.place(g, byId(id), x, 1, 0, BuildingState.Active)!.id,
  );
  const here = onZone(zone);
  const there = onZone(beyond ?? zone);
  const growth = new GrowthSystem(
    catalog,
    constantRng(0),
    (gg, x, z, w, d) => here(gg, x, z, w, d) || there(gg, x, z, w, d),
  );
  let tickNo = 0;
  return {
    g,
    registry,
    growth,
    ids,
    pass: (demand, room) => {
      growth.tick(g, registry, demand, MILESTONE, tickNo, UNMETERED_SUPPLY, {
        ...room,
        res: Infinity,
      });
      tickNo += 10;
    },
  };
}

const levelOf = (t: Town, id: number): number | undefined => t.registry.get(id)?.level;
/** How many standing buildings of `kind` stand at `level`. */
const countAt = (t: Town, kind: string, level: number): number =>
  t.registry.all().filter((b) => byId(b.catalogId).kind === kind && b.level === level).length;

const wants = (com: number, ind = 0): DemandLevels => ({ res: 0, com, ind });

describe('a level-up is held to job room, with one small step a pass past it', () => {
  it('names the cap as a level-3 shop', () => {
    expect(LEVEL_UP_FLOOR_JOBS).toBe(byId('com-low-2').jobs);
  });

  it('levels a shop (+9) in one pass where the commerce room is -9 and shops are wanted', () => {
    const t = town(ZoneType.ComLow, [['com-low-1', 1]]);
    t.pass(wants(0.2), { com: -9, ind: 0 });
    expect(t.registry.get(t.ids[0]!)).toBeUndefined();
    expect(countAt(t, 'shop', 2)).toBe(1);
  });

  it('keeps the shop at level 1 while commerce demand is at or below zero', () => {
    for (const com of [0, -0.3]) {
      const t = town(ZoneType.ComLow, [['com-low-1', 1]]);
      t.pass(wants(com), { com: -9, ind: 0 });
      expect(levelOf(t, t.ids[0]!)).toBe(1);
    }
  });

  it('is the room alone that holds it: with room it levels, and demand zero still does not', () => {
    const t = town(ZoneType.ComLow, [['com-low-1', 1]]);
    t.pass(wants(0), { com: 100, ind: 0 });
    expect(countAt(t, 'shop', 2)).toBe(1);
  });

  it('levels one shop a pass in a sector, the other on a later pass', () => {
    const t = town(ZoneType.ComLow, [
      ['com-low-1', 1],
      ['com-low-1', 8],
    ]);
    t.pass(wants(0.2), { com: -20, ind: 0 });
    expect(countAt(t, 'shop', 2)).toBe(1);
    expect(countAt(t, 'shop', 1)).toBe(1);
    t.pass(wants(0.2), { com: -40, ind: 0 });
    expect(countAt(t, 'shop', 2)).toBe(2);
    expect(countAt(t, 'shop', 1)).toBe(0);
  });

  it('lets the smaller step go first: a fuel station (+1) before a shop (+9)', () => {
    const t = town(ZoneType.ComLow, [
      ['com-low-1', 1],
      ['com-fuel-1', 6],
    ]);
    t.pass(wants(0.2), { com: -20, ind: 0 });
    expect(countAt(t, 'fuel', 2)).toBe(1);
    expect(countAt(t, 'shop', 1)).toBe(1);
    t.pass(wants(0.2), { com: -40, ind: 0 });
    expect(countAt(t, 'shop', 2)).toBe(1);
  });

  it('never lets a step over the cap use it: a level-2 supermarket (+68) waits for room', () => {
    const open = town(ZoneType.ComLow, [['com-market-2', 1]]);
    open.pass(wants(0.2), { com: 1000, ind: 0 });
    expect(countAt(open, 'supermarket', 3)).toBe(1);
    const t = town(ZoneType.ComLow, [['com-market-2', 1]]);
    t.pass(wants(0.2), { com: -9, ind: 0 });
    expect(levelOf(t, t.ids[0]!)).toBe(2);
  });

  it('never lets an office (+592) use it', () => {
    const open = town(ZoneType.ComHigh, [['com-high-1', 1]]);
    open.pass(wants(0.2), { com: 1000, ind: 0 });
    expect(countAt(open, 'office', 2)).toBe(1);
    const t = town(ZoneType.ComHigh, [['com-high-1', 1]]);
    t.pass(wants(0.2), { com: -9, ind: 0 });
    expect(levelOf(t, t.ids[0]!)).toBe(1);
  });

  it('never lets a works (+8) past the industry room, wanted or not', () => {
    const t = town(ZoneType.Industrial, [['ind-1', 1]]);
    t.pass(wants(0, 0.5), { com: 0, ind: -5 });
    expect(levelOf(t, t.ids[0]!)).toBe(1);
    const roomy = town(ZoneType.Industrial, [['ind-1', 1]]);
    roomy.pass(wants(0, 0.5), { com: 0, ind: 100 });
    expect(countAt(roomy, 'workshop', 2)).toBe(1);
  });

  it('keeps the sectors apart: a commerce step does not spend the industry allowance', () => {
    const t = town(ZoneType.ComLow, [['com-low-1', 1]]);
    t.pass(wants(0.2, 0.5), { com: -9, ind: -5 });
    expect(countAt(t, 'shop', 2)).toBe(1);
  });

  it('does not hold a home to the room', () => {
    const t = town(ZoneType.ResLow, [['res-half-1', 1]]);
    t.pass({ res: 1, com: 0, ind: 0 }, { com: -100, ind: -100 });
    expect(t.registry.get(t.ids[0]!)).toBeUndefined();
    expect(t.registry.all().some((b) => b.level === 2)).toBe(true);
  });

  it('does not hold a farm to the room, as it is held to industry demand alone', () => {
    const run = (room: number, tickNo: number): BuildingRegistry => {
      const g = createGrid();
      for (let x = 0; x < 8; x++) {
        for (let z = 1; z <= 8; z++) {
          g.zone[tileIndex(x, z)] = ZoneType.Agriculture;
          g.soil[tileIndex(x, z)] = SoilGrade.Prime;
        }
        g.roadTier[tileIndex(x, 0)] = RoadTier.Gravel;
      }
      g.power[tileIndex(0, 1)] = 1;
      const registry = new BuildingRegistry(catalog);
      registry.place(g, byId('farm-crops-1'), 0, 1, 0, BuildingState.Active);
      new GrowthSystem(catalog, constantRng(0), onZone(ZoneType.Agriculture)).tick(
        g,
        registry,
        wants(0, 0.8),
        0,
        tickNo,
        UNMETERED_SUPPLY,
        { com: 0, ind: room, res: Infinity },
      );
      return registry;
    };
    for (const room of [100, -100]) {
      expect(
        run(room, 0)
          .all()
          .map((b) => b.catalogId),
      ).toContain('farm-crops-2');
    }
  });

  it('gives the same result for the same start', () => {
    const run = (): string => {
      const t = town(ZoneType.ComLow, [
        ['com-low-1', 1],
        ['com-fuel-1', 6],
        ['com-low-1', 9],
      ]);
      for (let i = 0; i < 6; i++) t.pass(wants(0.2), { com: -20, ind: 0 });
      return JSON.stringify(t.registry.all());
    };
    expect(run()).toBe(run());
  });
});

describe('a mixed block carries commerce jobs and is held to commerce room', () => {
  const homesWanted = (com: number): DemandLevels => ({ res: 0.5, com, ind: 0 });
  const mixedCount = (t: Town): number =>
    t.registry.all().filter((b) => byId(b.catalogId).kind === 'mixed').length;

  it('builds none in 200 passes with no room and commerce demand below zero', () => {
    const t = town(ZoneType.Mixed, []);
    for (let i = 0; i < 200; i++) t.pass(homesWanted(-0.2), { com: -100, ind: 0 });
    expect(mixedCount(t)).toBe(0);
  });

  /** Passes over the whole map, the room being what `base` leaves after the mixed blocks standing, as the economy hands it out. */
  const sweep = (t: Town, demand: DemandLevels, base: number): void => {
    for (let i = 0; i < 40; i++) {
      const used = t.registry
        .all()
        .reduce(
          (sum, b) =>
            sum + (byId(b.catalogId).kind === 'mixed' ? (byId(b.catalogId).jobs ?? 0) : 0),
          0,
        );
      t.pass(demand, { com: base - used, ind: 0 });
    }
  };

  it('builds as many as the commerce room holds, and counts the room down as it builds', () => {
    const one = town(ZoneType.Mixed, []);
    sweep(one, homesWanted(-0.2), 17);
    expect(mixedCount(one)).toBe(1);
    const two = town(ZoneType.Mixed, []);
    sweep(two, homesWanted(-0.2), 34);
    expect(mixedCount(two)).toBe(2);
  });

  it('lets the floor build one where shops are wanted and there is no room', () => {
    const t = town(ZoneType.Mixed, []);
    sweep(t, homesWanted(0.2), 0);
    expect(mixedCount(t)).toBeGreaterThan(0);
  });

  it('holds a level-1 block to the room for its 17 jobs, and counts it down', () => {
    const none = town(ZoneType.Mixed, [['mixed-1', 1]]);
    none.pass(homesWanted(-0.1), { com: -5, ind: 0 });
    expect(none.registry.get(none.ids[0]!)).toBeDefined();
    const roomy = town(ZoneType.Mixed, [
      ['mixed-1', 1],
      ['mixed-1', 5],
    ]);
    roomy.pass(homesWanted(-0.1), { com: 20, ind: 0 });
    const levelled = roomy.registry.all().filter((b) => b.level === 2);
    expect(levelled).toHaveLength(1);
  });

  it('levels by the allowance where shops are wanted, one a pass shared with shops', () => {
    const lone = town(ZoneType.Mixed, [['mixed-1', 1]]);
    lone.pass(homesWanted(0.2), { com: -5, ind: 0 });
    expect(lone.registry.get(lone.ids[0]!)).toBeUndefined();
    expect(lone.registry.all().some((b) => b.level === 2)).toBe(true);

    const both = town(ZoneType.ComLow, [['com-low-1', 1]], ZoneType.Mixed);
    const mixedId = both.registry.place(both.g, byId('mixed-1'), 8, 1, 0, BuildingState.Active)!.id;
    both.pass(homesWanted(0.2), { com: -5, ind: 0 });
    // The shop adds fewer jobs (+9 against +17), so it goes this pass and the block waits.
    expect(countAt(both, 'shop', 2)).toBe(1);
    expect(levelOf(both, mixedId)).toBe(1);
    both.pass(homesWanted(0.2), { com: -5, ind: 0 });
    expect(levelOf(both, mixedId)).toBeUndefined();
  });

  it('leaves a home with no jobs alone whatever the commerce room', () => {
    const t = town(ZoneType.ResHigh, []);
    for (let i = 0; i < 40; i++) t.pass(homesWanted(-0.5), { com: -100, ind: -100 });
    expect(t.registry.all().length).toBeGreaterThan(0);
  });

  it('gives the same result for the same start', () => {
    const run = (): string => {
      const t = town(ZoneType.Mixed, [['mixed-1', 1]]);
      for (let i = 0; i < 40; i++) t.pass(homesWanted(0.2), { com: -5, ind: 0 });
      return JSON.stringify(t.registry.all());
    };
    expect(run()).toBe(run());
  });
});
