import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingKitRenderer, computePartPlacements, DOOR_COUNT } from './buildingkit';
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
