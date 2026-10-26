import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { footprintForRotation } from '../shared/footprint';
import { DRIVE_THROUGH_STACK_M } from '../shared/lotlayout';
import { isApartmentEntry, partsFor, type BuildingPart } from './archetypes';
import {
  alongPath,
  BuildingKitRenderer,
  computePartPlacements,
  DOOR_COUNT,
  kitPlanFor,
  LIT_DAY_FLOOR,
  LIT_WARM_SHIFT,
  LIT_PARTS,
  downspoutPositions,
  placementBounds,
  rooftopUnitCount,
  serviceDoorCount,
  type KitLot,
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
  BALCONY_DEPTH_M,
  BLOCK_BALCONY_SLAB_M,
  BLOCK_PARAPET_M,
  BOX_BAY_DARKEN,
  BOX_BAY_PROUD_M,
  BREEZEWAY_PROUD_M,
  BREEZEWAY_WIDTH_M,
  BRICK_PIER_M,
  BULKHEAD_HEIGHT_M,
  ELEVATOR_BULKHEAD_SIZE_M,
  ENTRY_HOOD_SIZE_M,
  ENTRY_HOOD_UNDERSIDE_M,
  GUARD_HEIGHT_M,
  HIP_EAVE_M,
  HIP_PITCH,
  HIP_RISE_CAP_M,
  LANDING_DEPTH_M,
  LANDING_THICKNESS_M,
  MAIL_KIOSK_SIZE_M,
  PENTHOUSE_HEIGHT_M,
  PENTHOUSE_PLATE_SHARE,
  ROOF_SETBACK_FROM_STREET_M,
  STAIR_PITCH,
  STOOP_DEPTH_M,
  STOOP_RISE_M,
  STOOP_WIDTH_M,
  STOREFRONT_GLAZING_M,
  TOWER_BALCONY_END_M,
  WALK_UP_BALCONY_SLAB_M,
  WALK_UP_BRICK_BASE_HEIGHT_M,
  WALK_UP_BRICK_BASE_PROUD_M,
  windowBays,
  storeysOf,
  stripTenants,
  ACCENT_BAND_M,
  BASE_BAND_M,
  CORNICE_HEIGHT_M,
  DOCK_SCREEN_M,
  FUEL_FASCIA_HEIGHT_M,
  LOBBY_HEIGHT_M,
  MANSARD_BAND_M,
  MENU_BOARD_HEIGHT_M,
  PARAPET_STEP_M,
  PORTE_COCHERE_UNDERSIDE_M,
  RIBBON_BAND_M,
  SIGN_HEIGHT_M,
  SPANDREL_BAND_M,
  STRIP_CANOPY_FASCIA_M,
  TOWER_OVER_PARAPET_M,
  BAGHOUSE_HEIGHT_M,
  BAGHOUSE_SIZE_M,
  CHEM_COOLING_TOWER_SIZE_M,
  CHIP_PILE_DIAMETER_M,
  CHIP_PILE_HEIGHT_M,
  CONDENSER_SIZE_M,
  condenserCount,
  COOLING_FAN_M,
  FACTORY_SILO_HEIGHT_M,
  FLARE_HEIGHT_M,
  FLARE_TIP_M,
  FOOD_PENTHOUSE_SIZE_M,
  FOOD_SILO_HEIGHT_M,
  GANTRY_HEIGHT_M,
  GUARD_BOOTH_SIZE_M,
  MELT_RIDGE_VENT_M,
  MELT_STACK_HEIGHT_M,
  PANEL_REVEAL_SPACING_M,
  RACK_CLEAR_M,
  RECOVERY_STACK_HEIGHT_M,
  SCRAP_YARD_SIZE_M,
  SILO_DIAMETER_M,
  STACK_HEIGHT_M,
  TILT_BAND_M,
  TRAILER_DOOR_STEP,
  TRAILER_SIZE_M,
  WAINSCOT_HEIGHT_M,
  YARD_FENCE_M,
} from './buildingkit';
import { computeSetbacks, type SetbackBox } from './massing';
import { bodyMetresFor } from '../shared/floorarea';
import { WALK_UP_REAR_YARD_M } from '../shared/parkingcode';
import { deriveFacadeParams, FLOOR_HEIGHT_METERS, type RGB } from './facade';
import {
  materialUnit,
  SATURATED,
  saturatedUnit,
  type MaterialName,
  type SaturatedName,
} from './palette';
import { trimColor } from './houses';
import type { Side } from './frontage';
import {
  BuildingState,
  ZoneType,
  type BuildingCatalogEntry,
  type BuildingInstance,
} from '../shared/types';

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

  // A workshop's doors are counted by its frontage now (one per 6 m, at most four),
  // so the 40 m face here holds four and a walk door; they still stand on the ground.
  it("stands a workshop's roller doors on the ground, since it has no dock", () => {
    const workshop = entry({ kind: 'workshop', level: 1, pollution: 20 });
    const placed = computePartPlacements(workshop, base, top, 'S');
    const doors = placed.filter((p) => p.part === 'rollUpDoors');
    expect(doors).toHaveLength(4);
    for (const door of doors) expect(door.offset[1] - door.size[1] / 2).toBeCloseTo(0, 9);
    expect(partsOf(placed)).not.toContain('loadingDock');
  });

  it("puts a plant's tank farm in the yard behind it, off the wall opposite the street", () => {
    const plant = entry({ kind: 'chemical', level: 1, pollution: 120 });
    for (const [side, sign] of [
      ['S', -1],
      ['N', 1],
    ] as const) {
      // The yard has more than the farm now: only the tanks are counted here.
      const tanks = computePartPlacements(plant, base, top, side).filter((p) => p.part === 'tanks');
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
/** The Industrial and Heavy Industrial zones' kinds; a farm has its own kit. */
const industrial = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter(
  (e) => e.category === 'ind' && e.zone !== ZoneType.Agriculture,
);
/** The four apartment kinds at every level. */
const apartments = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter((e) =>
  isApartmentEntry(e),
);

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

/** The saturated chart entry an instance colour is, or null for any other colour. */
const accentNames = (color: RGB | undefined): SaturatedName | null => {
  if (!color) return null;
  const same = (a: RGB, b: RGB): boolean => a.every((c, i) => Math.abs(c - b[i]!) < 1e-9);
  const name = (Object.keys(SATURATED) as SaturatedName[]).find((n) =>
    same(saturatedUnit(n), color),
  );
  return name ?? null;
};

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
          } else if (p.part === 'anchorParapet' || p.part === 'parapetStep') {
            if (Math.abs(bottomOf(p) - baseTop) > 1e-6) inside.push(label);
          } else if (p.part === 'ribbonBand') {
            // A ribbon band is a ring round its tier: on the base tier it holds the body, never sits inside it.
            const ring = placementBounds(p);
            const holds =
              ring.x0 <= body.x0 && ring.x1 >= body.x1 && ring.z0 <= body.z0 && ring.z1 >= body.z1;
            if (!holds && bottomOf(p) < baseTop - 1e-6) inside.push(label);
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

  it('has an awning every 1.5 m storefront bay, 1.5 m out, their underside at 2.45 m, and no flat canopy', () => {
    const awnings = only(shop, 'awning');
    expect(awnings.length).toBe(Math.round(shop.baseBox.w / 1.5));
    expect(awnings.length).toBeGreaterThan(2);
    for (const a of awnings) {
      expect(bottomOf(a)).toBeCloseTo(2.45, 9);
      expect(a.size[2]).toBeCloseTo(1.5, 9);
      expect(placementBounds(a).z0).toBeCloseTo(shop.baseBox.d / 2, 9);
    }
    expect(only(shop, 'canopy')).toEqual([]);
  });

  it('hangs its awnings in one of three liveries by building id, never the kit’s default red', () => {
    const liveries = ['greenPlaster', 'redPlaster', 'darkWood'].map((m) =>
      materialUnit(m as MaterialName),
    );
    const seen = new Set<string>();
    for (const id of [1, 2, 3, 4, 5, 6]) {
      const plan = kitPlanFor(
        byId('com-low-1'),
        { id, x: 10, z: 10, rotation: 0 },
        streetOn('S', 1, 1),
      )!;
      const colours = new Set(only(plan, 'awning').map((a) => JSON.stringify(a.color)));
      expect(colours.size).toBe(1);
      const [colour] = colours;
      expect(liveries.map((l) => JSON.stringify(l))).toContain(colour);
      seen.add(colour!);
    }
    expect(seen.size).toBe(3);
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

  it('has a 0.6 m bulkhead along the foot of the street face, and a cornice 0.5 m deep and 0.5 m tall at the parapet', () => {
    const [bulkhead] = only(shop, 'bulkhead');
    expect(bulkhead!.size[1]).toBeCloseTo(0.6, 9);
    expect(bottomOf(bulkhead!)).toBeCloseTo(0, 9);
    expect(bulkhead!.size[0]).toBeCloseTo(shop.baseBox.w, 9);
    const [cornice] = only(shop, 'cornice');
    expect(cornice!.size[2]).toBeCloseTo(0.5, 9);
    expect(cornice!.size[1]).toBeCloseTo(0.5, 9);
    expect(topOf(cornice!)).toBeCloseTo(shop.baseBox.h, 9);
  });

  it('signs 60% of its frontage in a band 1.2 m tall above the awnings and under the cornice, in the tenant’s accent', () => {
    const [band] = only(shop, 'signageBand');
    expect(band!.size[0]).toBeCloseTo(shop.baseBox.w * 0.6, 9);
    expect(band!.size[1]).toBeCloseTo(1.2, 9);
    expect(band!.offset[1]).toBeCloseTo(3.5, 9);
    const [cornice] = only(shop, 'cornice');
    expect(bottomOf(cornice!)).toBeGreaterThanOrEqual(topOf(band!) - 0.2);
    expect(accentNames(band!.color)).not.toBeNull();
  });
});

/** The identifying parts the art table names per commercial kind, each sized to read at 40 m. */
const IDENTIFYING_PARTS: Readonly<Record<string, readonly BuildingPart[]>> = {
  shop: ['bulkhead', 'awning', 'signageBand', 'cornice'],
  strip: ['stripCanopy', 'baseBand', 'signageBand', 'anchorParapet', 'parapetStep', 'pylon'],
  supermarket: ['entryTower', 'baseBand', 'cartCorral', 'dockScreen', 'signageBand'],
  restaurant: ['featureWall', 'menuBoard', 'accentBand', 'pylon', 'mansardBand'],
  fuel: ['fuelFascia', 'priceSign'],
  office: ['ribbonBand', 'lobbyPortal'],
  hotel: ['baseBand', 'porteCochere', 'signageBand'],
};

describe('the second pass: what tells the kinds apart at 40 m', () => {
  it('maps every identifying part the art table names onto its kind', () => {
    for (const [kind, parts] of Object.entries(IDENTIFYING_PARTS)) {
      const e = commercial.find((c) => c.kind === kind && (c.level ?? 1) === 1)!;
      for (const part of parts) expect(partsFor(e), `${kind} ${part}`).toContain(part);
    }
  });

  it('sizes each identifying part to its art figure, none under 0.5 m', () => {
    expect(SIGN_HEIGHT_M).toBe(1.2);
    expect(STRIP_CANOPY_FASCIA_M).toBe(0.9);
    expect(PARAPET_STEP_M).toBe(1.2);
    expect(BASE_BAND_M).toEqual({ strip: 1.2, supermarket: 2.4, hotel: 1.2 });
    expect(DOCK_SCREEN_M).toBe(1.8);
    expect(MENU_BOARD_HEIGHT_M).toBe(2.4);
    expect(ACCENT_BAND_M).toBe(0.6);
    expect(MANSARD_BAND_M).toBe(1.5);
    expect(FUEL_FASCIA_HEIGHT_M).toBe(0.76);
    expect(PORTE_COCHERE_UNDERSIDE_M).toBeGreaterThanOrEqual(4.1);
    expect(RIBBON_BAND_M).toBe(1.2);
    expect(SPANDREL_BAND_M).toBe(1);
    expect(CORNICE_HEIGHT_M).toBe(0.5);
    expect(TOWER_OVER_PARAPET_M).toBe(FLOOR_HEIGHT_METERS);
    expect(LOBBY_HEIGHT_M).toBe(2 * FLOOR_HEIGHT_METERS);
  });

  it('stands every identifying part on a south-fronting example of each kind, given a lot with room for its lane and drive', () => {
    const examples: Record<string, string> = {
      shop: 'com-low-1',
      strip: 'com-strip-1',
      supermarket: 'com-market-1',
      restaurant: 'com-restaurant-1-lot2x2',
      fuel: 'com-fuel-1',
      office: 'com-high-1',
      hotel: 'com-hotel-1',
    };
    for (const [kind, parts] of Object.entries(IDENTIFYING_PARTS)) {
      const e = byId(examples[kind]!);
      const plan = southern(e);
      for (const part of parts)
        expect(only(plan, part).length, `${e.id} ${part}`).toBeGreaterThan(0);
    }
  });
});

describe('a shopping strip', () => {
  const strip = southern(byId('com-strip-1'));
  const span = strip.baseBox.w;

  it('has one canopy the length of its frontage, 2.1 m deep with a 0.9 m fascia, its underside at 2.75 m, on 0.3 m columns no more than 6 m apart', () => {
    const [canopy] = only(strip, 'stripCanopy');
    expect(canopy!.size[0]).toBeCloseTo(span, 9);
    expect(canopy!.size[2]).toBeCloseTo(2.1, 9);
    expect(canopy!.size[1]).toBeCloseTo(0.9, 9);
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

  it('steps the parapet up 1.2 m over every other tenant’s entry, 80% of its bay wide, with the tenant’s 1.2 m band in the step, each in its own accent', () => {
    const tenants = stripTenants(span, strip.lot, 'S');
    const steps = only(strip, 'parapetStep').sort((a, b) => a.offset[0] - b.offset[0]);
    expect(steps).toHaveLength(tenants.length - 1);
    for (const step of steps) {
      expect(step.size[1]).toBeCloseTo(1.2, 9);
      expect(bottomOf(step)).toBeCloseTo(strip.baseBox.h, 9);
      const tenant = tenants.find((t) => Math.abs(t.along - step.offset[0]) < 1e-9)!;
      expect(step.size[0]).toBeCloseTo(tenant.width * 0.8, 9);
    }
    const bands = only(strip, 'signageBand');
    expect(bands).toHaveLength(tenants.length);
    for (const band of bands) {
      expect(band.size[1]).toBeCloseTo(1.2, 9);
      expect(bottomOf(band)).toBeCloseTo(strip.baseBox.h, 9);
      expect(placementBounds(band).z0).toBeCloseTo(strip.baseBox.d / 2, 9);
    }
    expect(new Set(bands.map((b) => JSON.stringify(b.color))).size).toBeGreaterThan(1);
  });

  it('runs a 1.2 m split-face base band along its frontage, and glows its pylon cabinet in the tenant’s accent', () => {
    const [base] = only(strip, 'baseBand');
    expect(base!.size[0]).toBeCloseTo(span, 9);
    expect(base!.size[1]).toBeCloseTo(1.2, 9);
    expect(bottomOf(base!)).toBeCloseTo(0, 9);
    expect(base!.color).toBeUndefined();
    const [cabinet] = only(strip, 'pylon');
    expect(accentNames(cabinet!.color)).not.toBeNull();
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

  it('has an entry tower 6 × 4 m rising a full storey over the parapet, proud of the wall, in the tenant’s accent', () => {
    const [tower] = only(plan, 'entryTower');
    expect(tower!.size[0]).toBeCloseTo(6, 9);
    expect(tower!.size[2]).toBeCloseTo(4, 9);
    expect(topOf(tower!)).toBeCloseTo(market.height + FLOOR_HEIGHT_METERS, 9);
    expect(bottomOf(tower!)).toBeCloseTo(0, 9);
    expect(placementBounds(tower!).z1).toBeGreaterThan(plan.baseBox.d / 2);
    expect(accentNames(tower!.color)).not.toBeNull();
    const [band] = only(plan, 'signageBand');
    expect(band!.size[1]).toBeCloseTo(1.2, 9);
    expect(band!.color).toEqual(tower!.color);
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

  it('glazes the tower’s face only, and runs a 2.4 m split-face base across the rest of the street face', () => {
    const [tower] = only(plan, 'entryTower');
    const [glazing] = only(plan, 'towerGlazing');
    expect(placementBounds(glazing!).z0).toBeCloseTo(placementBounds(tower!).z1, 9);
    expect(glazing!.size[0]).toBeLessThanOrEqual(6);
    const base = only(plan, 'baseBand');
    for (const b of base) {
      expect(b.size[1]).toBeCloseTo(2.4, 9);
      expect(b.size[2]).toBeCloseTo(0.1, 9);
      expect(bottomOf(b)).toBeCloseTo(0, 9);
    }
    expect(base.reduce((sum, b) => sum + b.size[0], 0)).toBeCloseTo(span - 6, 9);
    expect(only(plan, 'brickBase')).toEqual([]);
  });

  it('stands a 1.8 m screen wall up to 8 m long by the berths, within 12 m of them, clear of the body and of every stall, aisle and berth', () => {
    let stood = 0;
    for (const e of commercial.filter((c) => c.kind === 'supermarket')) {
      for (const side of STREET_SIDES) {
        const p = kitOf(e, 0, side);
        const [screen] = only(p, 'dockScreen');
        const dock = p.lot!.dock;
        if (!dock) {
          expect(screen, `${e.id} ${side}`).toBeUndefined();
          continue;
        }
        expect(screen, `${e.id} ${side}`).toBeDefined();
        stood += 1;
        expect(screen!.size[1]).toBeCloseTo(1.8, 9);
        expect(bottomOf(screen!)).toBeCloseTo(0, 9);
        const length = Math.max(screen!.size[0], screen!.size[2]);
        expect(length).toBeLessThanOrEqual(8 + 1e-9);
        expect(length).toBeGreaterThanOrEqual(3);
        expect(Math.min(screen!.size[0], screen!.size[2])).toBeCloseTo(0.2, 9);
        expect(
          Math.hypot(screen!.offset[0] - dock.x, screen!.offset[2] - dock.z),
        ).toBeLessThanOrEqual(12 * Math.SQRT2);
        const b = placementBounds(screen!);
        const body = {
          x0: -p.baseBox.w / 2,
          x1: p.baseBox.w / 2,
          z0: -p.baseBox.d / 2,
          z1: p.baseBox.d / 2,
        };
        expect(overlap(b, body)).toBe(false);
        for (const t of p.lot!.taken) expect(overlap(t, b), `${e.id} ${side}`).toBe(false);
      }
    }
    expect(stood).toBeGreaterThan(0);
    expect(only(plan, 'dockScreen')).toHaveLength(1);
  });

  it('stands two cart corrals 3.66 × 1.52 m with rails at least 0.9 m and a 2.3 m sign post, in planted islands by the entrance', () => {
    const rails = only(plan, 'cartCorral');
    expect(rails).toHaveLength(6);
    const posts = only(plan, 'signPole');
    expect(posts).toHaveLength(2);
    for (const post of posts) expect(topOf(post)).toBeCloseTo(2.3, 9);
    for (let i = 0; i < 2; i += 1) {
      const corral = rails.slice(i * 3, i * 3 + 3);
      for (const r of corral) {
        expect(topOf(r)).toBeCloseTo(1, 9);
        expect(topOf(r)).toBeGreaterThanOrEqual(0.9);
      }
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

  it('has its canopy’s underside at 4.27 m, a 0.76 m fascia round its edge in the brand’s accent, and four 0.4 m posts', () => {
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
      expect(f.size[1]).toBeCloseTo(0.76, 9);
      expect(bottomOf(f)).toBeCloseTo(4.27, 9);
      // Wrapped round the slab's edge, none of it across the deck.
      expect(overlap(placementBounds(f), placementBounds(slab))).toBe(false);
      expect(accentNames(f.color)).not.toBeNull();
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
  it('has a lit lobby portal 4 m wide and two storeys tall, projecting 1.5 m', () => {
    for (const id of ['com-high-1', 'com-office-2', 'com-high-2']) {
      const plan = southern(byId(id));
      const [portal] = only(plan, 'lobbyPortal');
      expect(portal!.size).toEqual([4, 2 * FLOOR_HEIGHT_METERS, 1.5]);
      expect(bottomOf(portal!)).toBeCloseTo(0, 9);
      expect(placementBounds(portal!).z0).toBeCloseTo(plan.baseBox.d / 2, 9);
    }
    expect(LIT_PARTS.has('lobbyPortal')).toBe(true);
  });

  it('bands an office at every floor line of every tier: a 1.2 m precast ring a floor on a block, a 1.0 m dark spandrel ring on the tower', () => {
    for (const id of ['com-high-1', 'com-office-2', 'com-high-2']) {
      const e = byId(id);
      const plan = southern(e);
      const { boxes } = computeSetbacks(e, 7, plan.frontage);
      const floors = boxes.reduce((n, box) => n + storeysOf(e, box).rows, 0);
      const bands = only(plan, 'ribbonBand').sort((a, b) => a.offset[1] - b.offset[1]);
      expect(bands.length, id).toBe(floors);
      const tower = id === 'com-high-2';
      const precast = ['precastGrey', 'precastBuff'].map((m) => materialUnit(m as MaterialName));
      for (const band of bands) {
        expect(band.size[1]).toBeCloseTo(tower ? 1 : 1.2, 9);
        if (tower) expect(band.color).toEqual(materialUnit('spandrelDark'));
        else expect(precast).toContainEqual(band.color);
        expect(band.color).toEqual(bands[0]!.color);
      }
      // The top band of each tier ends at that tier's top, wrapping the tier 0.1 m proud.
      for (const box of boxes) {
        const top = box.yOffset + box.h;
        const ring = bands.find((b) => Math.abs(topOf(b) - top) < 1e-6)!;
        expect(ring, `${id} tier at ${top}`).toBeDefined();
        expect(ring.size[0]).toBeCloseTo(box.w + 0.2, 9);
        expect(ring.size[2]).toBeCloseTo(box.d + 0.2, 9);
      }
    }
    // Grey or buff by building id: two neighbours differ.
    const other = kitPlanFor(
      byId('com-high-1'),
      { id: 8, x: 10, z: 10, rotation: 0 },
      streetOn('S', 2, 2),
    )!;
    expect(only(other, 'ribbonBand')[0]!.color).not.toEqual(
      only(southern(byId('com-high-1')), 'ribbonBand')[0]!.color,
    );
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
      expect(bottomOf(slab)).toBeGreaterThanOrEqual(4.1);
      expect(only(plan, 'canopy')).toEqual([]);
    }
  });

  it('gives a hotel a 1.2 m stone base band along its frontage and a 1.2 m sign band on the top floor of its top tier, navy or green', () => {
    for (const id of ['com-hotel-1', 'com-hotel-2', 'com-hotel-3']) {
      const plan = southern(byId(id));
      const [base] = only(plan, 'baseBand');
      expect(base!.size[1]).toBeCloseTo(1.2, 9);
      expect(base!.size[0]).toBeCloseTo(plan.baseBox.w, 9);
      expect(bottomOf(base!)).toBeCloseTo(0, 9);
      expect(base!.color).toEqual(materialUnit('stoneVeneer'));
      const [band] = only(plan, 'signageBand');
      const roofY = plan.topBox.yOffset + plan.topBox.h;
      const floor = storeysOf(byId(id), plan.topBox).pitch;
      expect(band!.size[1]).toBeCloseTo(1.2, 9);
      expect(band!.offset[1]).toBeCloseTo(roofY - floor / 2, 9);
      expect(placementBounds(band!).z0).toBeCloseTo(plan.topBox.d / 2, 9);
      expect(['navyAccent', 'greenAccent']).toContain(accentNames(band!.color));
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

  it('stands a menu board 1.8 m wide and 2.4 m tall at the head of a six-car stack, in the lane', () => {
    for (const { e, plan } of laned) {
      const lane = plan.lot!.lane!;
      const [board] = only(plan, 'menuBoard');
      expect(Math.max(board!.size[0], board!.size[2]), e.id).toBeCloseTo(1.8, 9);
      expect(topOf(board!)).toBeCloseTo(2.4, 9);
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

  it('darkens the drive-through end of the body as a feature wall its full height, on the pickup wall where there is a lane', () => {
    for (const { e, plan } of laned) {
      const [wall] = only(plan, 'featureWall');
      expect(wall, e.id).toBeDefined();
      expect(wall!.size[1]).toBeCloseTo(plan.topBox.yOffset + plan.topBox.h, 9);
      expect(bottomOf(wall!)).toBeCloseTo(0, 9);
      expect(Math.min(wall!.size[0], wall!.size[2])).toBeCloseTo(0.1, 9);
      const f = plan.lot!.lane!.pickupFacing;
      const b = placementBounds(wall!);
      const onPickupWall =
        Math.abs(f.x) > Math.abs(f.z)
          ? Math.abs((f.x > 0 ? b.x0 : b.x1) - (f.x * plan.baseBox.w) / 2) < 1e-6
          : Math.abs((f.z > 0 ? b.z0 : b.z1) - (f.z * plan.baseBox.d) / 2) < 1e-6;
      expect(onPickupWall, e.id).toBe(true);
    }
  });

  it('caps the parapet on every face with a 0.6 m red band and a 0.2 m yellow stripe over it', () => {
    for (const { e, plan } of plans) {
      const bands = only(plan, 'accentBand');
      expect(bands, e.id).toHaveLength(8);
      const roofY = plan.topBox.yOffset + plan.topBox.h;
      const red = bands.filter((b) => accentNames(b.color) === 'red');
      const yellow = bands.filter((b) => accentNames(b.color) === 'yellow');
      expect(red).toHaveLength(4);
      expect(yellow).toHaveLength(4);
      for (const b of red) {
        expect(b.size[1]).toBeCloseTo(0.6, 9);
        expect(bottomOf(b)).toBeCloseTo(roofY, 9);
      }
      for (const b of yellow) {
        expect(b.size[1]).toBeCloseTo(0.2, 9);
        expect(bottomOf(b)).toBeCloseTo(roofY + 0.6, 9);
      }
    }
  });

  it('wears the brown mansard band, 1.5 m tall round the parapet, at level 1 only', () => {
    for (const { e, plan } of plans) {
      const mansard = only(plan, 'mansardBand');
      if ((e.level ?? 1) >= 2) {
        expect(mansard, e.id).toEqual([]);
        continue;
      }
      expect(mansard, e.id).toHaveLength(4);
      const baseTop = plan.baseBox.yOffset + plan.baseBox.h;
      for (const m of mansard) {
        expect(m.pitch).toBeLessThan(0);
        // The slab's rise is the band's height.
        expect(m.size[2] * Math.sin(-m.pitch!)).toBeCloseTo(1.5, 9);
        expect(m.offset[1]).toBeCloseTo(baseTop - 0.75, 9);
        expect(m.color).toBeUndefined();
      }
    }
    // The sign hangs on the mansard, proud of its run.
    for (const { e, plan } of plans.filter((p) => p.rotation === 0 && p.side === 'S')) {
      if ((e.level ?? 1) >= 2) continue;
      const [band] = only(plan, 'signageBand');
      expect(placementBounds(band!).z0, e.id).toBeGreaterThan(plan.baseBox.d / 2 + 0.5);
    }
  });

  it('glows its sign band and pylon cabinet in fast food’s red', () => {
    for (const { e, plan } of plans) {
      for (const part of ['signageBand', 'pylon'] as const) {
        for (const p of only(plan, part))
          expect(accentNames(p.color), `${e.id} ${part}`).toBe('red');
      }
    }
  });
});

describe('the storefront and industrial kits on the map', () => {
  const road = (x: number, z: number): boolean => z === 40 && x >= 0 && x < 1000;
  /** One of each kind, commercial, industrial and apartment, each fronting the street along z = 40. */
  const row = [...commercial, ...industrial, ...apartments].filter(
    (e) => e.bodyFootprint === undefined,
  );
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
    new BuildingKitRenderer(new THREE.Scene(), () => 0, row, road);
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

  it('glows a lit part in its own livery, warm-shifted, never flat white', () => {
    const r = make();
    const lit = r.litMaterialOf() as MeshStandardNodeMaterial;
    expect(lit).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(lit.vertexColors).toBe(true);
    expect(lit.emissiveNode).not.toBeNull(); // the instance colour, shifted and scaled, not a flat emissive
    expect(lit.emissive.getHex()).toBe(0);
    const [red, green, blue] = LIT_WARM_SHIFT;
    expect(red).toBe(1);
    expect(green).toBeLessThan(red);
    expect(blue).toBeLessThan(green);
  });

  it('stands a wall-pack over every dock door and every walk door, on the lit material', () => {
    const r = make();
    r.apply({ added: row.map((e, i) => inst(e, i)), updated: [], removed: [] });
    expect(r.materialOf('dockLight')).toBe(r.litMaterialOf());
    const docks = row.filter((e) => partsFor(e).includes('dockShelter'));
    const walkDoors = row.filter((e) => partsFor(e).includes('walkDoor'));
    expect(docks.length + walkDoors.length).toBeGreaterThan(0);
    expect(r.instanceCount('dockLight')).toBeGreaterThanOrEqual(r.instanceCount('walkDoor'));
    // A workshop alone: one pack per walk door, nothing else lit on it.
    const workshop = row.find((e) => e.kind === 'workshop')!;
    const solo = make();
    solo.apply({ added: [inst(workshop, 0)], updated: [], removed: [] });
    expect(solo.instanceCount('dockLight')).toBe(solo.instanceCount('walkDoor'));
    expect(solo.instanceCount('walkDoor')).toBeGreaterThan(0);
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

// ---------------------------------------------------------------------------
// The industrial kit
// ---------------------------------------------------------------------------

const indById = (id: string): BuildingCatalogEntry => industrial.find((e) => e.id === id)!;

describe('the industrial kit: where every part stands', () => {
  const standing = industrial.filter((e) => e.bodyFootprint === undefined);

  it('stands every part inside its lot and above the ground, at every turn and street side', () => {
    const outside: string[] = [];
    for (const e of standing) {
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

  it('is the same every time', () => {
    for (const e of standing) expect(kitOf(e, 1, 'E')).toEqual(kitOf(e, 1, 'E'));
  });

  it('stands nothing against a wall where there is no street, only on the roof', () => {
    const roofOnly: readonly BuildingPart[] = [
      'monitorRoof',
      'roofArray',
      'ridgeVent',
      'clerestory',
      'penthouse',
    ];
    for (const e of standing) {
      const plan = kitPlanFor(e, { id: 7, x: 10, z: 10, rotation: 0 }, () => false)!;
      expect(
        plan.placements.filter((p) => !roofOnly.includes(p.part)),
        e.id,
      ).toEqual([]);
    }
  });
});

describe('a workshop and a factory', () => {
  it('cuts a workshop’s doors by its frontage: one 10 ft door per 6 m, at most four, and a walk door', () => {
    expect([8, 12, 20, 27.2, 40].map((s) => serviceDoorCount('workshop', s))).toEqual([
      1, 1, 2, 4, 4,
    ]);
    for (const id of ['ind-1', 'ind-workshop-2', 'ind-workshop-3']) {
      const plan = southern(indById(id));
      const doors = only(plan, 'rollUpDoors');
      expect(doors).toHaveLength(serviceDoorCount('workshop', plan.baseBox.w));
      for (const d of doors) {
        expect(d.size[0]).toBeCloseTo(3.05, 9);
        expect(d.size[1]).toBeCloseTo(3.05, 9);
        expect(bottomOf(d)).toBeCloseTo(0, 9);
      }
      const [walk] = only(plan, 'walkDoor');
      expect(walk!.size[0]).toBeCloseTo(0.9, 9);
      expect(walk!.size[1]).toBeCloseTo(2.1, 9);
      for (const d of doors) {
        expect(overlap(placementBounds(d), placementBounds(walk!))).toBe(false);
      }
    }
  });

  it('has a 2.4 m two-tone wainscot round every face, gutters along both eaves, a downspout at each corner and every 6 m, and a ridge vent', () => {
    // On a lot as wide as the body a wall on the lot line leaves the wainscot off it, so this one stands free.
    const plan = southern(indById('ind-workshop-2'));
    expect(only(plan, 'wainscot').length).toBeGreaterThan(0);
    const wide: SetbackBox = { w: 27.2, d: 27.2, h: 6.1, yOffset: 0 };
    const placed = computePartPlacements(indById('ind-workshop-2'), wide, wide, 'S', null);
    expect(placed.filter((p) => p.part === 'wainscot')).toHaveLength(4);
    const liveries = (['ribbedRed', 'ribbedSlate', 'ribbedGreen'] as const).map((n) =>
      materialUnit(n),
    );
    for (const w of placed.filter((p) => p.part === 'wainscot')) {
      expect(w.size[1]).toBeCloseTo(WAINSCOT_HEIGHT_M, 9);
      expect(liveries).toContainEqual(w.color);
    }
    // A factory's wainscot is the plate's own grey: no livery.
    const factoryPlan = southern(indById('ind-2'));
    for (const w of only(factoryPlan, 'wainscot')) expect(w.color).toBeUndefined();
    const gutters = only(plan, 'gutter');
    expect(gutters).toHaveLength(2);
    for (const g of gutters) expect(g.size[1]).toBeCloseTo(0.2, 9);
    const spouts = downspoutPositions(plan.baseBox.w);
    expect(spouts[0]).toBeCloseTo(-spouts[spouts.length - 1]!, 9);
    for (let i = 1; i < spouts.length; i += 1) {
      expect(spouts[i]! - spouts[i - 1]!).toBeLessThanOrEqual(6 + 1e-9);
    }
    expect(only(plan, 'downspout')).toHaveLength(2 * spouts.length);
    for (const s of only(plan, 'downspout')) {
      expect(Math.min(s.size[0], s.size[2])).toBeCloseTo(0.13, 9);
    }
    const [vent] = only(plan, 'ridgeVent');
    expect(bottomOf(vent!)).toBeCloseTo(plan.topBox.yOffset + plan.topBox.h, 9);
  });

  it('gives a factory two 12 ft doors, a walk door, and a lit clerestory 0.6 m tall down both sides of the monitor', () => {
    for (const id of ['ind-factory-1', 'ind-2', 'ind-factory-3']) {
      const plan = southern(indById(id));
      const doors = only(plan, 'rollUpDoors');
      expect(doors).toHaveLength(2);
      for (const d of doors) expect(d.size[0]).toBeCloseTo(3.66, 9);
      expect(only(plan, 'walkDoor')).toHaveLength(1);
      const bands = only(plan, 'clerestory');
      expect(bands).toHaveLength(2);
      for (const b of bands) expect(b.size[1]).toBeCloseTo(0.6, 9);
    }
    expect(LIT_PARTS.has('clerestory')).toBe(true);
  });

  it('gives a flex building an entry canopy 3 × 1.5 m at 3 m and a wainscot', () => {
    const plan = southern(indById('ind-flex-2'));
    const [canopy] = only(plan, 'entryCanopy');
    expect(canopy!.size[0]).toBeCloseTo(3, 9);
    expect(canopy!.size[2]).toBeCloseTo(1.5, 9);
    expect(bottomOf(canopy!)).toBeCloseTo(3, 9);
    expect(only(plan, 'wainscot').length).toBeGreaterThan(0);
  });
});

describe('a warehouse and a food plant', () => {
  const docked = industrial
    .filter(
      (e) => e.bodyFootprint === undefined && (e.kind === 'warehouse' || e.kind === 'foodplant'),
    )
    .flatMap((e) => TURNS.map((rotation) => ({ e, rotation, plan: kitOf(e, rotation, 'S') })));

  it('stands the dock bank on the loading side with doors 2.74 × 3.05 m at 4.3 m centres, each framed, bumped and lit', () => {
    let onSide = 0;
    for (const { e, plan } of docked) {
      const f = plan.lot!.loadingFacing;
      if (!f) continue;
      const alongX = Math.abs(f.x) > Math.abs(f.z);
      const doors = only(plan, 'rollUpDoors');
      const half = alongX ? plan.baseBox.w / 2 : plan.baseBox.d / 2;
      for (const d of doors) {
        const out = alongX ? Math.sign(f.x) * d.offset[0] : Math.sign(f.z) * d.offset[2];
        expect(out, e.id).toBeGreaterThan(half);
        expect(Math.max(d.size[0], d.size[2]), e.id).toBeCloseTo(2.74, 9);
        expect(d.size[1]).toBeCloseTo(3.05, 9);
      }
      const at = doors.map((d) => (alongX ? d.offset[2] : d.offset[0])).sort((a, b) => a - b);
      for (let i = 1; i < at.length; i += 1) expect(at[i]! - at[i - 1]!).toBeCloseTo(4.3, 9);
      expect(only(plan, 'dockShelter')).toHaveLength(3 * doors.length);
      expect(only(plan, 'dockBumper')).toHaveLength(2 * doors.length);
      expect(only(plan, 'dockLight')).toHaveLength(doors.length);
      onSide += 1;
    }
    expect(onSide).toBeGreaterThan(0);
  });

  it('keeps the dock on the street face where there are no berths, clear of the office corner', () => {
    const facing = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] } as const;
    for (const id of ['ind-warehouse-1', 'heavy-food-2']) {
      const e = indById(id);
      const body: SetbackBox = { w: 40.8, d: 40.8, h: e.height, yOffset: 0 };
      for (const side of STREET_SIDES) {
        const placed = computePartPlacements(e, body, body, side, null);
        const doors = placed.filter((p) => p.part === 'rollUpDoors');
        expect(doors.length).toBeGreaterThan(0);
        for (const d of doors) {
          const [fx, fz] = facing[side];
          expect(fx * d.offset[0] + fz * d.offset[2]).toBeGreaterThan(20.4);
        }
        const office = placed.find((p) => p.part === 'officeCorner')!;
        for (const d of doors) {
          expect(overlap(placementBounds(d), placementBounds(office))).toBe(false);
        }
      }
    }
  });

  it('carries an office corner 8 × 8 m, two storeys, on the lit material, with a canopy over its door', () => {
    const withOffice = docked.filter(({ plan }) => only(plan, 'officeCorner').length > 0);
    expect(withOffice.length).toBeGreaterThan(0);
    for (const { e, plan } of withOffice) {
      const [corner] = only(plan, 'officeCorner');
      expect(corner!.size[0], e.id).toBeCloseTo(8, 9);
      expect(corner!.size[2]).toBeCloseTo(8, 9);
      expect(corner!.size[1]).toBeGreaterThan(6);
      expect(only(plan, 'officeCanopy')).toHaveLength(1);
    }
    expect(LIT_PARTS.has('officeCorner')).toBe(true);
  });

  it('draws panel reveals every 8 m and a parapet band on a distribution centre, and two to four condensers 6 × 3.6 × 2.4 m on a food plant’s roof by level', () => {
    const plan = southern(indById('ind-warehouse-2'));
    expect(only(plan, 'panelReveal').length).toBeGreaterThan(10);
    expect(PANEL_REVEAL_SPACING_M).toBe(8);
    for (const r of only(plan, 'parapetBand')) expect(r.size[1]).toBeCloseTo(1, 9);
    expect([1, 2, 3].map(condenserCount)).toEqual([2, 3, 4]);
    for (const id of ['heavy-food-1', 'heavy-food-2', 'heavy-food-3']) {
      const e = indById(id);
      const food = southern(e);
      const condensers = only(food, 'condenser');
      expect(condensers, id).toHaveLength(condenserCount(e.level ?? 1));
      for (const c of condensers) {
        expect([...c.size].sort((a, b) => a - b)).toEqual([2.4, 3.6, 6]);
        expect(bottomOf(c)).toBeCloseTo(food.topBox.yOffset + food.topBox.h, 9);
      }
      const at = condensers.map((c) => c.offset[0] + c.offset[2]).sort((a, b) => a - b);
      for (let i = 1; i < at.length; i += 1) expect(at[i]! - at[i - 1]!).toBeCloseTo(7, 9);
    }
  });
});

describe('a chemical plant, a steelworks and a paper mill', () => {
  it('walls its tank farm in a 1 m bund, puts a bullet on saddles beside it, a rack over it and a column 1.6 times the body', () => {
    const body: SetbackBox = { w: 40, d: 40, h: 12, yOffset: 0 };
    const placed = computePartPlacements(indById('heavy-chem-2'), body, body, 'S', null);
    const of = (part: string): PartPlacement[] => placed.filter((p) => p.part === part);
    expect(of('bundWall')).toHaveLength(3);
    for (const w of of('bundWall')) expect(w.size[1]).toBeCloseTo(1, 9);
    expect(of('bullet')[0]!.size).toEqual([3, 3, 15]);
    expect(of('pipeRack').filter((p) => p.size[1] === 0.8)).toHaveLength(2);
    const tiers = of('pipeRack').filter((p) => p.size[0] === 6 && p.size[1] === 0.4);
    expect(tiers).toHaveLength(2);
    expect(bottomOf(tiers[0]!)).toBeCloseTo(RACK_CLEAR_M, 9);
    // Each bent is a portal: two columns and a cross beam at each tier.
    const columns = of('pipeRack').filter((p) => p.size[0] === 0.3 && p.size[2] === 0.3);
    const crossBeams = of('pipeRack').filter((p) => p.size[0] === 6.3);
    expect(columns.length).toBeGreaterThan(0);
    expect(crossBeams).toHaveLength(columns.length);
    const [column] = of('processColumn');
    expect(column!.size[0]).toBeCloseTo(3, 9);
    expect(topOf(column!)).toBeCloseTo(1.6 * 12, 9);
  });

  it('stands a steelworks furnace 8 m across to 1.8 times the body with three stoves to 1.4, and a duct to the stack', () => {
    const e = indById('heavy-metals-2');
    const body: SetbackBox = { w: 54, d: 40, h: 15, yOffset: 0 };
    const placed = computePartPlacements(e, body, body, 'S', null, 7);
    const of = (part: string): PartPlacement[] => placed.filter((p) => p.part === part);
    const [furnace] = of('furnace');
    expect(furnace!.size[0]).toBeCloseTo(8, 9);
    expect(topOf(furnace!)).toBeCloseTo(1.8 * 15, 9);
    expect(of('stove')).toHaveLength(3);
    for (const s of of('stove')) {
      expect(s.size[0]).toBeCloseTo(5, 9);
      expect(topOf(s)).toBeCloseTo(1.4 * 15, 9);
    }
    expect(of('skipBridge')[0]!.size[0]).toBeCloseTo(1.5, 9);
    expect(of('skipBridge')[0]!.pitch).toBeGreaterThan(0);
    expect(of('duct')[0]!.size[0]).toBeCloseTo(1.5, 9);
    // Without a building id there is no stack to run the duct to.
    expect(computePartPlacements(e, body, body, 'S', null).map((p) => p.part)).not.toContain(
      'duct',
    );
  });

  it('piles chips 24 m across and 12 m tall with a stacker, only where the lot has room', () => {
    const e = indById('heavy-paper-2');
    const body: SetbackBox = { w: 40, d: 40, h: 13, yOffset: 0 };
    const placed = computePartPlacements(e, body, body, 'S', lotOf(60));
    expect(placed.find((p) => p.part === 'chipPile')!.size).toEqual([24, 12, 24]);
    expect(placed.filter((p) => p.part === 'stacker')).toHaveLength(1);
    for (const p of placed.filter((q) => q.part === 'chipPile' || q.part === 'stacker')) {
      const b = placementBounds(p);
      expect(b.x0 >= -60 && b.x1 <= 60 && b.z0 >= -60 && b.z1 <= 60).toBe(true);
    }
    const tight = computePartPlacements(e, body, body, 'S', lotOf(30));
    expect(tight.filter((p) => p.part === 'chipPile')).toEqual([]);
  });
});

/** A square lot of `half` metres each way about the body, with its drive on the south edge and nothing else on it. */
const lotOf = (half: number, over: Partial<KitLot> = {}): KitLot => ({
  lot: { x0: -half, x1: half, z0: -half, z1: half },
  curbCut: { x0: 0, x1: 4, z0: half - 1, z1: half },
  walk: null,
  frontWalk: null,
  islands: [],
  dock: null,
  loadingFacing: null,
  trailers: [],
  hard: [],
  lane: null,
  taken: [],
  ...over,
});

/** The identifying parts the art table names per industrial kind, each sized to read at 40 m. */
const INDUSTRIAL_IDENTIFYING_PARTS: Readonly<Record<string, readonly BuildingPart[]>> = {
  workshop: ['wainscot', 'rollUpDoors', 'glassFront'],
  flex: ['glassFront', 'rollUpDoors', 'wainscot'],
  warehouse: ['loadingDock', 'dockBumper', 'dockLight', 'dockTrailer', 'tiltBand', 'guardBooth'],
  factory: ['baghouse', 'stack', 'silo', 'yardFence', 'monitorRoof'],
  foodplant: ['condenser', 'penthouse', 'silo', 'loadingDock'],
  chemical: ['tanks', 'bundWall', 'pipeRack', 'flare', 'coolingTower'],
  metals: ['monitorRoof', 'ridgeVent', 'stack', 'scrapYard', 'gantry'],
  paper: ['chipPile', 'monitorRoof', 'recoveryStack', 'tanks'],
};

describe('the second pass: what tells the industrial kinds apart at 40 m', () => {
  it('maps every identifying part the art table names onto its kind', () => {
    for (const [kind, parts] of Object.entries(INDUSTRIAL_IDENTIFYING_PARTS)) {
      const e = industrial.find((c) => c.kind === kind && (c.level ?? 1) === 1)!;
      for (const part of parts) expect(partsFor(e), `${kind} ${part}`).toContain(part);
    }
  });

  it('sizes each identifying part to its art figure, none under 0.5 m', () => {
    expect(WAINSCOT_HEIGHT_M).toBe(2.4);
    expect(TILT_BAND_M).toBe(2.4);
    expect(TRAILER_SIZE_M).toEqual([2.6, 4.1, 16]);
    expect(TRAILER_DOOR_STEP).toBe(3);
    expect(GUARD_BOOTH_SIZE_M).toEqual([1.2, 2.6, 1.8]);
    expect(BAGHOUSE_HEIGHT_M).toBe(6);
    expect(BAGHOUSE_SIZE_M[0]).toBe(3);
    expect(STACK_HEIGHT_M).toBe(12);
    expect(SILO_DIAMETER_M).toBe(4);
    expect(FACTORY_SILO_HEIGHT_M).toBe(12);
    expect(FOOD_SILO_HEIGHT_M).toBe(15);
    expect(YARD_FENCE_M).toBe(1.8);
    expect(CONDENSER_SIZE_M[1]).toBe(2.4);
    expect(FOOD_PENTHOUSE_SIZE_M).toEqual([4, 3, 4]);
    expect(RACK_CLEAR_M).toBe(5);
    expect(FLARE_HEIGHT_M).toBe(30);
    expect(FLARE_TIP_M).toBe(1.5);
    expect(CHEM_COOLING_TOWER_SIZE_M).toEqual([11, 5.6, 7]);
    expect(COOLING_FAN_M).toBe(2);
    expect(MELT_RIDGE_VENT_M).toBe(1.5);
    expect(MELT_STACK_HEIGHT_M).toBe(36);
    expect(SCRAP_YARD_SIZE_M).toEqual([20, 12]);
    expect(GANTRY_HEIGHT_M).toBe(10);
    expect(CHIP_PILE_DIAMETER_M).toBe(24);
    expect(CHIP_PILE_HEIGHT_M).toBe(12);
    expect(RECOVERY_STACK_HEIGHT_M).toBe(60);
    for (const m of [
      WAINSCOT_HEIGHT_M,
      TILT_BAND_M,
      YARD_FENCE_M,
      CONDENSER_SIZE_M[1],
      FLARE_TIP_M,
      MELT_RIDGE_VENT_M,
      COOLING_FAN_M,
    ]) {
      expect(m).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('glazes a flex building’s office front two storeys on the street and a workshop’s one storey at the end its doors leave free, both lit', () => {
    expect(LIT_PARTS.has('glassFront')).toBe(true);
    const flex = southern(indById('ind-flex-1'));
    const [front] = only(flex, 'glassFront');
    expect(front!.size[1]).toBeCloseTo(Math.min(2 * FLOOR_HEIGHT_METERS, 6.4 - 0.4), 9);
    expect(front!.offset[2]).toBeGreaterThan(flex.baseBox.d / 2 - 0.01);
    expect(bottomOf(front!)).toBeCloseTo(0, 9);
    const shop = southern(indById('ind-workshop-2'));
    const [shopFront] = only(shop, 'glassFront');
    expect(shopFront!.size[1]).toBeCloseTo(FLOOR_HEIGHT_METERS, 9);
    expect(shopFront!.size[0]).toBeGreaterThanOrEqual(3);
    for (const d of [...only(shop, 'rollUpDoors'), ...only(shop, 'walkDoor')]) {
      expect(overlap(placementBounds(d), placementBounds(shopFront!))).toBe(false);
    }
    // The smallest workshop's doors fill its frontage, so it has no office front.
    expect(only(southern(indById('ind-1')), 'glassFront')).toEqual([]);
  });

  it('gives a flex building one or two 3.05 m grade doors at the back, by the back wall’s span', () => {
    const one = southern(indById('ind-flex-1'));
    const two = southern(indById('ind-3'));
    expect(only(one, 'rollUpDoors')).toHaveLength(1);
    expect(only(two, 'rollUpDoors')).toHaveLength(2);
    for (const d of [...only(one, 'rollUpDoors'), ...only(two, 'rollUpDoors')]) {
      expect(d.size[0]).toBeCloseTo(3.05, 9);
      expect(d.size[1]).toBeCloseTo(3.05, 9);
      expect(d.offset[2]).toBeLessThan(0);
      expect(bottomOf(d)).toBeCloseTo(0, 9);
    }
  });

  it('bands a tilt-up warehouse 2.4 m in blue or red under its parapet band on every face', () => {
    const plan = southern(indById('ind-warehouse-2'));
    const bands = only(plan, 'tiltBand');
    expect(bands).toHaveLength(4);
    const liveries = bands.map((b) => accentNames(b.color));
    for (const livery of liveries) expect(['tiltBandBlue', 'tiltBandRed']).toContain(livery);
    expect(new Set(liveries).size).toBe(1);
    // The band wraps the base tier under its parapet band; the upper rungs are massed in set-back tiers of a few metres each, so it sits in the top half of that tier.
    const [parapet] = only(plan, 'parapetBand');
    for (const b of bands) {
      expect(b.size[1]).toBeCloseTo(TILT_BAND_M, 9);
      expect(topOf(b)).toBeCloseTo(bottomOf(parapet!), 9);
      expect(bottomOf(b)).toBeGreaterThan(0);
      expect(topOf(b) + 1).toBeCloseTo(plan.baseBox.h, 9);
    }
    // Two warehouses of different ids may differ; across the catalog both liveries appear.
    const seen = new Set(
      [1, 2, 3, 4, 5, 6].map((id) =>
        accentNames(
          computePartPlacements(
            indById('ind-warehouse-2'),
            plan.baseBox,
            plan.topBox,
            'S',
            null,
            id,
          ).find((p) => p.part === 'tiltBand')!.color,
        ),
      ),
    );
    expect(seen.size).toBe(2);
  });

  it('backs a 16 × 2.6 × 4.1 m dry van onto one dock door in three, square to the dock, where the court is deep enough: six doors stand two', () => {
    const e = indById('ind-warehouse-1');
    const body: SetbackBox = { w: 40.8, d: 40.8, h: e.height, yOffset: 0 };
    const lot = lotOf(45, {
      dock: { x: 0, z: -30 },
      loadingFacing: { x: 0, z: -1 },
      trailers: [{ x0: -20, x1: 20, z0: -40, z1: -23 }],
    });
    const placed = computePartPlacements(e, body, body, 'S', lot);
    const doors = placed.filter((p) => p.part === 'rollUpDoors');
    expect(doors).toHaveLength(6);
    const vans = placed.filter((p) => p.part === 'dockTrailer' && p.size[1] > 2);
    expect(vans).toHaveLength(2);
    const axles = placed.filter((p) => p.part === 'trailerAxle');
    expect(axles).toHaveLength(4);
    for (const van of vans) {
      expect(van.size[0]).toBeCloseTo(2.6, 9);
      expect(van.size[2]).toBeCloseTo(16, 9);
      expect(topOf(van)).toBeCloseTo(4.1, 9);
      // Backed onto a door: the van's rear at the bumpers, its middle on the door's centre line.
      const door = doors.find((d) => Math.abs(d.offset[0] - van.offset[0]) < 1e-6);
      expect(door).toBeDefined();
      expect(placementBounds(van).z1).toBeCloseTo(-20.4 - 2.6 - 0.11, 9);
      // Both axles under the rear of the van, on the ground.
      const under = axles.filter((a) => Math.abs(a.offset[0] - van.offset[0]) < 1e-6);
      expect(under).toHaveLength(2);
      for (const a of under) {
        expect(bottomOf(a)).toBeCloseTo(0, 9);
        expect(a.offset[2]).toBeGreaterThan(van.offset[2]);
        expect(Math.abs((a.yaw ?? 0) % Math.PI)).toBeLessThan(1e-9);
      }
    }
    // Doors one and four of six: the second and the fifth along the dock.
    const at = doors.map((d) => d.offset[0]).sort((a, b) => a - b);
    expect(vans.map((v) => v.offset[0]).sort((a, b) => a - b)).toEqual([at[1], at[4]]);
    // No row striped, no van.
    expect(
      computePartPlacements(e, body, body, 'S', lotOf(45, { ...lot, trailers: [] })).filter(
        (p) => p.part === 'dockTrailer',
      ),
    ).toEqual([]);
  });

  it('parks a van in one striped stall in three, the stall’s own way, on a shipped lot too shallow to back one in', () => {
    const plan = southern(indById('ind-warehouse-2'));
    const stalls = plan.lot!.trailers;
    expect(stalls.length).toBeGreaterThan(0);
    const vans = only(plan, 'dockTrailer').filter((p) => p.size[1] > 2);
    expect(vans).toHaveLength(Math.ceil(stalls.length / TRAILER_DOOR_STEP));
    for (const van of vans) {
      const stall = stalls.find((s) => middleIn(placementBounds(van), s));
      expect(stall).toBeDefined();
      const b = placementBounds(van);
      expect(b.x0).toBeGreaterThanOrEqual(stall!.x0 - 1e-6);
      expect(b.x1).toBeLessThanOrEqual(stall!.x1 + 1e-6);
      expect(b.z0).toBeGreaterThanOrEqual(stall!.z0 - 1e-6);
      expect(b.z1).toBeLessThanOrEqual(stall!.z1 + 1e-6);
    }
    expect(only(plan, 'trailerAxle')).toHaveLength(2 * vans.length);
  });

  it('stands a guard booth 1.2 × 1.8 × 2.6 m beside the lot’s drive mouth', () => {
    const plan = southern(indById('ind-warehouse-2'));
    const [booth] = only(plan, 'guardBooth');
    expect(booth!.size).toEqual([1.2, 2.6, 1.8]);
    expect(bottomOf(booth!)).toBeCloseTo(0, 9);
    const cut = plan.lot!.curbCut;
    const b = placementBounds(booth!);
    expect(Math.min(Math.abs(b.x1 - cut.x0), Math.abs(b.x0 - cut.x1))).toBeLessThan(2);
    expect(b.z1).toBeLessThanOrEqual(plan.lot!.lot.z1 + 1e-6);
  });

  it('gives a factory a baghouse 6 m on four posts with a 12 m stack beside it, a 4 × 12 m silo and a 1.8 m fenced yard', () => {
    for (const id of ['ind-factory-1', 'ind-2', 'ind-factory-3']) {
      const plan = southern(indById(id));
      const baghouse = only(plan, 'baghouse');
      expect(baghouse, id).toHaveLength(5);
      const box = baghouse.find((p) => p.size[0] === 3)!;
      expect(topOf(box)).toBeCloseTo(6, 9);
      expect(bottomOf(box)).toBeCloseTo(2, 9);
      const posts = baghouse.filter((p) => p !== box);
      for (const post of posts) {
        expect(post.size[1]).toBeCloseTo(2, 9);
        expect(bottomOf(post)).toBeCloseTo(0, 9);
      }
      const [stack] = only(plan, 'stack');
      expect(stack!.size).toEqual([1.2, 12, 1.2]);
      expect(bottomOf(stack!)).toBeCloseTo(0, 9);
      expect(
        Math.hypot(stack!.offset[0] - box.offset[0], stack!.offset[2] - box.offset[2]),
      ).toBeCloseTo(2.1, 9);
      const [silo] = only(plan, 'silo');
      expect(silo!.size, id).toEqual([4, 12, 4]);
      expect(bottomOf(silo!)).toBeCloseTo(0, 9);
      expect(overlap(placementBounds(silo!), placementBounds(box))).toBe(false);
      const fence = only(plan, 'yardFence');
      for (const f of fence) expect(topOf(f)).toBeCloseTo(YARD_FENCE_M, 9);
      // The yard lies behind the back wall, fenced where the lot leaves room there: the 4 × 3 lot parks in front and leaves 1.5 m.
      for (const f of fence) expect(f.offset[2]).toBeLessThan(-plan.baseBox.d / 2);
      if (id === 'ind-factory-3') {
        expect(fence).toEqual([]);
        continue;
      }
      const fencePosts = fence.filter((f) => f.size[0] === 0.1 && f.size[2] === 0.1);
      const rails = fence.filter((f) => !fencePosts.includes(f));
      expect(fencePosts.length).toBeGreaterThan(2);
      expect(rails.length).toBeGreaterThan(0);
      const at = fencePosts.map((p) => p.offset[0]).sort((a, b) => a - b);
      for (let i = 1; i < at.length; i += 1)
        expect(at[i]! - at[i - 1]!).toBeLessThanOrEqual(3 + 1e-9);
    }
  });

  it('wears the monitor roof on the level 1 factory only, and moves the clerestory under the eaves above it', () => {
    expect(only(southern(indById('ind-factory-1')), 'monitorRoof')).toHaveLength(1);
    for (const id of ['ind-2', 'ind-factory-3']) {
      const plan = southern(indById(id));
      expect(only(plan, 'monitorRoof'), id).toEqual([]);
      const bands = only(plan, 'clerestory');
      expect(bands, id).toHaveLength(2);
      for (const b of bands) {
        expect(b.size[1]).toBeCloseTo(0.6, 9);
        expect(topOf(b)).toBeLessThan(plan.baseBox.h);
        expect(topOf(b)).toBeGreaterThan(plan.baseBox.h - 1.5);
      }
    }
  });

  it('puts a 4 × 4 × 3 m penthouse on a food plant’s roof and two 4 × 15 m silos beside its body', () => {
    const e = indById('heavy-food-2');
    const body: SetbackBox = { w: 54.4, d: 40.8, h: e.height, yOffset: 0 };
    const placed = computePartPlacements(e, body, body, 'S', null);
    const [penthouse] = placed.filter((p) => p.part === 'penthouse');
    expect(penthouse!.size).toEqual([4, 3, 4]);
    expect(bottomOf(penthouse!)).toBeCloseTo(e.height, 9);
    const silos = placed.filter((p) => p.part === 'silo');
    expect(silos).toHaveLength(2);
    for (const s of silos) {
      expect(s.size).toEqual([4, 15, 4]);
      expect(bottomOf(s)).toBeCloseTo(0, 9);
      // Beside the body: outside its plan, off one wall that is not the street face.
      const b = placementBounds(s);
      const outside = b.x0 >= 27.2 || b.x1 <= -27.2 || b.z1 <= -20.4;
      expect(outside).toBe(true);
    }
    expect(
      Math.hypot(
        silos[0]!.offset[0] - silos[1]!.offset[0],
        silos[0]!.offset[2] - silos[1]!.offset[2],
      ),
    ).toBeCloseTo(5, 9);
  });

  it('raises a 30 m flare with a lit 1.5 m tip and stands an 11 × 7 × 5.6 m cooling tower with two 2 m fans on a chemical plant', () => {
    expect(LIT_PARTS.has('flareTip')).toBe(true);
    const e = indById('heavy-chem-2');
    const body: SetbackBox = { w: 40, d: 40, h: 12, yOffset: 0 };
    for (const lot of [null, lotOf(60)]) {
      const placed = computePartPlacements(e, body, body, 'S', lot);
      const of = (part: BuildingPart): PartPlacement[] => placed.filter((p) => p.part === part);
      const [flare] = of('flare');
      expect(flare!.size).toEqual([0.6, 30, 0.6]);
      expect(bottomOf(flare!)).toBeCloseTo(0, 9);
      const [tip] = of('flareTip');
      expect(tip!.size[1]).toBeCloseTo(1.5, 9);
      expect(bottomOf(tip!)).toBeCloseTo(30, 9);
      expect(tip!.offset[0]).toBeCloseTo(flare!.offset[0], 9);
      expect(tip!.offset[2]).toBeCloseTo(flare!.offset[2], 9);
      const [tower] = of('coolingTower');
      expect([...tower!.size].sort((a, b) => a - b)).toEqual([5.6, 7, 11]);
      expect(tower!.color).toEqual(materialUnit('concreteBlock'));
      const fans = of('coolingFan');
      expect(fans).toHaveLength(2);
      for (const f of fans) {
        expect(f.size[0]).toBeCloseTo(2, 9);
        expect(bottomOf(f)).toBeCloseTo(5.6, 9);
        expect(middleIn(placementBounds(f), placementBounds(tower!))).toBe(true);
      }
      // All of it behind the body, or beside it, never before the street face.
      for (const p of [flare!, tower!, ...fans]) expect(p.offset[2]).toBeLessThan(20);
    }
  });

  it('gives a steelworks a 1.5 m ridge vent along the monitor, a 36 m stack, and a 20 × 12 m scrap yard under a 10 m gantry where there is room', () => {
    const e = indById('heavy-metals-2');
    const body: SetbackBox = { w: 54, d: 40, h: 15, yOffset: 0 };
    const placed = computePartPlacements(e, body, body, 'S', null, 7);
    const of = (part: BuildingPart): PartPlacement[] => placed.filter((p) => p.part === part);
    const [monitor] = of('monitorRoof');
    const [vent] = of('ridgeVent');
    expect(vent!.size[1]).toBeCloseTo(MELT_RIDGE_VENT_M, 9);
    expect(bottomOf(vent!)).toBeCloseTo(topOf(monitor!), 9);
    expect(Math.max(vent!.size[0], vent!.size[2])).toBeCloseTo(
      Math.max(monitor!.size[0], monitor!.size[2]) - 1,
      9,
    );
    expect(vent!.color).toEqual(materialUnit('darkPanel'));
    const [stack] = of('stack');
    expect(stack!.size).toEqual([1.8, 36, 1.8]);
    expect(bottomOf(stack!)).toBeCloseTo(0, 9);
    const scrap = of('scrapYard');
    expect(scrap).toHaveLength(3);
    const base = scrap.find((p) => Math.max(p.size[0], p.size[2]) === 20)!;
    expect(Math.min(base.size[0], base.size[2])).toBe(12);
    expect(bottomOf(base)).toBeCloseTo(0, 9);
    const gantry = of('gantry');
    expect(gantry).toHaveLength(3);
    const legs = gantry.filter((g) => g.size[1] === GANTRY_HEIGHT_M);
    expect(legs).toHaveLength(2);
    for (const leg of legs) expect(leg.size[0]).toBeCloseTo(0.6, 9);
    const beam = gantry.find((g) => g.size[1] !== GANTRY_HEIGHT_M)!;
    expect(bottomOf(beam)).toBeCloseTo(GANTRY_HEIGHT_M, 9);
    expect(middleIn(placementBounds(base), placementBounds(beam))).toBe(true);
    // The furnace and its stoves are untouched, and nothing in the yard stands on another part.
    expect(of('furnace')).toHaveLength(1);
    expect(of('stove')).toHaveLength(3);
    const ground = placed.filter(
      (p) =>
        p.part !== 'duct' &&
        p.part !== 'skipBridge' &&
        p.part !== 'gantry' &&
        p.part !== 'monitorRoof' &&
        p.part !== 'ridgeVent',
    );
    for (let i = 0; i < ground.length; i += 1) {
      for (let j = i + 1; j < ground.length; j += 1) {
        if (ground[i]!.part === 'scrapYard' && ground[j]!.part === 'scrapYard') continue;
        expect(
          overlap(placementBounds(ground[i]!), placementBounds(ground[j]!)),
          `${ground[i]!.part} over ${ground[j]!.part}`,
        ).toBe(false);
      }
    }
  });

  it('raises a paper mill’s 60 × 2.4 m recovery stack behind the body beside the tanks', () => {
    const e = indById('heavy-paper-2');
    const body: SetbackBox = { w: 40, d: 40, h: 13, yOffset: 0 };
    for (const lot of [null, lotOf(60)]) {
      const placed = computePartPlacements(e, body, body, 'S', lot);
      const [stack] = placed.filter((p) => p.part === 'recoveryStack');
      expect(stack!.size).toEqual([2.4, 60, 2.4]);
      expect(bottomOf(stack!)).toBeCloseTo(0, 9);
      expect(stack!.offset[2]).toBeLessThan(-20);
      for (const t of placed.filter((p) => p.part === 'tanks')) {
        expect(overlap(placementBounds(t), placementBounds(stack!))).toBe(false);
      }
    }
    // The shipped lots are too tight for the pile, so the stack is what rises behind the mill there.
    expect(only(southern(e), 'recoveryStack')).toHaveLength(1);
  });

  it('stands every identifying part that a shipped lot has room for on a south-fronting example of each kind', () => {
    const examples: Record<string, string> = {
      workshop: 'ind-workshop-2',
      flex: 'ind-flex-1',
      warehouse: 'ind-warehouse-2',
      factory: 'ind-factory-1',
      foodplant: 'heavy-food-2',
      chemical: 'heavy-chem-2',
      metals: 'heavy-metals-3',
      paper: 'heavy-paper-2',
    };
    /** What the shipped lots leave no room for: a 24 m chip pile, and a 20 m scrap yard beside a furnace and three stoves. */
    const tight: readonly BuildingPart[] = ['chipPile', 'scrapYard', 'gantry'];
    for (const [kind, parts] of Object.entries(INDUSTRIAL_IDENTIFYING_PARTS)) {
      const plan = southern(indById(examples[kind]!));
      for (const part of parts) {
        if (tight.includes(part)) continue;
        expect(only(plan, part).length, `${examples[kind]} ${part}`).toBeGreaterThan(0);
      }
    }
  });
});

const aptById = (id: string): BuildingCatalogEntry => apartments.find((e) => e.id === id)!;

describe('the apartment kit: where every part stands', () => {
  const bodyOf = (e: BuildingCatalogEntry): SetbackBox => computeSetbacks(e, 1).boxes[0]!;
  const podiumOf = (e: BuildingCatalogEntry): SetbackBox | null =>
    computeSetbacks(e, 1).podium ?? null;
  const placed = (
    e: BuildingCatalogEntry,
    side: Side | null = 'S',
    lot: KitLot | null = null,
    id = 1,
  ): PartPlacement[] => computePartPlacements(e, bodyOf(e), bodyOf(e), side, lot, id, podiumOf(e));
  const ofKind = (list: readonly PartPlacement[], part: BuildingPart): PartPlacement[] =>
    list.filter((p) => p.part === part);
  const bottom = (p: PartPlacement): number => p.offset[1] - p.size[1] / 2;
  const overlaps = (a: PartPlacement, b: PartPlacement): boolean => {
    const r = placementBounds(a);
    const s = placementBounds(b);
    return r.x0 < s.x1 && s.x0 < r.x1 && r.z0 < s.z1 && s.z0 < r.z1;
  };

  it('stands a hip at 5:12 over 0.45 m eaves on every walk-up, its rise capped at 4.5 m, on a body that is square at every level', () => {
    for (const e of apartments.filter((a) => a.kind === 'multiplex' || a.kind === 'garden')) {
      const body = bodyMetresFor(e);
      expect(body.w, e.id).toBeCloseTo(body.d, 9);
      const [hip] = ofKind(placed(e), 'hipRoofBlock');
      expect(hip, e.id).toBeDefined();
      const span = body.w + 2 * HIP_EAVE_M;
      expect(hip!.size[0]).toBeCloseTo(span, 9);
      expect(hip!.size[2]).toBeCloseTo(span, 9);
      expect(hip!.size[1]).toBeCloseTo(Math.min(HIP_RISE_CAP_M, (HIP_PITCH * span) / 2), 9);
      expect(bottom(hip!)).toBeCloseTo(e.height, 9);
      expect(hip!.color).toBeDefined();
    }
    // A 13.6 m body takes the full pitch; the catalog's 24 m and 27.2 m bodies meet the cap.
    const small = { ...aptById('res-multiplex-1'), footprint: { w: 1, d: 1 } };
    const [hip] = ofKind(placed(small), 'hipRoofBlock');
    expect(hip!.size[1]).toBeCloseTo((HIP_PITCH * (13.6 + 2 * HIP_EAVE_M)) / 2, 9);
    expect(hip!.size[1]).toBeLessThan(HIP_RISE_CAP_M);
    expect(ofKind(placed(aptById('res-multiplex-1')), 'hipRoofBlock')[0]!.size[1]).toBe(
      HIP_RISE_CAP_M,
    );
  });

  it('turns the hip so its ridge runs along the frontage', () => {
    const e = aptById('res-medium-1');
    expect(ofKind(placed(e, 'S'), 'hipRoofBlock')[0]!.yaw).toBeUndefined();
    expect(ofKind(placed(e, 'E'), 'hipRoofBlock')[0]!.yaw).toBeCloseTo(Math.PI / 2, 9);
  });

  it('wraps a 0.9 m brick base 0.05 m proud round every face of a walk-up', () => {
    for (const e of apartments.filter((a) => a.kind === 'multiplex' || a.kind === 'garden')) {
      const bases = ofKind(placed(e), 'brickBase');
      expect(bases, e.id).toHaveLength(4);
      for (const b of bases) {
        expect(b.size[1]).toBe(WALK_UP_BRICK_BASE_HEIGHT_M);
        expect(Math.min(b.size[0], b.size[2])).toBe(WALK_UP_BRICK_BASE_PROUD_M);
        expect(bottom(b)).toBeCloseTo(0, 9);
      }
    }
  });

  it('stands the mail kiosk, 0.77 × 0.45 × 1.93 m, beside the door at the street', () => {
    for (const id of ['res-multiplex-1', 'res-medium-1']) {
      const e = aptById(id);
      const [kiosk] = ofKind(placed(e), 'mailKiosk');
      expect(kiosk, id).toBeDefined();
      expect(kiosk!.size).toEqual([
        MAIL_KIOSK_SIZE_M[0],
        MAIL_KIOSK_SIZE_M[1],
        MAIL_KIOSK_SIZE_M[2],
      ]);
      expect(bottom(kiosk!)).toBeCloseTo(0, 9);
      expect(kiosk!.offset[2]).toBeGreaterThan(bodyOf(e).d / 2);
    }
  });

  it('gives a multiplex one shared stoop, 2.4 × 1.5 m and 0.45 m up on two risers, under a 2.4 × 1.2 m gabled hood on two posts', () => {
    const e = aptById('res-multiplex-2');
    const parts = placed(e);
    const half = bodyOf(e).d / 2;
    const stoop = ofKind(parts, 'stoop');
    expect(stoop).toHaveLength(2);
    const [landing, step] = stoop;
    expect(landing!.size).toEqual([STOOP_WIDTH_M, STOOP_RISE_M, STOOP_DEPTH_M]);
    expect(landing!.offset[0]).toBe(0);
    expect(landing!.offset[2]).toBeCloseTo(half + STOOP_DEPTH_M / 2, 9);
    expect(step!.size[1]).toBeCloseTo(STOOP_RISE_M / 2, 9);
    expect(step!.offset[2]).toBeGreaterThan(landing!.offset[2]);
    const [hood] = ofKind(parts, 'entryHood');
    expect(hood!.size[0]).toBe(ENTRY_HOOD_SIZE_M[0]);
    expect(hood!.size[2]).toBe(ENTRY_HOOD_SIZE_M[1]);
    expect(bottom(hood!)).toBeCloseTo(ENTRY_HOOD_UNDERSIDE_M, 9);
    expect(hood!.color).toEqual(ofKind(parts, 'hipRoofBlock')[0]!.color);
    const posts = ofKind(parts, 'signPole');
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.size[0]).toBe(0.15);
      expect(post.size[2]).toBe(0.15);
      expect(bottom(post)).toBeCloseTo(STOOP_RISE_M, 9);
      expect(post.offset[1] + post.size[1] / 2).toBeCloseTo(ENTRY_HOOD_UNDERSIDE_M, 9);
    }
    expect(Math.abs(posts[0]!.offset[0] + posts[1]!.offset[0])).toBeLessThan(1e-9);
  });

  it('opens a garden walk-up’s breezeway on the street and rear faces, 1.8 m wide and 0.05 m proud to the eave, with a 1.8 × 1.2 m landing and a 1.07 m guard per upper floor', () => {
    const e = aptById('res-medium-2');
    const parts = placed(e);
    const half = bodyOf(e).d / 2;
    const { rows, pitch } = storeysOf(e, bodyOf(e));
    expect(rows).toBe(3);
    expect(pitch).toBeCloseTo(3.2, 9);
    const slots = ofKind(parts, 'breezeway');
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => Math.sign(s.offset[2])).sort()).toEqual([-1, 1]);
    for (const s of slots) {
      expect(s.size).toEqual([BREEZEWAY_WIDTH_M, e.height, BREEZEWAY_PROUD_M]);
      expect(s.offset[0]).toBe(0);
      expect(Math.abs(s.offset[2])).toBeCloseTo(half + BREEZEWAY_PROUD_M / 2, 9);
    }
    const landings = ofKind(parts, 'landing');
    const guards = ofKind(parts, 'landingGuard');
    expect(landings).toHaveLength(2 * (rows - 1));
    expect(guards).toHaveLength(2 * (rows - 1));
    const floors = landings.map(bottom).sort((a, b) => a - b);
    for (const [i, y] of [3.2, 3.2, 6.4, 6.4].entries()) expect(floors[i]).toBeCloseTo(y, 9);
    for (const l of landings) {
      expect(l.size).toEqual([BREEZEWAY_WIDTH_M, LANDING_THICKNESS_M, LANDING_DEPTH_M]);
    }
    for (const g of guards) {
      expect(g.size[1]).toBe(GUARD_HEIGHT_M);
      expect(g.size[0]).toBe(BREEZEWAY_WIDTH_M);
      // Each guard stands on the top of a landing on its own face.
      const onItsLanding = landings.some(
        (l) =>
          Math.sign(l.offset[2]) === Math.sign(g.offset[2]) &&
          Math.abs(l.offset[1] + LANDING_THICKNESS_M / 2 - bottom(g)) < 1e-9,
      );
      expect(onItsLanding).toBe(true);
    }
  });

  it('runs a 1 m flight at the 7:11 pitch from the ground to the first landing beside each slot, on opposite sides front and back', () => {
    const e = aptById('res-medium-2');
    const flights = ofKind(placed(e), 'stairFlight');
    expect(flights).toHaveLength(2);
    expect((STAIR_PITCH * 180) / Math.PI).toBeCloseTo(32, 0);
    for (const f of flights) {
      expect(f.pitch).toBe(STAIR_PITCH);
      expect(f.size[0]).toBe(1);
      expect(f.size[2]).toBeCloseTo(3.2 / Math.sin(STAIR_PITCH), 9);
      expect(f.offset[1]).toBeCloseTo(1.6, 9);
      // The top end is at the slot's edge, the foot a run away along the wall.
      const run = 3.2 / Math.tan(STAIR_PITCH);
      expect(Math.abs(f.offset[0])).toBeCloseTo(BREEZEWAY_WIDTH_M / 2 + run / 2, 9);
    }
    expect(Math.sign(flights[0]!.offset[0])).toBe(-Math.sign(flights[1]!.offset[0]));
    // Another seed puts the street flight on the other side.
    const other = ofKind(placed(e, 'S', null, 2), 'stairFlight');
    expect(Math.sign(other[0]!.offset[0])).toBe(-Math.sign(flights[0]!.offset[0]));
  });

  it('hangs a balcony in every bay clear of the breezeway on every upper floor, 1.8 m deep and the bay less 1 m, and lays a patio with no guard on the ground', () => {
    const e = aptById('res-medium-2');
    const parts = placed(e);
    const body = bodyOf(e);
    const { count, width } = windowBays(e, body.w);
    expect(count).toBe(4);
    const clearBays = 2;
    const slabs = ofKind(parts, 'balconySlab');
    const patios = ofKind(parts, 'patio');
    expect(patios).toHaveLength(2 * clearBays);
    expect(slabs).toHaveLength(2 * clearBays * 2);
    for (const p of [...slabs, ...patios]) {
      expect(p.size[0]).toBeCloseTo(width - 1, 9);
      expect(p.size[2]).toBe(BALCONY_DEPTH_M);
      expect(p.size[1]).toBe(WALK_UP_BALCONY_SLAB_M);
      for (const slot of ofKind(parts, 'breezeway')) expect(overlaps(p, slot)).toBe(false);
    }
    for (const s of slabs) expect(bottom(s)).toBeGreaterThanOrEqual(3.2 - 1e-9);
    for (const p of patios) expect(bottom(p)).toBeCloseTo(0, 9);
    // Three guards a balcony, front and sides, 1.07 m tall on the slab; none on a patio.
    const guards = ofKind(parts, 'balconyGuard');
    expect(guards).toHaveLength(3 * slabs.length);
    // A rail is painted in the house kit's trim colour, so it reads against the wall.
    const rail = new THREE.Color(trimColor(1, deriveFacadeParams(e, 1).wallColor));
    for (const g of [...guards, ...ofKind(parts, 'landingGuard')]) {
      expect(g.size[1]).toBe(GUARD_HEIGHT_M);
      expect(g.color).toEqual([rail.r, rail.g, rail.b]);
    }
    for (const g of guards) {
      expect(bottom(g)).toBeGreaterThanOrEqual(3.2 + WALK_UP_BALCONY_SLAB_M - 1e-9);
    }
  });

  it('bands a podium’s street face with 3 m of lit glazing over the 0.6 m bulkhead between 0.6 m brick piers at each end and every bay', () => {
    const e = aptById('res-high-2');
    const podium = podiumOf(e)!;
    expect(podium.h).toBe(4.6);
    const parts = placed(e);
    const { count } = windowBays(e, podium.w);
    const piers = ofKind(parts, 'brickPier');
    expect(piers).toHaveLength(count + 1);
    for (const p of piers) {
      expect(p.size[0]).toBe(BRICK_PIER_M);
      expect(p.size[1]).toBe(podium.h);
      expect(p.offset[2]).toBeGreaterThan(podium.d / 2);
    }
    expect(Math.min(...piers.map((p) => p.offset[0]))).toBeCloseTo(
      -podium.w / 2 + BRICK_PIER_M / 2,
      9,
    );
    const glazing = ofKind(parts, 'storefrontBand');
    const bulkheads = ofKind(parts, 'bulkhead');
    expect(glazing).toHaveLength(count);
    expect(bulkheads).toHaveLength(count);
    for (const g of glazing) {
      expect(g.size[1]).toBe(STOREFRONT_GLAZING_M);
      expect(bottom(g)).toBeCloseTo(BULKHEAD_HEIGHT_M, 9);
      expect(LIT_PARTS.has(g.part)).toBe(true);
    }
    for (const b of bulkheads) expect(bottom(b)).toBeCloseTo(0, 9);
  });

  it('stands box bays 0.6 m proud on alternate bays of a mid-rise from the podium to the parapet, in the wall colour darkened, with balconies in the bays between', () => {
    const e = aptById('res-high-2');
    const parts = placed(e);
    const body = bodyOf(e);
    const { count, width } = windowBays(e, body.w);
    const boxes = ofKind(parts, 'boxBay');
    expect(boxes).toHaveLength(2 * Math.ceil(count / 2));
    const { wallColor } = deriveFacadeParams(e, 1);
    for (const b of boxes) {
      expect(b.size[0]).toBeCloseTo(width - 1, 9);
      expect(Math.min(b.size[0], b.size[2])).toBe(BOX_BAY_PROUD_M);
      expect(bottom(b)).toBeCloseTo(4.6, 9);
      expect(b.offset[1] + b.size[1] / 2).toBeCloseTo(e.height - BLOCK_PARAPET_M, 9);
      expect(b.color![0]).toBeCloseTo(wallColor[0] * BOX_BAY_DARKEN, 9);
      expect(b.color![2]).toBeCloseTo(wallColor[2] * BOX_BAY_DARKEN, 9);
    }
    const slabs = ofKind(parts, 'balconySlab');
    const { rows, pitch } = storeysOf(e, body);
    const upper = Array.from({ length: rows - 1 }, (_, i) => (i + 1) * pitch).filter(
      (y) => y >= 4.6,
    );
    expect(slabs).toHaveLength(2 * Math.floor(count / 2) * upper.length);
    for (const s of slabs) {
      expect(s.size[1]).toBe(BLOCK_BALCONY_SLAB_M);
      expect(bottom(s)).toBeGreaterThanOrEqual(4.6);
      for (const b of boxes) expect(overlaps(s, b)).toBe(false);
    }
    const bays = new Set([...boxes, ...slabs].map((p) => p.offset[0].toFixed(3)));
    expect(bays.size).toBe(count);
    const rail = new THREE.Color(trimColor(1, wallColor));
    for (const g of ofKind(parts, 'balconyGuard')) {
      expect(g.color).toEqual([rail.r, rail.g, rail.b]);
    }
  });

  it('crowns a mid-rise with a 0.76 m parapet band, a 3 × 4 × 4.1 m bulkhead 3 m back from the street face, and the commercial kit’s units and hatch clear of it', () => {
    const e = aptById('res-high-3');
    const parts = placed(e);
    const body = bodyOf(e);
    const bands = ofKind(parts, 'parapetBand');
    expect(bands).toHaveLength(4);
    for (const b of bands) {
      expect(b.size[1]).toBe(BLOCK_PARAPET_M);
      expect(b.offset[1] + b.size[1] / 2).toBeCloseTo(e.height, 9);
    }
    const [bulk] = ofKind(parts, 'elevatorBulkhead');
    expect(bulk!.size).toEqual([
      ELEVATOR_BULKHEAD_SIZE_M[0],
      ELEVATOR_BULKHEAD_SIZE_M[1],
      ELEVATOR_BULKHEAD_SIZE_M[2],
    ]);
    expect(bottom(bulk!)).toBeCloseTo(e.height, 9);
    expect(bulk!.offset[2] + bulk!.size[2] / 2).toBeCloseTo(
      body.d / 2 - ROOF_SETBACK_FROM_STREET_M,
      9,
    );
    const units = ofKind(parts, 'rooftopUnit');
    expect(units.length).toBeGreaterThan(0);
    expect(ofKind(parts, 'roofHatch')).toHaveLength(1);
    for (const u of [...units, ...ofKind(parts, 'roofHatch')])
      expect(overlaps(u, bulk!)).toBe(false);
  });

  it('runs a tower’s continuous balcony along both long faces at every floor above the podium, 1 m short of each end, behind a glass guard, and none on the podium', () => {
    const e = aptById('res-tower-1');
    const parts = placed(e);
    const body = bodyOf(e);
    const podium = podiumOf(e)!;
    expect(podium.h).toBeCloseTo(6.4, 9);
    const { rows, pitch } = storeysOf(e, body);
    // The floor whose level is the podium's top is the first above it.
    const upper = Array.from({ length: rows - 1 }, (_, i) => (i + 1) * pitch).filter(
      (y) => y >= 6.4 - 1e-9,
    );
    expect(upper).toHaveLength(10);
    const slabs = ofKind(parts, 'balconySlab');
    expect(slabs).toHaveLength(2 * upper.length);
    expect(slabs.map((s) => Math.sign(s.offset[2])).filter((s) => s > 0)).toHaveLength(
      upper.length,
    );
    for (const s of slabs) {
      expect(s.size[0]).toBeCloseTo(body.w - 2 * TOWER_BALCONY_END_M, 9);
      expect(s.size[2]).toBe(BALCONY_DEPTH_M);
      expect(s.size[1]).toBe(BLOCK_BALCONY_SLAB_M);
      expect(bottom(s)).toBeGreaterThanOrEqual(podium.h - 1e-9);
      expect(s.offset[0]).toBe(0);
    }
    const guards = ofKind(parts, 'balconyGuard');
    expect(guards).toHaveLength(slabs.length);
    for (const g of guards) {
      expect(g.size[1]).toBe(GUARD_HEIGHT_M);
      expect(g.color).toBeDefined();
      expect(g.color![2]).toBeGreaterThan(g.color![0]);
    }
  });

  it('centres a tower’s lit lobby portal on its podium’s street face with the storefront band either side of it, and sets a penthouse of 30% of the plate 3 m back from the street face', () => {
    const e = aptById('res-tower-2');
    const parts = placed(e);
    const podium = podiumOf(e)!;
    const body = bodyOf(e);
    const [portal] = ofKind(parts, 'lobbyPortal');
    expect(portal!.offset[0]).toBe(0);
    expect(portal!.offset[2] - portal!.size[2] / 2).toBeCloseTo(podium.d / 2, 9);
    for (const g of [...ofKind(parts, 'storefrontBand'), ...ofKind(parts, 'brickPier')]) {
      expect(overlaps(g, portal!), g.part).toBe(false);
    }
    expect(ofKind(parts, 'storefrontBand').length).toBeGreaterThan(1);
    const [pent] = ofKind(parts, 'penthouse');
    expect(pent!.size[1]).toBe(PENTHOUSE_HEIGHT_M);
    expect(pent!.size[0] * pent!.size[2]).toBeCloseTo(PENTHOUSE_PLATE_SHARE * body.w * body.d, 9);
    expect(pent!.size[0] / pent!.size[2]).toBeCloseTo(body.w / body.d, 9);
    expect(pent!.offset[2] + pent!.size[2] / 2).toBeCloseTo(
      body.d / 2 - ROOF_SETBACK_FROM_STREET_M,
      9,
    );
    expect(bottom(pent!)).toBeCloseTo(e.height, 9);
    expect(ofKind(parts, 'rooftopUnit')).toHaveLength(0);
  });

  it('leaves the street-face parts off a block that fronts no street, keeping a walk-up’s hip and base', () => {
    const multiplex = placed(aptById('res-multiplex-1'), null);
    expect(new Set(multiplex.map((p) => p.part))).toEqual(new Set(['hipRoofBlock', 'brickBase']));
    expect(placed(aptById('res-high-1'), null)).toEqual([]);
    expect(placed(aptById('res-tower-1'), null)).toEqual([]);
  });

  it('lays the same block the same way every time', () => {
    for (const e of apartments) {
      expect(placed(e, 'S', null, 5)).toEqual(placed(e, 'S', null, 5));
    }
  });
});

describe('the apartment kit on the map', () => {
  const street =
    (lot: { w: number; d: number }, side: Side) =>
    (x: number, z: number): boolean => {
      switch (side) {
        case 'S':
          return z === 10 + lot.d && x >= 4 && x < 30;
        case 'N':
          return z === 9 && x >= 4 && x < 30;
        case 'E':
          return x === 10 + lot.w && z >= 4 && z < 30;
        default:
          return x === 9 && z >= 4 && z < 30;
      }
    };
  const inside = (
    r: ReturnType<typeof placementBounds>,
    lot: ReturnType<typeof placementBounds>,
  ): boolean =>
    r.x0 >= lot.x0 - 1e-6 &&
    r.x1 <= lot.x1 + 1e-6 &&
    r.z0 >= lot.z0 - 1e-6 &&
    r.z1 <= lot.z1 + 1e-6;

  it('keeps every part inside its lot at all four rotations, fronting any side', () => {
    for (const e of apartments) {
      for (const rotation of [0, 1, 2, 3] as const) {
        const lot = footprintForRotation(e, rotation);
        for (const side of ['N', 'E', 'S', 'W'] as const) {
          const plan = kitPlanFor(e, { id: 3, x: 10, z: 10, rotation }, street(lot, side))!;
          expect(plan.placements.length, `${e.id} turned ${rotation}, ${side}`).toBeGreaterThan(0);
          for (const p of plan.placements) {
            expect(
              inside(placementBounds(p), plan.tiles),
              `${e.id} ${p.part} turned ${rotation}, ${side}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('stands a multiplex’s kiosk by its stoop, off the stalls, the aisles and the walk from the street', () => {
    for (const e of apartments.filter((a) => a.kind === 'multiplex')) {
      const plan = kitPlanFor(e, { id: 3, x: 10, z: 10, rotation: 0 }, street(e.footprint, 'S'))!;
      expect(plan.lot, e.id).not.toBeNull();
      const [kiosk] = plan.placements.filter((p) => p.part === 'mailKiosk');
      expect(kiosk, e.id).toBeDefined();
      const b = placementBounds(kiosk!);
      const blocked = [...plan.lot!.hard, ...(plan.lot!.walk ? [plan.lot!.walk] : [])];
      for (const t of blocked) {
        expect(
          b.x0 < t.x1 && t.x0 < b.x1 && b.z0 < t.z1 && t.z0 < b.z1,
          `${e.id} kiosk on a stall or walk`,
        ).toBe(false);
      }
      expect(plan.placements.filter((p) => p.part === 'stoop')).toHaveLength(2);
    }
  });

  it('lays a garden on its 2×2 lot no car park, keeping its lawn, both breezeways, its balconies and patios, the body centred', () => {
    for (const e of apartments.filter((a) => a.kind === 'garden')) {
      const plan = kitPlanFor(e, { id: 3, x: 10, z: 10, rotation: 0 }, street(e.footprint, 'S'))!;
      expect(plan.lot, e.id).toBeNull();
      expect(plan.frontage.centerXM).toBe(0);
      expect(plan.frontage.centerZM).toBe(0);
      const counts = (part: BuildingPart): number =>
        plan.placements.filter((p) => p.part === part).length;
      expect(counts('breezeway')).toBe(2);
      expect(counts('brickBase')).toBe(4);
      expect(counts('mailKiosk')).toBe(1);
      expect(counts('patio')).toBe(4);
      expect(counts('balconySlab')).toBeGreaterThan(0);
    }
  });

  it('keeps the rear yard the lot leaves a walk-up as deep as what hangs off its rear face', () => {
    expect(WALK_UP_REAR_YARD_M.garden).toBeGreaterThanOrEqual(BALCONY_DEPTH_M + BREEZEWAY_PROUD_M);
    expect(WALK_UP_REAR_YARD_M.garden).toBeGreaterThanOrEqual(LANDING_DEPTH_M + BREEZEWAY_PROUD_M);
    expect(WALK_UP_REAR_YARD_M.multiplex).toBeGreaterThanOrEqual(HIP_EAVE_M);
    expect(WALK_UP_REAR_YARD_M.garden).toBeGreaterThanOrEqual(HIP_EAVE_M);
  });

  it('keeps a multiplex’s stoop on the door path, centred on the street face', () => {
    const e = aptById('res-multiplex-1');
    const plan = kitPlanFor(e, { id: 3, x: 10, z: 10, rotation: 0 }, street(e.footprint, 'S'))!;
    const stoop = plan.placements.filter((p) => p.part === 'stoop');
    expect(stoop.length).toBe(2);
    for (const s of stoop) expect(s.offset[0]).toBe(0);
  });
});
