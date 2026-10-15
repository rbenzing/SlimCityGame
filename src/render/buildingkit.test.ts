import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { footprintForRotation } from '../shared/footprint';
import { DRIVE_THROUGH_STACK_M } from '../shared/lotlayout';
import { partsFor, type BuildingPart } from './archetypes';
import {
  alongPath,
  BuildingKitRenderer,
  computePartPlacements,
  DOOR_COUNT,
  kitPlanFor,
  LIT_DAY_FLOOR,
  LIT_PARTS,
  placementBounds,
  rooftopUnitCount,
  type KitPlan,
  type PartPlacement,
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

  it('stands a filling station canopy off the kiosk over the forecourt, on four posts, with two islands under it', () => {
    const station = entry({ category: 'com', kind: 'fuel', footprint: { w: 2, d: 2 } });
    const kiosk: SetbackBox = { w: 14, d: 14, h: 4.5, yOffset: 0 };
    const placed = computePartPlacements(station, kiosk, kiosk, 'S');
    const canopy = placed.filter((p) => p.part === 'fuelCanopy');
    const islands = placed.filter((p) => p.part === 'fuelIsland');
    expect(canopy).toHaveLength(5);
    expect(islands).toHaveLength(2);

    const slab = canopy.find((p) => p.size[1] === FUEL_CANOPY_THICKNESS_M)!;
    // The slab starts the gap off the wall and runs its depth out over the forecourt, up at canopy height.
    expect(slab.offset[2] - slab.size[2] / 2).toBeCloseTo(kiosk.d / 2 + FUEL_CANOPY_GAP_M, 9);
    expect(slab.size[2]).toBe(FUEL_CANOPY_DEPTH_M);
    expect(slab.size[0]).toBeCloseTo(kiosk.w * FUEL_CANOPY_FRONTAGE_FRACTION, 9);
    expect(slab.offset[1] - slab.size[1] / 2).toBeCloseTo(FUEL_CANOPY_HEIGHT_M, 9);
    // The posts stand on the ground under the slab's corners, and the islands under the slab.
    for (const post of canopy.filter((p) => p !== slab)) {
      expect(post.size[1]).toBe(FUEL_CANOPY_HEIGHT_M);
      expect(post.offset[1] - post.size[1] / 2).toBeCloseTo(0, 9);
      expect(Math.abs(post.offset[0])).toBeLessThan(slab.size[0] / 2);
      expect(post.offset[2]).toBeGreaterThan(slab.offset[2] - slab.size[2] / 2);
      expect(post.offset[2]).toBeLessThan(slab.offset[2] + slab.size[2] / 2);
    }
    for (const island of islands) {
      expect(island.offset[1] - island.size[1] / 2).toBeCloseTo(0, 9);
      expect(island.offset[2]).toBeGreaterThan(slab.offset[2] - slab.size[2] / 2);
      expect(island.offset[2]).toBeLessThan(slab.offset[2] + slab.size[2] / 2);
    }
    expect(islands[0]!.offset[0]).toBeCloseTo(-islands[1]!.offset[0], 9);
  });

  it('turns the filling station onto the X axis for an east frontage', () => {
    const station = entry({ category: 'com', kind: 'fuel', footprint: { w: 2, d: 2 } });
    const kiosk: SetbackBox = { w: 14, d: 14, h: 4.5, yOffset: 0 };
    // The kiosk's roof units and hatch stand on its roof, not off its east wall.
    const frontage = computePartPlacements(station, kiosk, kiosk, 'E').filter(
      (p) => p.part !== 'rooftopUnit' && p.part !== 'roofHatch',
    );
    for (const p of frontage) {
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

// ---------------------------------------------------------------------------
// The storefront kit, over the shipped catalog
// ---------------------------------------------------------------------------

const commercial = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter(
  (e) => e.category === 'com',
);
const byId = (id: string): BuildingCatalogEntry => commercial.find((e) => e.id === id)!;

type StreetSide = 'N' | 'E' | 'S' | 'W';
const STREET_SIDES: readonly StreetSide[] = ['N', 'E', 'S', 'W'];
const TURNS = [0, 1, 2, 3] as const;

/** A street along one side of a w×d lot at (10, 10). */
function streetOn(side: StreetSide, w: number, d: number): (x: number, z: number) => boolean {
  switch (side) {
    case 'N':
      return (x, z) => z === 9 && x >= 10 && x < 10 + w;
    case 'S':
      return (x, z) => z === 10 + d && x >= 10 && x < 10 + w;
    case 'E':
      return (x, z) => x === 10 + w && z >= 10 && z < 10 + d;
    default:
      return (x, z) => x === 9 && z >= 10 && z < 10 + d;
  }
}

function kitOf(e: BuildingCatalogEntry, rotation: 0 | 1 | 2 | 3, side: StreetSide): KitPlan {
  const lot = footprintForRotation(e, rotation);
  return kitPlanFor(e, { id: 7, x: 10, z: 10, rotation }, streetOn(side, lot.w, lot.d))!;
}

/** The kit of a building turned square to a street on its south side. */
const southern = (e: BuildingCatalogEntry): KitPlan => kitOf(e, 0, 'S');

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const only = (plan: KitPlan, part: BuildingPart): PartPlacement[] =>
  plan.placements.filter((p) => p.part === part);
const topOf = (p: PartPlacement): number => p.offset[1] + p.size[1] / 2;
const bottomOf = (p: PartPlacement): number => p.offset[1] - p.size[1] / 2;
const boundsOf = (parts: readonly PartPlacement[]): Rect => {
  const all = parts.map(placementBounds);
  return {
    x0: Math.min(...all.map((b) => b.x0)),
    x1: Math.max(...all.map((b) => b.x1)),
    z0: Math.min(...all.map((b) => b.z0)),
    z1: Math.max(...all.map((b) => b.z1)),
  };
};
const overlap = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
/** Whether one rectangle's middle lies inside another. */
const middleIn = (a: Rect, b: Rect): boolean => {
  const x = (a.x0 + a.x1) / 2;
  const z = (a.z0 + a.z1) / 2;
  return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
};

const ROOF_PARTS: readonly BuildingPart[] = [
  'rooftopUnit',
  'roofHatch',
  'roofScreen',
  'coolingTower',
];

describe('the storefront kit: where every part stands', () => {
  it('stands every part inside its lot, at every turn and every street side', () => {
    const outside: string[] = [];
    for (const e of commercial) {
      for (const rotation of TURNS) {
        for (const side of STREET_SIDES) {
          const plan = kitOf(e, rotation, side);
          for (const p of plan.placements) {
            const b = placementBounds(p);
            const t = plan.tiles;
            const inside =
              b.x0 >= t.x0 - 1e-6 &&
              b.x1 <= t.x1 + 1e-6 &&
              b.z0 >= t.z0 - 1e-6 &&
              b.z1 <= t.z1 + 1e-6;
            if (!inside || bottomOf(p) < -1e-9)
              outside.push(`${e.id} ${rotation}${side} ${p.part}`);
          }
        }
      }
    }
    expect(outside).toEqual([]);
  });

  it('keeps every part against the street wall or on the roof, never inside the body', () => {
    const inside: string[] = [];
    for (const e of commercial) {
      for (const rotation of TURNS) {
        const plan = kitOf(e, rotation, 'S');
        const roofY = plan.topBox.yOffset + plan.topBox.h;
        const baseTop = plan.baseBox.yOffset + plan.baseBox.h;
        const body = {
          x0: -plan.baseBox.w / 2,
          x1: plan.baseBox.w / 2,
          z0: -plan.baseBox.d / 2,
          z1: plan.baseBox.d / 2,
        };
        const roof = {
          x0: -plan.topBox.w / 2,
          x1: plan.topBox.w / 2,
          z0: -plan.topBox.d / 2,
          z1: plan.topBox.d / 2,
        };
        for (const p of plan.placements) {
          const b = placementBounds(p);
          const label = `${e.id} ${rotation} ${p.part}`;
          if (ROOF_PARTS.includes(p.part)) {
            const within = b.x0 >= roof.x0 && b.x1 <= roof.x1 && b.z0 >= roof.z0 && b.z1 <= roof.z1;
            if (bottomOf(p) < roofY - 1e-6 || !within) inside.push(label);
          } else if (p.part === 'anchorParapet') {
            if (Math.abs(bottomOf(p) - baseTop) > 1e-6) inside.push(label);
          } else if (p.part !== 'entryTower' && overlap(b, body) && bottomOf(p) < baseTop - 1e-6) {
            inside.push(label);
          }
        }
      }
    }
    expect(inside).toEqual([]);
  });

  it('is the same every time', () => {
    for (const e of commercial) {
      expect(kitOf(e, 1, 'E')).toEqual(kitOf(e, 1, 'E'));
    }
  });

  it('stands nothing against a wall where there is no street, only on the roof', () => {
    for (const e of commercial) {
      const plan = kitPlanFor(e, { id: 7, x: 10, z: 10, rotation: 0 }, () => false)!;
      const wall = plan.placements.filter((p) => !ROOF_PARTS.includes(p.part));
      expect(wall, e.id).toEqual([]);
    }
  });
});

describe('a shop', () => {
  const shop = southern(byId('com-low-1'));

  it('has awnings a bay, 1.5 m out, their underside at 2.45 m, and no flat canopy', () => {
    const awnings = only(shop, 'awning');
    expect(awnings.length).toBe(2);
    for (const a of awnings) {
      expect(bottomOf(a)).toBeCloseTo(2.45, 9);
      expect(a.size[2]).toBeCloseTo(1.5, 9);
      expect(placementBounds(a).z0).toBeCloseTo(shop.baseBox.d / 2, 9);
    }
    expect(only(shop, 'canopy')).toEqual([]);
  });

  it('turns an awning out of the wall it hangs on, at every street side', () => {
    const yaws: Record<StreetSide, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
    for (const side of STREET_SIDES) {
      const plan = kitOf(byId('com-low-1'), 0, side);
      for (const a of only(plan, 'awning')) {
        expect(a.yaw).toBeCloseTo(yaws[side], 9);
        const b = placementBounds(a);
        const reach = { S: b.z0, N: -b.z1, E: b.x0, W: -b.x1 }[side];
        expect(reach).toBeCloseTo(plan.baseBox.w / 2, 9);
      }
    }
  });

  it('has a 0.6 m bulkhead along the foot of the street face, and a cornice 0.5 m deep and 0.45 m tall at the parapet', () => {
    const [bulkhead] = only(shop, 'bulkhead');
    expect(bulkhead!.size[1]).toBeCloseTo(0.6, 9);
    expect(bottomOf(bulkhead!)).toBeCloseTo(0, 9);
    expect(bulkhead!.size[0]).toBeCloseTo(shop.baseBox.w, 9);
    const [cornice] = only(shop, 'cornice');
    expect(cornice!.size[2]).toBeCloseTo(0.5, 9);
    expect(cornice!.size[1]).toBeCloseTo(0.45, 9);
    expect(topOf(cornice!)).toBeCloseTo(shop.baseBox.h, 9);
  });

  it('signs 60% of its frontage in a band 0.9 m tall at 3.6 m', () => {
    const [band] = only(shop, 'signageBand');
    expect(band!.size[0]).toBeCloseTo(shop.baseBox.w * 0.6, 9);
    expect(band!.size[1]).toBeCloseTo(0.9, 9);
    expect(band!.offset[1]).toBeCloseTo(3.6, 9);
  });
});

describe('a shopping strip', () => {
  const strip = southern(byId('com-strip-1'));
  const span = strip.baseBox.w;

  it('has one canopy the length of its frontage, 2.1 m deep, its underside at 2.75 m, on 0.3 m columns no more than 6 m apart', () => {
    const [canopy] = only(strip, 'stripCanopy');
    expect(canopy!.size[0]).toBeCloseTo(span, 9);
    expect(canopy!.size[2]).toBeCloseTo(2.1, 9);
    expect(canopy!.size[1]).toBeCloseTo(0.3, 9);
    expect(bottomOf(canopy!)).toBeCloseTo(2.75, 9);
    const columns = only(strip, 'stripColumn').sort((a, b) => a.offset[0] - b.offset[0]);
    expect(columns.length).toBeGreaterThanOrEqual(Math.ceil(span / 6));
    for (const c of columns) {
      expect(c.size[0]).toBeCloseTo(0.3, 9);
      expect(topOf(c)).toBeCloseTo(2.75, 9);
    }
    for (let i = 1; i < columns.length; i += 1) {
      expect(columns[i]!.offset[0] - columns[i - 1]!.offset[0]).toBeLessThanOrEqual(6 + 1e-9);
    }
  });

  it('cuts the frontage into bays of about 8 m, a lit band each, and an anchor of two bays', () => {
    const bays = Math.round(span / 8);
    const bay = span / bays;
    expect(bay).toBeGreaterThan(7);
    expect(bay).toBeLessThan(9);
    const widths = only(strip, 'signageBand')
      .map((b) => b.size[0])
      .sort((a, b) => a - b);
    expect(widths).toHaveLength(bays - 1);
    expect(widths[0]).toBeCloseTo(bay * 0.6, 9);
    expect(widths[widths.length - 1]).toBeCloseTo(bay * 2 * 0.6, 9);
  });

  it('puts the anchor at the end away from the drive, its parapet stepped up 1.2 m', () => {
    for (const side of STREET_SIDES) {
      const plan = kitOf(byId('com-strip-2'), 0, side);
      const [parapet] = only(plan, 'anchorParapet');
      expect(parapet!.size[1]).toBeCloseTo(1.2, 9);
      expect(bottomOf(parapet!)).toBeCloseTo(plan.baseBox.h, 9);
      const alongX = side === 'N' || side === 'S';
      const cut = plan.lot!.curbCut;
      const drive = alongX ? (cut.x0 + cut.x1) / 2 : (cut.z0 + cut.z1) / 2;
      const anchor = alongX ? parapet!.offset[0] : parapet!.offset[2];
      expect(Math.sign(anchor)).toBe(Math.sign(-drive));
      // The anchor's own sign band is two bays wide.
      const width = alongX ? parapet!.size[0] : parapet!.size[2];
      const bands = only(plan, 'signageBand').map((b) => (alongX ? b.size[0] : b.size[2]));
      expect(bands.some((w) => Math.abs(w - width * 0.6) < 1e-9)).toBe(true);
    }
  });

  it('has a pylon 6.1 m tall at the drive mouth, its face 1.5 m inside the lot line, on a 0.4 m pole', () => {
    for (const e of commercial.filter((c) => c.kind === 'strip')) {
      for (const side of STREET_SIDES) {
        const plan = kitOf(e, 0, side);
        const [cabinet] = only(plan, 'pylon');
        const [pole] = only(plan, 'signPole');
        expect(topOf(cabinet!)).toBeCloseTo(6.1, 9);
        expect(cabinet!.size[1]).toBeCloseTo(1.8, 9);
        expect(Math.max(cabinet!.size[0], cabinet!.size[2])).toBeCloseTo(3.66, 9);
        expect(Math.min(pole!.size[0], pole!.size[2])).toBeCloseTo(0.4, 9);
        expect(bottomOf(pole!)).toBeCloseTo(0, 9);
        expect(topOf(pole!)).toBeCloseTo(6.1 - 1.8, 9);
        const b = placementBounds(cabinet!);
        const t = plan.tiles;
        const inset = { S: t.z1 - b.z1, N: b.z0 - t.z0, E: t.x1 - b.x1, W: b.x0 - t.x0 }[side];
        expect(inset, `${e.id} ${side}`).toBeCloseTo(1.5, 9);
        // Beside the drive, not across it.
        const cut = plan.lot!.curbCut;
        const alongX = side === 'N' || side === 'S';
        const [from, to] = alongX ? [b.x0, b.x1] : [b.z0, b.z1];
        const [c0, c1] = alongX ? [cut.x0, cut.x1] : [cut.z0, cut.z1];
        expect(from < c1 - 1e-6 && c0 < to - 1e-6, `${e.id} ${side}`).toBe(false);
      }
    }
  });
});

describe('a supermarket', () => {
  const market = byId('com-market-1');
  const plan = southern(market);
  const span = plan.baseBox.w;

  it('has an entry tower 6 × 4 m rising to 1.28 times the body, proud of the wall', () => {
    const [tower] = only(plan, 'entryTower');
    expect(tower!.size[0]).toBeCloseTo(6, 9);
    expect(tower!.size[2]).toBeCloseTo(4, 9);
    expect(topOf(tower!)).toBeCloseTo(1.28 * market.height, 9);
    expect(bottomOf(tower!)).toBeCloseTo(0, 9);
    expect(placementBounds(tower!).z1).toBeGreaterThan(plan.baseBox.d / 2);
  });

  it('steps its parapet up to 1.17 times the body for 12 m either side of the tower', () => {
    const wings = only(plan, 'anchorParapet');
    expect(wings).toHaveLength(2);
    for (const wing of wings) {
      expect(topOf(wing)).toBeCloseTo(1.17 * market.height, 9);
      expect(wing.size[0]).toBeCloseTo(12, 9);
      expect(Math.abs(wing.offset[0])).toBeCloseTo(3 + 6, 9);
    }
  });

  it('glazes the tower’s face only, and runs a brick base across the rest of the street face', () => {
    const [tower] = only(plan, 'entryTower');
    const [glazing] = only(plan, 'towerGlazing');
    expect(placementBounds(glazing!).z0).toBeCloseTo(placementBounds(tower!).z1, 9);
    expect(glazing!.size[0]).toBeLessThanOrEqual(6);
    const bricks = only(plan, 'brickBase');
    for (const b of bricks) {
      expect(b.size[1]).toBeCloseTo(1.2, 9);
      expect(b.size[2]).toBeCloseTo(0.1, 9);
    }
    expect(bricks.reduce((sum, b) => sum + b.size[0], 0)).toBeCloseTo(span - 6, 9);
  });

  it('stands two cart corrals 3.66 × 1.52 m with 1.0 m rails and a 2.3 m sign post, in planted islands by the entrance', () => {
    const rails = only(plan, 'cartCorral');
    expect(rails).toHaveLength(6);
    const posts = only(plan, 'signPole');
    expect(posts).toHaveLength(2);
    for (const post of posts) expect(topOf(post)).toBeCloseTo(2.3, 9);
    for (let i = 0; i < 2; i += 1) {
      const corral = rails.slice(i * 3, i * 3 + 3);
      for (const r of corral) expect(topOf(r)).toBeCloseTo(1, 9);
      const b = boundsOf(corral);
      const dims = [b.x1 - b.x0, b.z1 - b.z0].sort((a, c) => a - c);
      expect(dims[0]).toBeCloseTo(1.52, 9);
      expect(dims[1]).toBeCloseTo(3.66, 9);
      const stands = plan.lot!.islands.some(
        (island) =>
          b.x0 >= island.x0 - 0.01 &&
          b.x1 <= island.x1 + 0.01 &&
          b.z0 >= island.z0 - 0.01 &&
          b.z1 <= island.z1 + 0.01,
      );
      expect(stands).toBe(true);
    }
  });

  it('keeps its units to the dock side of the roof', () => {
    for (const e of commercial.filter((c) => c.kind === 'supermarket')) {
      for (const rotation of TURNS) {
        const p = kitOf(e, rotation, 'S');
        const dock = p.lot?.dock;
        if (!dock) continue;
        const alongZ = p.topBox.d > p.topBox.w;
        const toward = alongZ ? dock.z : dock.x;
        if (Math.abs(toward) <= 1) continue;
        for (const u of only(p, 'rooftopUnit')) {
          const at = alongZ ? u.offset[2] : u.offset[0];
          expect(Math.sign(at) * Math.sign(toward), `${e.id} ${rotation}`).toBeGreaterThanOrEqual(
            0,
          );
        }
      }
    }
  });
});

describe('rooftop units', () => {
  const withUnits = commercial.filter((e) => partsFor(e).includes('rooftopUnit'));

  it('stands one per 232 m² of the top floor, at least one and at most eight, with a hatch', () => {
    expect(withUnits.length).toBeGreaterThan(0);
    const counts: number[] = [];
    for (const e of withUnits) {
      const plan = southern(e);
      const units = only(plan, 'rooftopUnit');
      const area = plan.topBox.w * plan.topBox.d;
      expect(units.length, e.id).toBe(Math.min(8, Math.max(1, Math.ceil(area / 232))));
      expect(rooftopUnitCount(plan.topBox)).toBe(units.length);
      expect(only(plan, 'roofHatch'), e.id).toHaveLength(1);
      counts.push(units.length);
    }
    expect(Math.max(...counts)).toBe(8);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(1);
  });

  it('is a 1.95 × 1.22 m unit on a 0.36 m curb, spaced down the long axis 2 m inside the parapet, the hatch by the back parapet', () => {
    for (const e of withUnits) {
      const plan = southern(e);
      const roofY = plan.topBox.yOffset + plan.topBox.h;
      const alongZ = plan.topBox.d > plan.topBox.w;
      const units = only(plan, 'rooftopUnit').sort((a, b) =>
        alongZ ? a.offset[2] - b.offset[2] : a.offset[0] - b.offset[0],
      );
      const half = (alongZ ? plan.topBox.d : plan.topBox.w) / 2;
      units.forEach((u, i) => {
        expect(bottomOf(u)).toBeCloseTo(roofY, 9);
        expect(u.size[1]).toBeCloseTo(1.07 + 0.36, 9);
        expect(Math.max(u.size[0], u.size[2])).toBeCloseTo(1.95, 9);
        expect(Math.min(u.size[0], u.size[2])).toBeCloseTo(1.22, 9);
        const at = alongZ ? u.offset[2] : u.offset[0];
        expect(Math.abs(at) + 1.95 / 2, e.id).toBeLessThanOrEqual(half - 2 + 1e-9);
        if (i > 0) {
          const before = alongZ ? units[i - 1]!.offset[2] : units[i - 1]!.offset[0];
          expect(at - before, e.id).toBeGreaterThanOrEqual(1.95 - 1e-9);
        }
      });
      const [hatch] = only(plan, 'roofHatch');
      expect(hatch!.size).toEqual([0.9, 0.3, 0.76]);
      // The street is south, so the back parapet is the north one: the hatch stands 2 m in from it.
      expect(placementBounds(hatch!).z0 + plan.topBox.d / 2, e.id).toBeCloseTo(2, 9);
      for (const u of units)
        expect(overlap(placementBounds(hatch!), placementBounds(u))).toBe(false);
    }
  });

  it('gives a shop and a filling station’s kiosk one unit each, by the same rule', () => {
    expect(only(southern(byId('com-low-1')), 'rooftopUnit')).toHaveLength(1);
    expect(only(southern(byId('com-fuel-1')), 'rooftopUnit')).toHaveLength(1);
  });
});

describe('a filling station', () => {
  const station = southern(byId('com-fuel-1'));

  it('has its canopy’s underside at 4.27 m, a 0.91 m fascia round its edge, and four 0.4 m posts', () => {
    const canopy = only(station, 'fuelCanopy');
    const slab = canopy.find((p) => p.size[1] === 0.5)!;
    expect(bottomOf(slab)).toBeCloseTo(4.27, 9);
    const posts = canopy.filter((p) => p !== slab);
    expect(posts).toHaveLength(4);
    for (const post of posts) {
      expect(post.size[0]).toBeCloseTo(0.4, 9);
      expect(topOf(post)).toBeCloseTo(4.27, 9);
    }
    const fascia = only(station, 'fuelFascia');
    expect(fascia).toHaveLength(4);
    for (const f of fascia) {
      expect(f.size[1]).toBeCloseTo(0.91, 9);
      expect(bottomOf(f)).toBeCloseTo(4.27, 9);
      // Wrapped round the slab's edge, none of it across the deck.
      expect(overlap(placementBounds(f), placementBounds(slab))).toBe(false);
    }
  });

  it('has two islands 1.2 × 3.66 × 0.15 m, 7.6 m apart, each with two dispensers and a bollard at each end', () => {
    const islands = only(station, 'fuelIsland');
    expect(islands).toHaveLength(2);
    for (const island of islands) {
      expect(island.size[0]).toBeCloseTo(1.2, 9);
      expect(island.size[2]).toBeCloseTo(3.66, 9);
      expect(island.size[1]).toBeCloseTo(0.15, 9);
    }
    expect(Math.abs(islands[0]!.offset[0] - islands[1]!.offset[0])).toBeCloseTo(7.6, 9);
    const dispensers = only(station, 'dispenser');
    expect(dispensers).toHaveLength(4);
    for (const d of dispensers) {
      expect(d.size).toEqual([0.5, 1.9, 1]);
      expect(bottomOf(d)).toBeCloseTo(0.15, 9);
      expect(islands.some((i) => middleIn(placementBounds(d), placementBounds(i)))).toBe(true);
    }
    const bollards = only(station, 'bollard');
    expect(bollards).toHaveLength(4);
    for (const b of bollards) {
      expect(islands.some((i) => middleIn(placementBounds(b), placementBounds(i)))).toBe(true);
      expect(dispensers.some((d) => overlap(placementBounds(b), placementBounds(d)))).toBe(false);
    }
  });

  it('has a lit price sign, a 2.4 × 1.5 m panel on a 0.3 m pole to 6.1 m at the street, and an awning over the kiosk door', () => {
    const [panel] = only(station, 'priceSign');
    expect(topOf(panel!)).toBeCloseTo(6.1, 9);
    expect(panel!.size[0]).toBeCloseTo(2.4, 9);
    expect(panel!.size[1]).toBeCloseTo(1.5, 9);
    const [pole] = only(station, 'signPole');
    expect(pole!.size[0]).toBeCloseTo(0.3, 9);
    expect(topOf(pole!)).toBeCloseTo(6.1 - 1.5, 9);
    expect(LIT_PARTS.has('priceSign')).toBe(true);
    expect(only(station, 'awning')).toHaveLength(1);
  });
});

describe('an office and a hotel', () => {
  it('has a lit lobby portal 4 m wide and 4.5 m tall, projecting 1.5 m', () => {
    for (const id of ['com-high-1', 'com-office-2', 'com-high-2']) {
      const plan = southern(byId(id));
      const [portal] = only(plan, 'lobbyPortal');
      expect(portal!.size).toEqual([4, 4.5, 1.5]);
      expect(bottomOf(portal!)).toBeCloseTo(0, 9);
      expect(placementBounds(portal!).z0).toBeCloseTo(plan.baseBox.d / 2, 9);
    }
    expect(LIT_PARTS.has('lobbyPortal')).toBe(true);
  });

  it('puts rooftop units on levels one and two and a screened cooling tower on the tower', () => {
    for (const id of ['com-high-1', 'com-office-2']) {
      const plan = southern(byId(id));
      expect(only(plan, 'rooftopUnit').length, id).toBeGreaterThan(0);
      expect(only(plan, 'roofScreen')).toEqual([]);
    }
    const tower = southern(byId('com-high-2'));
    expect(only(tower, 'rooftopUnit')).toEqual([]);
    const [screen] = only(tower, 'roofScreen');
    const [cooling] = only(tower, 'coolingTower');
    const roofY = tower.topBox.yOffset + tower.topBox.h;
    expect(screen!.size[1]).toBeCloseTo(3, 9);
    expect(bottomOf(screen!)).toBeCloseTo(roofY, 9);
    // Inset 2 m from the top tier's street edge, with the cooling tower behind it.
    expect(tower.topBox.d / 2 - placementBounds(screen!).z1).toBeCloseTo(2, 9);
    expect([...cooling!.size].sort((a, b) => a - b)).toEqual([3, 3, 6]);
    expect(cooling!.size[1]).toBeCloseTo(3, 9);
    expect(placementBounds(cooling!).z1).toBeLessThanOrEqual(placementBounds(screen!).z0 + 1e-9);
  });

  it('has a porte-cochere on four 0.4 m columns, a 0.6 m slab 6.1 × 6 m with its underside at 4.27 m', () => {
    for (const id of ['com-hotel-1', 'com-hotel-2', 'com-hotel-3']) {
      const plan = southern(byId(id));
      const parts = only(plan, 'porteCochere');
      const slab = parts.find((p) => p.size[1] === 0.6)!;
      expect(slab.size).toEqual([6.1, 0.6, 6]);
      expect(bottomOf(slab)).toBeCloseTo(4.27, 9);
      const columns = parts.filter((p) => p !== slab);
      expect(columns).toHaveLength(4);
      for (const c of columns) {
        expect(c.size[0]).toBeCloseTo(0.4, 9);
        expect(topOf(c)).toBeCloseTo(4.27, 9);
      }
      expect(only(plan, 'canopy')).toEqual([]);
    }
  });
});

describe('a restaurant’s drive-through', () => {
  const restaurants = commercial.filter((e) => e.kind === 'restaurant');
  const plans = restaurants.flatMap((e) =>
    TURNS.flatMap((rotation) =>
      STREET_SIDES.map((side) => ({ e, rotation, side, plan: kitOf(e, rotation, side) })),
    ),
  );
  const laned = plans.filter((p) => p.plan.lot?.lane);
  const LANE_PARTS: BuildingPart[] = [
    'menuBoard',
    'clearanceBar',
    'pickupCanopy',
    'dumpsterEnclosure',
  ];

  it('is drawn where the lot leaves the lane room, and not where it does not', () => {
    expect(laned.length).toBeGreaterThan(0);
    expect(plans.length - laned.length).toBeGreaterThan(0);
    for (const { plan } of laned) {
      for (const part of LANE_PARTS.slice(0, 3)) expect(only(plan, part).length).toBeGreaterThan(0);
    }
    for (const { e, rotation, side, plan } of plans.filter((p) => !p.plan.lot?.lane)) {
      for (const part of LANE_PARTS) {
        expect(only(plan, part), `${e.id} ${rotation}${side}`).toEqual([]);
      }
    }
  });

  it('draws nothing of it for a restaurant given no lot', () => {
    const e = byId('com-restaurant-3-lot6x2');
    const body: SetbackBox = { w: 24, d: 24, h: 7.5, yOffset: 0 };
    const placed = computePartPlacements(e, body, body, 'S', null);
    for (const part of LANE_PARTS) expect(placed.filter((p) => p.part === part)).toEqual([]);
    expect(placed.filter((p) => p.part === 'awning').length).toBeGreaterThan(0);
  });

  it('stands a menu board 1.8 m wide and 2.1 m tall at the head of a six-car stack, in the lane', () => {
    for (const { e, plan } of laned) {
      const lane = plan.lot!.lane!;
      const [board] = only(plan, 'menuBoard');
      expect(Math.max(board!.size[0], board!.size[2]), e.id).toBeCloseTo(1.8, 9);
      expect(topOf(board!)).toBeCloseTo(2.1, 9);
      const head = alongPath(lane.path, Math.max(1.8, lane.length - DRIVE_THROUGH_STACK_M)).at;
      const [bx, bz] = [board!.offset[0], board!.offset[2]];
      expect(Math.hypot(bx - head.x, bz - head.z), e.id).toBeLessThanOrEqual(1.83 + 1e-9);
      expect(lane.rects.some((r) => bx > r.x0 && bx < r.x1 && bz > r.z0 && bz < r.z1)).toBe(true);
    }
  });

  it('puts a clearance bar at 2.74 m over the lane’s entry and a 1.8 × 2.7 m canopy at 3.0 m over the pickup window', () => {
    for (const { e, plan } of laned) {
      const [bar] = only(plan, 'clearanceBar');
      expect(bottomOf(bar!), e.id).toBeCloseTo(2.74, 9);
      expect(Math.max(bar!.size[0], bar!.size[2])).toBeCloseTo(3.66, 9);
      const [canopy] = only(plan, 'pickupCanopy');
      expect(bottomOf(canopy!)).toBeCloseTo(3, 9);
      expect(Math.min(canopy!.size[0], canopy!.size[2])).toBeCloseTo(1.8, 9);
      expect(Math.max(canopy!.size[0], canopy!.size[2])).toBeCloseTo(2.7, 9);
      const lane = plan.lot!.lane!;
      expect(lane.rects.some((r) => overlap(r, placementBounds(canopy!)))).toBe(true);
    }
  });

  it('stands a 3.66 × 3.05 m dumpster enclosure in 1.83 m masonry walls, clear of the lane and the car park', () => {
    const withDumpster = laned.filter((p) => only(p.plan, 'dumpsterEnclosure').length > 0);
    expect(withDumpster.length).toBeGreaterThan(0);
    for (const { e, plan } of withDumpster) {
      const walls = only(plan, 'dumpsterEnclosure');
      expect(walls).toHaveLength(3);
      for (const w of walls) expect(w.size[1], e.id).toBeCloseTo(1.83, 9);
      const b = boundsOf(walls);
      const dims = [b.x1 - b.x0, b.z1 - b.z0].sort((a, c) => a - c);
      expect(dims[0]).toBeCloseTo(3.05, 9);
      expect(dims[1]).toBeCloseTo(3.66, 9);
      for (const t of plan.lot!.taken) expect(overlap(t, b), e.id).toBe(false);
    }
  });
});

describe('the storefront kit on the map', () => {
  const road = (x: number, z: number): boolean => z === 40 && x >= 0 && x < 300;
  /** One of each kind, each fronting the street along z = 40. */
  const row = commercial.filter((e) => e.bodyFootprint === undefined);
  const inst = (
    e: BuildingCatalogEntry,
    i: number,
    state: BuildingState = BuildingState.Active,
  ): BuildingInstance =>
    ({
      id: i + 1,
      catalogId: e.id,
      x: i * 8,
      z: 40 - footprintForRotation(e, 0).d,
      rotation: 0,
      level: e.level ?? 1,
      state,
      problems: 0,
    }) as BuildingInstance;
  const make = (): BuildingKitRenderer =>
    new BuildingKitRenderer(new THREE.Scene(), () => 0, commercial, road);
  const allParts = [...new Set(row.flatMap((e) => partsFor(e)))];

  it('draws the lit parts on the lit material and nothing else on it', () => {
    const r = make();
    r.apply({ added: row.map((e, i) => inst(e, i)), updated: [], removed: [] });
    const lit = r.litMaterialOf();
    for (const part of allParts) {
      const material = r.materialOf(part);
      if (!material) continue;
      expect(material === lit, part).toBe(LIT_PARTS.has(part));
    }
    for (const part of LIT_PARTS) expect(r.instanceCount(part), part).toBeGreaterThan(0);
  });

  it('glows the lit parts at a daytime floor, rising to full at night, and only them', () => {
    const r = make();
    r.apply({ added: row.map((e, i) => inst(e, i)), updated: [], removed: [] });
    expect(r.litIntensity()).toBe(LIT_DAY_FLOOR);
    r.setNightFactor(0);
    expect(r.litIntensity()).toBe(LIT_DAY_FLOOR);
    r.setNightFactor(1);
    expect(r.litIntensity()).toBe(1);
    r.setNightFactor(0.25);
    expect(r.litIntensity()).toBeCloseTo(LIT_DAY_FLOOR + (1 - LIT_DAY_FLOOR) * 0.25, 9);
    r.setNightFactor(7);
    expect(r.litIntensity()).toBe(1);
    expect(LIT_DAY_FLOOR).toBeGreaterThan(0);
    expect(LIT_DAY_FLOOR).toBeLessThan(1);
    for (const part of allParts) {
      const material = r.materialOf(part) as THREE.MeshLambertMaterial | undefined;
      if (!material || LIT_PARTS.has(part)) continue;
      expect(material.emissive.getHex(), part).toBe(0);
    }
  });

  it('stands no part, lit or not, on a building that is not Active, so a dark building has no lit sign', () => {
    const strip = byId('com-strip-1');
    const r = make();
    r.apply({ added: [inst(strip, 0, BuildingState.Constructing)], updated: [], removed: [] });
    expect(r.partCountFor(1)).toBe(0);
    r.apply({ added: [], updated: [inst(strip, 0)], removed: [] });
    expect(r.instanceCount('signageBand')).toBeGreaterThan(0);
    r.apply({ added: [], updated: [inst(strip, 0, BuildingState.Abandoned)], removed: [] });
    expect(r.partCountFor(1)).toBe(0);
    expect(r.instanceCount('signageBand')).toBe(0);
  });

  it('frees every part of a building when it is removed', () => {
    const r = make();
    r.apply({ added: row.map((e, i) => inst(e, i)), updated: [], removed: [] });
    expect(r.trackedIds().length).toBeGreaterThan(0);
    r.apply({ added: [], updated: [], removed: row.map((_, i) => i + 1) });
    expect(r.trackedIds()).toEqual([]);
    for (const part of allParts) expect(r.instanceCount(part), part).toBe(0);
  });
});
