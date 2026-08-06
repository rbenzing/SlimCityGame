import { describe, expect, it } from 'vitest';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import { BuildingState, FIELD_COUNT, FieldId, RoadTier, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, DemandLevels, GridState } from '../shared/types';
import { BuildingRegistry } from './buildings';
import { GrowthSystem } from './growth';
import type { Rng } from './growth';

function makeGrid(): GridState {
  const n = MAP_SIZE * MAP_SIZE;
  const fields: Uint8Array[] = [];
  for (let i = 0; i < FIELD_COUNT; i++) fields.push(new Uint8Array(n));
  return {
    size: MAP_SIZE,
    height: new Float32Array(n),
    water: new Uint8Array(n),
    trees: new Uint8Array(n),
    zone: new Uint8Array(n),
    roadTier: new Uint8Array(n),
    roadMask: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    power: new Uint8Array(n),
    watered: new Uint8Array(n),
    fields,
    district: new Uint8Array(n),
    landfill: new Uint8Array(n),
  };
}

/** Stamps road/power/water/zone directly at (x, z) -- and only there. */
function serviceTile(g: GridState, x: number, z: number, zone: ZoneType): void {
  const idx = tileIndex(x, z);
  g.zone[idx] = zone;
  g.power[idx] = 1;
  g.watered[idx] = 1;
  g.roadTier[idx] = RoadTier.TwoLane;
}

/** Power + water + an adjacent road, with no zone change -- keeps an
 *  already-placed grown building free of NoPower/NoWater/NoRoad problems so
 *  level-up tests aren't confounded by an incidental abandonment streak. */
function keepServiced(g: GridState, x: number, z: number): void {
  const idx = tileIndex(x, z);
  g.power[idx] = 1;
  g.watered[idx] = 1;
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
        serviceTile(g, 0, 0, zone);
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
});
