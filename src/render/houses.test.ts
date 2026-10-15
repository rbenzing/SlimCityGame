import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HouseRoofRenderer,
  NIGHT_ROOF_TINT,
  buildCarportGeometry,
  buildGableRoofGeometry,
  buildGrillGeometry,
  buildDormerGeometry,
  buildPoolGeometry,
  buildPorticoGeometry,
  buildShedRoofGeometry,
  buildTrampolineGeometry,
  roofColorHex,
  trimColor,
  type HousePart,
} from './houses';
import { isHouseEntry } from './archetypes';
import { deriveFacadeParams } from './facade';
import { NIGHT_BODY_TINT } from './buildings';
import {
  ROOF_MAX_RISE_M,
  computeRoofRise,
  lotToWorld,
  planHouseLot,
  type HouseLotPlan,
} from './houselot';
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
    kind: 'detached',
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
function streetAlong(z: number): {
  roadAt: (x: number, z: number) => boolean;
  street: StreetLookup;
} {
  return {
    roadAt: (_x, tz) => tz === z,
    street: (_x, tz) => (tz === z ? { vergeM: 4.375, sidewalkM: 1.875 } : null),
  };
}

const EVERY_PART: readonly HousePart[] = [
  'roof',
  'fascia',
  'chimney',
  'stoop',
  'portico',
  'porch',
  'porchRoof',
  'dormer',
  'shutter',
  'parapet',
  'parapetGable',
  'garage',
  'garageLeaf',
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
  it('caps the house-scale kinds — detached, duplex, fourplex, townhouse — never a block, mixed, commercial or industrial', () => {
    expect(isHouseEntry(entry({ zone: ZoneType.ResLow, kind: 'detached' }))).toBe(true);
    expect(isHouseEntry(entry({ zone: ZoneType.ResLow, kind: 'duplex' }))).toBe(true);
    expect(isHouseEntry(entry({ zone: ZoneType.ResLow, kind: 'fourplex' }))).toBe(true);
    expect(isHouseEntry(entry({ zone: ZoneType.ResMediumRow, kind: 'townhouse' }))).toBe(true);
    expect(isHouseEntry(entry({ zone: ZoneType.ResMedium, kind: 'multiplex' }))).toBe(false);
    expect(isHouseEntry(entry({ zone: ZoneType.ResMedium, kind: 'garden' }))).toBe(false);
    expect(isHouseEntry(entry({ zone: ZoneType.ResHigh, kind: 'midrise' }))).toBe(false);
    expect(isHouseEntry(entry({ zone: ZoneType.ResHigh, kind: 'tower' }))).toBe(false);
    expect(isHouseEntry(entry({ zone: ZoneType.Mixed, kind: 'mixed' }))).toBe(false);
    for (const zone of [ZoneType.ComLow, ZoneType.Industrial]) {
      expect(isHouseEntry(entry({ zone, kind: undefined }))).toBe(false);
    }
    expect(isHouseEntry(entry({ zone: undefined, kind: undefined, category: 'service' }))).toBe(
      false,
    );
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
  it('roof rise is the span times its slope, never past the cap', () => {
    // 8:12 over a 9.5 m span: 4.75 m of run rises 3.17 m.
    expect(computeRoofRise(9.5, 8 / 12)).toBeCloseTo(4.75 * (8 / 12), 6);
    expect(computeRoofRise(9.5, 5 / 12)).toBeLessThan(computeRoofRise(9.5, 8 / 12));
    expect(computeRoofRise(100, 8 / 12)).toBeCloseTo(ROOF_MAX_RISE_M, 9);
    expect(computeRoofRise(4, 8 / 12)).toBeLessThan(computeRoofRise(40, 8 / 12));
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
    entry({
      id: 'row',
      zone: ZoneType.ResMediumRow,
      kind: 'townhouse',
      footprint: { w: 1, d: 4 },
      height: 9,
    }),
    entry({
      id: 'apt',
      zone: ZoneType.ResHigh,
      kind: 'midrise',
      footprint: { w: 2, d: 2 },
      height: 28,
    }),
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

  it('seats the roof on top of the body (its surface through the wall top, ground + entry.height) and over it where it stands', () => {
    const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, catalog, roadAt, street);
    const home = instance({ id: 1, catalogId: 'res-low-1' });
    r.apply({ added: [home], updated: [], removed: [] });
    const pos = matrixOf(r, 'roof', r.slotsFor(1, 'roof')[0]!);
    // The prism overhangs the walls, so its low edge droops below the wall top by
    // the eave times the pitch and the slope passes through the wall top itself.
    const { roof } = planHouseLot(home, catalog[0]!, roadAt, street)!.kit;
    expect(pos.y).toBeCloseTo(4 - roof.eaveM * roof.slope, 5);
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
    r.apply({
      added: [instance({ id: 1, catalogId: 'res-low-3', z: -1 })],
      updated: [],
      removed: [],
    });
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

describe('houses — the kit’s own geometry, in metres', () => {
  const extent = (geo: THREE.BufferGeometry): THREE.Box3 => {
    geo.computeBoundingBox();
    return geo.boundingBox!;
  };
  const triangles = (geo: THREE.BufferGeometry): number =>
    (geo.index?.count ?? geo.getAttribute('position').count) / 3;

  it('a portico is a 1.8 × 1.2 m gable hood on two 0.25 m posts, the wall at z = 0', () => {
    const geo = buildPorticoGeometry();
    const box = extent(geo);
    expect(box.max.x - box.min.x).toBeCloseTo(1.8, 6);
    expect(box.min.z).toBeCloseTo(0, 6);
    expect(box.max.z).toBeCloseTo(1.2, 6);
    expect(box.min.y).toBeCloseTo(0, 6);
    // The ridge stands 0.6 m over the hood's eaves: 8:12 across 1.8 m.
    expect(box.max.y).toBeCloseTo(2.45 - 0.6 + 0.6, 6);
    expect(triangles(geo)).toBeLessThanOrEqual(30);
  });

  it('a shed roof is a wedge from the wall (z = 0, y = 1) down to its low edge (z = 1, y = 0)', () => {
    const geo = buildShedRoofGeometry();
    const box = extent(geo);
    expect([box.min.x, box.max.x]).toEqual([-0.5, 0.5]);
    expect([box.min.y, box.max.y]).toEqual([0, 1]);
    expect([box.min.z, box.max.z]).toEqual([0, 1]);
    expect(triangles(geo)).toBe(6);
    // Its slope faces up and out.
    const normal = geo.getAttribute('normal');
    expect(normal.getY(0)).toBeGreaterThan(0.5);
    expect(normal.getZ(0)).toBeGreaterThan(0.5);
  });

  it('a dormer is 1.4 m wide, its walls 1.2 m tall and running back into the roof, with a dark window in its front', () => {
    const geo = buildDormerGeometry();
    const box = extent(geo);
    expect(box.max.x - box.min.x).toBeCloseTo(1.4, 6);
    expect(box.max.y).toBeCloseTo(1.2, 6);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.min.z).toBeCloseTo(-3, 6);
    expect(box.max.z).toBeCloseTo(0.04, 6);
    const colour = geo.getAttribute('color');
    let darkest = 1;
    for (let i = 0; i < colour.count; i++) darkest = Math.min(darkest, colour.getX(i));
    expect(darkest).toBeLessThan(0.2);
  });
});

describe('houses — trim colour', () => {
  it('is one colour a house, stable per seed', () => {
    for (let id = 1; id <= 50; id++) expect(trimColor(id)).toBe(trimColor(id));
  });

  it('is black in 39 houses of 100 and white in 19, the rest a dark green or the roof colour', () => {
    const n = 20000;
    const tally = new Map<number, number>();
    for (let id = 1; id <= n; id++) tally.set(trimColor(id), (tally.get(trimColor(id)) ?? 0) + 1);
    const share = (hex: number): number => (tally.get(hex) ?? 0) / n;
    const [black, white] = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
    expect(share(black!)).toBeGreaterThan(0.37);
    expect(share(black!)).toBeLessThan(0.41);
    expect(share(white!)).toBeGreaterThan(0.17);
    expect(share(white!)).toBeLessThan(0.21);
    // Everything else is the dark green or one of the roof palette's colours.
    const rest = [...tally.entries()]
      .filter(([hex]) => hex !== black && hex !== white)
      .reduce((sum, [, count]) => sum + count, 0);
    expect(rest / n).toBeGreaterThan(0.39);
    expect(rest / n).toBeLessThan(0.43);
  });
});

describe('HouseRoofRenderer — the house kit', () => {
  const kitCatalog = [
    entry({ id: 'ranch', footprint: { w: 1, d: 2 }, height: 4, level: 1 }),
    entry({ id: 'cape', footprint: { w: 1, d: 2 }, height: 5, level: 2 }),
    entry({ id: 'colonial', footprint: { w: 1, d: 2 }, height: 6.5, level: 3 }),
    entry({ id: 'duplex', kind: 'duplex', footprint: { w: 1, d: 2 }, height: 6.4 }),
    entry({
      id: 'terrace',
      zone: ZoneType.ResMediumRow,
      kind: 'townhouse',
      footprint: { w: 1, d: 2 },
      height: 9,
    }),
  ];
  const catalogOf = (id: string): BuildingCatalogEntry => kitCatalog.find((e) => e.id === id)!;
  const { roadAt, street } = streetAlong(2);
  const build = (homes: BuildingInstance[]): HouseRoofRenderer => {
    const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, kitCatalog, roadAt, street);
    r.apply({ added: homes, updated: [], removed: [] });
    return r;
  };
  const home = (id: string, n: number, over: Partial<BuildingInstance> = {}): BuildingInstance =>
    instance({ id: n, catalogId: id, x: n * 3, z: 0, ...over });
  const planOf = (b: BuildingInstance): HouseLotPlan =>
    planHouseLot(b, catalogOf(b.catalogId), roadAt, street)!;
  const matrixAt = (r: HouseRoofRenderer, part: HousePart, slot: number): THREE.Matrix4 => {
    const m = new THREE.Matrix4();
    r.getPartMatrix(part, slot, m);
    return m;
  };
  const scaleAt = (r: HouseRoofRenderer, part: HousePart, slot: number): THREE.Vector3 =>
    new THREE.Vector3().setFromMatrixScale(matrixAt(r, part, slot));
  const positionAt = (r: HouseRoofRenderer, part: HousePart, slot: number): THREE.Vector3 =>
    new THREE.Vector3().setFromMatrixPosition(matrixAt(r, part, slot));
  const count = (r: HouseRoofRenderer, id: number, part: HousePart): number =>
    r.slotsFor(id, part).length;

  it('carries the three houses’ parts: a ranch no shutters or dormers, a Cape two dormers and a portico', () => {
    const ranch = home('ranch', 1);
    const cape = home('cape', 2);
    const colonial = home('colonial', 3);
    const r = build([ranch, cape, colonial]);

    expect(count(r, 1, 'roof')).toBe(1);
    expect(count(r, 1, 'fascia')).toBe(2);
    expect(count(r, 1, 'chimney')).toBe(1);
    expect(count(r, 1, 'stoop')).toBe(1);
    for (const part of ['shutter', 'dormer', 'portico', 'porch', 'porchRoof'] as const) {
      expect(count(r, 1, part), `ranch ${part}`).toBe(0);
    }

    // A Cape's two dormers each carry their own gable roof beside the main one.
    expect(count(r, 2, 'dormer')).toBe(2);
    expect(count(r, 2, 'roof')).toBe(3);
    expect(count(r, 2, 'portico')).toBe(1);
    expect(count(r, 2, 'stoop')).toBe(3);
    expect(count(r, 2, 'chimney')).toBe(1);
    expect(count(r, 2, 'shutter')).toBe(planOf(cape).kit.shutters.length);
    expect(count(r, 2, 'shutter')).toBeGreaterThan(0);

    const kit = planOf(colonial).kit;
    expect(count(r, 3, 'dormer')).toBe(0);
    expect(count(r, 3, 'chimney')).toBe(kit.chimneys.length);
    expect(count(r, 3, 'shutter')).toBe(kit.shutters.length);
    expect(count(r, 3, 'portico')).toBe(kit.porticos.length);
    expect(count(r, 3, 'porchRoof')).toBe(kit.porch ? 1 : 0);
    expect(count(r, 3, 'porch')).toBe(kit.porch ? 1 + kit.porch.posts.length : 0);
  });

  it('stands a dormer on the street slope 0.3 m up from the eave, facing the street', () => {
    const cape = home('cape', 2);
    const r = build([cape]);
    const plan = planOf(cape);
    for (const [i, dormer] of plan.kit.dormers.entries()) {
      const slot = r.slotsFor(2, 'dormer')[i]!;
      const at = positionAt(r, 'dormer', slot);
      const expected = lotToWorld(plan.frame, dormer.u, dormer.v);
      expect(at.x).toBeCloseTo(expected.x, 4);
      expect(at.z).toBeCloseTo(expected.z, 4);
      expect(at.y).toBeCloseTo(5 + 0.3, 4);
      // The front (+Z) of the part points from the body toward the street.
      const front = new THREE.Vector3(0, 0, 1).applyMatrix4(
        new THREE.Matrix4().extractRotation(matrixAt(r, 'dormer', slot)),
      );
      const street = lotToWorld(plan.frame, dormer.u, dormer.v - 1);
      expect(front.x).toBeCloseTo(street.x - expected.x, 4);
      expect(front.z).toBeCloseTo(street.z - expected.z, 4);
    }
  });

  it('turns every part with the lot, whichever side the street is on', () => {
    const streets = {
      N: (x: number, z: number): boolean => z === 5 && x >= 0 && x < 40,
      S: (x: number, z: number): boolean => z === 8 && x >= 0 && x < 40,
      E: (x: number, z: number): boolean => x === 5 && z >= 0 && z < 40,
      W: (x: number, z: number): boolean => x === 3 && z >= 0 && z < 40,
    };
    for (const side of ['N', 'S', 'E', 'W'] as const) {
      const at = streets[side];
      const lookup: StreetLookup = (x, z) =>
        at(x, z) ? { vergeM: 4.375, sidewalkM: 1.875 } : null;
      const b = instance({ id: 2, catalogId: 'cape', x: 4, z: 6 });
      const r = new HouseRoofRenderer(new THREE.Scene(), flatHeightAt, kitCatalog, at, lookup);
      r.apply({ added: [b], updated: [], removed: [] });
      const plan = planHouseLot(b, catalogOf('cape'), at, lookup)!;
      expect(plan.edge?.side).toBe(side);
      const porticoAt = positionAt(r, 'portico', r.slotsFor(2, 'portico')[0]!);
      const door = lotToWorld(plan.frame, plan.doors[0]!.u, plan.doors[0]!.v);
      expect(porticoAt.x).toBeCloseTo(door.x, 4);
      expect(porticoAt.z).toBeCloseTo(door.z, 4);
      const out = new THREE.Vector3(0, 0, 1).applyMatrix4(
        new THREE.Matrix4().extractRotation(matrixAt(r, 'portico', r.slotsFor(2, 'portico')[0]!)),
      );
      const toStreet = lotToWorld(plan.frame, plan.doors[0]!.u, plan.doors[0]!.v - 1);
      expect(out.x).toBeCloseTo(toStreet.x - door.x, 4);
      expect(out.z).toBeCloseTo(toStreet.z - door.z, 4);
      // The ridge runs along the frontage: the roof's long axis is the street's.
      const roofScale = scaleAt(r, 'roof', r.slotsFor(2, 'roof')[0]!);
      const ridge = new THREE.Vector3(1, 0, 0).applyMatrix4(
        new THREE.Matrix4().extractRotation(matrixAt(r, 'roof', r.slotsFor(2, 'roof')[0]!)),
      );
      expect(Math.abs(plan.frame.alongX ? ridge.x : ridge.z)).toBeCloseTo(1, 4);
      expect(roofScale.x).toBeGreaterThan(roofScale.z * 0.99);
    }
  });

  it('clears the ridge by 0.6 m with a colonial’s gable-end chimney', () => {
    const colonial = home('colonial', 3);
    const r = build([colonial]);
    const plan = planOf(colonial);
    expect(plan.kit.chimneys.length).toBeGreaterThan(0);
    const ridgeY = 6.5 + plan.kit.roof.riseM;
    for (const slot of r.slotsFor(3, 'chimney')) {
      const top = positionAt(r, 'chimney', slot).y + scaleAt(r, 'chimney', slot).y;
      expect(top - ridgeY).toBeCloseTo(0.6, 4);
    }
  });

  it('puts a porch floor 0.6 m up and 1.8 m deep, and its shed roof off the wall at 2.9 m over it', () => {
    const porched = Array.from({ length: 60 }, (_, i) => home('colonial', i + 1)).find(
      (b) => planOf(b).kit.porch,
    )!;
    const r = build([porched]);
    const kit = planOf(porched).kit;
    const [floor] = r.slotsFor(porched.id, 'porch');
    const size = scaleAt(r, 'porch', floor!);
    expect(size.y).toBeCloseTo(0.6, 4);
    expect([size.x, size.z].map((v) => +v.toFixed(3)).sort((a, b) => a - b)[0]).toBeCloseTo(1.8, 3);
    const [roofSlot] = r.slotsFor(porched.id, 'porchRoof');
    const roofSize = scaleAt(r, 'porchRoof', roofSlot!);
    expect(positionAt(r, 'porchRoof', roofSlot!).y).toBeCloseTo(kit.porch!.roof.lowM, 4);
    expect(roofSize.y).toBeCloseTo(kit.porch!.roof.wallM - kit.porch!.roof.lowM, 4);
  });

  it('stands a garage leaf 2.74 × 2.13 m, 0.05 m proud of the garage face, and a row’s 2.44 m', () => {
    const dims = (r: HouseRoofRenderer, id: number): number[] => {
      const [slot] = r.slotsFor(id, 'garageLeaf');
      const s = scaleAt(r, 'garageLeaf', slot!);
      return [s.x, s.y, s.z].map((v) => +v.toFixed(3)).sort((a, b) => a - b);
    };
    let found = 0;
    for (let n = 1; n <= 40 && found < 1; n++) {
      const b = home('colonial', n);
      const plan = planOf(b);
      if (!plan.drives.some((d) => d.garageDoor)) continue;
      const r = build([b]);
      expect(dims(r, n)).toEqual([0.05, 2.13, 2.74]);
      found++;
    }
    expect(found).toBe(1);
    for (let n = 1; n <= 40; n++) {
      const b = home('terrace', n, { x: n * 4 });
      const plan = planOf(b);
      if (!plan.drives.some((d) => d.cover === 'integralGarage')) continue;
      const r = build([b]);
      const leaves = r.slotsFor(n, 'garageLeaf');
      expect(leaves).toHaveLength(plan.drives.filter((d) => d.cover === 'integralGarage').length);
      expect(dims(r, n)).toEqual([0.05, 2.13, 2.44]);
      return;
    }
    throw new Error('no row with a garage leaf in 40 seeds');
  });

  it('paints the shutters, fascia, door and garage leaf the house’s one trim colour', () => {
    for (let n = 1; n <= 12; n++) {
      const b = home('colonial', n);
      const r = build([b]);
      const wall = deriveFacadeParams(catalogOf('colonial'), n).wallColor;
      const expected = new THREE.Color().setHex(trimColor(n, wall));
      for (const part of ['shutter', 'fascia', 'door', 'garageLeaf'] as const) {
        for (const slot of r.slotsFor(n, part)) {
          const c = new THREE.Color();
          r.getPartColor(part, slot, c);
          expect(c.getHex()).toBe(expected.getHex());
        }
      }
    }
  });

  it('makes a row’s party walls in the wall colour, two for three homes', () => {
    const row = home('terrace', 1);
    const r = build([row]);
    expect(count(r, 1, 'parapet')).toBe(2);
    expect(count(r, 1, 'chimney')).toBe(0);
    const kit = planOf(row).kit;
    expect(count(r, 1, 'parapetGable')).toBe(2);
    // A band 0.76 m over the eave line, and the roof's own gable section standing on it:
    // a pentagon in the wall's plane, 0.76 m proud of the slope all the way up.
    const [band] = r.slotsFor(1, 'parapet');
    const bandTop = positionAt(r, 'parapet', band!).y + scaleAt(r, 'parapet', band!).y;
    expect(bandTop).toBeCloseTo(9 + 0.76, 4);
    const [gable] = r.slotsFor(1, 'parapetGable');
    const base = positionAt(r, 'parapetGable', gable!).y;
    expect(base).toBeCloseTo(bandTop, 4);
    expect(base + scaleAt(r, 'parapetGable', gable!).y).toBeCloseTo(9 + kit.roof.riseM + 0.76, 4);
    // Thin: the gable section is 0.3 m along the frontage.
    const size = scaleAt(r, 'parapetGable', gable!);
    expect(Math.min(size.x, size.z)).toBeCloseTo(0.3, 4);
  });

  it('gives a house with a dark wall white trim, and leaves a light wall to the seed', () => {
    const dark: [number, number, number] = [0.2, 0.22, 0.3];
    const light: [number, number, number] = [0.9, 0.88, 0.8];
    const white = trimColor(1, dark);
    for (let id = 1; id <= 200; id++) expect(trimColor(id, dark)).toBe(white);
    for (let id = 1; id <= 200; id++) expect(trimColor(id, light)).toBe(trimColor(id));
    expect(
      new Set(Array.from({ length: 200 }, (_, i) => trimColor(i + 1, light))).size,
    ).toBeGreaterThan(2);
    // The renderer paints a dark-walled house's door that white.
    const r = build([home('colonial', 3)]);
    const [door] = r.slotsFor(3, 'door');
    const c = new THREE.Color();
    r.getPartColor('door', door!, c);
    const w = new THREE.Color().setHex(
      trimColor(3, deriveFacadeParams(catalogOf('colonial'), 3).wallColor),
    );
    expect(c.getHex()).toBe(w.getHex());
  });

  it('follows the body through construction (squat, as the roof is), abandonment (kept, darkened) and removal (freed)', () => {
    const b = home('cape', 2);
    const active = build([b]);
    const building = build([{ ...b, state: BuildingState.Constructing }]);
    const abandoned = build([{ ...b, state: BuildingState.Abandoned }]);
    const kitParts = [
      'roof',
      'fascia',
      'chimney',
      'stoop',
      'portico',
      'dormer',
      'shutter',
    ] as const;
    for (const part of kitParts) {
      expect(count(building, 2, part), `constructing ${part}`).toBe(count(active, 2, part));
      expect(count(abandoned, 2, part), `abandoned ${part}`).toBe(count(active, 2, part));
    }
    // Squat: a shutter's height and its height above the ground shrink to a quarter.
    const [whole] = active.slotsFor(2, 'shutter');
    const [squat] = building.slotsFor(2, 'shutter');
    expect(scaleAt(building, 'shutter', squat!).y).toBeCloseTo(
      scaleAt(active, 'shutter', whole!).y * 0.25,
      4,
    );
    expect(positionAt(building, 'shutter', squat!).y).toBeCloseTo(
      positionAt(active, 'shutter', whole!).y * 0.25,
      4,
    );
    const chimney = (r: HouseRoofRenderer): number => {
      const [slot] = r.slotsFor(2, 'chimney');
      return positionAt(r, 'chimney', slot!).y + scaleAt(r, 'chimney', slot!).y;
    };
    expect(chimney(building)).toBeCloseTo(chimney(active) * 0.25, 4);
    // Abandoned: the same parts, darkened.
    const [dark] = abandoned.slotsFor(2, 'shutter');
    const c = new THREE.Color();
    const d = new THREE.Color();
    active.getPartColor('shutter', whole!, c);
    abandoned.getPartColor('shutter', dark!, d);
    expect(d.r).toBeCloseTo(c.r * 0.25, 4);
    // Removed: every slot is freed.
    active.apply({ added: [], updated: [], removed: [2] });
    for (const part of EVERY_PART) expect(active.slotsFor(2, part), part).toHaveLength(0);
  });

  it('draws the same kit for the same homes on every load', () => {
    const homes = [
      ...Array.from({ length: 6 }, (_, i) => home('colonial', i + 1)),
      home('cape', 10),
      home('duplex', 11),
      home('terrace', 12),
    ];
    const a = build(homes);
    const b = build(homes);
    for (const h of homes) {
      for (const part of EVERY_PART) {
        const sa = a.slotsFor(h.id, part);
        const sb = b.slotsFor(h.id, part);
        expect(sa).toEqual(sb);
        for (const [i, slot] of sa.entries()) {
          expect(matrixAt(a, part, slot).equals(matrixAt(b, part, sb[i]!))).toBe(true);
        }
      }
    }
  });
});
