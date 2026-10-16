import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  COAL_ASH_SILO,
  COAL_BOILER_HOUSE,
  COAL_ESP,
  COAL_GALLERY,
  COAL_HEAP,
  COAL_HEAP_WIDTH,
  COAL_STACK,
  COAL_TOWER,
  COAL_TURBINE_HALL,
  DRAIN_APRON,
  DRAIN_GUARD_RAIL_M,
  DRAIN_HEADWALL,
  DRAIN_OUTFALL_OVERHANG,
  DRAIN_OUTFALL_RADIUS,
  DRAIN_WINGWALL,
  INCINERATOR_BOILER_HALL,
  INCINERATOR_DOOR,
  INCINERATOR_STACK,
  INCINERATOR_TIPPING_HALL,
  MRF_BALE_SIZE,
  MRF_BALE_STACK,
  MRF_DOCK,
  MRF_DOOR_SIZE,
  MRF_FAN,
  MRF_WAINSCOT_M,
  PUMP_HOUSE,
  PUMP_INTAKE_OVERHANG,
  PUMP_INTAKE_RADIUS,
  PUMP_SCREEN,
  PUMP_SCREEN_HOUSE,
  PUMP_SURGE_TANK,
  PUMP_WET_WELL,
  RECYCLING_AISLE_M,
  RECYCLING_PULL_M,
  RECYCLING_ROLL_OFF,
  RECYCLING_ROLL_OFF_COUNT,
  RECYCLING_SHED_SIZE,
  RECYCLING_STALL,
  RECYCLING_STALL_COUNT,
  RECYCLING_YARD_HEIGHT,
  TRANSFER_DOOR,
  TRANSFER_GUARD_WALL_M,
  TRANSFER_HALL_SIZE,
  TRANSFER_PUSH_WALL,
  TRANSFER_WEIGHBRIDGE_SIZE,
  UTILITY_KIT_CATALOG_IDS,
  UtilityKitRenderer,
  WORKS_BASIN,
  WORKS_CLARIFIER,
  WORKS_CLARIFIER_COUNT,
  WORKS_CONTACT_TANK,
  WORKS_DIGESTER,
  computeCoalPlantLayout,
  computeDrainLayout,
  computeIncineratorLayout,
  computeMrfLayout,
  computePumpLayout,
  computeRecyclingDepotLayout,
  computeTransferLayout,
  computeWorksLayout,
  footprintHalfExtents,
  type Rect,
  type UtilityKitPartKind,
} from './utilitykits';
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
const COAL = byId('coal-plant');
const INCINERATOR = byId('incinerator');
const PUMP = byId('water-pump');
const DRAIN = byId('water-drain');
const WORKS = byId('sewage-works');
const DEPOT = byId('recycling-depot');
const MRF = byId('materials-recovery-facility');
const TRANSFER = byId('transfer-station');
const EIGHT = [COAL, INCINERATOR, PUMP, DRAIN, WORKS, DEPOT, MRF, TRANSFER];
const flat = (): number => 0;
const KIT_TIER = 30000;

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
const circleRect = (c: { x: number; z: number }, r: number): Rect => ({
  x0: c.x - r,
  x1: c.x + r,
  z0: c.z - r,
  z1: c.z + r,
});

function boundsOf(entry: BuildingCatalogEntry, kind: UtilityKitPartKind): THREE.Box3 {
  const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
  const geometry = renderer.partGeometry(entry.id, kind)!;
  geometry.computeBoundingBox();
  return geometry.boundingBox!;
}

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

/** Every placed part of the kit lies inside the turned lot, in world metres; the pipes that reach out over the water on purpose are not asked. */
function expectPartsInsideLot(
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
  waterAt?: (x: number, z: number) => boolean,
): void {
  const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [entry], waterAt);
  const building = instance(1, entry.id, { x: 10, z: 10, rotation });
  renderer.apply(add(building));
  const lot = footprintForRotation(entry, rotation);
  const x0 = building.x * TILE_METERS;
  const z0 = building.z * TILE_METERS;
  const x1 = x0 + lot.w * TILE_METERS;
  const z1 = z0 + lot.d * TILE_METERS;
  const kinds = new Set<UtilityKitPartKind>();
  for (const kind of [
    'coalGrounds',
    'coalPlant',
    'coalSmokestack',
    'coalHeap',
    'incineratorGrounds',
    'incineratorPlant',
    'incineratorStack',
    'pumpGrounds',
    'pumpStation',
    'drainGrounds',
    'drainHeadwall',
    'worksGrounds',
    'worksPlant',
    'worksClarifier',
    'recyclingYard',
    'recyclingDepot',
    'recyclingRollOff',
    'recyclingTruck',
    'mrfYard',
    'mrfHall',
    'mrfBales',
    'mrfOffice',
    'mrfScale',
    'mrfTruck',
    'transferYard',
    'transferHall',
    'transferScale',
    'transferRig',
    'transferPacker',
  ] as const) {
    if (renderer.partSlotsFor(1, kind).length > 0) kinds.add(kind);
  }
  expect(kinds.size).toBeGreaterThan(0);
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

/** Water on one side of the 2×2 (or 1×1) lot at (10, 10): south, east, north, west. */
const waterOn = (side: 0 | 1 | 2 | 3, entry: BuildingCatalogEntry) => {
  const { w, d } = entry.footprint;
  return (x: number, z: number): boolean => {
    if (side === 0) return z === 10 + d && x >= 10 && x < 10 + w;
    if (side === 1) return x === 10 + w && z >= 10 && z < 10 + d;
    if (side === 2) return z === 9 && x >= 10 && x < 10 + w;
    return x === 9 && z >= 10 && z < 10 + d;
  };
};

describe('the registry', () => {
  it('holds the eight earliest kits, and the renderer builds each from the catalog', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, catalog);
    for (const entry of EIGHT) {
      expect(UTILITY_KIT_CATALOG_IDS).toContain(entry.id);
      expect(renderer.kitIds().has(entry.id)).toBe(true);
    }
  });
});

describe('the coal plant', () => {
  const layout = computeCoalPlantLayout(COAL.footprint);
  const lot = lotOf(COAL.footprint);

  it('stands a 24 × 18 × 32 m boiler house with a 36 × 16 × 15 m turbine hall along it, and the precipitator on 2 m legs behind', () => {
    expect([width(layout.boiler), depth(layout.boiler), COAL_BOILER_HOUSE.h]).toEqual([24, 18, 32]);
    expect([width(layout.hall), depth(layout.hall), COAL_TURBINE_HALL.h]).toEqual([36, 16, 15]);
    expect(layout.hall.z0).toBeCloseTo(layout.boiler.z1, 9);
    expect([width(layout.esp), depth(layout.esp), COAL_ESP.h, COAL_ESP.legs]).toEqual([
      12, 10, 14, 2,
    ]);
    expect(layout.esp.z1).toBeLessThanOrEqual(layout.boiler.z0);
    expect(COAL_BOILER_HOUSE.h).toBeGreaterThan(COAL.height);
  });

  it('runs a flue from the precipitator to two 76 m stacks 4.5 m across', () => {
    expect(layout.stacks).toHaveLength(2);
    expect(layout.flue.x0).toBeCloseTo(layout.esp.x1, 9);
    expect(layout.flue.x1).toBeCloseTo(layout.stacks[1]!.x, 9);
    expect(COAL_STACK.h).toBe(76);
    const stack = boundsOf(COAL, 'coalSmokestack');
    expect(stack.max.y).toBeCloseTo(76, 5);
    expect(stack.max.x - stack.min.x).toBeCloseTo(4.5, 5);
  });

  it('piles the stockpile 40 m long and 12 m high at a 37° angle of repose, on the side away from the street', () => {
    expect(COAL_HEAP).toEqual({ length: 40, height: 12, repose: (37 * Math.PI) / 180 });
    expect(width(layout.heap)).toBeCloseTo(40, 9);
    expect(depth(layout.heap)).toBeCloseTo(COAL_HEAP_WIDTH, 9);
    expect(layout.heap.z1).toBeLessThan(0);
    const heap = boundsOf(COAL, 'coalHeap');
    expect(heap.max.y).toBeCloseTo(12, 5);
    const slope = Math.atan(heap.max.y / ((heap.max.z - heap.min.z) / 2));
    expect(slope).toBeCloseTo((37 * Math.PI) / 180, 6);
    expect(heap.max.x - heap.min.x).toBeCloseTo(40, 5);
  });

  it('climbs the conveyor gallery from the crusher house at 18° on a bent every 12 m', () => {
    expect(COAL_GALLERY.pitch).toBeCloseTo((18 * Math.PI) / 180, 9);
    const { from, to } = layout.gallery;
    const run = Math.hypot(to.x - from.x, to.z - from.z);
    expect(Math.atan((to.y - from.y) / run)).toBeCloseTo((18 * Math.PI) / 180, 9);
    expect(from.y).toBe(8);
    expect(to.x).toBeCloseTo(layout.boiler.x1, 9);
    expect(to.y).toBeLessThan(COAL_BOILER_HOUSE.h);
    expect(layout.bents.length).toBe(Math.floor((run - 2) / 12));
    for (let i = 1; i < layout.bents.length; i++) {
      const a = layout.bents[i - 1]!;
      const b = layout.bents[i]!;
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(12, 6);
    }
  });

  it('cools on a four-cell 36.8 × 13.7 × 9.4 m tower with a fan on each cell, and stores ash in an 8 m silo 15 m tall', () => {
    expect(COAL_TOWER).toEqual({ long: 36.8, wide: 13.7, h: 9.4, cells: 4 });
    const [short, long] = [width(layout.tower), depth(layout.tower)].sort((a, b) => a - b);
    expect(short).toBeCloseTo(13.7, 9);
    expect(long).toBeCloseTo(36.8, 9);
    expect(layout.fans).toHaveLength(4);
    for (const fan of layout.fans) expect(inside(circleRect(fan, 0.1), layout.tower)).toBe(true);
    expect([COAL_ASH_SILO.radius * 2, COAL_ASH_SILO.h]).toEqual([8, 15]);
  });

  it('puts the switchyard of three transformers and gantries on the street side, inside the fence', () => {
    expect(layout.transformers).toHaveLength(3);
    expect(layout.gantries).toHaveLength(3);
    for (const t of layout.transformers) expect(t.z0).toBeGreaterThan(layout.hall.z1);
    for (const g of layout.gantries) expect(g.z).toBeLessThan(layout.fence.z1);
    expect(layout.gate.x0).toBeGreaterThan(layout.fence.x0);
  });

  it('keeps every building clear of every other and inside the lot', () => {
    const rects = [
      layout.boiler,
      layout.hall,
      layout.esp,
      layout.heap,
      layout.crusher,
      layout.tower,
      circleRect(layout.silo, COAL_ASH_SILO.radius),
      ...layout.transformers,
      ...layout.stacks.map((s) => circleRect(s, COAL_STACK.radiusBottom)),
    ];
    for (const r of rects) expect(inside(r, lot)).toBe(true);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i]!, rects[j]!), `${i} vs ${j}`).toBe(false);
      }
    }
  });

  it.each([0, 1, 2, 3] as const)('stands every part inside the lot at rotation %i', (rotation) => {
    expectPartsInsideLot(COAL, rotation);
  });
});

describe('the incinerator', () => {
  const layout = computeIncineratorLayout(INCINERATOR.footprint);
  const lot = lotOf(INCINERATOR.footprint);

  it('tips into a 50 × 25 m hall at a 15 m eave through three 6 × 7 m doors on the street side', () => {
    expect([width(layout.tipping), depth(layout.tipping), INCINERATOR_TIPPING_HALL.h]).toEqual([
      50, 25, 15,
    ]);
    expect(INCINERATOR_DOOR).toEqual({ w: 6, h: 7, count: 3 });
    expect(layout.doors).toHaveLength(3);
    for (const door of layout.doors) {
      expect(door.z).toBeCloseTo(layout.tipping.z1, 9);
      expect(door.x - 3).toBeGreaterThan(layout.tipping.x0);
      expect(door.x + 3).toBeLessThan(layout.tipping.x1);
    }
    expect(layout.lane.z1).toBeCloseTo(lot.z1, 9);
    expect(layout.lane.z0).toBeLessThanOrEqual(layout.tipping.z1);
  });

  it('burns in a 30 × 25 × 40 m boiler hall behind it, with the baghouse and one 73 m stack 3 m across beside', () => {
    expect([width(layout.boiler), depth(layout.boiler), INCINERATOR_BOILER_HALL.h]).toEqual([
      30, 25, 40,
    ]);
    expect(layout.boiler.z1).toBeCloseTo(layout.tipping.z0, 9);
    expect([width(layout.baghouse), depth(layout.baghouse)]).toEqual([15, 10]);
    expect(INCINERATOR_STACK).toEqual({ h: 73, radius: 1.5 });
    const stack = boundsOf(INCINERATOR, 'incineratorStack');
    expect(stack.max.y).toBeCloseTo(73, 5);
    expect(stack.max.x - stack.min.x).toBeCloseTo(3.3, 1);
  });

  it('weighs at a 21.3 × 3.4 m scale on the queue lane at the gate', () => {
    expect(TRANSFER_WEIGHBRIDGE_SIZE.l).toBeCloseTo(21.3, 9);
    expect(layout.weighbridge.x).toBeGreaterThan(layout.lane.x0);
    expect(layout.weighbridge.x).toBeLessThan(layout.lane.x1);
    expect(layout.weighbridge.z - TRANSFER_WEIGHBRIDGE_SIZE.l / 2).toBeGreaterThanOrEqual(
      layout.lane.z0,
    );
    expect(layout.weighbridge.z + TRANSFER_WEIGHBRIDGE_SIZE.l / 2).toBeLessThanOrEqual(
      layout.lane.z1,
    );
    expect(layout.lane.x0).toBeGreaterThanOrEqual(layout.tipping.x1);
  });

  it('keeps every building clear of every other and inside the lot', () => {
    const rects = [
      layout.tipping,
      layout.boiler,
      layout.baghouse,
      layout.turbine,
      circleRect(layout.stack, INCINERATOR_STACK.radius),
    ];
    for (const r of rects) expect(inside(r, lot)).toBe(true);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i]!, rects[j]!), `${i} vs ${j}`).toBe(false);
      }
    }
  });

  it.each([0, 1, 2, 3] as const)('stands every part inside the lot at rotation %i', (rotation) => {
    expectPartsInsideLot(INCINERATOR, rotation);
  });
});

describe('the pumping station', () => {
  const layout = computePumpLayout(PUMP.footprint);
  const lot = lotOf(PUMP.footprint);

  it('houses the pumps in 13 × 12 m of masonry under a gable, 6 m to the eave and the catalog height at the ridge', () => {
    expect([width(layout.house), depth(layout.house)]).toEqual([13, 12]);
    expect(PUMP_HOUSE.eave).toBe(6);
    expect(PUMP_HOUSE.ridge).toBe(PUMP.height);
    // Nothing on the station stands over the ridge: the surge tank reaches it exactly.
    const station = boundsOf(PUMP, 'pumpStation');
    expect(station.max.y).toBeCloseTo(PUMP_SURGE_TANK.h, 5);
    expect(station.max.y).toBeLessThanOrEqual(PUMP.height);
  });

  it('screens at a 6 × 6 × 5 m house on the water edge with two travelling screens on its water face', () => {
    expect([width(layout.screenHouse), depth(layout.screenHouse), PUMP_SCREEN_HOUSE.h]).toEqual([
      6, 6, 5,
    ]);
    expect(layout.screenHouse.z1).toBeCloseTo(lot.z1 - PUMP_SCREEN_HOUSE.setback, 9);
    expect(PUMP_SCREEN.count).toBe(2);
    expect(layout.screens).toHaveLength(2);
    for (const s of layout.screens) expect(s.z).toBeCloseTo(layout.screenHouse.z1, 9);
  });

  it('runs the 1.2 m intake 6 m out over the water from the screen house, and the 0.9 m main out of the land face to its vault', () => {
    expect(PUMP_INTAKE_RADIUS * 2).toBeCloseTo(1.2, 9);
    const intake = boundsOf(PUMP, 'pumpIntake');
    expect(intake.max.z).toBeCloseTo(lot.z1 + PUMP_INTAKE_OVERHANG, 6);
    expect(intake.min.z).toBeCloseTo(layout.screenHouse.z0, 6);
    expect(layout.main.z1).toBeCloseTo(layout.house.z0, 9);
    expect(layout.vault.z1).toBeCloseTo(layout.main.z0, 9);
    expect(layout.track.z0).toBeCloseTo(lot.z0, 9);
  });

  it('draws from a 10.7 m wet well 1 m above grade, with a 3 m surge tank 8 m tall', () => {
    expect(PUMP_WET_WELL.radius * 2).toBeCloseTo(10.7, 9);
    expect(PUMP_WET_WELL.rim).toBe(1);
    expect(inside(circleRect(layout.wetWell, PUMP_WET_WELL.radius), layout.fence)).toBe(true);
  });

  it('keeps the house, screen house, wet well, tank, vault and transformer clear of each other', () => {
    const rects = [
      layout.house,
      layout.screenHouse,
      circleRect(layout.wetWell, PUMP_WET_WELL.radius),
      circleRect(layout.surgeTank, 1.5),
      layout.vault,
      layout.transformer,
    ];
    for (const r of rects) expect(inside(r, lot)).toBe(true);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i]!, rects[j]!), `${i} vs ${j}`).toBe(false);
      }
    }
  });

  it.each([0, 1, 2, 3] as const)(
    'stands every part inside the lot with the water on side %i',
    (side) => {
      expectPartsInsideLot(PUMP, 0, waterOn(side, PUMP));
    },
  );
});

describe('the drain', () => {
  const layout = computeDrainLayout(DRAIN.footprint);
  const lot = lotOf(DRAIN.footprint);

  it('stands a 4 × 2.4 m headwall behind a 6 × 4 m riprap apron at the water edge, with 2 m wingwalls flared at 45°', () => {
    expect([width(layout.headwall), DRAIN_HEADWALL.h]).toEqual([4, 2.4]);
    expect([width(layout.apron), depth(layout.apron)]).toEqual([6, 4]);
    expect(layout.apron.z1).toBeCloseTo(lot.z1, 9);
    expect(layout.headwall.z1).toBeCloseTo(layout.apron.z0, 9);
    expect(DRAIN_WINGWALL.length).toBe(2);
    expect(layout.wingwalls).toHaveLength(2);
    for (const w of layout.wingwalls) {
      expect(Math.abs(w.yaw)).toBeCloseTo(Math.PI / 4, 9);
      expect(w.z).toBeGreaterThan(layout.headwall.z1);
      expect(Math.abs(w.x)).toBeGreaterThan(DRAIN_HEADWALL.w / 2);
    }
    expect(DRAIN_APRON).toEqual({ w: 6, d: 4 });
  });

  it('carries a 1.07 m guard rail on the headwall and a 1.5 m pipe through it 4 m out over the water', () => {
    expect(DRAIN_GUARD_RAIL_M).toBe(1.07);
    const headwall = boundsOf(DRAIN, 'drainHeadwall');
    expect(headwall.max.y).toBeCloseTo(DRAIN_HEADWALL.h + DRAIN_GUARD_RAIL_M, 5);
    expect(DRAIN_OUTFALL_RADIUS * 2).toBe(1.5);
    const outfall = boundsOf(DRAIN, 'drainOutfall');
    expect(outfall.max.z).toBeCloseTo(lot.z1 + DRAIN_OUTFALL_OVERHANG, 6);
    expect(outfall.min.z).toBeLessThan(layout.headwall.z0);
    expect(outfall.max.y).toBeLessThan(DRAIN_HEADWALL.h);
  });

  it.each([0, 1, 2, 3] as const)(
    'stands every part inside the lot with the water on side %i',
    (side) => {
      expectPartsInsideLot(DRAIN, 0, waterOn(side, DRAIN));
    },
  );
});

describe('the sewage works', () => {
  const layout = computeWorksLayout(WORKS.footprint);
  const lot = lotOf(WORKS.footprint);

  it('settles in three 13.7 m clarifiers, two primary and one secondary, each with a bridge from rim to centre under a 1.07 m rail', () => {
    expect(WORKS_CLARIFIER_COUNT).toBe(3);
    expect(layout.clarifiers).toHaveLength(3);
    expect(WORKS_CLARIFIER.radius * 2).toBeCloseTo(13.7, 9);
    expect(WORKS_CLARIFIER.wall).toBe(1.2);
    expect(WORKS_CLARIFIER.rail).toBe(1.07);
    const clarifier = boundsOf(WORKS, 'worksClarifier');
    expect(clarifier.max.x - clarifier.min.x).toBeCloseTo(13.7, 5);
    // The bridge reaches from the rim (-Z) to the centre; the rail stands 1.07 m over its deck.
    expect(clarifier.min.z).toBeCloseTo(-WORKS_CLARIFIER.radius, 1);
    expect(clarifier.max.y).toBeGreaterThanOrEqual(
      WORKS_CLARIFIER.wall + 0.15 + WORKS_CLARIFIER.rail,
    );
    expect(layout.clarifiers[0]!.z).toBeCloseTo(layout.clarifiers[1]!.z, 9);
    expect(layout.clarifiers[2]!.z).toBeGreaterThan(layout.clarifiers[0]!.z);
  });

  it('aerates in a 20 × 8 m basin 1.5 m above grade with a walkway, digests under a dome 12 m across 8 m up, and chlorinates in a 6 × 3.7 m tank with two baffles', () => {
    expect([width(layout.basin), depth(layout.basin), WORKS_BASIN.wall]).toEqual([20, 8, 1.5]);
    expect(layout.walkway.z0).toBeCloseTo(layout.basin.z1, 9);
    expect(width(layout.walkway)).toBeCloseTo(20, 9);
    expect([WORKS_DIGESTER.radius * 2, WORKS_DIGESTER.h]).toEqual([12, 8]);
    expect(width(layout.contact)).toBeCloseTo(6, 9);
    expect(depth(layout.contact)).toBeCloseTo(3.7, 9);
    expect(WORKS_CONTACT_TANK.baffles).toBe(2);
    const plant = boundsOf(WORKS, 'worksPlant');
    expect(plant.max.y).toBeCloseTo(WORKS_DIGESTER.h + WORKS_DIGESTER.dome, 5);
  });

  it('takes the inlet at the screen house on the land side and lets out by the outfall on the water side', () => {
    expect(layout.screenHouse.z0).toBeLessThan(0);
    expect(layout.screenHouse.z1).toBeLessThan(layout.clarifiers[0]!.z);
    expect(layout.contact.z1).toBeGreaterThan(0);
    const outfall = boundsOf(WORKS, 'worksOutfall');
    expect(outfall.max.z).toBeCloseTo(lot.z1 + DRAIN_OUTFALL_OVERHANG, 6);
  });

  it('keeps every tank and building clear of every other and inside the lot', () => {
    const rects = [
      layout.screenHouse,
      layout.grit,
      ...layout.clarifiers.map((c) => circleRect(c, WORKS_CLARIFIER.radius)),
      layout.basin,
      layout.walkway,
      layout.blower,
      circleRect(layout.digester, WORKS_DIGESTER.radius),
      layout.contact,
      layout.house,
    ];
    for (const r of rects) expect(inside(r, lot)).toBe(true);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i]!, rects[j]!), `${i} vs ${j}`).toBe(false);
      }
    }
  });

  it.each([0, 1, 2, 3] as const)(
    'stands every part inside the lot with the water on side %i',
    (side) => {
      expectPartsInsideLot(WORKS, 0, waterOn(side, WORKS));
    },
  );
});

describe('the recycling depot', () => {
  const layout = computeRecyclingDepotLayout(DEPOT.footprint);
  const lot = lotOf(DEPOT.footprint);

  it('lines six 6.7 × 2.4 × 1.5 m roll-offs along the yard’s back with 12 m of hook-lift pull clearance and a 7.3 m aisle before them', () => {
    expect(RECYCLING_ROLL_OFF).toEqual({ w: 2.4, l: 6.7, h: 1.5 });
    expect(RECYCLING_ROLL_OFF_COUNT).toBe(6);
    expect(layout.rollOffs).toHaveLength(6);
    const front = layout.rollOffs[0]!.z + RECYCLING_ROLL_OFF.l / 2;
    for (let i = 0; i < layout.rollOffs.length; i++) {
      const r = layout.rollOffs[i]!;
      expect(r.z).toBeCloseTo(layout.rollOffs[0]!.z, 9);
      if (i > 0)
        expect(r.x - layout.rollOffs[i - 1]!.x).toBeGreaterThanOrEqual(RECYCLING_ROLL_OFF.w);
      expect(r.z - RECYCLING_ROLL_OFF.l / 2).toBeGreaterThanOrEqual(lot.z0);
      expect(r.z).toBeLessThan(0);
    }
    expect(RECYCLING_PULL_M).toBe(12);
    expect(RECYCLING_AISLE_M).toBe(7.3);
    const nearest = Math.min(
      ...layout.stalls.map((s) => s.z0),
      layout.shed.z0 > front ? layout.shed.z0 : Infinity,
    );
    expect(nearest - front).toBeGreaterThanOrEqual(RECYCLING_PULL_M - 1e-9);
    expect(nearest - front).toBeGreaterThanOrEqual(RECYCLING_AISLE_M - 1e-9);
  });

  it('marks eight 2.7 × 5.5 m stalls along the aisle', () => {
    expect(RECYCLING_STALL).toEqual({ w: 2.7, l: 5.5 });
    expect(RECYCLING_STALL_COUNT).toBe(8);
    expect(layout.stalls).toHaveLength(8);
    for (const s of layout.stalls) {
      expect(width(s)).toBeCloseTo(2.7, 9);
      expect(depth(s)).toBeCloseTo(5.5, 9);
      expect(s.z0).toBeCloseTo(layout.stalls[0]!.z0, 9);
    }
  });

  it('sorts in a 12 × 8 m shed at a 6 m eave open to the yard, with a 4 × 3 m office by the gate', () => {
    expect([width(layout.shed), depth(layout.shed), RECYCLING_SHED_SIZE.h]).toEqual([12, 8, 6]);
    expect([width(layout.office), depth(layout.office)]).toEqual([4, 3]);
    // By the gate: on the street half, within a few metres of the gate's post.
    expect(layout.office.z0).toBeGreaterThan(0);
    expect(layout.office.x0 - layout.gate.x1).toBeLessThan(3);
    expect(layout.office.x0).toBeGreaterThanOrEqual(layout.gate.x1);
    // Open to the yard: the shed's street face has no wall, only its two posts.
    const depot = boundsOf(DEPOT, 'recyclingDepot');
    expect(depot.max.y).toBeCloseTo(RECYCLING_SHED_SIZE.h + 0.4, 5);
  });

  it.each([0, 1, 2, 3] as const)('stands every part inside the lot at rotation %i', (rotation) => {
    expectPartsInsideLot(DEPOT, rotation);
  });
});

describe('the materials recovery facility', () => {
  const layout = computeMrfLayout(MRF.footprint);

  it('bands its hall with a 3 m wainscot and opens three 5.5 × 7.9 m doors on the street side', () => {
    expect(MRF_WAINSCOT_M).toBe(3);
    expect(MRF_DOOR_SIZE).toEqual({ w: 5.5, h: 7.9 });
    const hall = boundsOf(MRF, 'mrfHall');
    expect(hall.max.z).toBeGreaterThan(layout.hall.z + 46.5 / 2);
  });

  it('loads bales at two docks on the yard side, 1.2 m up behind 2.74 × 3.05 m doors at 4.3 m centres, with a leveller at each', () => {
    expect(MRF_DOCK).toEqual({
      doors: 2,
      h: 1.2,
      depth: 2.6,
      doorW: 2.74,
      doorH: 3.05,
      centres: 4.3,
    });
    expect(layout.dockDoors).toHaveLength(2);
    expect(layout.dock.x0).toBeCloseTo(layout.hall.x + 54 / 2, 9);
    expect(width(layout.dock)).toBeCloseTo(2.6, 9);
    expect(layout.dockDoors[1]!.z - layout.dockDoors[0]!.z).toBeCloseTo(4.3, 9);
    // The dock and its shelters stay clear of the bale yard.
    const firstBale = Math.min(...layout.bales.map((b) => b.x - MRF_BALE_SIZE.w / 2));
    expect(layout.dock.x1 + 0.4).toBeLessThan(firstBale);
  });

  it('stacks bales three high and never above 6 m, and vents through four 1.2 m roof fans', () => {
    expect(MRF_BALE_STACK.high).toBe(3);
    expect(MRF_BALE_STACK.high * MRF_BALE_SIZE.h).toBeLessThanOrEqual(MRF_BALE_STACK.capM);
    expect(MRF_FAN).toEqual({ radius: 0.6, h: 0.8, count: 4 });
    expect(layout.fans).toHaveLength(4);
  });

  it('weighs at a truck scale with its scale house on the way in, clear of the office', () => {
    const scale = boundsOf(MRF, 'mrfScale');
    expect(scale.max.z - scale.min.z).toBeCloseTo(TRANSFER_WEIGHBRIDGE_SIZE.l, 5);
    const office = boundsOf(MRF, 'mrfOffice');
    expect(scale.max.x).toBeLessThan(office.min.x);
    expect(layout.weighbridge.z).toBeGreaterThan(0);
  });

  it.each([0, 1, 2, 3] as const)('stands every part inside the lot at rotation %i', (rotation) => {
    expectPartsInsideLot(MRF, rotation);
  });
});

describe('the transfer station', () => {
  const layout = computeTransferLayout(TRANSFER.footprint);

  it('draws its three street doors open at 7.3 m clear, so nothing fills the opening below the lintel', () => {
    expect(TRANSFER_DOOR).toEqual({ w: 6, clear: 7.3, count: 3 });
    expect(layout.doors).toHaveLength(3);
    const geometry = new UtilityKitRenderer(new THREE.Scene(), flat, [TRANSFER]).partGeometry(
      'transfer-station',
      'transferHall',
    )!;
    const position = geometry.getAttribute('position');
    const front = layout.hall.z + TRANSFER_HALL_SIZE.d / 2;
    for (const door of layout.doors) {
      let filled = 0;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        if (Math.abs(x - door.x) < 2.5 && Math.abs(z - front) < 0.5 && y < 6.9) filled++;
      }
      expect(filled).toBe(0);
    }
  });

  it('lines the hall’s three closed sides with 4.3 × 0.3 m push walls, and guards the sunken bay with a 1.07 m wall', () => {
    expect(TRANSFER_PUSH_WALL).toEqual({ h: 4.3, t: 0.3 });
    expect(layout.pushWalls).toHaveLength(3);
    const hallRect: Rect = {
      x0: layout.hall.x - TRANSFER_HALL_SIZE.w / 2,
      x1: layout.hall.x + TRANSFER_HALL_SIZE.w / 2,
      z0: layout.hall.z - TRANSFER_HALL_SIZE.d / 2,
      z1: layout.hall.z + TRANSFER_HALL_SIZE.d / 2,
    };
    for (const wall of layout.pushWalls) {
      expect(inside(wall, hallRect)).toBe(true);
      expect(Math.min(width(wall), depth(wall))).toBeCloseTo(0.3, 9);
    }
    // One along the back, two along the sides, none along the street wall.
    const alongX = layout.pushWalls.filter((w) => depth(w) < 1);
    expect(alongX).toHaveLength(1);
    expect(alongX[0]!.z0).toBeCloseTo(hallRect.z0 + 0.3, 9);
    expect(layout.pushWalls.filter((w) => width(w) < 1)).toHaveLength(2);
    expect(TRANSFER_GUARD_WALL_M).toBe(1.07);
  });

  it.each([0, 1, 2, 3] as const)('stands every part inside the lot at rotation %i', (rotation) => {
    expectPartsInsideLot(TRANSFER, rotation);
  });
});

describe('all eight', () => {
  it('light nothing', () => {
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, EIGHT);
    renderer.setNightFactor(1);
    const kinds: UtilityKitPartKind[] = [
      'coalGrounds',
      'coalPlant',
      'coalSmokestack',
      'coalHeap',
      'incineratorGrounds',
      'incineratorPlant',
      'incineratorStack',
      'pumpGrounds',
      'pumpStation',
      'pumpIntake',
      'drainGrounds',
      'drainHeadwall',
      'drainOutfall',
      'worksGrounds',
      'worksPlant',
      'worksClarifier',
      'worksOutfall',
      'recyclingYard',
      'recyclingDepot',
      'recyclingRollOff',
      'recyclingTruck',
      'mrfYard',
      'mrfHall',
      'mrfBales',
      'mrfOffice',
      'mrfScale',
      'mrfTruck',
      'transferYard',
      'transferHall',
      'transferScale',
      'transferRig',
      'transferPacker',
    ];
    let seen = 0;
    for (const entry of EIGHT) {
      for (const kind of kinds) {
        const emissive = renderer.partEmissiveHex(entry.id, kind);
        if (emissive === null) continue;
        seen++;
        expect(emissive, `${entry.id} ${kind}`).toBe(0);
      }
    }
    expect(seen).toBe(kinds.length);
  });

  it('are deterministic: two renderers given the same delta place every part identically', () => {
    for (const entry of EIGHT) {
      const a = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
      const b = new UtilityKitRenderer(new THREE.Scene(), flat, [entry]);
      a.apply(add(instance(3, entry.id)));
      b.apply(add(instance(3, entry.id)));
      for (const kind of [
        'coalPlant',
        'incineratorPlant',
        'pumpStation',
        'drainHeadwall',
        'worksClarifier',
        'recyclingRollOff',
        'mrfHall',
        'transferHall',
      ] as const) {
        const slotsA = a.partSlotsFor(3, kind);
        const slotsB = b.partSlotsFor(3, kind);
        expect(slotsA).toEqual(slotsB);
        for (let i = 0; i < slotsA.length; i++) {
          const mA = new THREE.Matrix4();
          const mB = new THREE.Matrix4();
          a.getPartMatrix(entry.id, kind, slotsA[i]!, mA);
          b.getPartMatrix(entry.id, kind, slotsB[i]!, mB);
          expect(mA.elements).toEqual(mB.elements);
        }
      }
    }
  });

  it('stay within the kit tier, the drain and the depot under 2,000 triangles', () => {
    const triangles = (entry: BuildingCatalogEntry): number => {
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
    };
    const table: Record<string, number> = {};
    for (const entry of EIGHT) {
      table[entry.id] = triangles(entry);
      expect(table[entry.id], entry.id).toBeLessThanOrEqual(KIT_TIER);
    }
    expect(table['water-drain']).toBeLessThan(2000);
    expect(table['recycling-depot']).toBeLessThan(2000);
    expect(RECYCLING_YARD_HEIGHT).toBe(0.3);
  });
});
