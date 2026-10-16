import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BUS_STOP_PAD,
  BUS_STOP_SIGN,
  CLINIC_BODY,
  CLINIC_CANOPY,
  CLINIC_ENTRY,
  CLINIC_LANE_M,
  CLINIC_STALL,
  DEPOT_BODY,
  DEPOT_CANOPY,
  DEPOT_PLATFORM,
  DEPOT_STALLS,
  RECYCLING_YARD_HEIGHT,
  UTILITY_KIT_CATALOG_IDS,
  UtilityKitRenderer,
  busStopShelterAnchor,
  clinicStallRect,
  computeBusStopLayout,
  computeClinicLayout,
  computeDepotLayout,
  depotFrame,
  depotFrames,
  depotStallRect,
  footprintHalfExtents,
  railSideOf,
  type Rect,
} from './utilitykits';
import { BUS_SHELTER, buildBusShelterGeometry } from './busshelter';
import { ACCESSIBLE_AISLE_M, ACCESSIBLE_VAN_WIDTH_M } from '../shared/parkingcode';
import catalogData from '../data/catalog.json';
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
const CLINIC = byId('clinic');
const STATION = byId('rail-station');
const BUS_STOP = byId('bus-stop');
const flat = (): number => 0;

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
  kind: Parameters<UtilityKitRenderer['partGeometry']>[1],
  slot: number,
): THREE.Box3 {
  const geometry = renderer.partGeometry(catalogId, kind)!;
  const m = new THREE.Matrix4();
  renderer.getPartMatrix(catalogId, kind, slot, m);
  return new THREE.Box3()
    .setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute)
    .applyMatrix4(m);
}

describe('the registry', () => {
  it('holds the three kitless ploppables, and the renderer builds a kit for each from the catalog', () => {
    for (const id of ['clinic', 'rail-station', 'bus-stop']) {
      expect(UTILITY_KIT_CATALOG_IDS).toContain(id);
    }
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, catalog);
    expect(renderer.kitIds().has('clinic')).toBe(true);
    expect(renderer.kitIds().has('rail-station')).toBe(true);
    expect(renderer.kitIds().has('bus-stop')).toBe(true);
  });
});

describe('the clinic layout', () => {
  const layout = computeClinicLayout(CLINIC.footprint);
  const lot = lotOf(CLINIC.footprint);

  it('stands a 17 × 20 m block on the back half of the lot under a 5.5 m parapet wall', () => {
    expect(layout.body.x1 - layout.body.x0).toBeCloseTo(17, 9);
    expect(layout.body.z1 - layout.body.z0).toBeCloseTo(20, 9);
    // On the back half, give or take the roof cap's overhang off the back lot line.
    expect(layout.body.z1).toBeLessThanOrEqual(0.2);
    expect(CLINIC_BODY.wall).toBeCloseTo(5.5, 9);
    expect(CLINIC_BODY.parapet).toBeCloseTo(1.07, 9);
    expect(CLINIC_BODY.base).toBeCloseTo(1.0, 9);
    expect(CLINIC_BODY.wall).toBeLessThan(CLINIC.height);
  });

  it('centres a 6 m entry 3.0 m to its head on the street face under a 4.0 × 6.1 m porte-cochère at 2.9 m clear', () => {
    expect(layout.entrance).toEqual({ x: 0, z: layout.body.z1 });
    expect(CLINIC_ENTRY).toEqual({ w: 6, h: 3.0 });
    expect(layout.canopy.x1 - layout.canopy.x0).toBeCloseTo(4.0, 9);
    expect(layout.canopy.z1 - layout.canopy.z0).toBeCloseTo(6.1, 9);
    expect(layout.canopy.z0).toBeCloseTo(layout.body.z1, 9);
    expect(CLINIC_CANOPY.clear).toBeCloseTo(2.9, 9);
    expect(CLINIC_CANOPY.column).toBeCloseTo(0.3, 9);
    expect(layout.columns).toHaveLength(2);
    for (const c of layout.columns) {
      expect(c.x).toBeGreaterThan(layout.canopy.x0);
      expect(c.x).toBeLessThan(layout.canopy.x1);
      expect(c.z).toBeLessThan(layout.canopy.z1);
    }
  });

  it('runs a 6.1 m one-way loop in from the street, under the canopy and back out', () => {
    expect(CLINIC_LANE_M).toBeCloseTo(6.1, 9);
    const [left, cross, right] = layout.lane as [Rect, Rect, Rect];
    expect(left.x1 - left.x0).toBeCloseTo(CLINIC_LANE_M, 9);
    expect(right.x1 - right.x0).toBeCloseTo(CLINIC_LANE_M, 9);
    expect(cross.z1 - cross.z0).toBeCloseTo(CLINIC_LANE_M, 9);
    expect(left.z1).toBeCloseTo(lot.z1, 9);
    expect(right.z1).toBeCloseTo(lot.z1, 9);
    expect(inside(layout.canopy, cross)).toBe(true);
    expect(left.z0).toBeCloseTo(cross.z1, 9);
    expect(right.z0).toBeCloseTo(cross.z1, 9);
  });

  it('parks 2.74 × 5.5 m stalls along the loop, the nearest a 3.35 m van space with a 1.52 m aisle', () => {
    expect(CLINIC_STALL).toEqual({ w: 2.74, l: 5.5 });
    expect(layout.stalls.length).toBeGreaterThanOrEqual(5);
    const van = layout.stalls.find((s) => s.van)!;
    expect(van.across).toBeCloseTo(ACCESSIBLE_VAN_WIDTH_M, 9);
    expect(ACCESSIBLE_VAN_WIDTH_M).toBeCloseTo(3.35, 2);
    expect(layout.aisle.x1 - layout.aisle.x0).toBeCloseTo(ACCESSIBLE_AISLE_M, 9);
    expect(ACCESSIBLE_AISLE_M).toBeCloseTo(1.52, 2);
    // The van space is the stall nearest the entrance.
    const nearest = [...layout.stalls].sort(
      (a, b) =>
        Math.hypot(a.x - layout.entrance.x, a.z - layout.entrance.z) -
        Math.hypot(b.x - layout.entrance.x, b.z - layout.entrance.z),
    )[0]!;
    expect(nearest.van).toBe(true);
    // The aisle lies against the van space's side.
    const vanRect = clinicStallRect(van);
    expect(layout.aisle.x0).toBeCloseTo(vanRect.x1, 9);
    for (const s of layout.stalls) {
      if (s.van) continue;
      expect(s.across).toBeCloseTo(CLINIC_STALL.w, 9);
    }
    // Every stall fronts a lane of the loop.
    for (const s of layout.stalls) {
      const r = clinicStallRect(s);
      const fronts = layout.lane.some(
        (l) =>
          (Math.abs(r.z0 - l.z1) < 1e-9 && s.turn === 2) ||
          (Math.abs(r.x0 - l.x1) < 1e-9 && s.turn === 3),
      );
      expect(fronts).toBe(true);
    }
  });

  it('keeps every part inside the lot and clear of one another', () => {
    const parts: Rect[] = [layout.body, layout.canopy, ...layout.lane, layout.aisle, layout.sign];
    const stalls = layout.stalls.map(clinicStallRect);
    for (const r of [...parts, ...stalls, ...layout.units]) expect(inside(r, lot)).toBe(true);
    for (const u of layout.units) expect(inside(u, layout.body)).toBe(true);
    const ground = [layout.body, ...layout.lane, layout.aisle, layout.sign, ...stalls];
    for (let i = 0; i < ground.length; i++) {
      for (let j = i + 1; j < ground.length; j++) {
        expect(overlaps(ground[i]!, ground[j]!), `${i} and ${j}`).toBe(false);
      }
    }
    expect(overlaps(layout.canopy, layout.body)).toBe(false);
  });

  it('is deterministic', () => {
    expect(computeClinicLayout(CLINIC.footprint)).toEqual(layout);
  });
});

describe('the clinic kit', () => {
  it('draws its glazing and sign panels on the lit material and nothing else', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CLINIC]);
    renderer.setNightFactor(1);
    expect(renderer.partEmissiveHex('clinic', 'clinicLit')).not.toBe(0);
    expect(renderer.partEmissiveHex('clinic', 'clinicBuilding')).toBe(0);
    expect(renderer.partEmissiveHex('clinic', 'clinicGrounds')).toBe(0);
    expect(renderer.partEmissiveHex('clinic', 'clinicCar')).toBe(0);
    expect(renderer.stationLightIntensity()).toBe(1);
  });

  it('stands its rooftop units on the roof behind the parapet, and its glazing from the ground', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CLINIC]);
    const building = renderer.partGeometry('clinic', 'clinicBuilding')!;
    building.computeBoundingBox();
    const roof = RECYCLING_YARD_HEIGHT + CLINIC_BODY.wall - CLINIC_BODY.parapet;
    // The units stand over the roof deck, their curbs inside the parapet's plan.
    expect(building.boundingBox!.max.y).toBeGreaterThan(roof + 1);
    expect(building.boundingBox!.max.y).toBeLessThan(roof + 2);
    const lit = renderer.partGeometry('clinic', 'clinicLit')!;
    lit.computeBoundingBox();
    expect(lit.boundingBox!.min.y).toBeCloseTo(RECYCLING_YARD_HEIGHT, 6);
    expect(lit.boundingBox!.max.y).toBeLessThan(roof);
  });

  it.each([0, 1, 2, 3] as const)('keeps every part on the lot at rotation %i', (rotation) => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [CLINIC]);
    renderer.apply(add(instance(1, 'clinic', { rotation })));
    const lot = footprintForRotation(CLINIC, rotation);
    const x0 = 10 * TILE_METERS;
    const z0 = 10 * TILE_METERS;
    for (const kind of ['clinicGrounds', 'clinicBuilding', 'clinicLit', 'clinicCar'] as const) {
      for (const slot of renderer.partSlotsFor(1, kind)) {
        const b = placedBounds(renderer, 'clinic', kind, slot);
        expect(b.min.x).toBeGreaterThanOrEqual(x0 - 1e-6);
        expect(b.max.x).toBeLessThanOrEqual(x0 + lot.w * TILE_METERS + 1e-6);
        expect(b.min.z).toBeGreaterThanOrEqual(z0 - 1e-6);
        expect(b.max.z).toBeLessThanOrEqual(z0 + lot.d * TILE_METERS + 1e-6);
      }
    }
    expect(renderer.partSlotsFor(1, 'clinicCar').length).toBeGreaterThan(0);
  });
});

describe('the rail station layout', () => {
  const frames = depotFrames(STATION);

  it('takes the track along either edge of its 2×3 lot', () => {
    expect(frames.short).toEqual({ w: 2, d: 3 });
    expect(frames.long).toEqual({ w: 3, d: 2 });
  });

  describe.each([
    ['short', frames.short],
    ['long', frames.long],
  ] as const)('with the track along the lot’s %s edge', (_name, footprint) => {
    const layout = computeDepotLayout(footprint);
    const lot = lotOf(footprint);

    it('lays a 3.66 m platform 0.2 m high along the track edge, 2 m short of the lot at each end, with a 0.61 m tactile strip at its edge', () => {
      expect(layout.platform.z0).toBeCloseTo(lot.z0, 9);
      expect(layout.platform.z1 - layout.platform.z0).toBeCloseTo(3.66, 9);
      expect(layout.platform.x0).toBeCloseTo(lot.x0 + 2, 9);
      expect(layout.platform.x1).toBeCloseTo(lot.x1 - 2, 9);
      expect(DEPOT_PLATFORM.h).toBeCloseTo(0.2, 9);
      expect(layout.tactile.z1 - layout.tactile.z0).toBeCloseTo(0.61, 9);
      expect(layout.tactile.z0).toBeCloseTo(layout.platform.z0, 9);
    });

    it('covers the platform for the depot’s length and 13.7 m beyond it each way, capped by the platform, at 3.05 m clear on posts every 4.6 m', () => {
      const asked = DEPOT_BODY.w + 2 * DEPOT_CANOPY.beyond;
      const length = layout.canopy.x1 - layout.canopy.x0;
      expect(length).toBeCloseTo(Math.min(asked, layout.platform.x1 - layout.platform.x0), 9);
      expect(layout.canopy.z0).toBeCloseTo(layout.platform.z0, 9);
      expect(layout.canopy.z1).toBeCloseTo(layout.platform.z1, 9);
      expect(DEPOT_CANOPY.clear).toBeCloseTo(3.05, 9);
      expect(DEPOT_CANOPY.w).toBeCloseTo(3.66, 9);
      const xs = layout.posts.map((p) => p.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(4.6, 9);
      for (const p of layout.posts) {
        expect(p.x).toBeGreaterThan(layout.canopy.x0);
        expect(p.x).toBeLessThan(layout.canopy.x1);
        expect(p.z).toBeGreaterThan(layout.platform.z0);
        expect(p.z).toBeLessThan(layout.platform.z1);
        // No post inside the operator's bay.
        expect(Math.abs(p.x)).toBeGreaterThan(layout.bay.x1);
      }
    });

    it('stands the 9.1 × 19.5 m depot between the platform and the street, long axis along the track, its bay 3.66 m wide and 1.0 m proud on the track face', () => {
      expect(layout.depot.x1 - layout.depot.x0).toBeCloseTo(19.5, 9);
      expect(layout.depot.z1 - layout.depot.z0).toBeCloseTo(9.1, 9);
      expect(layout.depot.z0).toBeGreaterThanOrEqual(layout.platform.z1);
      expect(layout.depot.z1).toBeLessThan(layout.dropOff.z0);
      expect(layout.bay.x1 - layout.bay.x0).toBeCloseTo(3.66, 9);
      expect(layout.bay.z1 - layout.bay.z0).toBeCloseTo(1.0, 9);
      expect(layout.bay.z1).toBeCloseTo(layout.depot.z0, 9);
      expect(DEPOT_BODY.plate).toBeCloseTo(3.66, 9);
      expect(DEPOT_BODY.plate + (DEPOT_BODY.pitch * DEPOT_BODY.d) / 2).toBeCloseTo(7.1, 1);
      expect(DEPOT_BODY.eave).toBeCloseTo(1.2, 9);
      expect(DEPOT_BODY.batten).toBeCloseTo(0.05, 9);
      expect(DEPOT_BODY.battenPitch).toBeCloseTo(0.3, 9);
      expect(DEPOT_BODY.wainscot).toBeCloseTo(1.0, 9);
      expect(DEPOT_BODY.bracePitch).toBeCloseTo(2.4, 9);
    });

    it('parks twenty stalls on aisles open to the street, with a drop-off at the depot’s street door', () => {
      expect(layout.stalls).toHaveLength(DEPOT_STALLS);
      expect(DEPOT_STALLS).toBe(20);
      expect(layout.dropOff.z0).toBeCloseTo(layout.walk.z1, 9);
      expect(layout.dropOff.z1 - layout.dropOff.z0).toBeCloseTo(6.1, 9);
      expect(layout.walk.z0).toBeCloseTo(layout.depot.z1, 9);
      for (const a of layout.aisles) {
        expect(a.z1).toBeCloseTo(lot.z1, 9);
        expect(a.z0).toBeCloseTo(layout.dropOff.z1, 9);
      }
      for (const s of layout.stalls) {
        const r = depotStallRect(s);
        const onAisle = layout.aisles.some(
          (a) => Math.abs(r.x1 - a.x0) < 1e-9 || Math.abs(r.x0 - a.x1) < 1e-9,
        );
        expect(onAisle).toBe(true);
        for (const a of layout.aisles) expect(overlaps(r, a)).toBe(false);
      }
    });

    it('keeps every part inside the lot and clear of the others', () => {
      const stalls = layout.stalls.map(depotStallRect);
      const all: Rect[] = [
        layout.platform,
        layout.canopy,
        layout.depot,
        layout.bay,
        layout.walk,
        layout.dropOff,
        ...layout.asphalt,
        ...stalls,
      ];
      for (const r of all) expect(inside(r, lot)).toBe(true);
      const ground = [layout.platform, layout.depot, layout.walk, layout.dropOff, ...stalls];
      for (let i = 0; i < ground.length; i++) {
        for (let j = i + 1; j < ground.length; j++) {
          expect(overlaps(ground[i]!, ground[j]!), `${i} and ${j}`).toBe(false);
        }
      }
      expect(overlaps(layout.bay, layout.platform)).toBe(false);
    });

    it('is deterministic', () => {
      expect(computeDepotLayout(footprint)).toEqual(layout);
    });
  });
});

describe('railSideOf', () => {
  const lot = { w: 2, d: 3 };
  const rowAt = (tz: number) => (x: number, z: number) => z === tz && x >= 10 && x < 12;
  const colAt = (tx: number) => (x: number, z: number) => x === tx && z >= 10 && z < 13;

  it('picks the edge the rail runs along', () => {
    expect(railSideOf(10, 10, lot, rowAt(9))).toBe(2);
    expect(railSideOf(10, 10, lot, colAt(12))).toBe(1);
    expect(railSideOf(10, 10, lot, rowAt(13))).toBe(0);
    expect(railSideOf(10, 10, lot, colAt(9))).toBe(3);
    expect(railSideOf(10, 10, lot, () => false)).toBeNull();
  });

  it('takes the edge with the most rail tiles, ties north, east, south, west', () => {
    const one = (tx: number, tz: number) => (x: number, z: number) => x === tx && z === tz;
    // One tile south, a full column east: east.
    expect(railSideOf(10, 10, lot, (x, z) => one(10, 13)(x, z) || colAt(12)(x, z))).toBe(1);
    // One tile on each of the south and east edges: east outranks south.
    expect(railSideOf(10, 10, lot, (x, z) => one(10, 13)(x, z) || one(12, 10)(x, z))).toBe(1);
    // One each on north and east: north.
    expect(railSideOf(10, 10, lot, (x, z) => one(10, 9)(x, z) || one(12, 10)(x, z))).toBe(2);
    // One each on south and west: south.
    expect(railSideOf(10, 10, lot, (x, z) => one(10, 13)(x, z) || one(9, 10)(x, z))).toBe(0);
  });
});

describe('the rail station kit', () => {
  const sides = [
    { side: 0 as const, dir: { x: 0, z: 1 } },
    { side: 1 as const, dir: { x: 1, z: 0 } },
    { side: 2 as const, dir: { x: 0, z: -1 } },
    { side: 3 as const, dir: { x: -1, z: 0 } },
  ];

  it.each(
    sides.flatMap((s) => ([0, 1, 2, 3] as const).map((rotation) => [s.side, rotation] as const)),
  )('lays the platform on the track edge (world side %i) at rotation %i', (side, rotation) => {
    const lot = footprintForRotation(STATION, rotation);
    const railAt = (x: number, z: number): boolean => {
      if (side === 0) return z === 10 + lot.d && x >= 10 && x < 10 + lot.w;
      if (side === 2) return z === 9 && x >= 10 && x < 10 + lot.w;
      if (side === 1) return x === 10 + lot.w && z >= 10 && z < 10 + lot.d;
      return x === 9 && z >= 10 && z < 10 + lot.d;
    };
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [STATION], undefined, railAt);
    renderer.apply(add(instance(1, 'rail-station', { rotation })));

    const frame = depotFrame(STATION, rotation, side);
    const edgeTiles = side % 2 === 0 ? lot.w : lot.d;
    expect(frame.long).toBe(edgeTiles === 3);
    const groundsKind = frame.long ? 'depotGroundsLong' : 'depotGrounds';
    const canopyKind = frame.long ? 'depotCanopyLong' : 'depotCanopy';
    expect(renderer.partSlotsFor(1, groundsKind)).toHaveLength(1);
    expect(renderer.partSlotsFor(1, frame.long ? 'depotGrounds' : 'depotGroundsLong')).toHaveLength(
      0,
    );
    expect(renderer.partSlotsFor(1, canopyKind)).toHaveLength(1);

    // The track frame's -Z points at the rail.
    const m = new THREE.Matrix4();
    renderer.getPartMatrix(
      'rail-station',
      groundsKind,
      renderer.partSlotsFor(1, groundsKind)[0]!,
      m,
    );
    const q = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const dir = sides[side]!.dir;
    expect(back.x).toBeCloseTo(dir.x, 6);
    expect(back.z).toBeCloseTo(dir.z, 6);

    // The canopy stands along the lot's track edge, at the lot line.
    const canopy = placedBounds(
      renderer,
      'rail-station',
      canopyKind,
      renderer.partSlotsFor(1, canopyKind)[0]!,
    );
    const lotX0 = 10 * TILE_METERS;
    const lotZ0 = 10 * TILE_METERS;
    const lotX1 = lotX0 + lot.w * TILE_METERS;
    const lotZ1 = lotZ0 + lot.d * TILE_METERS;
    const edge = side === 0 ? lotZ1 : side === 2 ? lotZ0 : side === 1 ? lotX1 : lotX0;
    const nearest =
      side === 0
        ? canopy.max.z
        : side === 2
          ? canopy.min.z
          : side === 1
            ? canopy.max.x
            : canopy.min.x;
    expect(nearest).toBeCloseTo(edge, 6);
    expect(canopy.min.x).toBeGreaterThanOrEqual(lotX0 - 1e-6);
    expect(canopy.max.x).toBeLessThanOrEqual(lotX1 + 1e-6);
    expect(canopy.min.z).toBeGreaterThanOrEqual(lotZ0 - 1e-6);
    expect(canopy.max.z).toBeLessThanOrEqual(lotZ1 + 1e-6);

    // The depot stands between the platform and the far edge, inside the lot.
    const depot = placedBounds(
      renderer,
      'rail-station',
      'depotBuilding',
      renderer.partSlotsFor(1, 'depotBuilding')[0]!,
    );
    expect(depot.min.x).toBeGreaterThanOrEqual(lotX0 - 1e-6);
    expect(depot.max.x).toBeLessThanOrEqual(lotX1 + 1e-6);
    expect(depot.min.z).toBeGreaterThanOrEqual(lotZ0 - 1e-6);
    expect(depot.max.z).toBeLessThanOrEqual(lotZ1 + 1e-6);
    const depotNearest =
      side === 0 ? depot.max.z : side === 2 ? depot.min.z : side === 1 ? depot.max.x : depot.min.x;
    expect(Math.abs(depotNearest - edge)).toBeGreaterThan(DEPOT_PLATFORM.w);
    expect(renderer.partSlotsFor(1, 'depotCar').length).toBeGreaterThan(0);
  });

  it('turns the platform to the back of the lot as placed when no rail touches it', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [STATION]);
    renderer.apply(add(instance(1, 'rail-station', { rotation: 1 })));
    const m = new THREE.Matrix4();
    renderer.getPartMatrix(
      'rail-station',
      'depotGrounds',
      renderer.partSlotsFor(1, 'depotGrounds')[0]!,
      m,
    );
    const q = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    // Rotation 1 puts the street on +X, so the track frame's -Z looks to -X.
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    expect(back.x).toBeCloseTo(-1, 6);
  });

  it('draws the depot to its ridge with the doors and windows on the lit material only', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [STATION]);
    renderer.setNightFactor(1);
    expect(renderer.partEmissiveHex('rail-station', 'depotLit')).not.toBe(0);
    expect(renderer.partEmissiveHex('rail-station', 'depotBuilding')).toBe(0);
    expect(renderer.partEmissiveHex('rail-station', 'depotCanopy')).toBe(0);
    expect(renderer.partEmissiveHex('rail-station', 'depotGrounds')).toBe(0);
    const depot = renderer.partGeometry('rail-station', 'depotBuilding')!;
    depot.computeBoundingBox();
    const ridge = DEPOT_BODY.plate + (DEPOT_BODY.pitch * DEPOT_BODY.d) / 2;
    // The chimney stands above the ridge; the roof itself tops out there.
    expect(depot.boundingBox!.max.y).toBeGreaterThan(ridge);
    expect(depot.boundingBox!.max.y).toBeLessThan(ridge + 1);
    expect(depot.boundingBox!.max.x - depot.boundingBox!.min.x).toBeCloseTo(
      DEPOT_BODY.w + 2 * DEPOT_BODY.eave,
      6,
    );
    // The bay stands proud of the track face.
    expect(depot.boundingBox!.min.z).toBeLessThanOrEqual(-DEPOT_BODY.d / 2 - DEPOT_BODY.eave);
    const lit = renderer.partGeometry('rail-station', 'depotLit')!;
    lit.computeBoundingBox();
    expect(lit.boundingBox!.min.z).toBeLessThan(-DEPOT_BODY.d / 2 - 0.9);
    expect(lit.boundingBox!.max.z).toBeGreaterThan(DEPOT_BODY.d / 2);
  });
});

describe('the bus stop layout', () => {
  const layout = computeBusStopLayout(BUS_STOP.footprint);
  const lot = lotOf(BUS_STOP.footprint);

  it('stands a 1.52 × 3.66 m shelter at the lot’s street edge with its roof 2.29 m clear', () => {
    expect(BUS_SHELTER.w).toBeCloseTo(3.66, 9);
    expect(BUS_SHELTER.d).toBeCloseTo(1.52, 9);
    expect(BUS_SHELTER.clear).toBeCloseTo(2.29, 9);
    expect(BUS_SHELTER.overhang).toBeCloseTo(0.3, 9);
    expect(BUS_SHELTER.bench.l).toBeCloseTo(1.83, 9);
    expect(BUS_SHELTER.bench.h).toBeCloseTo(0.45, 9);
    const roofFront = layout.shelter.z + BUS_SHELTER.d / 2 + BUS_SHELTER.overhang;
    expect(roofFront).toBeLessThanOrEqual(lot.z1);
    expect(lot.z1 - roofFront).toBeLessThan(0.5);
    const geometry = buildBusShelterGeometry();
    geometry.computeBoundingBox();
    const b = geometry.boundingBox!;
    expect(b.max.x - b.min.x).toBeCloseTo(BUS_SHELTER.w + 2 * BUS_SHELTER.overhang, 6);
    expect(b.max.z - b.min.z).toBeCloseTo(BUS_SHELTER.d + 2 * BUS_SHELTER.overhang, 6);
    expect(b.max.y).toBeCloseTo(BUS_SHELTER.clear + BUS_SHELTER.roof, 6);
    expect(b.min.y).toBeCloseTo(0, 6);
  });

  it('lays a 2.44 × 1.52 m boarding pad at the kerb beside the shelter, a walk between, and the sign bottom 2.13 m up', () => {
    expect(layout.pad.z1 - layout.pad.z0).toBeCloseTo(BUS_STOP_PAD.out, 9);
    expect(layout.pad.x1 - layout.pad.x0).toBeCloseTo(BUS_STOP_PAD.along, 9);
    expect(BUS_STOP_PAD).toEqual({ out: 2.44, along: 1.52 });
    expect(layout.pad.z1).toBeCloseTo(lot.z1, 9);
    expect(inside(layout.pad, layout.walk)).toBe(true);
    const shelter: Rect = {
      x0: layout.shelter.x - BUS_SHELTER.w / 2,
      x1: layout.shelter.x + BUS_SHELTER.w / 2,
      z0: layout.shelter.z - BUS_SHELTER.d / 2,
      z1: layout.shelter.z + BUS_SHELTER.d / 2,
    };
    expect(inside(shelter, layout.walk)).toBe(true);
    expect(overlaps(shelter, layout.pad)).toBe(false);
    expect(BUS_STOP_SIGN.bottom).toBeCloseTo(2.13, 9);
    expect(BUS_STOP_SIGN.w).toBeCloseTo(0.46, 9);
    expect(BUS_STOP_SIGN.h).toBeCloseTo(0.61, 9);
    expect(inside(layout.walk, lot)).toBe(true);
    expect(Math.abs(layout.sign.x)).toBeLessThan(lot.x1);
    expect(Math.abs(layout.bin.x)).toBeLessThan(lot.x1);
  });

  it('is deterministic', () => {
    expect(computeBusStopLayout(BUS_STOP.footprint)).toEqual(layout);
  });
});

describe('the bus stop kit', () => {
  it('stands on a lawn plate over the whole tile, not a plinth, with no lit part', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [BUS_STOP]);
    renderer.setNightFactor(1);
    for (const kind of ['busStopGrounds', 'busStopShelter', 'busStopProps'] as const) {
      expect(renderer.partEmissiveHex('bus-stop', kind)).toBe(0);
    }
    const grounds = renderer.partGeometry('bus-stop', 'busStopGrounds')!;
    grounds.computeBoundingBox();
    const b = grounds.boundingBox!;
    expect(b.max.x - b.min.x).toBeCloseTo(TILE_METERS, 6);
    expect(b.max.z - b.min.z).toBeCloseTo(TILE_METERS, 6);
    // Its top is the lawn plate's, with the walk a few centimetres proud.
    expect(b.max.y).toBeGreaterThan(RECYCLING_YARD_HEIGHT);
    expect(b.max.y).toBeLessThan(RECYCLING_YARD_HEIGHT + 0.1);
    // The lawn's own colour: green dominates the plate's vertices.
    const colors = grounds.getAttribute('color');
    let green = 0;
    for (let i = 0; i < colors.count; i++) if (colors.getY(i) > colors.getX(i) + 0.1) green++;
    expect(green).toBeGreaterThanOrEqual(8);
  });

  it.each([0, 1, 2, 3] as const)(
    'puts the shelter at the street edge inside the lot at rotation %i, where the idlers wait',
    (rotation) => {
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [BUS_STOP]);
      renderer.apply(add(instance(1, 'bus-stop', { rotation })));
      const slot = renderer.partSlotsFor(1, 'busStopShelter')[0]!;
      const b = placedBounds(renderer, 'bus-stop', 'busStopShelter', slot);
      const x0 = 10 * TILE_METERS;
      const z0 = 10 * TILE_METERS;
      expect(b.min.x).toBeGreaterThanOrEqual(x0 - 1e-6);
      expect(b.max.x).toBeLessThanOrEqual(x0 + TILE_METERS + 1e-6);
      expect(b.min.z).toBeGreaterThanOrEqual(z0 - 1e-6);
      expect(b.max.z).toBeLessThanOrEqual(z0 + TILE_METERS + 1e-6);
      // Against the edge local +Z turned to.
      const streetEdge = [b.max.z, b.max.x, b.min.z, b.min.x][rotation]!;
      const lotEdge = [z0 + TILE_METERS, x0 + TILE_METERS, z0, x0][rotation]!;
      expect(Math.abs(streetEdge - lotEdge)).toBeLessThan(0.5);
      const anchor = busStopShelterAnchor({ x: 10, z: 10, rotation }, BUS_STOP);
      const m = new THREE.Matrix4();
      renderer.getPartMatrix('bus-stop', 'busStopShelter', slot, m);
      const p = new THREE.Vector3();
      m.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
      expect(anchor.x).toBeCloseTo(p.x, 3);
      expect(anchor.z).toBeCloseTo(p.z, 3);
      const props = placedBounds(
        renderer,
        'bus-stop',
        'busStopProps',
        renderer.partSlotsFor(1, 'busStopProps')[0]!,
      );
      expect(props.max.y).toBeGreaterThan(BUS_STOP_SIGN.bottom + BUS_STOP_SIGN.h);
      expect(props.min.x).toBeGreaterThanOrEqual(x0 - 1e-6);
      expect(props.max.x).toBeLessThanOrEqual(x0 + TILE_METERS + 1e-6);
    },
  );
});
