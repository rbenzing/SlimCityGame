import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HouseRoofRenderer,
  NIGHT_ROOF_TINT,
  buildCarportGeometry,
  buildGableRoofGeometry,
  buildGrillGeometry,
  buildPoolGeometry,
  buildTrampolineGeometry,
  computeRoofRise,
  roofColorHex,
  roofRidgeAlongZ,
  type HousePart,
} from './houses';
import { isHouseEntry } from './archetypes';
import { NIGHT_BODY_TINT } from './buildings';
import { lotToWorld, planHouseLot } from './houselot';
import type { StreetLookup } from './frontage';
import { TILE_METERS } from '../shared/constants';
import { BuildingCatalogEntry, BuildingInstance, BuildingState, ZoneType } from '../shared/types';

const flatHeightAt = (): number => 0;

function entry(over: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'res-low-1',
    name: 'Small House',
    category: 'res',
    zone: ZoneType.ResLow,
    level: 1,
    footprint: { w: 2, d: 2 },
    height: 5,
    color: 0x4c8b4d,
    powerUse: 0.1,
    waterUse: 0.4,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...over,
  };
}

function instance(over: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: 1,
    catalogId: 'res-low-1',
    x: 0,
    z: 0,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...over,
  };
}

/** A two-lane street along row `z`: a 4.375 m verge and a 1.875 m sidewalk each side. */
function streetAlong(z: number): { roadAt: (x: number, z: number) => boolean; street: StreetLookup } {
  return {
    roadAt: (_x, tz) => tz === z,
    street: (_x, tz) => (tz === z ? { vergeM: 4.375, sidewalkM: 1.875 } : null),
  };
}

const EVERY_PART: readonly HousePart[] = [
  'roof',
  'garage',
  'carport',
  'door',
  'fence',
  'pool',
  'trampoline',
  'grill',
  'bush',
  'tree',
];

describe('houses — which buildings are homes', () => {
  it('caps detached (ResLow) and attached-row (ResMediumRow) homes, never apartments/towers/mixed/commercial/industrial', () => {
    expect(isHouseEntry(entry({ zone: ZoneType.ResLow }))).toBe(true);
    expect(isHouseEntry(entry({ zone: ZoneType.ResMediumRow }))).toBe(true);
    for (const zone of [
      ZoneType.ResMedium,
      ZoneType.ResHigh,
      ZoneType.Mixed,
      ZoneType.ComLow,
      ZoneType.Industrial,
    ]) {
      expect(isHouseEntry(entry({ zone }))).toBe(false);
    }
    expect(isHouseEntry(entry({ zone: undefined, category: 'service' }))).toBe(false);
  });
});

describe('houses — gable geometry', () => {
  it('is a base-anchored unit prism: eaves at y=0, ridge apex at y=1, spanning the unit footprint', () => {
    const geo = buildGableRoofGeometry();
    const pos = geo.getAttribute('position');
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
    }
    expect(minY).toBeCloseTo(0, 6);
    expect(maxY).toBeCloseTo(1, 6);
    expect(minX).toBeCloseTo(-0.5, 6);
    expect(maxX).toBeCloseTo(0.5, 6);
    expect(geo.getAttribute('normal')).toBeTruthy(); // computeVertexNormals ran
  });
});

describe('houses — yard kit geometry, in real metres and standing on the ground', () => {
  const extent = (geo: THREE.BufferGeometry): THREE.Box3 => {
    geo.computeBoundingBox();
    return geo.boundingBox!;
  };

  it('a carport is 3.4 m wide, 6 m deep and roofed at about 2.4 m', () => {
    const box = extent(buildCarportGeometry());
    expect(box.max.x - box.min.x).toBeCloseTo(3.4, 3);
    expect(box.max.z - box.min.z).toBeCloseTo(6, 3);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(2.46, 2);
  });

  it('an above-ground pool is 4.6 m across and 1.2 m tall, its water at the rim', () => {
    const box = extent(buildPoolGeometry());
    expect(box.max.x - box.min.x).toBeCloseTo(4.6, 2);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeGreaterThan(1.2);
    expect(box.max.y).toBeLessThan(1.25);
  });

  it('a trampoline is 4.3 m across with its mat under a metre up', () => {
    const box = extent(buildTrampolineGeometry());
    expect(box.max.x - box.min.x).toBeCloseTo(4.3, 1);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeLessThan(1);
  });

  it('a grill is about a metre tall', () => {
    const box = extent(buildGrillGeometry());
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(1, 1);
  });
});

describe('houses — deterministic pure helpers', () => {
  it('roof rise scales with the shorter base span, jitters per id, and is capped', () => {
    const a = computeRoofRise(8, 8, 1);
    const b = computeRoofRise(8, 8, 2);
    expect(a).toBeGreaterThan(0);
    expect(a).not.toBeCloseTo(b, 6); // per-id variety
    // capped regardless of a huge base
    expect(computeRoofRise(100, 100, 3)).toBeLessThanOrEqual(4.5 + 1e-9);
    // shorter span drives it: a narrow row is shallower than a square of the long span
    expect(computeRoofRise(4, 40, 5)).toBeLessThan(computeRoofRise(40, 40, 5));
  });

  it('ridge runs along the longer footprint axis', () => {
    expect(roofRidgeAlongZ(entry({ footprint: { w: 1, d: 6 } }))).toBe(true);
    expect(roofRidgeAlongZ(entry({ footprint: { w: 2, d: 2 } }))).toBe(false);
  });

  it('roof color is a stable palette pick per id', () => {
    expect(roofColorHex(7)).toBe(roofColorHex(7));
    expect(typeof roofColorHex(7)).toBe('number');
  });
});

describe('HouseRoofRenderer', () => {
  const catalog = [
    entry({ id: 'res-low-1', zone: ZoneType.ResLow, footprint: { w: 2, d: 2 }, height: 4 }),
    entry({ id: 'res-low-3', zone: ZoneType.ResLow, footprint: { w: 3, d: 3 }, height: 6.5 }),
    entry({ id: 'row', zone: ZoneType.ResMediumRow, footprint: { w: 1, d: 4 }, height: 9 }),
    entry({ id: 'apt', zone: ZoneType.ResHigh, footprint: { w: 2, d: 2 }, height: 28 }),
  ];
  // A street along row 2, south of every 2-deep lot at z=0.
  const { roadAt, street } = streetAlong(2);

  const matrixOf = (r: HouseRoofRenderer, part: HousePart, slot: number): THREE.Vector3 => {
    const m = new THREE.Matrix4();
    r.getPartMatrix(part, slot, m);
    return new THREE.Vector3().setFromMatrixPosition(m);
  };

  it('adds one roof instance per home and none for a flat-roof apartment', () => {
    const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, catalog);
    r.apply({
      added: [
        instance({ id: 1, catalogId: 'res-low-1' }),
        instance({ id: 2, catalogId: 'row', x: 10 }),
        instance({ id: 3, catalogId: 'apt', x: 20 }),
      ],
      updated: [],
      removed: [],
    });
    expect(r.slotsFor(1, 'roof')).toHaveLength(1);
    expect(r.slotsFor(2, 'roof')).toHaveLength(1);
    expect(r.slotsFor(3, 'roof')).toHaveLength(0); // apartment: flat roof, no kit
    expect(r.partCount('roof')).toBe(2);
  });

  it('seats the roof on top of the body (eaves at ground + entry.height) and over it where it stands', () => {
    const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, catalog, roadAt, street);
    const home = instance({ id: 1, catalogId: 'res-low-1' });
    r.apply({ added: [home], updated: [], removed: [] });
    const pos = matrixOf(r, 'roof', r.slotsFor(1, 'roof')[0]!);
    expect(pos.y).toBeCloseTo(4, 6);
    // The body has moved to the front of the lot, toward the street at z=2,
    // and the roof with it: centred across the frontage, off the lot's centre.
    const plan = planHouseLot(home, catalog[0]!, roadAt, street)!;
    const front = lotToWorld(plan.frame, 0, plan.body.v0);
    expect(pos.x).toBeCloseTo(TILE_METERS, 6);
    expect(pos.z).toBeGreaterThan(TILE_METERS);
    expect(front.z).toBeGreaterThan(pos.z);
  });

  it('parks one car per drive, where the plan puts it, while the home is Active', () => {
    const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, catalog, roadAt, street);
    const home = instance({ id: 1, catalogId: 'res-low-1' });
    const row = instance({ id: 2, catalogId: 'row', x: 10, z: -2 });
    r.apply({ added: [home, row], updated: [], removed: [] });
    const plan = planHouseLot(home, catalog[0]!, roadAt, street)!;
    expect(plan.drives).toHaveLength(1);
    expect(r.carSlotsFor(1)).toHaveLength(1);

    const m = new THREE.Matrix4();
    r.getCarMatrix(r.carSlotsFor(1)[0]!, m);
    const car = new THREE.Vector3().setFromMatrixPosition(m);
    const expected = lotToWorld(plan.frame, plan.drives[0]!.car.u, plan.drives[0]!.car.v);
    // Instance matrices are float32: a tenth of a millimetre is the match.
    expect(car.x).toBeCloseTo(expected.x, 4);
    expect(car.z).toBeCloseTo(expected.z, 4);

    // A row whose narrow end meets the street is one home with one drive.
    const rowPlan = planHouseLot(row, catalog[2]!, roadAt, street)!;
    expect(r.carSlotsFor(2)).toHaveLength(rowPlan.drives.length);
    expect(r.carCount()).toBe(1 + rowPlan.drives.length);
  });

  it('a home that fronts no street has its roof, door and yard but no car', () => {
    const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, catalog);
    r.apply({ added: [instance({ id: 1 })], updated: [], removed: [] });
    expect(r.slotsFor(1, 'roof')).toHaveLength(1);
    expect(r.slotsFor(1, 'door')).toHaveLength(1);
    expect(r.carSlotsFor(1)).toHaveLength(0);
    expect(r.slotsFor(1, 'garage')).toHaveLength(0);
    expect(r.slotsFor(1, 'carport')).toHaveLength(0);
  });

  it('across a street of homes, every kind of cover turns up', () => {
    const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, catalog, roadAt, street);
    const homes = Array.from({ length: 40 }, (_, i) =>
      instance({ id: i + 1, catalogId: 'res-low-3', x: i * 3, z: -1 }),
    );
    r.apply({ added: homes, updated: [], removed: [] });
    const covers = new Set<string>();
    for (const home of homes) {
      for (const drive of planHouseLot(home, catalog[1]!, roadAt, street)!.drives) {
        covers.add(drive.cover);
      }
    }
    expect([...covers].sort()).toEqual(['carport', 'detachedGarage', 'garage', 'spot']);
    expect(r.partCount('garage')).toBeGreaterThan(0);
    expect(r.partCount('carport')).toBeGreaterThan(0);
    expect(r.carCount()).toBe(homes.length);
  });

  it('gives a home under construction no yard and no car, and an abandoned one its fence and trees but nothing its family took', () => {
    const homes = Array.from({ length: 30 }, (_, i) =>
      instance({ id: i + 1, catalogId: 'res-low-3', x: i * 3, z: -1 }),
    );
    const count = (state: BuildingState): Record<string, number> => {
      const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, catalog, roadAt, street);
      r.apply({ added: homes.map((h) => ({ ...h, state })), updated: [], removed: [] });
      const out: Record<string, number> = { car: r.carCount() };
      for (const part of EVERY_PART) out[part] = r.partCount(part);
      return out;
    };
    const active = count(BuildingState.Active);
    const building = count(BuildingState.Constructing);
    const abandoned = count(BuildingState.Abandoned);

    for (const part of ['fence', 'pool', 'trampoline', 'grill', 'bush', 'tree']) {
      expect(active[part], `active ${part}`).toBeGreaterThan(0);
      expect(building[part], `constructing ${part}`).toBe(0);
    }
    expect(building.roof).toBe(homes.length);
    expect(building.car).toBe(0);

    for (const part of ['fence', 'bush', 'tree']) expect(abandoned[part]).toBe(active[part]);
    for (const part of ['pool', 'trampoline', 'grill', 'car']) expect(abandoned[part]).toBe(0);
  });

  it('a removed home frees every part and its car', () => {
    const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, catalog, roadAt, street);
    r.apply({ added: [instance({ id: 1, catalogId: 'res-low-3', z: -1 })], updated: [], removed: [] });
    expect(r.carSlotsFor(1)).toHaveLength(1);
    r.apply({ added: [], updated: [], removed: [1] });
    for (const part of EVERY_PART) expect(r.slotsFor(1, part), part).toHaveLength(0);
    expect(r.carSlotsFor(1)).toHaveLength(0);
  });

  it('night factor clamps to [0,1]', () => {
    const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, catalog);
    r.setNightFactor(2);
    expect(r.nightFactor()).toBe(1);
    r.setNightFactor(-1);
    expect(r.nightFactor()).toBe(0);
  });

  it('roof night tint stays recognizable (matches the body, not the hidden massing tiers) so a house never reads as a flat box at night', () => {
    // Must track the exposed BODY tint, never the near-black hidden-tier value.
    expect(NIGHT_ROOF_TINT).toEqual(NIGHT_BODY_TINT);
    const [r, g, b] = NIGHT_ROOF_TINT;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance).toBeGreaterThan(0.3); // the "still recognizable at night" floor
  });
});
