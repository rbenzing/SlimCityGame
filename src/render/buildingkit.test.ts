import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BuildingKitRenderer,
  computePartPlacements,
  DOOR_COUNT,
  FUEL_CANOPY_DEPTH_M,
  FUEL_CANOPY_FRONTAGE_FRACTION,
  FUEL_CANOPY_GAP_M,
  FUEL_CANOPY_HEIGHT_M,
  FUEL_CANOPY_THICKNESS_M,
  TANK_COUNT,
  TANK_DIAMETER_M,
  TANK_GAP_M,
  TANK_HEIGHT_M,
  TANK_SPACING_M,
} from './buildingkit';
import type { SetbackBox } from './massing';
import { BuildingState, type BuildingCatalogEntry, type BuildingInstance } from '../shared/types';

function entry(over: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'x',
    name: 'X',
    category: 'ind',
    footprint: { w: 3, d: 3 },
    height: 12,
    color: 0x808080,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...over,
  } as BuildingCatalogEntry;
}

const base: SetbackBox = { w: 40, d: 30, h: 12, yOffset: 0 };
const top: SetbackBox = { w: 34, d: 26, h: 4, yOffset: 8 };

const warehouse = entry({ level: 1, pollution: 60 });
const factory = entry({ level: 2, pollution: 90 });
const greenWorks = entry({ level: 3, pollution: 0 });
const shop = entry({ category: 'com', level: 1 });

const partsOf = (p: ReturnType<typeof computePartPlacements>): string[] => p.map((x) => x.part);

describe('computePartPlacements', () => {
  it('gives each industrial rung a different silhouette', () => {
    expect(partsOf(computePartPlacements(warehouse, base, top, 'S'))).toContain('loadingDock');
    expect(partsOf(computePartPlacements(factory, base, top, 'S'))).toContain('monitorRoof');
    expect(partsOf(computePartPlacements(greenWorks, base, top, 'S'))).toContain('roofArray');
  });

  it('stands roof parts on top of the roof, never inside the building', () => {
    const roofY = top.yOffset + top.h;
    for (const e of [factory, greenWorks]) {
      for (const p of computePartPlacements(e, base, top, 'S')) {
        const bottom = p.offset[1] - p.size[1] / 2;
        expect(bottom, `${p.part} starts below the roof`).toBeGreaterThanOrEqual(roofY - 1e-9);
      }
    }
  });

  it('keeps a roof part inside the roof it sits on', () => {
    for (const p of computePartPlacements(greenWorks, base, top, 'S')) {
      expect(p.size[0]).toBeLessThanOrEqual(top.w);
      expect(p.size[2]).toBeLessThanOrEqual(top.d);
    }
  });

  // A dock, a canopy and a sign are frontage parts: they must sit OUTSIDE the
  // wall they hang on, or they vanish inside the building box.
  it('hangs frontage parts outside the wall, on the road side', () => {
    for (const [side, sign] of [
      ['S', 1],
      ['N', -1],
    ] as const) {
      for (const p of computePartPlacements(warehouse, base, top, side)) {
        expect(Math.sign(p.offset[2]), `${p.part} on ${side}`).toBe(sign);
        expect(Math.abs(p.offset[2]), `${p.part} on ${side}`).toBeGreaterThanOrEqual(base.d / 2);
      }
    }
  });

  it('turns frontage parts onto the X axis for an east or west frontage', () => {
    for (const [side, sign] of [
      ['E', 1],
      ['W', -1],
    ] as const) {
      const dock = computePartPlacements(warehouse, base, top, side).find(
        (p) => p.part === 'loadingDock',
      )!;
      expect(Math.sign(dock.offset[0])).toBe(sign);
      expect(dock.offset[2]).toBe(0);
      // Its long axis now runs along Z, the wall it lies against.
      expect(dock.size[2]).toBeGreaterThan(dock.size[0]);
    }
  });

  it('gives a warehouse one door per bay, spread across the frontage', () => {
    const doors = computePartPlacements(warehouse, base, top, 'S').filter(
      (p) => p.part === 'rollUpDoors',
    );
    expect(doors).toHaveLength(DOOR_COUNT);
    const xs = doors.map((d) => d.offset[0]).sort((a, b) => a - b);
    expect(new Set(xs).size).toBe(DOOR_COUNT); // no two doors stacked
    expect(Math.abs(xs[0]! + xs[xs.length - 1]!)).toBeLessThan(1e-9); // centred
  });

  it('stands the doors above the dock they open onto', () => {
    const placements = computePartPlacements(warehouse, base, top, 'S');
    const dock = placements.find((p) => p.part === 'loadingDock')!;
    const door = placements.find((p) => p.part === 'rollUpDoors')!;
    const dockTop = dock.offset[1] + dock.size[1] / 2;
    expect(door.offset[1] - door.size[1] / 2).toBeGreaterThanOrEqual(dockTop - 1e-9);
  });

  it('puts a shop sign above its canopy, not behind it', () => {
    const placements = computePartPlacements(shop, base, top, 'S');
    const canopy = placements.find((p) => p.part === 'canopy')!;
    const sign = placements.find((p) => p.part === 'signageBand')!;
    expect(sign.offset[1]).toBeGreaterThan(canopy.offset[1]);
  });

  // Without a street there is nothing for a dock or a canopy to face.
  it('skips every frontage part when the building fronts no road', () => {
    expect(computePartPlacements(warehouse, base, top, null)).toEqual([]);
    expect(computePartPlacements(shop, base, top, null)).toEqual([]);
    // Roof parts need no frontage, so they still appear.
    expect(partsOf(computePartPlacements(greenWorks, base, top, null))).toEqual(['roofArray']);
  });

  it('stands a filling station canopy off the kiosk over the forecourt, on four posts, with two pumps under it', () => {
    const station = entry({ category: 'com', kind: 'fuel', footprint: { w: 2, d: 2 } });
    const kiosk: SetbackBox = { w: 14, d: 14, h: 4.5, yOffset: 0 };
    const placed = computePartPlacements(station, kiosk, kiosk, 'S');
    const canopy = placed.filter((p) => p.part === 'fuelCanopy');
    const pumps = placed.filter((p) => p.part === 'pumps');
    expect(canopy).toHaveLength(5);
    expect(pumps).toHaveLength(2);

    const slab = canopy.find((p) => p.size[1] === FUEL_CANOPY_THICKNESS_M)!;
    // The slab starts the gap off the wall and runs its depth out over the forecourt, up at canopy height.
    expect(slab.offset[2] - slab.size[2] / 2).toBeCloseTo(kiosk.d / 2 + FUEL_CANOPY_GAP_M, 9);
    expect(slab.size[2]).toBe(FUEL_CANOPY_DEPTH_M);
    expect(slab.size[0]).toBeCloseTo(kiosk.w * FUEL_CANOPY_FRONTAGE_FRACTION, 9);
    expect(slab.offset[1] - slab.size[1] / 2).toBeCloseTo(FUEL_CANOPY_HEIGHT_M, 9);
    // The posts stand on the ground under the slab's corners, and the pumps under the slab.
    for (const post of canopy.filter((p) => p !== slab)) {
      expect(post.size[1]).toBe(FUEL_CANOPY_HEIGHT_M);
      expect(post.offset[1] - post.size[1] / 2).toBeCloseTo(0, 9);
      expect(Math.abs(post.offset[0])).toBeLessThan(slab.size[0] / 2);
      expect(post.offset[2]).toBeGreaterThan(slab.offset[2] - slab.size[2] / 2);
      expect(post.offset[2]).toBeLessThan(slab.offset[2] + slab.size[2] / 2);
    }
    for (const pump of pumps) {
      expect(pump.offset[1] - pump.size[1] / 2).toBeCloseTo(0, 9);
      expect(pump.offset[2]).toBeGreaterThan(slab.offset[2] - slab.size[2] / 2);
      expect(pump.offset[2]).toBeLessThan(slab.offset[2] + slab.size[2] / 2);
    }
    expect(pumps[0]!.offset[0]).toBeCloseTo(-pumps[1]!.offset[0], 9);
  });

  it('turns the filling station onto the X axis for an east frontage', () => {
    const station = entry({ category: 'com', kind: 'fuel', footprint: { w: 2, d: 2 } });
    const kiosk: SetbackBox = { w: 14, d: 14, h: 4.5, yOffset: 0 };
    for (const p of computePartPlacements(station, kiosk, kiosk, 'E')) {
      expect(p.offset[0], p.part).toBeGreaterThan(kiosk.w / 2);
    }
  });

  it("stands a workshop's roller doors on the ground, since it has no dock", () => {
    const workshop = entry({ kind: 'workshop', level: 1, pollution: 20 });
    const placed = computePartPlacements(workshop, base, top, 'S');
    expect(partsOf(placed)).toEqual(Array(DOOR_COUNT).fill('rollUpDoors'));
    for (const door of placed) expect(door.offset[1] - door.size[1] / 2).toBeCloseTo(0, 9);
  });

  it("puts a plant's tank farm in the yard behind it, off the wall opposite the street", () => {
    const plant = entry({ kind: 'chemical', level: 1, pollution: 120 });
    for (const [side, sign] of [
      ['S', -1],
      ['N', 1],
    ] as const) {
      const tanks = computePartPlacements(plant, base, top, side);
      expect(tanks).toHaveLength(TANK_COUNT);
      for (const tank of tanks) {
        expect(tank.part).toBe('tanks');
        expect(tank.size).toEqual([TANK_DIAMETER_M, TANK_HEIGHT_M, TANK_DIAMETER_M]);
        // Standing on the ground, the gap off the back wall, never inside the body.
        expect(tank.offset[1] - tank.size[1] / 2).toBeCloseTo(0, 9);
        expect(Math.sign(tank.offset[2])).toBe(sign);
        expect(Math.abs(tank.offset[2]) - TANK_DIAMETER_M / 2).toBeCloseTo(
          base.d / 2 + TANK_GAP_M,
          9,
        );
      }
      const along = tanks.map((t) => t.offset[0]).sort((a, b) => a - b);
      expect(along[1]).toBeCloseTo(0, 9);
      expect(along[2]! - along[0]!).toBeCloseTo((TANK_COUNT - 1) * TANK_SPACING_M, 9);
    }
    // An east frontage puts the yard on the west.
    for (const tank of computePartPlacements(plant, base, top, 'E')) {
      expect(tank.offset[0]).toBeLessThan(-base.w / 2);
    }
    expect(computePartPlacements(plant, base, top, null)).toEqual([]);
  });

  it('gives an archetype with no parts nothing at all', () => {
    const home = entry({ category: 'res', zone: 1 });
    expect(computePartPlacements(home, base, top, 'S')).toEqual([]);
  });

  it('stays far under the mesh budget: a whole assembly is a handful of boxes', () => {
    const most = computePartPlacements(warehouse, base, top, 'S');
    // 12 triangles a box; the reference caps a mesh at 65,536 vertices.
    expect(most.length * 36).toBeLessThan(65536);
  });
});

describe('BuildingKitRenderer delta handling', () => {
  const shopEntry = entry({ id: 'shop', category: 'com', level: 1, footprint: { w: 2, d: 2 } });
  const roadSouth = (x: number, z: number): boolean => z === 8 && x >= 4 && x < 6;
  const inst = (over: Partial<BuildingInstance> = {}): BuildingInstance =>
    ({
      id: 1,
      catalogId: 'shop',
      x: 4,
      z: 6,
      rotation: 0,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
      ...over,
    }) as BuildingInstance;

  const make = (): BuildingKitRenderer =>
    new BuildingKitRenderer(new THREE.Scene(), () => 0, [shopEntry], roadSouth);

  it('builds a shopfront its parts', () => {
    const r = make();
    r.apply({ added: [inst()], updated: [], removed: [] });
    expect(r.partCountFor(1)).toBeGreaterThan(0);
    expect(r.instanceCount('canopy')).toBe(1);
  });

  // The defect this guards: a building can be updated AND removed inside one
  // delta — abandoned then demolished in a single snapshot window. Freeing
  // before placing let the update resurrect it, leaving a canopy hanging over
  // a building the world no longer had.
  it('leaves nothing standing when a building is updated and removed at once', () => {
    const r = make();
    r.apply({ added: [inst()], updated: [], removed: [] });
    r.apply({ added: [], updated: [inst()], removed: [1] });

    expect(r.trackedIds()).toEqual([]);
    expect(r.instanceCount('canopy')).toBe(0);
    expect(r.instanceCount('signageBand')).toBe(0);
  });

  it('counts parts that stand, not slots a pool once held', () => {
    const r = make();
    r.apply({ added: [inst()], updated: [], removed: [] });
    r.apply({ added: [], updated: [], removed: [1] });
    r.apply({ added: [inst({ id: 2 })], updated: [], removed: [] });
    expect(r.instanceCount('canopy')).toBe(1);
  });

  it('drops parts for a building that stops being active', () => {
    const r = make();
    r.apply({ added: [inst()], updated: [], removed: [] });
    r.apply({ added: [], updated: [inst({ state: BuildingState.Abandoned })], removed: [] });
    expect(r.partCountFor(1)).toBe(0);
  });
});
