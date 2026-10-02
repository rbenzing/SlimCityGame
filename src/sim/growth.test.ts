import { describe, expect, it } from 'vitest';
import { tileIndex } from '../shared/constants';
import { BuildingState, FieldId, Problem, RoadTier, ZoneType } from '../shared/types';
import type {
  BuildingCatalogEntry,
  BuildingKind,
  DemandLevels,
  FarmKind,
  GridState,
} from '../shared/types';
import { SoilGrade } from '../shared/soil';
import { BuildingRegistry } from './buildings';
import {
  GrowthSystem,
  UNLIMITED_ROOM,
  UNMETERED_SUPPLY,
  drawKind,
  farmKindFor,
  lotGrade,
  spawnCandidates,
  withinRoom,
} from './growth';
import { recomputeUtilities } from './network';
import type { GrowthSupply, Rng } from './growth';
import { createGrid } from '../world/grid';

function makeGrid(): GridState {
  return createGrid();
}

/** Stamps road/power/water/sewer/zone directly at (x, z) -- and only there. */
function serviceTile(g: GridState, x: number, z: number, zone: ZoneType): void {
  const idx = tileIndex(x, z);
  g.zone[idx] = zone;
  g.power[idx] = 1;
  g.watered[idx] = 1;
  g.sewered[idx] = 1;
  g.roadTier[idx] = RoadTier.TwoLane;
}

/** Zone + power + water + an adjacent road -- keeps an already-placed grown
 *  building free of NoPower/NoWater/NoRoad problems, on land zoned for it,
 *  so level-up tests aren't confounded by an incidental abandonment streak. */
function keepServiced(g: GridState, x: number, z: number, zone: ZoneType = ZoneType.ResLow): void {
  const idx = tileIndex(x, z);
  g.zone[idx] = zone;
  g.power[idx] = 1;
  g.watered[idx] = 1;
  g.sewered[idx] = 1;
  g.roadTier[idx] = RoadTier.TwoLane;
}

function constantRng(value: number): Rng {
  const self: Rng = {
    next: () => value,
    int: (maxExclusive: number) => Math.floor(value * maxExclusive),
    range: (a: number, b: number) => a + value * (b - a),
    fork: () => constantRng(value),
  };
  return self;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRng(seed: number): Rng {
  const rand = mulberry32(seed);
  const self: Rng = {
    next: () => rand(),
    int: (maxExclusive: number) => Math.floor(rand() * maxExclusive),
    range: (a: number, b: number) => a + rand() * (b - a),
    fork: (streamId: number) => seededRng(seed + streamId + 1),
  };
  return self;
}

const alwaysTrue = (): boolean => true;

const neutralDemand: DemandLevels = { res: 0.5, com: 0.5, ind: 0.5 };

const resL1: BuildingCatalogEntry = {
  id: 'res-l1',
  name: 'House',
  category: 'res',
  zone: ZoneType.ResLow,
  kind: 'detached',
  level: 1,
  footprint: { w: 1, d: 1 },
  height: 5,
  color: 0x336633,
  residents: 4,
  powerUse: 0.1,
  waterUse: 0.1,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
};

const resL2: BuildingCatalogEntry = {
  ...resL1,
  id: 'res-l2',
  name: 'Bigger House',
  level: 2,
  residents: 8,
};

const resL3: BuildingCatalogEntry = {
  ...resL1,
  id: 'res-l3',
  name: 'Tower',
  level: 3,
  residents: 16,
};

const growthCatalog: BuildingCatalogEntry[] = [resL1, resL2, resL3];

// New city-builder zones: ResMediumRow(6)/ResMedium(7)/Mixed(8).
// Milestone gates: row housing M1, medium M2, mixed M3.
const resMediumRowL1: BuildingCatalogEntry = {
  id: 'res-medium-row-l1',
  name: 'Row House',
  category: 'res',
  zone: ZoneType.ResMediumRow,
  kind: 'townhouse',
  level: 1,
  footprint: { w: 1, d: 2 },
  height: 7,
  color: 0x6db85d,
  residents: 8,
  powerUse: 0.2,
  waterUse: 0.5,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 1,
};

const resMediumL1: BuildingCatalogEntry = {
  id: 'res-medium-l1',
  name: 'Low Apartments',
  category: 'res',
  zone: ZoneType.ResMedium,
  kind: 'garden',
  level: 1,
  footprint: { w: 2, d: 2 },
  height: 14,
  color: 0x3f9a6a,
  residents: 30,
  powerUse: 0.6,
  waterUse: 1.8,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 2,
};

const mixedL1: BuildingCatalogEntry = {
  id: 'mixed-l1',
  name: 'Shopfront Flats',
  category: 'res',
  zone: ZoneType.Mixed,
  kind: 'mixed',
  level: 1,
  footprint: { w: 2, d: 2 },
  height: 18,
  color: 0x2f7d8c,
  residents: 30,
  jobs: 12,
  powerUse: 0.9,
  waterUse: 2.2,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 3,
};

const expandedZonesCatalog: BuildingCatalogEntry[] = [resL1, resMediumRowL1, resMediumL1, mixedL1];

describe('GrowthSystem', () => {
  describe('spawn gating', () => {
    it('does not spawn when there is no road within range', () => {
      const g = makeGrid();
      const idx = tileIndex(0, 0);
      g.zone[idx] = ZoneType.ResLow;
      g.power[idx] = 1;
      g.watered[idx] = 1;
      g.sewered[idx] = 1;
      // roadTier left at 0 everywhere.
      const registry = new BuildingRegistry(growthCatalog);
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      const delta = growth.tick(g, registry, neutralDemand, 0, 0);
      expect(delta.added).toEqual([]);
      expect(registry.all()).toHaveLength(0);
    });

    it('does not spawn when the tile has no power', () => {
      const g = makeGrid();
      serviceTile(g, 0, 0, ZoneType.ResLow);
      g.power[tileIndex(0, 0)] = 0;
      const registry = new BuildingRegistry(growthCatalog);
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      const delta = growth.tick(g, registry, neutralDemand, 0, 0);
      expect(delta.added).toEqual([]);
      expect(registry.all()).toHaveLength(0);
    });

    it('does not spawn when the tile has no sewer, since its sewage would have nowhere to go', () => {
      const g = makeGrid();
      serviceTile(g, 0, 0, ZoneType.ResLow);
      g.sewered[tileIndex(0, 0)] = 0;
      const registry = new BuildingRegistry(growthCatalog);
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      const delta = growth.tick(g, registry, neutralDemand, 0, 0);
      expect(delta.added).toEqual([]);
      expect(registry.all()).toHaveLength(0);
    });

    it('does not spawn when the tile has no water', () => {
      const g = makeGrid();
      serviceTile(g, 0, 0, ZoneType.ResLow);
      g.watered[tileIndex(0, 0)] = 0;
      const registry = new BuildingRegistry(growthCatalog);
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      const delta = growth.tick(g, registry, neutralDemand, 0, 0);
      expect(delta.added).toEqual([]);
      expect(registry.all()).toHaveLength(0);
    });

    it('does not spawn when sector demand is not positive', () => {
      const g = makeGrid();
      serviceTile(g, 0, 0, ZoneType.ResLow);
      const registry = new BuildingRegistry(growthCatalog);
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      const zeroDemand: DemandLevels = { res: 0, com: 0, ind: 0 };
      const delta = growth.tick(g, registry, zeroDemand, 0, 0);
      expect(delta.added).toEqual([]);
      expect(registry.all()).toHaveLength(0);
    });
  });

  it('spawns Constructing buildings deterministically across a serviced strip with a seeded rng', () => {
    const g = makeGrid();
    for (let x = 0; x < 5; x++) {
      serviceTile(g, x, 0, ZoneType.ResLow);
    }
    g.fields[FieldId.LandValue]!.fill(255); // desirability at its max
    const registry = new BuildingRegistry(growthCatalog);
    // demand=1 * desirability=1 => spawn probability is exactly 1: deterministic
    // regardless of the specific seeded values the rng happens to produce.
    const fullResDemand: DemandLevels = { res: 1, com: 0, ind: 0 };
    const growth = new GrowthSystem(growthCatalog, seededRng(20260721), alwaysTrue);

    // The scanner strides through the grid rather than covering it every
    // pass; run enough GROWTH_INTERVAL-spaced passes to guarantee every
    // tile in the small strip has had a turn.
    for (let pass = 0; pass < 40; pass++) {
      growth.tick(g, registry, fullResDemand, 0, pass * 10);
    }

    expect(registry.all()).toHaveLength(5);
    for (let x = 0; x < 5; x++) {
      const inst = registry.get(g.buildingId[tileIndex(x, 0)]!);
      expect(inst).toBeDefined();
      expect(inst!.catalogId).toBe('res-l1');
      expect(inst!.state).toBe(BuildingState.Constructing);
    }
  });

  it('transitions a Constructing building to Active after exactly CONSTRUCTION_TICKS ticks', () => {
    const g = makeGrid();
    serviceTile(g, 0, 0, ZoneType.ResLow);
    // Land value is deliberately left at its default (0, well under the L2
    // threshold of 140): a constantRng(0) spawn only needs probability > 0
    // to fire deterministically, and keeping land value low means the
    // resulting Active building isn't *also* eligible to level up on the
    // same tick that finishes construction, which would confound this test.
    const registry = new BuildingRegistry(growthCatalog);
    const fullResDemand: DemandLevels = { res: 1, com: 0, ind: 0 };
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

    const spawnDelta = growth.tick(g, registry, fullResDemand, 0, 0);
    expect(spawnDelta.added).toHaveLength(1);
    const id = spawnDelta.added[0]!.id;
    expect(registry.get(id)!.state).toBe(BuildingState.Constructing);

    for (let t = 1; t < 100; t++) {
      const delta = growth.tick(g, registry, fullResDemand, 0, t);
      expect(registry.get(id)!.state).toBe(BuildingState.Constructing);
      expect(delta.updated.some((b) => b.id === id)).toBe(false);
    }

    const finishDelta = growth.tick(g, registry, fullResDemand, 0, 100);
    expect(registry.get(id)!.state).toBe(BuildingState.Active);
    expect(finishDelta.updated).toHaveLength(1);
    expect(finishDelta.updated[0]!.id).toBe(id);
    expect(finishDelta.updated[0]!.state).toBe(BuildingState.Active);
    expect(finishDelta.added).toEqual([]);
    expect(finishDelta.removed).toEqual([]);
  });

  describe('level up', () => {
    it('levels up an Active building once land value clears the L2 threshold', () => {
      const g = makeGrid();
      const registry = new BuildingRegistry(growthCatalog);
      const original = registry.place(g, resL1, 5, 5, 0, BuildingState.Active)!;
      keepServiced(g, 5, 5);
      g.fields[FieldId.LandValue]![tileIndex(5, 5)] = 200; // > 140 threshold
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      const delta = growth.tick(g, registry, neutralDemand, 0, 0);

      expect(delta.removed).toEqual([original.id]);
      expect(delta.added).toHaveLength(1);
      const grown = delta.added[0]!;
      expect(grown.catalogId).toBe('res-l2');
      expect(grown.level).toBe(2);
      expect(grown.state).toBe(BuildingState.Constructing);
      expect(grown.x).toBe(5);
      expect(grown.z).toBe(5);

      expect(registry.get(original.id)).toBeUndefined();
      expect(registry.get(grown.id)!.catalogId).toBe('res-l2');
      expect(g.buildingId[tileIndex(5, 5)]).toBe(grown.id);
    });

    it('does not level up when land value is below the threshold', () => {
      const g = makeGrid();
      const registry = new BuildingRegistry(growthCatalog);
      const original = registry.place(g, resL1, 5, 5, 0, BuildingState.Active)!;
      keepServiced(g, 5, 5);
      g.fields[FieldId.LandValue]![tileIndex(5, 5)] = 50; // <= 140 threshold
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      const delta = growth.tick(g, registry, neutralDemand, 0, 0);

      expect(delta.added).toEqual([]);
      expect(delta.removed).toEqual([]);
      expect(registry.get(original.id)!.level).toBe(1);
      expect(registry.get(original.id)!.state).toBe(BuildingState.Active);
      expect(g.buildingId[tileIndex(5, 5)]).toBe(original.id);
    });

    it('requires education > 60 for a res building to reach L3, on top of land value', () => {
      const g = makeGrid();
      const registry = new BuildingRegistry(growthCatalog);
      const original = registry.place(g, resL2, 8, 8, 0, BuildingState.Active)!;
      keepServiced(g, 8, 8);
      g.fields[FieldId.LandValue]![tileIndex(8, 8)] = 220; // > 190 threshold
      g.fields[FieldId.Education]![tileIndex(8, 8)] = 30; // <= 60: not enough
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      const blockedDelta = growth.tick(g, registry, neutralDemand, 0, 0);
      expect(blockedDelta.added).toEqual([]);
      expect(registry.get(original.id)!.level).toBe(2);

      g.fields[FieldId.Education]![tileIndex(8, 8)] = 90; // now clears the L3 gate
      const grownDelta = growth.tick(g, registry, neutralDemand, 0, 10);
      expect(grownDelta.added).toHaveLength(1);
      expect(grownDelta.added[0]!.catalogId).toBe('res-l3');
      expect(grownDelta.added[0]!.level).toBe(3);
    });

    it('does not level up when the larger footprint is blocked by a neighboring building', () => {
      const blockedCatalog: BuildingCatalogEntry[] = [
        resL1,
        { ...resL1, id: 'res-l2-wide', level: 2, footprint: { w: 2, d: 2 } },
      ];
      const g = makeGrid();
      const registry = new BuildingRegistry(blockedCatalog);
      const original = registry.place(g, resL1, 5, 5, 0, BuildingState.Active)!;
      const neighbor = registry.place(g, resL1, 6, 6, 0, BuildingState.Active)!;
      keepServiced(g, 5, 5);
      keepServiced(g, 6, 6);
      g.fields[FieldId.LandValue]![tileIndex(5, 5)] = 200;
      const growth = new GrowthSystem(blockedCatalog, constantRng(0), alwaysTrue);
      const neighborId = neighbor.id;
      const neighborSnapshot = { ...neighbor };

      const delta = growth.tick(g, registry, neutralDemand, 0, 0);

      expect(delta.added).toEqual([]);
      expect(delta.removed).toEqual([]);
      expect(registry.get(original.id)!.level).toBe(1);
      expect(registry.get(original.id)!.state).toBe(BuildingState.Active);
      expect(g.buildingId[tileIndex(5, 5)]).toBe(original.id);
      expect(g.buildingId[tileIndex(6, 6)]).toBe(neighborId);
      expect(registry.get(neighborId)).toEqual(neighborSnapshot);
    });
  });

  describe('problems & abandonment', () => {
    it('flags NoPower, abandons after 3 consecutive passes, then recovers once power returns', () => {
      const g = makeGrid();
      const registry = new BuildingRegistry(growthCatalog);
      const inst = registry.place(g, resL1, 3, 3, 0, BuildingState.Active)!;
      const idx = tileIndex(3, 3);
      g.watered[idx] = 1;
      g.sewered[idx] = 1;
      g.roadTier[idx] = RoadTier.TwoLane;
      g.power[idx] = 0; // persistently unpowered
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      const pass1 = growth.tick(g, registry, neutralDemand, 0, 0);
      expect(registry.get(inst.id)!.state).toBe(BuildingState.Active);
      expect(pass1.updated.find((b) => b.id === inst.id)?.problems).toBe(1 /* Problem.NoPower */);

      const pass2 = growth.tick(g, registry, neutralDemand, 0, 10);
      expect(registry.get(inst.id)!.state).toBe(BuildingState.Active);
      expect(pass2.removed).toEqual([]);

      const pass3 = growth.tick(g, registry, neutralDemand, 0, 20);
      expect(registry.get(inst.id)!.state).toBe(BuildingState.Abandoned);
      expect(
        pass3.updated.some((b) => b.id === inst.id && b.state === BuildingState.Abandoned),
      ).toBe(true);

      // Recovery: power comes back.
      g.power[idx] = 1;
      const recoveryPass = growth.tick(g, registry, neutralDemand, 0, 30);
      expect(registry.get(inst.id)!.state).toBe(BuildingState.Active);
      const recovered = recoveryPass.updated.find((b) => b.id === inst.id);
      expect(recovered).toBeDefined();
      expect(recovered!.state).toBe(BuildingState.Active);
      expect(recovered!.problems & 1).toBe(0); // NoPower bit cleared
    });

    it('despawns an abandoned building after 10 further passes without recovery', () => {
      const g = makeGrid();
      const registry = new BuildingRegistry(growthCatalog);
      const inst = registry.place(g, resL1, 3, 3, 0, BuildingState.Active)!;
      const idx = tileIndex(3, 3);
      g.watered[idx] = 1;
      g.sewered[idx] = 1;
      g.roadTier[idx] = RoadTier.TwoLane;
      g.power[idx] = 0; // persistently unpowered, never restored
      const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

      // 3 passes to abandon (tickNo 0, 10, 20).
      growth.tick(g, registry, neutralDemand, 0, 0);
      growth.tick(g, registry, neutralDemand, 0, 10);
      growth.tick(g, registry, neutralDemand, 0, 20);
      expect(registry.get(inst.id)!.state).toBe(BuildingState.Abandoned);

      // 9 more passes (30..110): still abandoned, not yet despawned.
      growth.tick(g, registry, neutralDemand, 0, 30);
      for (let tickNo = 40; tickNo <= 110; tickNo += 10) {
        const lastDelta = growth.tick(g, registry, neutralDemand, 0, tickNo);
        expect(registry.get(inst.id)).toBeDefined();
        expect(lastDelta.removed).toEqual([]);
      }

      // 10th pass since abandonment (tickNo 120): despawns.
      const despawnDelta = growth.tick(g, registry, neutralDemand, 0, 120);
      expect(despawnDelta.removed).toEqual([inst.id]);
      expect(registry.get(inst.id)).toBeUndefined();
      expect(g.buildingId[idx]).toBe(0);
    });
  });

  it('returns empty added/removed/updated arrays on a no-op tick', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(growthCatalog);
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

    const delta = growth.tick(g, registry, neutralDemand, 0, 0);
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.updated).toEqual([]);
  });

  it('does not run the growth pass on ticks that are not a multiple of GROWTH_INTERVAL', () => {
    const g = makeGrid();
    serviceTile(g, 0, 0, ZoneType.ResLow);
    g.fields[FieldId.LandValue]!.fill(255);
    const registry = new BuildingRegistry(growthCatalog);
    const fullResDemand: DemandLevels = { res: 1, com: 0, ind: 0 };
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

    const delta = growth.tick(g, registry, fullResDemand, 0, 3);
    expect(delta.added).toEqual([]);
    expect(registry.all()).toHaveLength(0);
  });

  // Zoning types expansion: ResMediumRow(6)/ResMedium(7)/Mixed(8)
  // grow like any other zone once their catalog entries exist and the tile's
  // city has reached each zone's unlockMilestone.
  describe('expanded zone set (§6.21)', () => {
    const fullResDemand: DemandLevels = { res: 1, com: 0, ind: 0 };

    it.each([
      ['ResMediumRow', ZoneType.ResMediumRow, resMediumRowL1, 1],
      ['ResMedium', ZoneType.ResMedium, resMediumL1, 2],
      ['Mixed', ZoneType.Mixed, mixedL1, 3],
    ] as const)(
      'grows the matching catalog building on a %s tile at/above its unlock milestone',
      (_label, zone, entry, unlockMilestone) => {
        const g = makeGrid();
        // The whole lot zoned: a building stands only on land zoned for it.
        for (let dz = 0; dz < entry.footprint.d; dz++) {
          for (let dx = 0; dx < entry.footprint.w; dx++) serviceTile(g, dx, dz, zone);
        }
        g.fields[FieldId.LandValue]!.fill(255); // desirability at its max
        const registry = new BuildingRegistry(expandedZonesCatalog);
        const growth = new GrowthSystem(expandedZonesCatalog, constantRng(0), alwaysTrue);

        const delta = growth.tick(g, registry, fullResDemand, unlockMilestone, 0);

        expect(delta.added).toHaveLength(1);
        expect(delta.added[0]!.catalogId).toBe(entry.id);
        expect(delta.added[0]!.state).toBe(BuildingState.Constructing);
      },
    );

    it.each([
      ['ResMediumRow', ZoneType.ResMediumRow, 1],
      ['ResMedium', ZoneType.ResMedium, 2],
      ['Mixed', ZoneType.Mixed, 3],
    ] as const)(
      'does not grow a %s tile below its unlock milestone',
      (_label, zone, unlockMilestone) => {
        const g = makeGrid();
        serviceTile(g, 0, 0, zone);
        g.fields[FieldId.LandValue]!.fill(255);
        const registry = new BuildingRegistry(expandedZonesCatalog);
        const growth = new GrowthSystem(expandedZonesCatalog, constantRng(0), alwaysTrue);

        const delta = growth.tick(g, registry, fullResDemand, unlockMilestone - 1, 0);

        expect(delta.added).toEqual([]);
        expect(registry.all()).toHaveLength(0);
      },
    );

    it.each([
      ['ResLow', ZoneType.ResLow],
      ['ResHigh', ZoneType.ResHigh],
      ['ResMediumRow', ZoneType.ResMediumRow],
      ['ResMedium', ZoneType.ResMedium],
      ['Mixed', ZoneType.Mixed],
    ] as const)(
      'spawns a %s-zoned tile under residential (res) demand, not com/ind',
      (_label, zone) => {
        // zoneSector is private, but its behavior is externally observable:
        // a tile only spawns when *its* sector's demand is positive, so driving
        // res demand to 1 while com/ind are 0 (and vice versa) pins down which
        // sector each zone maps to without reaching into module internals.
        const catalogForZone: BuildingCatalogEntry[] = [
          { ...resL1, id: `entry-${zone}`, zone, unlockMilestone: 0 },
        ];
        const resOnlyDemand: DemandLevels = { res: 1, com: 0, ind: 0 };
        const nonResDemand: DemandLevels = { res: 0, com: 1, ind: 1 };

        const gRes = makeGrid();
        serviceTile(gRes, 0, 0, zone);
        gRes.fields[FieldId.LandValue]!.fill(255);
        const registryRes = new BuildingRegistry(catalogForZone);
        const growthRes = new GrowthSystem(catalogForZone, constantRng(0), alwaysTrue);
        const deltaRes = growthRes.tick(gRes, registryRes, resOnlyDemand, 0, 0);
        expect(deltaRes.added).toHaveLength(1);

        const gNonRes = makeGrid();
        serviceTile(gNonRes, 0, 0, zone);
        gNonRes.fields[FieldId.LandValue]!.fill(255);
        const registryNonRes = new BuildingRegistry(catalogForZone);
        const growthNonRes = new GrowthSystem(catalogForZone, constantRng(0), alwaysTrue);
        const deltaNonRes = growthNonRes.tick(gNonRes, registryNonRes, nonResDemand, 0, 0);
        expect(deltaNonRes.added).toEqual([]);
      },
    );

    it('a grown Mixed building contributes both residents and jobs to the registry totals', () => {
      const g = makeGrid();
      const registry = new BuildingRegistry(expandedZonesCatalog);
      registry.place(g, mixedL1, 2, 2, 0, BuildingState.Active);

      const totals = registry.totals();
      expect(totals.residents).toBe(mixedL1.residents);
      expect(totals.jobs).toBe(mixedL1.jobs);
      expect(totals.residents).toBeGreaterThan(0);
      expect(totals.jobs).toBeGreaterThan(0);
    });
  });

  describe('service reach is judged over the whole lot', () => {
    /** A 2x2 level-1 industrial entry — the footprint size that exposed this. */
    const indL1: BuildingCatalogEntry = {
      id: 'ind-1',
      name: 'Workshop Yard',
      category: 'ind',
      zone: ZoneType.Industrial,
      level: 1,
      footprint: { w: 2, d: 2 },
      height: 9,
      color: 0x8b6f4f,
      jobs: 16,
      powerUse: 1,
      waterUse: 1,
      cost: 0,
      upkeep: 0,
      unlockMilestone: 0,
    };

    /** The real buildability rule: a footprint may not cover a road or another building. */
    const footprintClear = (g: GridState, x: number, z: number, w: number, d: number): boolean => {
      for (let dz = 0; dz < d; dz++) {
        for (let dx = 0; dx < w; dx++) {
          const idx = tileIndex(x + dx, z + dz);
          if (g.roadTier[idx] !== RoadTier.None) return false;
          if (g.buildingId[idx] !== 0) return false;
        }
      }
      return true;
    };

    /**
     * Zones a 2x2 lot at (x, z) and lays a road along `side`, servicing only
     * the tiles one step from that road — what SERVICE_RADIUS = 1 produces.
     */
    function lotFronting(g: GridState, x: number, z: number, side: 'N' | 'S' | 'W' | 'E'): void {
      for (let dz = 0; dz < 2; dz++) {
        for (let dx = 0; dx < 2; dx++) g.zone[tileIndex(x + dx, z + dz)] = ZoneType.Industrial;
      }
      const road: Array<[number, number]> =
        side === 'N'
          ? [
              [x, z - 1],
              [x + 1, z - 1],
            ]
          : side === 'S'
            ? [
                [x, z + 2],
                [x + 1, z + 2],
              ]
            : side === 'W'
              ? [
                  [x - 1, z],
                  [x - 1, z + 1],
                ]
              : [
                  [x + 2, z],
                  [x + 2, z + 1],
                ];
      for (const [rx, rz] of road) g.roadTier[tileIndex(rx, rz)] = RoadTier.TwoLane;
      for (const [rx, rz] of road) {
        const spread: Array<[number, number]> = [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        for (const [ox, oz] of spread) {
          const idx = tileIndex(rx + ox, rz + oz);
          g.power[idx] = 1;
          g.watered[idx] = 1;
          g.sewered[idx] = 1;
        }
      }
    }

    function growsFronting(side: 'N' | 'S' | 'W' | 'E'): boolean {
      const g = makeGrid();
      lotFronting(g, 20, 20, side);
      const registry = new BuildingRegistry([indL1]);
      const system = new GrowthSystem([indL1], constantRng(0), footprintClear);
      for (let tick = 1; tick <= 4000; tick++) {
        if (system.tick(g, registry, neutralDemand, 0, tick).added.length > 0) return true;
      }
      return false;
    }

    it('spawns a multi-tile lot whichever side of it the street is on', () => {
      // Service used to be read at the origin corner only. Since a footprint
      // grows towards +x/+z, a lot fronting a road to its south or east had
      // its one serviced row pushed into the road and could never spawn —
      // which silently killed industrial districts laid out that way.
      for (const side of ['N', 'S', 'W', 'E'] as const) {
        expect(growsFronting(side), `road on the ${side} side`).toBe(true);
      }
    });

    it('still refuses a lot with no power or water anywhere on its footprint', () => {
      const g = makeGrid();
      for (let dz = 0; dz < 2; dz++) {
        for (let dx = 0; dx < 2; dx++) g.zone[tileIndex(20 + dx, 20 + dz)] = ZoneType.Industrial;
      }
      g.roadTier[tileIndex(20, 22)] = RoadTier.TwoLane; // in road reach, but unserviced
      const registry = new BuildingRegistry([indL1]);
      const system = new GrowthSystem([indL1], constantRng(0), footprintClear);
      let placed = 0;
      for (let tick = 1; tick <= 1000; tick++) {
        placed += system.tick(g, registry, neutralDemand, 0, tick).added.length;
      }
      expect(placed).toBe(0);
    });
  });

  describe('a generator that cannot deliver says so', () => {
    const waterTower: BuildingCatalogEntry = {
      id: 'water-tower',
      name: 'Water Tower',
      category: 'utility',
      footprint: { w: 2, d: 2 },
      height: 22,
      color: 0x8fa3b0,
      powerUse: 0,
      waterUse: 0,
      utility: { waterKL: 400 },
      cost: 2500,
      upkeep: 120,
      unlockMilestone: 0,
    };

    const windTurbine: BuildingCatalogEntry = {
      id: 'wind-turbine',
      name: 'Wind Turbine',
      category: 'utility',
      footprint: { w: 1, d: 1 },
      height: 40,
      color: 0xd8d8d8,
      powerUse: 0,
      waterUse: 0,
      utility: { powerMW: 6 },
      cost: 3000,
      upkeep: 100,
      unlockMilestone: 0,
    };

    const utilityCatalog = [waterTower, windTurbine];

    /** Places `entry` and runs one problems pass over it. */
    function plopAndSettle(
      g: GridState,
      entry: BuildingCatalogEntry,
      x: number,
      z: number,
    ): { id: number; problems: number; updated: number[] } {
      const registry = new BuildingRegistry(utilityCatalog);
      const inst = registry.place(g, entry, x, z, 0, BuildingState.Active)!;
      const growth = new GrowthSystem(utilityCatalog, constantRng(0), alwaysTrue);
      const delta = growth.tick(g, registry, neutralDemand, 0, 0);
      return {
        id: inst.id,
        problems: registry.get(inst.id)!.problems,
        updated: delta.updated.map((b) => b.id),
      };
    }

    it('flags a water tower the street never reaches', () => {
      const g = makeGrid();
      const { id, problems, updated } = plopAndSettle(g, waterTower, 5, 5);

      expect(problems & Problem.NoRoad).toBe(Problem.NoRoad);
      // The flag has to reach the mirror, or the advisor never counts it.
      expect(updated).toContain(id);
    });

    it('leaves the same tower alone once a street touches its footprint', () => {
      const g = makeGrid();
      g.roadTier[tileIndex(7, 5)] = RoadTier.TwoLane;
      const { problems } = plopAndSettle(g, waterTower, 5, 5);

      expect(problems & Problem.NoRoad).toBe(0);
    });

    it('leaves a wind turbine on a power line alone — the cable is its road', () => {
      const g = makeGrid();
      g.powerLine[tileIndex(6, 5)] = 1;
      const { problems } = plopAndSettle(g, windTurbine, 5, 5);

      expect(problems & Problem.NoRoad).toBe(0);
    });

    it('flags a water tower on a motorway — the tier beside it carries no water', () => {
      // The street it touches has to be one that conducts what it makes, which
      // is the same question coverage asks; a looser "any road will do" would
      // call this connected and then supply nothing.
      const g = makeGrid();
      g.roadTier[tileIndex(7, 5)] = RoadTier.Highway;
      const { problems } = plopAndSettle(g, waterTower, 5, 5);

      expect(problems & Problem.NoRoad).toBe(Problem.NoRoad);
    });

    it('flags a water tower on a power line — a cable carries no water', () => {
      const g = makeGrid();
      g.powerLine[tileIndex(7, 5)] = 1;
      const { problems } = plopAndSettle(g, waterTower, 5, 5);

      expect(problems & Problem.NoRoad).toBe(Problem.NoRoad);
    });

    it('changes nothing about supply — the city still counts what it cannot deliver', () => {
      const g = makeGrid();
      const registry = new BuildingRegistry(utilityCatalog);
      const inst = registry.place(g, waterTower, 5, 5, 0, BuildingState.Active)!;

      const before = recomputeUtilities(g, registry.all(), utilityCatalog);
      const growth = new GrowthSystem(utilityCatalog, constantRng(0), alwaysTrue);
      growth.tick(g, registry, neutralDemand, 0, 0);
      const after = recomputeUtilities(g, registry.all(), utilityCatalog);

      expect(registry.get(inst.id)!.problems & Problem.NoRoad).toBe(Problem.NoRoad);
      expect(before.waterSupply).toBe(400);
      expect(after).toEqual(before);
    });
  });
});

/** What a utility pass left: `spare` in utility units (millionths), and whom it cut. */
function supplyOf(
  power: { spare: number; cut?: number[] },
  water: { spare: number; cut?: number[] } = { spare: Infinity },
  sewer: { spare: number; cut?: number[] } = { spare: Infinity },
): GrowthSupply {
  return {
    power: { spare: power.spare, cut: new Set(power.cut ?? []) },
    water: { spare: water.spare, cut: new Set(water.cut ?? []) },
    sewer: { spare: sewer.spare, cut: new Set(sewer.cut ?? []) },
  };
}

/** The spawn scan comes back to a lot once every 32 passes of 10 ticks. */
const SWEEP_TICKS = 32 * 10;

describe('GrowthSystem: zoned land its road brings nothing', () => {
  /** A street down x = 5 that nothing supplies, and homes zoned three deep along its east side. */
  function zonedDownADryStreet(): GridState {
    const g = makeGrid();
    for (let z = 0; z < 6; z++) {
      g.roadTier[tileIndex(5, z)] = RoadTier.TwoLane;
      for (let x = 6; x <= 8; x++) g.zone[tileIndex(x, z)] = ZoneType.ResLow;
    }
    return g;
  }
  const growth = (): GrowthSystem => new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

  it('counts only the row beside the road, not ground zoned too deep to reach it', () => {
    const counted = growth().zonedUnserved(zonedDownADryStreet());
    expect(counted).toEqual({
      power: 6,
      water: 6,
      sewer: 6,
      powerAt: { x: 6, z: 0 },
      waterAt: { x: 6, z: 0 },
      sewerAt: { x: 6, z: 0 },
    });
  });

  it('counts each utility the road fails, and leaves out what it brings', () => {
    const g = zonedDownADryStreet();
    for (let z = 0; z < 6; z++) g.watered[tileIndex(6, z)] = 1;
    expect(growth().zonedUnserved(g)).toMatchObject({ power: 6, water: 0, sewer: 6 });
    for (let z = 0; z < 6; z++) g.sewered[tileIndex(6, z)] = 1;
    expect(growth().zonedUnserved(g)).toMatchObject({ power: 6, water: 0, sewer: 0 });
    for (let z = 0; z < 6; z++) g.power[tileIndex(6, z)] = 1;
    expect(growth().zonedUnserved(g)).toEqual({ power: 0, water: 0, sewer: 0 });
  });

  it('leaves out a tile something is already built on', () => {
    const g = zonedDownADryStreet();
    new BuildingRegistry(growthCatalog).place(g, resL1, 6, 0, 0, BuildingState.Active);
    expect(growth().zonedUnserved(g).power).toBe(5);
  });

  it('never asks water for farmland, which draws none', () => {
    const g = zonedDownADryStreet();
    for (let z = 0; z < 6; z++) g.zone[tileIndex(6, z)] = ZoneType.Agriculture;
    const farmCatalog: BuildingCatalogEntry[] = [
      ...growthCatalog,
      { ...resL1, id: 'farm', zone: ZoneType.Agriculture, waterUse: 0, kind: 'pasture' },
    ];
    const counted = new GrowthSystem(farmCatalog, constantRng(0), alwaysTrue).zonedUnserved(g);
    expect(counted).toEqual({ power: 6, water: 0, sewer: 0, powerAt: { x: 6, z: 0 } });
  });

  it('never asks water or a sewer for a house a dirt road serves, which is on a well and a septic tank', () => {
    const g = zonedDownADryStreet();
    for (let z = 0; z < 6; z++) g.roadTier[tileIndex(5, z)] = RoadTier.Gravel;
    expect(growth().zonedUnserved(g)).toEqual({
      power: 6,
      water: 0,
      sewer: 0,
      powerAt: { x: 6, z: 0 },
    });
  });

  it('asks water down a dirt road for anything denser than a house', () => {
    const g = zonedDownADryStreet();
    for (let z = 0; z < 6; z++) {
      g.roadTier[tileIndex(5, z)] = RoadTier.Gravel;
      g.zone[tileIndex(6, z)] = ZoneType.ResMedium;
    }
    const counted = new GrowthSystem(
      [...growthCatalog, resMediumL1],
      constantRng(0),
      alwaysTrue,
    ).zonedUnserved(g);
    expect(counted).toMatchObject({ power: 6, water: 6, sewer: 6 });
  });
});

describe('GrowthSystem: a house on a well', () => {
  const wantsHomes: DemandLevels = { res: 1, com: 0, ind: 0 };
  const flats: BuildingCatalogEntry = {
    ...resMediumL1,
    footprint: { w: 1, d: 1 },
    unlockMilestone: 0,
  };
  const catalog = [...growthCatalog, flats];

  /**
   * Homes zoned along z = 1 behind a dirt road along z = 0, power on (0, 1) —
   * the lot the first pass scans — and no water anywhere.
   */
  function downADirtRoad(zone: ZoneType = ZoneType.ResLow): GridState {
    const g = makeGrid();
    for (let x = 0; x < 8; x++) {
      g.roadTier[tileIndex(x, 0)] = RoadTier.Gravel;
      g.zone[tileIndex(x, 1)] = zone;
    }
    g.power[tileIndex(0, 1)] = 1;
    return g;
  }
  const grow = (
    g: GridState,
    registry = new BuildingRegistry(catalog),
    supply: GrowthSupply = UNMETERED_SUPPLY,
  ): BuildingRegistry => {
    new GrowthSystem(catalog, constantRng(0), alwaysTrue).tick(
      g,
      registry,
      wantsHomes,
      0,
      0,
      supply,
    );
    return registry;
  };

  it('grows a house off a dirt road on power alone', () => {
    const homes = grow(downADirtRoad()).all();
    expect(homes).toHaveLength(1);
    expect(homes[0]).toMatchObject({ catalogId: 'res-l1', x: 0, z: 1 });
  });

  it('draws nothing from the mains, so a dry grid never holds it back', () => {
    const g = downADirtRoad();
    const growth = new GrowthSystem(catalog, constantRng(0), alwaysTrue);
    const registry = new BuildingRegistry(catalog);
    const dry = supplyOf({ spare: Infinity }, { spare: 0 });
    expect(growth.tick(g, registry, wantsHomes, 0, 0, dry).added).toHaveLength(1);
    expect(growth.waitingFor(g, registry, dry)).toEqual({ power: 0, water: 0, sewer: 0 });
  });

  it('still needs power, which the dirt road does not bring', () => {
    const g = downADirtRoad();
    g.power[tileIndex(0, 1)] = 0;
    expect(grow(g).all()).toHaveLength(0);
  });

  it('never flags a standing house on a well for water', () => {
    const g = downADirtRoad();
    const registry = new BuildingRegistry(catalog);
    const house = registry.place(g, resL1, 0, 1, 0, BuildingState.Active)!;
    grow(g, registry);
    expect(house.problems & Problem.NoWater).toBe(0);
  });

  it('puts denser homes on the mains, which a dirt road does not bring', () => {
    expect(grow(downADirtRoad(ZoneType.ResMedium)).all()).toHaveLength(0);
  });

  it('puts a house on the mains when a main runs beside its lot, and it waits for the water', () => {
    const g = downADirtRoad();
    g.roadTier[tileIndex(0, 2)] = RoadTier.TwoLane; // a dry street behind the lot
    expect(grow(g).all()).toHaveLength(0);
    g.watered[tileIndex(0, 1)] = 1;
    // On the mains it is on the sewer too, and waits for a drain the same way.
    expect(grow(g).all()).toHaveLength(0);
    g.sewered[tileIndex(0, 1)] = 1;
    expect(grow(g).all()).toHaveLength(1);
  });

  it('never moves a house the mains serve onto a well when the water runs short', () => {
    const g = downADirtRoad();
    g.roadTier[tileIndex(0, 2)] = RoadTier.TwoLane;
    const registry = new BuildingRegistry(catalog);
    const house = registry.place(g, resL1, 0, 1, 0, BuildingState.Active)!;
    // The cut has taken its water.
    grow(g, registry, supplyOf({ spare: Infinity }, { spare: -100, cut: [house.id] }));
    const both = Problem.NoWater | Problem.WaterShortage;
    expect(house.problems & both).toBe(both);
  });
});

describe('GrowthSystem: a grid too small for its city', () => {
  const fullResDemand: DemandLevels = { res: 1, com: 0, ind: 0 };

  it('flags a building the shortage cut beside NoPower, and it abandons like any unpowered one', () => {
    const g = makeGrid();
    const registry = new BuildingRegistry(growthCatalog);
    const inst = registry.place(g, resL1, 3, 3, 0, BuildingState.Active)!;
    keepServiced(g, 3, 3);
    g.power[tileIndex(3, 3)] = 0; // what the cut leaves it
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);
    const short = supplyOf({ spare: -100, cut: [inst.id] });

    growth.tick(g, registry, neutralDemand, 0, 0, short);
    const both = Problem.NoPower | Problem.PowerShortage;
    expect(registry.get(inst.id)!.problems & both).toBe(both);

    growth.tick(g, registry, neutralDemand, 0, 10, short);
    growth.tick(g, registry, neutralDemand, 0, 20, short);
    expect(registry.get(inst.id)!.state).toBe(BuildingState.Abandoned);
    expect(registry.get(inst.id)!.problems & both).toBe(both);
  });

  it('builds nothing the grid cannot supply, and counts the lot as waiting until it can', () => {
    const g = makeGrid();
    serviceTile(g, 0, 0, ZoneType.ResLow);
    const registry = new BuildingRegistry(growthCatalog);
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);
    const full = supplyOf({ spare: 99_999 }); // a house draws 0.1 MW, 100,000 units
    const room = supplyOf({ spare: 100_000 });

    expect(growth.tick(g, registry, fullResDemand, 0, 0, full).added).toEqual([]);
    expect(growth.waitingFor(g, registry, full)).toEqual({ power: 1, water: 0, sewer: 0 });
    // Measured against what is spare now, so more supply ends the wait at once.
    expect(growth.waitingFor(g, registry, room)).toEqual({ power: 0, water: 0, sewer: 0 });

    expect(growth.tick(g, registry, fullResDemand, 0, SWEEP_TICKS, room).added).toHaveLength(1);
    expect(growth.waitingFor(g, registry, full)).toEqual({ power: 0, water: 0, sewer: 0 });
  });

  it('waits for water the same way', () => {
    const g = makeGrid();
    serviceTile(g, 0, 0, ZoneType.ResLow);
    const registry = new BuildingRegistry(growthCatalog);
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);
    const dry = supplyOf({ spare: Infinity }, { spare: 0 });

    expect(growth.tick(g, registry, fullResDemand, 0, 0, dry).added).toEqual([]);
    expect(growth.waitingFor(g, registry, dry)).toEqual({ power: 0, water: 1, sewer: 0 });
  });

  it('waits for a drain the same way', () => {
    const g = makeGrid();
    serviceTile(g, 0, 0, ZoneType.ResLow);
    const registry = new BuildingRegistry(growthCatalog);
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);
    const choked = supplyOf({ spare: Infinity }, { spare: Infinity }, { spare: 0 });
    expect(growth.tick(g, registry, fullResDemand, 0, 0, choked).added).toEqual([]);
    expect(growth.waitingFor(g, registry, choked)).toEqual({ power: 0, water: 0, sewer: 1 });
  });

  it("hands a pass's spare supply out once, not to every lot that asks", () => {
    const g = makeGrid();
    serviceTile(g, 0, 0, ZoneType.ResLow);
    serviceTile(g, 32, 0, ZoneType.ResLow); // the same stride of the scan
    const registry = new BuildingRegistry(growthCatalog);
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);

    const delta = growth.tick(g, registry, fullResDemand, 0, 0, supplyOf({ spare: 150_000 }));
    expect(delta.added).toHaveLength(1);
    expect(growth.waitingFor(g, registry, supplyOf({ spare: 50_000 }))).toEqual({
      power: 1,
      water: 0,
      sewer: 0,
    });
  });

  it('counts overlapping candidate lots as the homes that would fit, not as tiles', () => {
    const wideHouse: BuildingCatalogEntry = { ...resL1, id: 'wide-l1', footprint: { w: 2, d: 2 } };
    const catalog = [wideHouse];
    const g = makeGrid();
    // A 4×2 block: a 2×2 home could start on any of the three tiles whose
    // lot stays inside it.
    for (let z = 0; z < 2; z++) for (let x = 0; x < 4; x++) serviceTile(g, x, z, ZoneType.ResLow);
    const registry = new BuildingRegistry(catalog);
    const growth = new GrowthSystem(catalog, constantRng(0), alwaysTrue);
    const full = supplyOf({ spare: 0 });
    for (let pass = 0; pass < 32; pass++)
      growth.tick(g, registry, fullResDemand, 0, pass * 10, full);

    expect(registry.all()).toHaveLength(0);
    // Claimed in tile order: (0,0) takes 0..1 × 0..1, (2,0) the next two columns.
    expect(growth.waitingFor(g, registry, full).power).toBe(2);
  });

  it('forgets a waiting lot once it is built on or unzoned', () => {
    const g = makeGrid();
    serviceTile(g, 0, 0, ZoneType.ResLow);
    const registry = new BuildingRegistry(growthCatalog);
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);
    const full = supplyOf({ spare: 0 });
    growth.tick(g, registry, fullResDemand, 0, 0, full);
    expect(growth.waitingFor(g, registry, full).power).toBe(1);

    g.zone[tileIndex(0, 0)] = ZoneType.None;
    expect(growth.waitingFor(g, registry, full).power).toBe(0);
  });

  it('levels nothing up into a shortage, and counts the building as waiting', () => {
    const hungryL2: BuildingCatalogEntry = { ...resL2, powerUse: 0.3 };
    const catalog = [resL1, hungryL2, resL3];
    const g = makeGrid();
    const registry = new BuildingRegistry(catalog);
    const inst = registry.place(g, resL1, 5, 5, 0, BuildingState.Active)!;
    keepServiced(g, 5, 5);
    g.fields[FieldId.LandValue]![tileIndex(5, 5)] = 200;
    const growth = new GrowthSystem(catalog, constantRng(0), alwaysTrue);
    const tight = supplyOf({ spare: 199_999 }); // the bigger house draws 0.2 MW more

    const held = growth.tick(g, registry, neutralDemand, 0, 0, tight);
    expect(held.added).toEqual([]);
    expect(registry.get(inst.id)!.level).toBe(1);
    expect(g.buildingId[tileIndex(5, 5)]).toBe(inst.id);
    expect(growth.waitingFor(g, registry, tight)).toEqual({ power: 1, water: 0, sewer: 0 });

    const grown = growth.tick(g, registry, neutralDemand, 0, 10, supplyOf({ spare: 200_000 }));
    expect(grown.added).toHaveLength(1);
    expect(grown.added[0]!.level).toBe(2);
    expect(growth.waitingFor(g, registry, tight)).toEqual({ power: 0, water: 0, sewer: 0 });
  });

  it('settles a short city: the far house goes dark and stays dark, and nothing flips back', () => {
    const plant: BuildingCatalogEntry = {
      id: 'small-plant',
      name: 'Plant',
      category: 'utility',
      footprint: { w: 1, d: 1 },
      height: 5,
      color: 0,
      powerUse: 0,
      waterUse: 0,
      utility: { powerMW: 0.35, waterKL: 100, sewerKL: 100 }, // power for three houses of four
      cost: 0,
      upkeep: 0,
      unlockMilestone: 0,
    };
    const catalog = [...growthCatalog, plant];
    const g = makeGrid();
    for (let x = 6; x <= 24; x++) g.roadTier[tileIndex(x, 5)] = RoadTier.TwoLane;
    const registry = new BuildingRegistry(catalog);
    registry.place(g, plant, 5, 5, 0, BuildingState.Active);
    const houses = [8, 12, 16, 20].map((x) => {
      g.zone[tileIndex(x, 6)] = ZoneType.ResLow;
      return registry.place(g, resL1, x, 6, 0, BuildingState.Active)!.id;
    });
    const far = houses[3]!;
    const growth = new GrowthSystem(catalog, constantRng(0), alwaysTrue);

    // The worker's own order: the utility pass every 10 ticks, then growth.
    const farStates: BuildingState[] = [];
    let totals = recomputeUtilities(g, registry.all(), catalog);
    let supply: GrowthSupply = { power: totals.power, water: totals.water, sewer: totals.sewer };
    for (let t = 1; t <= 500; t++) {
      if (t % 10 === 0) {
        totals = recomputeUtilities(g, registry.all(), catalog);
        supply = { power: totals.power, water: totals.water, sewer: totals.sewer };
      }
      growth.tick(g, registry, fullResDemand, 0, t, supply);
      const b = registry.get(far);
      if (t % 10 === 0 && b) farStates.push(b.state);
    }

    const darkFrom = farStates.indexOf(BuildingState.Abandoned);
    expect(darkFrom).toBeGreaterThan(-1);
    expect(farStates.slice(darkFrom).every((s) => s === BuildingState.Abandoned)).toBe(true);
    expect(registry.get(far)).toBeUndefined(); // cleared, as an abandoned home is
    for (const id of houses.slice(0, 3)) {
      expect(registry.get(id)!.state).toBe(BuildingState.Active);
    }
    // Its lot is not rebuilt into the same shortage; it waits.
    expect(g.buildingId[tileIndex(20, 6)]).toBe(0);
    expect(growth.waitingFor(g, registry, supply)).toEqual({ power: 1, water: 0, sewer: 0 });
  });
});

describe('farms', () => {
  const farmEntry = (
    kind: FarmKind,
    level: number,
    w: number,
    d: number,
  ): BuildingCatalogEntry => ({
    id: `farm-${kind}-${level}`,
    name: `${kind} ${level}`,
    category: 'ind',
    zone: ZoneType.Agriculture,
    level,
    kind,
    footprint: { w, d },
    height: 9,
    color: 0x7a3a2c,
    residents: 4,
    jobs: level,
    powerUse: 0.2 * level,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  });
  const farmCatalog: BuildingCatalogEntry[] = [
    farmEntry('crops', 1, 4, 5),
    farmEntry('crops', 2, 5, 6),
    farmEntry('orchard', 1, 4, 5),
    farmEntry('orchard', 2, 5, 6),
    farmEntry('pasture', 1, 4, 5),
    farmEntry('pasture', 2, 5, 6),
  ];
  const wantsWork: DemandLevels = { res: 0, com: 0, ind: 0.8 };

  /**
   * Agriculture land of one grade at x 0..7, z 1..8, a dirt road along z = 0
   * in front of it and power on the lot's first tile, (0, 1), which the first
   * pass scans; no water anywhere.
   */
  function farmland(grade: SoilGrade = SoilGrade.Prime): GridState {
    const g = makeGrid();
    for (let x = 0; x < 8; x++) {
      for (let z = 1; z <= 8; z++) {
        g.zone[tileIndex(x, z)] = ZoneType.Agriculture;
        g.soil[tileIndex(x, z)] = grade;
      }
      g.roadTier[tileIndex(x, 0)] = RoadTier.Gravel;
    }
    g.power[tileIndex(0, 1)] = 1;
    return g;
  }
  const pave = (g: GridState): void => {
    for (let x = 0; x < 8; x++) g.roadTier[tileIndex(x, 0)] = RoadTier.TwoLane;
  };

  const grow = (g: GridState, demand = wantsWork): BuildingRegistry => {
    const registry = new BuildingRegistry(farmCatalog);
    new GrowthSystem(farmCatalog, constantRng(0), alwaysTrue).tick(g, registry, demand, 0, 0);
    return registry;
  };

  it('starts a farm off a dirt road with power, and no city water at all', () => {
    const farms = grow(farmland()).all();
    expect(farms).toHaveLength(1);
    expect(farms[0]).toMatchObject({ catalogId: 'farm-crops-1', x: 0, z: 1 });
  });

  it.each([
    ['row crops on very fertile land', SoilGrade.Prime, 'farm-crops-1'],
    ['an orchard on fertile land', SoilGrade.Fertile, 'farm-orchard-1'],
    ['pasture on somewhat fertile land', SoilGrade.Marginal, 'farm-pasture-1'],
  ])('grows %s', (_label, grade, catalogId) => {
    expect(grow(farmland(grade)).all()[0]?.catalogId).toBe(catalogId);
  });

  it('grows nothing on unfit land, even zoned', () => {
    expect(grow(farmland(SoilGrade.Unfit)).all()).toHaveLength(0);
  });

  it('reads the kind from the grade at least half the lot reaches', () => {
    const g = farmland(SoilGrade.Fertile);
    // Half the 4×5 lot is prime, and half is as good as prime or better.
    for (let z = 1; z <= 5; z++) {
      for (let x = 0; x < 2; x++) g.soil[tileIndex(x, z)] = SoilGrade.Prime;
    }
    expect(lotGrade(g, 0, 1, 4, 5)).toBe(SoilGrade.Prime);
    // One fewer, and the lot as a whole is only as good as fertile.
    g.soil[tileIndex(0, 1)] = SoilGrade.Fertile;
    expect(lotGrade(g, 0, 1, 4, 5)).toBe(SoilGrade.Fertile);
  });

  it('needs a dirt road: a paved street beside the land gives it no gate', () => {
    const g = farmland();
    pave(g);
    expect(grow(g).all()).toHaveLength(0);
  });

  it('needs power, which a dirt road does not carry', () => {
    const g = farmland();
    g.power[tileIndex(0, 1)] = 0;
    expect(grow(g).all()).toHaveLength(0);
  });

  it('needs its whole lot zoned Agriculture on farmable soil', () => {
    const notZoned = farmland();
    notZoned.zone[tileIndex(3, 5)] = ZoneType.None;
    expect(grow(notZoned).all()).toHaveLength(0);

    const rocky = farmland();
    rocky.soil[tileIndex(3, 5)] = SoilGrade.Unfit;
    expect(grow(rocky).all()).toHaveLength(0);
  });

  it('grows only while the town wants basic work', () => {
    expect(grow(farmland(), { res: 1, com: 1, ind: 0 }).all()).toHaveLength(0);
  });

  it('reads a lost dirt road as no road, and never wants water', () => {
    const g = farmland();
    const registry = new BuildingRegistry(farmCatalog);
    const farm = registry.place(g, farmCatalog[0]!, 0, 1, 0, BuildingState.Active)!;
    pave(g);
    new GrowthSystem(farmCatalog, constantRng(0.99), alwaysTrue).tick(g, registry, wantsWork, 0, 0);
    expect(farm.problems & Problem.NoRoad).toBe(Problem.NoRoad);
    expect(farm.problems & Problem.NoWater).toBe(0);
  });

  describe('growing larger', () => {
    function standingFarm(
      kind: FarmKind,
      grade: SoilGrade,
    ): { g: GridState; registry: BuildingRegistry } {
      const g = farmland(grade);
      const registry = new BuildingRegistry(farmCatalog);
      const entry = farmCatalog.find((e) => e.kind === kind && e.level === 1)!;
      registry.place(g, entry, 0, 1, 0, BuildingState.Active);
      return { g, registry };
    }
    const levelUp = (g: GridState, registry: BuildingRegistry, demand = wantsWork): string[] => {
      new GrowthSystem(farmCatalog, constantRng(0), alwaysTrue).tick(g, registry, demand, 0, 0);
      return registry.all().map((b) => b.catalogId);
    };

    it('takes more land of its own grade and stays the same kind of farm', () => {
      const { g, registry } = standingFarm('orchard', SoilGrade.Prime);
      expect(levelUp(g, registry)).toContain('farm-orchard-2');
    });

    it('never grows onto land poorer than its kind needs', () => {
      // A crop farm whose land has since been reshaped into rolling ground.
      const { g, registry } = standingFarm('crops', SoilGrade.Fertile);
      expect(levelUp(g, registry)).toEqual(['farm-crops-1']);
    });

    it('never grows onto land outside the Agriculture zone', () => {
      const { g, registry } = standingFarm('pasture', SoilGrade.Marginal);
      g.zone[tileIndex(4, 6)] = ZoneType.ResLow;
      expect(levelUp(g, registry)).toEqual(['farm-pasture-1']);
    });

    it('grows only while the town wants more basic work, whatever the land value', () => {
      const { g, registry } = standingFarm('pasture', SoilGrade.Marginal);
      g.fields[FieldId.LandValue]!.fill(255);
      expect(levelUp(g, registry, { res: 1, com: 1, ind: 0 })).toEqual(['farm-pasture-1']);
      expect(levelUp(g, registry)).toEqual(['farm-pasture-2']);
    });
  });
});

describe('the lot picks its building', () => {
  const wantsHomes: DemandLevels = { res: 1, com: 0, ind: 0 };
  const house = (level: number, w: number, d: number): BuildingCatalogEntry => ({
    ...resL1,
    id: `house-${level}`,
    kind: 'detached',
    level,
    share: level === 1 ? 61.1 : undefined,
    units: 1,
    footprint: { w, d },
  });
  const duplex = (level: number): BuildingCatalogEntry => ({
    ...resL1,
    id: `duplex-${level}`,
    kind: 'duplex',
    level,
    share: level === 1 ? 1.6 : undefined,
    units: 2,
    footprint: { w: 1, d: 2 },
    unlockMilestone: 1,
  });
  const kinds = [house(1, 2, 2), house(2, 2, 3), duplex(1), duplex(2)];
  /** The only lots a building may take here are ones zoned ResLow on every tile. */
  const onZonedGround = (g: GridState, x: number, z: number, w: number, d: number): boolean => {
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) {
        if (g.zone[tileIndex(x + dx, z + dz)] !== ZoneType.ResLow) return false;
      }
    }
    return true;
  };
  /** A street along z = 0 and zoned, powered, watered land in the block below it. */
  function zoned(w: number, d: number): GridState {
    const g = makeGrid();
    for (let x = 0; x < w + 2; x++) g.roadTier[tileIndex(x, 0)] = RoadTier.TwoLane;
    for (let z = 1; z <= d; z++) {
      for (let x = 0; x < w; x++) {
        const i = tileIndex(x, z);
        g.zone[i] = ZoneType.ResLow;
        g.power[i] = 1;
        g.watered[i] = 1;
        g.sewered[i] = 1;
      }
    }
    return g;
  }

  it('lists the kinds of the zone that are unlocked and fit the lot, in catalog order', () => {
    const fits = (e: BuildingCatalogEntry): boolean => e.footprint.w === 1;
    expect(spawnCandidates(kinds, ZoneType.ResLow, 1, () => true).map((e) => e.id)).toEqual([
      'house-1',
      'duplex-1',
    ]);
    expect(spawnCandidates(kinds, ZoneType.ResLow, 0, () => true).map((e) => e.id)).toEqual([
      'house-1',
    ]);
    expect(spawnCandidates(kinds, ZoneType.ResLow, 1, fits).map((e) => e.id)).toEqual(['duplex-1']);
    expect(spawnCandidates(kinds, ZoneType.ResHigh, 1, () => true)).toEqual([]);
  });

  it('draws by share: a roll walks the cumulative weights in order', () => {
    const [h, d] = spawnCandidates(kinds, ZoneType.ResLow, 1, () => true);
    expect(drawKind([h!, d!], 0).id).toBe('house-1');
    expect(drawKind([h!, d!], 61 / 62.7).id).toBe('house-1');
    expect(drawKind([h!, d!], 61.2 / 62.7).id).toBe('duplex-1');
    expect(drawKind([h!, d!], 0.999).id).toBe('duplex-1');
    // Without a share, a kind weighs one.
    const plain = { ...h!, share: undefined };
    expect(drawKind([plain, { ...d!, share: undefined }], 0.49).id).toBe('house-1');
    expect(drawKind([plain, { ...d!, share: undefined }], 0.51).id).toBe('duplex-1');
  });

  it('grows a detached house on a wide block, the first kind a constant roll picks', () => {
    const g = zoned(4, 4);
    const registry = new BuildingRegistry(kinds);
    new GrowthSystem(kinds, constantRng(0), onZonedGround).tick(g, registry, wantsHomes, 1, 0);
    const grown = registry.all().map((b) => b.catalogId);
    expect(grown.length).toBeGreaterThan(0);
    expect(new Set(grown)).toEqual(new Set(['house-1']));
  });

  it('grows a duplex, never a house, on a strip one tile wide', () => {
    const g = zoned(1, 4);
    const registry = new BuildingRegistry(kinds);
    const growth = new GrowthSystem(kinds, constantRng(0), onZonedGround);
    for (let pass = 0; pass < 32; pass++) growth.tick(g, registry, wantsHomes, 1, pass * 10);
    const grown = registry.all().map((b) => b.catalogId);
    expect(grown.length).toBeGreaterThan(0);
    expect(new Set(grown)).toEqual(new Set(['duplex-1']));
  });

  it('grows no duplex before its milestone, even where only a duplex fits', () => {
    const g = zoned(1, 4);
    const registry = new BuildingRegistry(kinds);
    const growth = new GrowthSystem(kinds, constantRng(0), onZonedGround);
    for (let pass = 0; pass < 32; pass++) growth.tick(g, registry, wantsHomes, 0, pass * 10);
    expect(registry.all()).toHaveLength(0);
  });

  it('keeps its kind through a level-up: a duplex becomes a better duplex, never a house', () => {
    const g = zoned(2, 3);
    const registry = new BuildingRegistry(kinds);
    const inst = registry.place(g, duplex(1), 0, 1, 0, BuildingState.Active)!;
    g.fields[FieldId.LandValue]![tileIndex(0, 1)] = 200;
    new GrowthSystem(kinds, constantRng(0), onZonedGround).tick(g, registry, wantsHomes, 1, 0);
    expect(registry.get(inst.id)).toBeUndefined();
    expect(registry.all().map((b) => b.catalogId)).toEqual(['duplex-2']);
  });
});

describe('a business opens where the town has room for its jobs', () => {
  const wantsShops: DemandLevels = { res: 0, com: 1, ind: 0 };
  const business = (
    id: string,
    kind: BuildingKind,
    zone: ZoneType,
    level: number,
    w: number,
    d: number,
    jobs: number,
    share?: number,
  ): BuildingCatalogEntry => ({
    ...resL1,
    id,
    category: 'com',
    zone,
    kind,
    level,
    share,
    footprint: { w, d },
    residents: undefined,
    jobs,
  });
  const shop = business('shop-1', 'shop', ZoneType.ComLow, 1, 1, 1, 8, 1);
  const strip = business('strip-1', 'strip', ZoneType.ComLow, 1, 3, 2, 51, 1000);
  const office1 = business('office-1', 'office', ZoneType.ComHigh, 1, 2, 2, 228, 1);
  const office2 = business('office-2', 'office', ZoneType.ComHigh, 2, 3, 3, 820);
  const catalog = [shop, strip, office1, office2];
  const onZoned =
    (zone: ZoneType) => (g: GridState, x: number, z: number, w: number, d: number) => {
      for (let dz = 0; dz < d; dz++) {
        for (let dx = 0; dx < w; dx++) {
          if (g.zone[tileIndex(x + dx, z + dz)] !== zone) return false;
        }
      }
      return true;
    };
  /** A street along z = 0 and a served block of `zone` below it, as desirable as land gets. */
  function block(zone: ZoneType, w: number, d: number): GridState {
    const g = makeGrid();
    g.fields[FieldId.LandValue]!.fill(255);
    for (let x = 0; x < w + 2; x++) g.roadTier[tileIndex(x, 0)] = RoadTier.TwoLane;
    for (let z = 1; z <= d; z++) {
      for (let x = 0; x < w; x++) {
        const i = tileIndex(x, z);
        g.zone[i] = zone;
        g.power[i] = 1;
        g.watered[i] = 1;
        g.sewered[i] = 1;
      }
    }
    return g;
  }

  it('keeps only the kinds whose jobs fit the room, and always the smallest', () => {
    expect(withinRoom([shop, strip], 'com', { com: 10, ind: 0 })).toEqual([shop]);
    expect(withinRoom([shop, strip], 'com', { com: 60, ind: 0 })).toEqual([shop, strip]);
    expect(withinRoom([shop, strip], 'com', { com: -5, ind: 0 })).toEqual([shop]);
    expect(withinRoom([strip], 'com', { com: 0, ind: 0 })).toEqual([strip]);
    expect(withinRoom([shop, strip], 'res', { com: 0, ind: 0 })).toEqual([shop, strip]);
    expect(withinRoom([shop, strip], 'com', UNLIMITED_ROOM)).toEqual([shop, strip]);
  });

  it('grows a corner shop, not a shopping strip, where the town supports ten jobs', () => {
    const g = block(ZoneType.ComLow, 6, 2);
    const registry = new BuildingRegistry(catalog);
    // A roll near one would pick the strip, the heavier kind, whenever it is a candidate.
    const growth = new GrowthSystem(catalog, constantRng(0.99), onZoned(ZoneType.ComLow));
    growth.tick(g, registry, wantsShops, 1, 0, UNMETERED_SUPPLY, { com: 10, ind: 0 });
    const grown = registry.all().map((b) => b.catalogId);
    expect(grown.length).toBeGreaterThan(0);
    expect(new Set(grown)).toEqual(new Set(['shop-1']));
  });

  it('grows the strip where the town has room for it, and hands the room out once a pass', () => {
    const g = block(ZoneType.ComLow, 6, 4);
    const registry = new BuildingRegistry(catalog);
    const growth = new GrowthSystem(catalog, constantRng(0.99), onZoned(ZoneType.ComLow));
    // Room for one strip and a little over: the first lot takes it, the next gets a shop.
    growth.tick(g, registry, wantsShops, 1, 0, UNMETERED_SUPPLY, { com: 60, ind: 0 });
    expect(registry.all().map((b) => b.catalogId)).toEqual(['strip-1', 'shop-1']);
  });

  it('lets a business level up only with room for the jobs it adds', () => {
    const g = block(ZoneType.ComHigh, 3, 3);
    const registry = new BuildingRegistry(catalog);
    const inst = registry.place(g, office1, 0, 1, 0, BuildingState.Active)!;
    g.fields[FieldId.LandValue]![tileIndex(0, 1)] = 200;
    const growth = new GrowthSystem(catalog, constantRng(0), onZoned(ZoneType.ComHigh));

    growth.tick(g, registry, wantsShops, 4, 0, UNMETERED_SUPPLY, { com: 500, ind: 0 });
    expect(registry.get(inst.id)!.level).toBe(1);

    growth.tick(g, registry, wantsShops, 4, 10, UNMETERED_SUPPLY, { com: 592, ind: 0 });
    expect(registry.get(inst.id)).toBeUndefined();
    expect(registry.all().map((b) => b.catalogId)).toEqual(['office-2']);
  });

  it('never holds a home to the room: homes follow residential demand alone', () => {
    const g = block(ZoneType.ResLow, 2, 2);
    const registry = new BuildingRegistry(growthCatalog);
    const growth = new GrowthSystem(growthCatalog, constantRng(0), alwaysTrue);
    growth.tick(g, registry, { res: 1, com: 0, ind: 0 }, 0, 0, UNMETERED_SUPPLY, {
      com: -100,
      ind: -100,
    });
    expect(registry.all().length).toBeGreaterThan(0);
  });
});

describe('farmKindFor', () => {
  it('reads the kind a grade of soil grows', () => {
    expect(farmKindFor(SoilGrade.Prime)).toBe('crops');
    expect(farmKindFor(SoilGrade.Fertile)).toBe('orchard');
    expect(farmKindFor(SoilGrade.Marginal)).toBe('pasture');
    expect(farmKindFor(SoilGrade.Unfit)).toBeNull();
  });
});
