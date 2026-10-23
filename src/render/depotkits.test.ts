import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BUS_BASE_AISLE_M,
  BUS_BASE_BAY,
  BUS_BASE_DRIVE_M,
  BUS_BASE_FUEL,
  BUS_BASE_ROOF_M,
  BUS_BASE_STALL,
  CATENARY_POLE,
  RAIL_YARD_SPEC,
  TRAM_DEPOT_SPEC,
  UTILITY_KIT_CATALOG_IDS,
  UtilityKitRenderer,
  YARD_CARS,
  busBaseStallRect,
  computeBusBaseLayout,
  computeYardLayout,
  footprintHalfExtents,
  railSideOf,
  tramSideOf,
  yardFootprint,
  yardFrame,
  yardSegments,
  type Rect,
  type UtilityKitPartKind,
} from './utilitykits';
import { TRAIN_CAR_PITCH, TRAM_CAR_PITCH } from './transit';
import catalogData from '../data/catalog.json';
import { BuildingInstancer } from './buildings';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
const DEPOT = byId('bus-depot');
const GARAGE = byId('bus-garage');
const TRAM = byId('tram-depot');
const RAIL = byId('rail-yard');
const FOUR = [DEPOT, GARAGE, TRAM, RAIL];
const flat = (): number => 0;
const KIT_TIER = 30000;
const STATION_LIGHT_HEX = 0xffd98a;

function instance(
  id: number,
  catalogId: string,
  overrides: Partial<BuildingInstance> = {},
): BuildingInstance {
  return {
    id,
    catalogId,
    x: 10,
    z: 10,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...overrides,
  };
}
const add = (...buildings: BuildingInstance[]): BuildingDelta => ({
  added: buildings,
  removed: [],
  updated: [],
});

const width = (r: Rect): number => r.x1 - r.x0;
const depth = (r: Rect): number => r.z1 - r.z0;
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.z0 < b.z1 - 1e-9 && b.z0 < a.z1 - 1e-9;
const inside = (r: Rect, lot: Rect): boolean =>
  r.x0 >= lot.x0 - 1e-9 && r.x1 <= lot.x1 + 1e-9 && r.z0 >= lot.z0 - 1e-9 && r.z1 <= lot.z1 + 1e-9;
const lotOf = (footprint: { w: number; d: number }): Rect => {
  const { halfW, halfD } = footprintHalfExtents(footprint);
  return { x0: -halfW, x1: halfW, z0: -halfD, z1: halfD };
};

/** The world-space bounds of a part as placed, from its geometry and instance matrix. */
function placedBounds(
  renderer: UtilityKitRenderer,
  catalogId: string,
  kind: UtilityKitPartKind,
  slot: number,
): THREE.Box3 {
  const geometry = renderer.partGeometry(catalogId, kind)!;
  const m = new THREE.Matrix4();
  renderer.getPartMatrix(catalogId, kind, slot, m);
  return new THREE.Box3()
    .setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute)
    .applyMatrix4(m);
}

const PART_KINDS: readonly UtilityKitPartKind[] = [
  'busBaseYard',
  'busBaseShop',
  'busBaseLit',
  'busBaseBus',
  'tramDepotYard',
  'tramDepotYardEnd',
  'tramDepotTrack',
  'tramDepotTrackEnd',
  'tramDepotPoles',
  'tramDepotShop',
  'tramDepotLit',
  'tramDepotCar',
  'railYardYard',
  'railYardYardEnd',
  'railYardTrack',
  'railYardTrackEnd',
  'railYardShop',
  'railYardLit',
  'railYardCar',
];

/** Every placed part of the kit lies inside the turned lot, in world metres. */
function expectPartsInsideLot(
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
  trackAt?: (x: number, z: number) => boolean,
): void {
  const renderer = new UtilityKitRenderer(
    new THREE.Scene(),
    flat,
    [entry],
    undefined,
    trackAt,
    trackAt,
  );
  const building = instance(1, entry.id, { x: 10, z: 10, rotation });
  renderer.apply(add(building));
  const lot = footprintForRotation(entry, rotation);
  const x0 = building.x * TILE_METERS;
  const z0 = building.z * TILE_METERS;
  const x1 = x0 + lot.w * TILE_METERS;
  const z1 = z0 + lot.d * TILE_METERS;
  const kinds = PART_KINDS.filter((kind) => renderer.partSlotsFor(1, kind).length > 0);
  expect(kinds.length).toBeGreaterThan(2);
  for (const kind of kinds) {
    for (const slot of renderer.partSlotsFor(1, kind)) {
      const box = placedBounds(renderer, entry.id, kind, slot);
      expect(box.min.x, `${entry.id} ${kind} r${rotation}`).toBeGreaterThanOrEqual(x0 - 1e-4);
      expect(box.max.x, `${entry.id} ${kind} r${rotation}`).toBeLessThanOrEqual(x1 + 1e-4);
      expect(box.min.z, `${entry.id} ${kind} r${rotation}`).toBeGreaterThanOrEqual(z0 - 1e-4);
      expect(box.max.z, `${entry.id} ${kind} r${rotation}`).toBeLessThanOrEqual(z1 + 1e-4);
    }
  }
}

/** Track along one side of the lot at (10, 10) as placed: 0 south, 1 east, 2 north, 3 west. */
const trackOn = (side: 0 | 1 | 2 | 3, entry: BuildingCatalogEntry, rotation: 0 | 1 | 2 | 3) => {
  const { w, d } = footprintForRotation(entry, rotation);
  return (x: number, z: number): boolean => {
    if (side === 0) return z === 10 + d && x >= 10 && x < 10 + w;
    if (side === 1) return x === 10 + w && z >= 10 && z < 10 + d;
    if (side === 2) return z === 9 && x >= 10 && x < 10 + w;
    return x === 9 && z >= 10 && z < 10 + d;
  };
};

/** Triangles a kit draws with its whole fleet parked: its plinth and every part. */
function triangles(entry: BuildingCatalogEntry): number {
  const scene = new THREE.Scene();
  const delta = add(instance(1, entry.id));
  new BuildingInstancer(scene, catalog, flat, new Set(UTILITY_KIT_CATALOG_IDS)).apply(delta);
  new UtilityKitRenderer(scene, flat, catalog).apply(delta);
  let total = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const vertices = geometry.index?.count ?? geometry.getAttribute('position').count;
    const copies = object instanceof THREE.InstancedMesh ? object.count : 1;
    total += (vertices / 3) * copies;
  });
  return total;
}

describe('the registry', () => {
  it('holds the four depots, and the renderer builds each from the catalog', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, catalog);
    for (const entry of FOUR) {
      expect(UTILITY_KIT_CATALOG_IDS).toContain(entry.id);
      expect(renderer.kitIds().has(entry.id)).toBe(true);
    }
    expect(UTILITY_KIT_CATALOG_IDS).toHaveLength(38);
  });
});

describe('the bus base', () => {
  const depot = computeBusBaseLayout(DEPOT.footprint);
  const garage = computeBusBaseLayout(GARAGE.footprint);

  it('parks the depot in two rows of five about one aisle and the garage in four rows of nine about two', () => {
    expect(depot.rows).toHaveLength(2);
    expect(depot.aisles).toHaveLength(1);
    expect(depot.stalls).toHaveLength(10);
    expect(garage.rows).toHaveLength(4);
    expect(garage.aisles).toHaveLength(2);
    expect(garage.stalls).toHaveLength(36);
    expect(depot.stalls.length).toBe(DEPOT.depot!.fleet);
    expect(garage.stalls.length).toBe(GARAGE.depot!.fleet);
  });

  it('marks every stall 11.5 × 3.6 m nose-in to a 12.2 m aisle', () => {
    expect(BUS_BASE_STALL).toEqual({ w: 3.6, l: 11.5 });
    expect(BUS_BASE_AISLE_M).toBe(12.2);
    for (const layout of [depot, garage]) {
      for (const aisle of layout.aisles) expect(depth(aisle)).toBeCloseTo(12.2, 9);
      for (const row of layout.rows) expect(depth(row)).toBeCloseTo(11.5, 9);
      for (const s of layout.stalls) {
        const r = busBaseStallRect(s);
        expect(width(r)).toBeCloseTo(3.6, 9);
        expect(depth(r)).toBeCloseTo(11.5, 9);
        const row = layout.rows.find((row) => inside(r, row))!;
        expect(row).toBeDefined();
        // A bus backs onto its row from the aisle beside it: nose to -Z from the aisle below the row, nose to +Z from the aisle above it.
        const aisle = layout.aisles.find((a) =>
          s.turn === 2 ? Math.abs(a.z0 - row.z1) < 1e-9 : Math.abs(a.z1 - row.z0) < 1e-9,
        );
        expect(aisle, `stall at ${s.x},${s.z}`).toBeDefined();
      }
    }
  });

  it('runs a 7.2 m drive from the gate down the rows to every aisle', () => {
    expect(BUS_BASE_DRIVE_M).toBe(7.2);
    for (const [entry, layout] of [
      [DEPOT, depot],
      [GARAGE, garage],
    ] as const) {
      expect(width(layout.drive)).toBeCloseTo(7.2, 9);
      expect(layout.drive.z1).toBe(lotOf(entry.footprint).z1);
      expect(layout.gate).toEqual({ x0: layout.drive.x0, x1: layout.drive.x1 });
      for (const aisle of layout.aisles) {
        expect(aisle.x1).toBeCloseTo(layout.drive.x0, 9);
        expect(aisle.z0).toBeGreaterThanOrEqual(layout.drive.z0 - 1e-9);
      }
    }
  });

  it('opens one 4.9 m bay on the depot and four on the garage under 4.1 m clear doors, the wash lane beside them with its gantry', () => {
    expect(BUS_BASE_BAY).toEqual({ w: 4.9, l: 18.3, clear: 4.1 });
    expect(depot.bayDoors).toHaveLength(1);
    expect(garage.bayDoors).toHaveLength(4);
    for (const layout of [depot, garage]) {
      for (const door of [...layout.bayDoors, layout.washMouth]) {
        expect(door.h).toBe(4.1);
        expect(door.w).toBeLessThan(4.9);
        expect(door.x).toBeCloseTo(layout.hall.x0, 9);
        expect(door.nx).toBe(-1);
      }
      expect(depth(layout.hall)).toBeCloseTo((layout.bayDoors.length + 1) * 4.9 + 0.6, 9);
      expect(layout.gantry).toHaveLength(2);
      for (const post of layout.gantry) expect(post.x).toBeLessThan(layout.hall.x0);
    }
    expect(width(garage.hall)).toBeCloseTo(18.3, 9);
  });

  it('stands the depot shop at 5.5 m, the garage office two storeys at 6.4 m, with the office door on the street', () => {
    expect(BUS_BASE_BAY.clear + BUS_BASE_ROOF_M).toBeCloseTo(5.5, 9);
    expect(depot.hallHeight).toBeCloseTo(DEPOT.height, 9);
    expect(depot.officeHeight).toBeCloseTo(DEPOT.height, 9);
    expect(garage.hallHeight).toBeCloseTo(5.5, 9);
    expect(garage.officeStoreys).toBe(2);
    expect(garage.officeHeight).toBeCloseTo(GARAGE.height, 9);
    for (const layout of [depot, garage]) {
      expect(layout.officeDoor.nz).toBe(1);
      expect(layout.officeDoor.z).toBeCloseTo(layout.office.z1, 9);
      expect(layout.office.z0).toBeCloseTo(layout.hall.z1, 9);
    }
    expect(width(garage.office) * depth(garage.office)).toBeCloseTo(125, 0);
  });

  it('fuels at one island on the depot and two on the garage, each a 1.2 × 4 m canopy behind the shop', () => {
    expect(BUS_BASE_FUEL.w).toBe(1.2);
    expect(BUS_BASE_FUEL.l).toBe(4);
    expect(BUS_BASE_FUEL.clear).toBeGreaterThan(3);
    expect(depot.fuel).toHaveLength(1);
    expect(garage.fuel).toHaveLength(2);
    for (const layout of [depot, garage]) {
      for (const island of layout.fuel) {
        expect(island.z + 2).toBeLessThan(layout.hall.z0);
        expect(island.x).toBeGreaterThan(layout.drive.x1);
      }
    }
  });

  it('keeps the rows, drive, shop and islands inside the fence and clear of one another', () => {
    for (const [entry, layout] of [
      [DEPOT, depot],
      [GARAGE, garage],
    ] as const) {
      const lot = lotOf(entry.footprint);
      const pieces = [
        ...layout.rows,
        ...layout.aisles,
        layout.hall,
        layout.office,
        ...layout.fuel.map((f) => ({ x0: f.x - 1, x1: f.x + 1, z0: f.z - 2, z1: f.z + 2 })),
      ];
      for (const r of pieces) expect(inside(r, lot)).toBe(true);
      expect(inside(layout.drive, lot)).toBe(true);
      const solid = [...layout.rows, layout.hall, layout.office, layout.drive];
      for (let i = 0; i < solid.length; i++) {
        for (let j = i + 1; j < solid.length; j++) {
          expect(overlaps(solid[i]!, solid[j]!), `${entry.id} ${i} ${j}`).toBe(false);
        }
      }
      for (const f of layout.fuel) {
        expect(overlaps({ x0: f.x - 1, x1: f.x + 1, z0: f.z - 2, z1: f.z + 2 }, layout.hall)).toBe(
          false,
        );
      }
    }
  });

  it('lights only the door and office panes, on the stations’ material', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [DEPOT, GARAGE]);
    for (const entry of [DEPOT, GARAGE]) {
      expect(renderer.partEmissiveHex(entry.id, 'busBaseLit')).toBe(STATION_LIGHT_HEX);
      expect(renderer.partEmissiveHex(entry.id, 'busBaseShop')).toBe(0);
      expect(renderer.partEmissiveHex(entry.id, 'busBaseYard')).toBe(0);
      expect(renderer.partEmissiveHex(entry.id, 'busBaseBus')).toBe(0);
    }
    renderer.setNightFactor(1);
    expect(renderer.stationLightIntensity()).toBe(1);
  });

  it.each([0, 1, 2, 3] as const)('stands every part inside the lot at rotation %i', (rotation) => {
    expectPartsInsideLot(DEPOT, rotation);
    expectPartsInsideLot(GARAGE, rotation);
  });
});

describe('the fleet at home', () => {
  it('parks the whole catalog fleet until the sim says what is out', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [DEPOT, GARAGE]);
    renderer.apply(add(instance(1, 'bus-depot'), instance(2, 'bus-garage', { x: 20 })));
    expect(renderer.partSlotsFor(1, 'busBaseBus')).toHaveLength(10);
    expect(renderer.partSlotsFor(2, 'busBaseBus')).toHaveLength(36);
    expect(renderer.parkedFleets()).toEqual({ 1: 10, 2: 36 });
  });

  it('parks holds less in service, refits when the count changes, and fills the whole apron again for a depot the list leaves out', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [DEPOT]);
    renderer.apply(add(instance(1, 'bus-depot')));
    renderer.setDepotFleets([{ id: 1, holds: 10, inService: 3 }]);
    expect(renderer.partSlotsFor(1, 'busBaseBus')).toHaveLength(7);
    const kept = renderer.partSlotsFor(1, 'busBaseBus').slice(0, 5);
    renderer.setDepotFleets([{ id: 1, holds: 10, inService: 5 }]);
    expect(renderer.partSlotsFor(1, 'busBaseBus')).toEqual(kept);
    renderer.setDepotFleets([{ id: 1, holds: 10, inService: 0 }]);
    expect(renderer.partSlotsFor(1, 'busBaseBus')).toHaveLength(10);
    renderer.setDepotFleets([{ id: 1, holds: 10, inService: 8 }]);
    expect(renderer.parkedFleets()).toEqual({ 1: 2 });
    renderer.setDepotFleets([]);
    expect(renderer.parkedFleets()).toEqual({ 1: 10 });
    // Never below empty, never past the stalls.
    renderer.setDepotFleets([{ id: 1, holds: 10, inService: 12 }]);
    expect(renderer.parkedFleets()).toEqual({ 1: 0 });
    renderer.setDepotFleets([{ id: 1, holds: 99, inService: 0 }]);
    expect(renderer.parkedFleets()).toEqual({ 1: 10 });
  });

  it('keeps a count that arrives before its depot, and applies it when the building comes', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [TRAM]);
    renderer.setDepotFleets([{ id: 7, holds: 8, inService: 6 }]);
    renderer.apply(add(instance(7, 'tram-depot')));
    expect(renderer.parkedFleets()).toEqual({ 7: 2 });
    expect(renderer.partSlotsFor(7, 'tramDepotCar')).toHaveLength(2 * YARD_CARS.tram.perSet);
  });

  it('stands each bus nose-in on its own stall, the first stalls in fill order', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [DEPOT]);
    renderer.apply(add(instance(1, 'bus-depot', { x: 10, z: 10, rotation: 0 })));
    renderer.setDepotFleets([{ id: 1, holds: 10, inService: 4 }]);
    const layout = computeBusBaseLayout(DEPOT.footprint);
    const centre = { x: 11 * TILE_METERS, z: 11 * TILE_METERS };
    const slots = renderer.partSlotsFor(1, 'busBaseBus');
    expect(slots).toHaveLength(6);
    slots.forEach((slot, i) => {
      const m = new THREE.Matrix4();
      renderer.getPartMatrix('bus-depot', 'busBaseBus', slot, m);
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      expect(p.x).toBeCloseTo(centre.x + layout.stalls[i]!.x, 3);
      expect(p.z).toBeCloseTo(centre.z + layout.stalls[i]!.z, 3);
    });
    const box = placedBounds(renderer, 'bus-depot', 'busBaseBus', slots[0]!);
    // The vehicle kit's bus at its real size, its lamps a hair proud of the body.
    expect(box.max.z - box.min.z).toBeCloseTo(10, 0);
    expect(box.max.y - box.min.y).toBeCloseTo(3, 0);
  });
});

describe('the tram depot', () => {
  const footprint = yardFootprint(TRAM);
  const side = computeYardLayout(footprint, TRAM_DEPOT_SPEC, false, YARD_CARS.tram);
  const end = computeYardLayout(footprint, TRAM_DEPOT_SPEC, true, YARD_CARS.tram);

  it('lays the yard with its long side along X', () => {
    expect(footprint).toEqual({ w: 3, d: 2 });
  });

  it('fans the lead into eight stabling roads at 3.5 m centres, 22.4 m long, off a 45° ladder', () => {
    expect(TRAM_DEPOT_SPEC.roads).toBe(8);
    expect(side.roads).toHaveLength(8);
    for (let k = 0; k < 8; k++) {
      const r = side.roads[k]!;
      expect(r.x1 - r.x0).toBeCloseTo(22.4, 9);
      expect(r.z1).toBe(r.z0);
      if (k > 0) {
        expect(r.z0 - side.roads[k - 1]!.z0).toBeCloseTo(3.5, 9);
        expect(r.x0 - side.roads[k - 1]!.x0).toBeCloseTo(3.5, 9);
      }
    }
    expect(side.ladder.x1 - side.ladder.x0).toBeCloseTo(side.ladder.z1 - side.ladder.z0, 9);
    expect(side.roads[7]!.x1).toBeLessThanOrEqual(lotOf(footprint).x1);
  });

  it('runs the lead from the track edge, off the long edge or straight in off the end, climbing at 45°', () => {
    const lot = lotOf(footprint);
    expect(side.lead).toHaveLength(1);
    expect(side.lead[0]!.z0 - lot.z0).toBeLessThan(2);
    expect(side.lead[0]!.x0).toBeGreaterThanOrEqual(lot.x0);
    expect(side.lead[0]!.x1 - side.lead[0]!.x0).toBeCloseTo(side.lead[0]!.z1 - side.lead[0]!.z0, 9);
    expect(
      Math.hypot(side.lead[0]!.x1 - side.lead[0]!.x0, side.lead[0]!.z1 - side.lead[0]!.z0),
      // The 20 m lead, less what the eight roads and their ladder leave of a 60 m lot.
    ).toBeGreaterThan(16);
    expect(end.lead).toHaveLength(2);
    expect(end.lead[0]!.x0 - lot.x0).toBeLessThan(0.5);
    expect(end.lead[0]!.z0).toBe(end.lead[0]!.z1);
    expect(end.lead[1]!.x1).toBe(side.ladder.x0);
    expect(end.lead[1]!.z1).toBe(side.ladder.z0);
    // The roads, the shop and the poles are the same whichever edge the lead comes off.
    expect(end.roads).toEqual(side.roads);
    expect(end.hall).toEqual(side.hall);
    expect(end.poles).toEqual(side.poles);
  });

  it('stables a two-car set on each road at the lines’ pitch, inside the road', () => {
    expect(YARD_CARS.tram).toEqual({ perSet: 2, length: 11, pitch: TRAM_CAR_PITCH });
    expect(side.sets).toHaveLength(8);
    side.sets.forEach((set, k) => {
      const road = side.roads[k]!;
      expect(set).toHaveLength(2);
      expect(set[1]!.x - set[0]!.x).toBeCloseTo(TRAM_CAR_PITCH, 9);
      for (const car of set) {
        expect(car.z).toBe(road.z0);
        expect(car.x - 5.5).toBeGreaterThanOrEqual(road.x0);
        expect(car.x + 5.5).toBeLessThanOrEqual(road.x1 + 1e-9);
      }
    });
  });

  it('stands 6 m catenary poles every 10 m along the roads with a crossarm over each pair, and no wire', () => {
    expect(CATENARY_POLE.h).toBe(6);
    expect(CATENARY_POLE.pitch).toBe(10);
    expect(side.poles).toHaveLength(8);
    for (let k = 0; k < 8; k += 2) {
      const between = (side.roads[k]!.z0 + side.roads[k + 1]!.z0) / 2;
      const row = side.poles.filter((p) => Math.abs(p.z - between) < 1e-9);
      expect(row).toHaveLength(2);
      expect(row[1]!.x - row[0]!.x).toBeCloseTo(10, 9);
    }
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [TRAM]);
    const poles = renderer.partGeometry('tram-depot', 'tramDepotPoles')!;
    poles.computeBoundingBox();
    expect(poles.boundingBox!.max.y).toBeCloseTo(6, 6);
  });

  it('covers a maintenance road and a wash road 4.9 m wide and 28.4 m long with 4.6 m clear doors under a 6 m roof, the office at its far end', () => {
    expect([width(side.hall), depth(side.hall)]).toEqual([28.4, 9.8]);
    expect(side.hallRoads).toHaveLength(2);
    expect(side.hallRoads[1]!.z0 - side.hallRoads[0]!.z0).toBeCloseTo(4.9, 9);
    for (const r of side.hallRoads) expect(r.x1).toBeLessThanOrEqual(side.hall.x1);
    expect(side.hallDoors).toHaveLength(2);
    for (const door of side.hallDoors) expect(door.h).toBe(4.6);
    expect(TRAM.height).toBe(6);
    expect(width(side.office) * depth(side.office)).toBeCloseTo(97, 6);
    expect(side.office.x1).toBeCloseTo(side.hall.x1, 9);
    expect(side.fuel).toBeNull();
    expect(side.drive).toBeNull();
  });

  it('keeps every road clear of the shop and the office, and every piece inside the lot', () => {
    const lot = lotOf(footprint);
    for (const layout of [side, end]) {
      for (const r of [layout.hall, layout.office]) expect(inside(r, lot)).toBe(true);
      expect(overlaps(layout.hall, layout.office)).toBe(false);
      for (const seg of yardSegments(layout)) {
        for (const [x, z] of [
          [seg.x0, seg.z0],
          [seg.x1, seg.z1],
        ]) {
          expect(x).toBeGreaterThanOrEqual(lot.x0 - 1e-9);
          expect(x).toBeLessThanOrEqual(lot.x1 + 1e-9);
          expect(z).toBeGreaterThanOrEqual(lot.z0 - 1e-9);
          expect(z).toBeLessThanOrEqual(lot.z1 + 1e-9);
        }
      }
      for (const road of layout.roads) {
        const strip = { x0: road.x0, x1: road.x1, z0: road.z0 - 0.9, z1: road.z0 + 0.9 };
        expect(overlaps(strip, layout.hall)).toBe(false);
        expect(overlaps(strip, layout.office)).toBe(false);
      }
    }
  });

  it('lights only the shop and office panes, on the stations’ material', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [TRAM, RAIL]);
    expect(renderer.partEmissiveHex('tram-depot', 'tramDepotLit')).toBe(STATION_LIGHT_HEX);
    expect(renderer.partEmissiveHex('rail-yard', 'railYardLit')).toBe(STATION_LIGHT_HEX);
    for (const kind of PART_KINDS) {
      if (kind.endsWith('Lit')) continue;
      for (const id of ['tram-depot', 'rail-yard']) {
        const hex = renderer.partEmissiveHex(id, kind);
        if (hex !== null) expect(hex, `${id} ${kind}`).toBe(0);
      }
    }
  });
});

describe('the rail yard', () => {
  const footprint = yardFootprint(RAIL);
  const side = computeYardLayout(footprint, RAIL_YARD_SPEC, false, YARD_CARS.rail);
  const end = computeYardLayout(footprint, RAIL_YARD_SPEC, true, YARD_CARS.rail);

  it('fans a 20 m lead into five stabling roads at 4.5 m centres, 45.6 m long, along the lot’s 80 m side', () => {
    expect(footprint).toEqual({ w: 4, d: 3 });
    expect(side.roads).toHaveLength(5);
    for (let k = 0; k < 5; k++) {
      expect(side.roads[k]!.x1 - side.roads[k]!.x0).toBeCloseTo(45.6, 9);
      if (k > 0) expect(side.roads[k]!.z0 - side.roads[k - 1]!.z0).toBeCloseTo(4.5, 9);
    }
    const lead = side.lead[0]!;
    expect(Math.hypot(lead.x1 - lead.x0, lead.z1 - lead.z0)).toBeCloseTo(20, 6);
    // The lead starts at the track edge, in by its own ballast so the rails stay on the lot.
    expect(lead.z0 - lotOf(footprint).z0).toBeLessThan(2);
  });

  it('stables a three-car set on each road at the lines’ pitch', () => {
    expect(YARD_CARS.rail).toEqual({ perSet: 3, length: 14, pitch: TRAIN_CAR_PITCH });
    expect(side.sets).toHaveLength(5);
    for (const [k, set] of side.sets.entries()) {
      expect(set).toHaveLength(3);
      expect(set[2]!.x - set[0]!.x).toBeCloseTo(2 * TRAIN_CAR_PITCH, 9);
      expect(set[2]!.x + 7).toBeLessThanOrEqual(side.roads[k]!.x1 + 1e-9);
      expect(set[0]!.x - 7).toBeGreaterThanOrEqual(side.roads[k]!.x0);
    }
  });

  it('covers two 6 m roads 51.6 m long under a 6 m roof with 4.6 m doors, fuels at the lead, and keeps the office by the gate on the street', () => {
    expect([width(side.hall), depth(side.hall)]).toEqual([51.6, 12]);
    for (const door of side.hallDoors) expect(door.h).toBe(4.6);
    expect(RAIL.height).toBe(6);
    expect(side.fuel).not.toBeNull();
    expect(side.drive).not.toBeNull();
    expect(width(side.drive!)).toBeCloseTo(7.2, 9);
    expect(side.drive!.z1).toBe(lotOf(footprint).z1);
    expect(width(side.office) * depth(side.office)).toBeCloseTo(125, 6);
    expect(side.officeDoor.nz).toBe(1);
    expect(side.office.z1).toBeGreaterThan(side.roads[4]!.z0 + 10);
    expect(overlaps(side.office, side.drive!)).toBe(false);
  });

  it('fences the yard but for the lead and the drive', () => {
    expect(side.fenceGaps.map((g) => g.side)).toEqual([2, 0]);
    expect(end.fenceGaps.map((g) => g.side)).toEqual([3, 0]);
    const drive = side.drive!;
    // The gate opens across the office's frontage and the drive beside it.
    expect(side.fenceGaps[1]).toEqual({ side: 0, a: side.office.x0 - 1, b: drive.x1 });
    const lead = side.lead[0]!;
    const at = lead.x0 + (side.fence.z0 - lead.z0);
    expect(at).toBeGreaterThan(side.fenceGaps[0]!.a);
    expect(at).toBeLessThan(side.fenceGaps[0]!.b);
  });

  it('keeps every road clear of the shop, the office, the drive and the fuelling stand', () => {
    const lot = lotOf(footprint);
    for (const layout of [side, end]) {
      const stand = {
        x0: layout.fuel!.x - 1.3,
        x1: layout.fuel!.x + 1.3,
        z0: layout.fuel!.z - 2.6,
        z1: layout.fuel!.z + 2.6,
      };
      for (const r of [layout.hall, layout.office, layout.drive!, stand])
        expect(inside(r, lot)).toBe(true);
      const beds = yardSegments(layout).map((seg) => ({
        x0: Math.min(seg.x0, seg.x1) - (seg.z0 === seg.z1 ? 0 : 1.7),
        x1: Math.max(seg.x0, seg.x1) + (seg.z0 === seg.z1 ? 0 : 1.7),
        z0: Math.min(seg.z0, seg.z1) - 1.7,
        z1: Math.max(seg.z0, seg.z1) + 1.7,
      }));
      for (const road of beds.slice(
        layout.lead.length + 1,
        layout.lead.length + 1 + layout.roads.length,
      )) {
        for (const r of [layout.hall, layout.office, layout.drive!, stand]) {
          expect(overlaps(road, r)).toBe(false);
        }
      }
      // The hall roads cross nothing but the hall they serve.
      for (const road of beds.slice(-2)) {
        expect(overlaps(road, layout.office)).toBe(false);
        expect(overlaps(road, layout.drive!)).toBe(false);
        expect(overlaps(road, stand)).toBe(false);
      }
    }
  });
});

describe('a yard turns its lead to the track', () => {
  const sideOf = {
    tram: tramSideOf,
    rail: railSideOf,
  };

  it.each([
    ['tram-depot', 'tram'],
    ['rail-yard', 'rail'],
  ] as const)(
    '%s: the lead meets the lot edge the track runs along, at every rotation and side',
    (id, mode) => {
      const entry = byId(id);
      for (const rotation of [0, 1, 2, 3] as const) {
        for (const trackSide of [0, 1, 2, 3] as const) {
          const trackAt = trackOn(trackSide, entry, rotation);
          const lot = footprintForRotation(entry, rotation);
          const facing = sideOf[mode](10, 10, lot, trackAt);
          expect(facing).toBe(trackSide);
          const frame = yardFrame(entry, rotation, trackSide);
          const spec = mode === 'tram' ? TRAM_DEPOT_SPEC : RAIL_YARD_SPEC;
          const layout = computeYardLayout(frame.footprint, spec, frame.fromEnd, YARD_CARS[mode]);
          const start = layout.lead[0]!;
          const centre = { x: (10 + lot.w / 2) * TILE_METERS, z: (10 + lot.d / 2) * TILE_METERS };
          const theta = frame.turn * (Math.PI / 2);
          const wx = centre.x + start.x0 * Math.cos(theta) + start.z0 * Math.sin(theta);
          const wz = centre.z - start.x0 * Math.sin(theta) + start.z0 * Math.cos(theta);
          const edge = {
            0: (10 + lot.d) * TILE_METERS,
            1: (10 + lot.w) * TILE_METERS,
            2: 10 * TILE_METERS,
            3: 10 * TILE_METERS,
          }[trackSide];
          // At the edge, in by the track's own bed so its rails stay on the lot.
          expect(
            Math.abs((trackSide % 2 === 0 ? wz : wx) - edge),
            `${id} r${rotation} side ${trackSide}`,
          ).toBeLessThan(2);
          // The long frame is the yard's whatever edge the track is on.
          expect(frame.footprint.w).toBeGreaterThan(frame.footprint.d);
        }
      }
    },
  );

  it('takes the back of the lot as placed when no track touches it', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [TRAM]);
    // A 2×3's back edge as placed is its short edge at every rotation, so the lead comes off the end.
    for (const rotation of [0, 1, 2, 3] as const) {
      renderer.apply(add(instance(rotation + 1, 'tram-depot', { x: 10 + rotation * 5, rotation })));
      expect(renderer.partSlotsFor(rotation + 1, 'tramDepotTrackEnd')).toHaveLength(1);
      expect(renderer.partSlotsFor(rotation + 1, 'tramDepotTrack')).toHaveLength(0);
    }
    // With the track along the long side, the lead comes off that side instead.
    const longSide = new UtilityKitRenderer(
      new THREE.Scene(),
      flat,
      [TRAM],
      undefined,
      undefined,
      trackOn(1, TRAM, 0),
    );
    longSide.apply(add(instance(9, 'tram-depot', { rotation: 0 })));
    expect(longSide.partSlotsFor(9, 'tramDepotTrack')).toHaveLength(1);
    expect(longSide.partSlotsFor(9, 'tramDepotTrackEnd')).toHaveLength(0);
  });

  it.each([
    ['tram-depot', 0],
    ['tram-depot', 1],
    ['rail-yard', 0],
    ['rail-yard', 1],
  ] as const)(
    '%s stands every part inside the lot with the track on each side at rotation %i',
    (id, rotation) => {
      const entry = byId(id);
      for (const trackSide of [0, 1, 2, 3] as const) {
        expectPartsInsideLot(entry, rotation, trackOn(trackSide, entry, rotation));
      }
    },
  );
});

describe('the four kits', () => {
  it('place the same parts at the same matrices every time', () => {
    const build = (): UtilityKitRenderer => {
      const renderer = new UtilityKitRenderer(
        new THREE.Scene(),
        flat,
        catalog,
        undefined,
        () => true,
        () => true,
      );
      renderer.apply(
        add(
          instance(1, 'bus-depot', { x: 10, z: 10 }),
          instance(2, 'bus-garage', { x: 20, z: 10 }),
          instance(3, 'tram-depot', { x: 30, z: 10, rotation: 1 }),
          instance(4, 'rail-yard', { x: 40, z: 10, rotation: 3 }),
        ),
      );
      renderer.setDepotFleets([
        { id: 1, holds: 10, inService: 2 },
        { id: 3, holds: 8, inService: 5 },
        { id: 4, holds: 5, inService: 1 },
      ]);
      return renderer;
    };
    const a = build();
    const b = build();
    for (const [id, catalogId] of [
      [1, 'bus-depot'],
      [2, 'bus-garage'],
      [3, 'tram-depot'],
      [4, 'rail-yard'],
    ] as const) {
      for (const kind of PART_KINDS) {
        expect(a.partSlotsFor(id, kind)).toEqual(b.partSlotsFor(id, kind));
        for (const slot of a.partSlotsFor(id, kind)) {
          const ma = new THREE.Matrix4();
          const mb = new THREE.Matrix4();
          a.getPartMatrix(catalogId, kind, slot, ma);
          b.getPartMatrix(catalogId, kind, slot, mb);
          expect(ma.elements).toEqual(mb.elements);
        }
      }
    }
    expect(a.parkedFleets()).toEqual({ 1: 8, 2: 36, 3: 3, 4: 4 });
  });

  it('stay within the kit tier with their fleets parked', () => {
    const table: Record<string, number> = {};
    for (const entry of FOUR) {
      table[entry.id] = triangles(entry);
      expect(table[entry.id], entry.id).toBeLessThanOrEqual(KIT_TIER);
    }
    // eslint-disable-next-line no-console
    console.table(table);
  });
});
