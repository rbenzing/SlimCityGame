import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from '../shared/types';
import { footprintForRotation } from '../shared/footprint';
import { lotLayoutFor } from '../shared/lotparking';
import { WALL_LOCKER_ZONE_M } from '../shared/lotgrounds';
import { repairBays } from '../shared/parkingcode';
import { hasPart, partsFor, type BuildingPart } from './archetypes';
import {
  kitPlanFor,
  placementBounds,
  REPAIR_BAY_M,
  REPAIR_DOOR_HEIGHT_M,
  type KitPlan,
  type LocalRect,
  type PartPlacement,
} from './buildingkit';
import { tierCountOf } from './massing';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const repairs = catalog.filter((e) => e.kind === 'autorepair');
const stores = catalog.filter((e) => e.kind === 'convenience');

type StreetSide = 'N' | 'E' | 'S' | 'W';

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

const only = (plan: KitPlan, part: BuildingPart): PartPlacement[] =>
  plan.placements.filter((p) => p.part === part);

const inside = (r: LocalRect, lot: LocalRect): boolean =>
  r.x0 >= lot.x0 - 1e-6 && r.x1 <= lot.x1 + 1e-6 && r.z0 >= lot.z0 - 1e-6 && r.z1 <= lot.z1 + 1e-6;
const overlap = (a: LocalRect, b: LocalRect): boolean =>
  a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

/** Where the street face lies on an axis, along it: the plan's coordinate in the face's direction. */
const alongOf = (p: PartPlacement, side: StreetSide): number =>
  side === 'N' || side === 'S' ? p.offset[0] : p.offset[2];

describe('both kinds are one volume at every level', () => {
  it('stand as a single tier, not a stack', () => {
    for (const e of [...repairs, ...stores]) expect(tierCountOf(e), e.id).toBe(1);
  });
});

describe('an auto repair shop', () => {
  for (const side of ['S', 'N', 'E', 'W'] as const) {
    for (const e of repairs) {
      const plan = kitOf(e, 0, side);
      const alongFace = side === 'N' || side === 'S' ? plan.baseBox.w : plan.baseBox.d;

      it(`${e.id} (${side}) draws a bay door for each 3.7 m of its street face, none wider than a bay`, () => {
        const doors = only(plan, 'rollUpDoors');
        expect(doors).toHaveLength(repairBays(alongFace));
        for (const d of doors) {
          const width = side === 'N' || side === 'S' ? d.size[0] : d.size[2];
          expect(width).toBeLessThanOrEqual(REPAIR_BAY_M + 1e-9);
          expect(width).toBeGreaterThan(3);
          expect(d.size[1]).toBeCloseTo(REPAIR_DOOR_HEIGHT_M, 5);
        }
        const centres = doors.map((d) => alongOf(d, side)).sort((a, b) => a - b);
        for (let i = 1; i < centres.length; i++) {
          expect(centres[i]! - centres[i - 1]!).toBeGreaterThan(3.7 - 1e-6);
        }
      });
    }
  }

  it('lays the car park for as many doors as it draws', () => {
    for (const e of repairs) {
      for (const [rotation, side] of [
        [0, 'S'],
        [1, 'S'],
        [0, 'E'],
      ] as const) {
        const plan = kitOf(e, rotation, side);
        const alongX = side !== 'E';
        const layout = lotLayoutFor(e, rotation, alongX)!;
        expect(layout.required, `${e.id} r${rotation} ${side}`).toBe(
          2 * only(plan, 'rollUpDoors').length + (e.jobs ?? 0),
        );
      }
    }
  });

  it('signs above the doors, under the roof, with no canopy or awning', () => {
    for (const e of repairs) {
      const plan = kitOf(e, 0, 'S');
      const [band] = only(plan, 'signageBand');
      expect(band, e.id).toBeDefined();
      expect(band!.offset[1] - band!.size[1] / 2, e.id).toBeGreaterThanOrEqual(
        REPAIR_DOOR_HEIGHT_M,
      );
      expect(band!.offset[1] + band!.size[1] / 2, e.id).toBeLessThanOrEqual(e.height);
      for (const part of ['canopy', 'awning', 'cornice', 'bulkhead'] as const) {
        expect(hasPart(e, part), `${e.id} ${part}`).toBe(false);
        expect(only(plan, part)).toHaveLength(0);
      }
    }
  });

  it('puts a glazed office and its door in the end wall beside the drive, at the street corner', () => {
    for (const e of repairs) {
      const plan = kitOf(e, 0, 'S');
      const [glass] = only(plan, 'glassFront');
      const [door] = only(plan, 'walkDoor');
      expect(glass, e.id).toBeDefined();
      expect(door, e.id).toBeDefined();
      const half = plan.baseBox.w / 2;
      // Street on S: ends are E and W, standing at x = +-half, and the street corner is at +z.
      expect(Math.abs(Math.abs(glass!.offset[0]) - half), e.id).toBeLessThan(0.5);
      expect(Math.sign(door!.offset[0]), e.id).toBe(Math.sign(glass!.offset[0]));
      expect(glass!.offset[2], e.id).toBeGreaterThan(plan.baseBox.d / 2 - 6);
      expect(door!.offset[2], e.id).toBeGreaterThan(plan.baseBox.d / 2 - 6);
      expect(overlap(placementBounds(glass!), placementBounds(door!)), e.id).toBe(false);
      expect(only(plan, 'dockLight').length, e.id).toBe(1);
    }
  });

  it('stands its tyre rack and waste-oil tank on the end wall away from the office, clear of cars and the lot line', () => {
    let drawn = 0;
    for (const e of repairs) {
      const plan = kitOf(e, 0, 'S');
      const [glass] = only(plan, 'glassFront');
      const rack = only(plan, 'tyreRack');
      const tanks = only(plan, 'oilTank');
      expect(rack.length, e.id).toBeLessThanOrEqual(1);
      expect(tanks.length, e.id).toBeLessThanOrEqual(1);
      for (const p of [...rack, ...tanks]) {
        drawn += 1;
        expect(Math.sign(p.offset[0]), e.id).toBe(-Math.sign(glass!.offset[0]));
        expect(inside(placementBounds(p), plan.lot!.lot), `${e.id} ${p.part}`).toBe(true);
        for (const h of plan.lot!.hard) {
          expect(overlap(placementBounds(p), h), `${e.id} ${p.part}`).toBe(false);
        }
      }
    }
    expect(drawn).toBeGreaterThan(0);
  });

  it('is a storefront-kind kit with the parts the doc names', () => {
    for (const e of repairs) {
      for (const part of [
        'rollUpDoors',
        'glassFront',
        'signageBand',
        'tyreRack',
        'oilTank',
      ] as const) {
        expect(partsFor(e), `${e.id} ${part}`).toContain(part);
      }
    }
  });
});

describe('a convenience store', () => {
  it('has a glazed front under a bright canopy band, the lockers clear of the glass', () => {
    for (const e of stores) {
      const plan = kitOf(e, 0, 'S');
      const [glass] = only(plan, 'glassFront');
      const [canopy] = only(plan, 'canopy');
      expect(glass, e.id).toBeDefined();
      expect(canopy, e.id).toBeDefined();
      expect(canopy!.color, e.id).toBeDefined();
      expect(glass!.size[0], e.id).toBeCloseTo(plan.baseBox.w - 2 * WALL_LOCKER_ZONE_M.along, 5);
      expect(glass!.offset[1] + glass!.size[1] / 2, e.id).toBeLessThan(canopy!.offset[1]);
      for (const p of [...only(plan, 'iceLocker'), ...only(plan, 'propaneCage')]) {
        expect(overlap(placementBounds(p), placementBounds(glass!)), `${e.id} ${p.part}`).toBe(
          false,
        );
      }
    }
  });

  it('stands an ice locker and a propane cage against the front wall, on the front walk', () => {
    let drawn = 0;
    for (const e of stores) {
      const plan = kitOf(e, 0, 'S');
      for (const part of ['iceLocker', 'propaneCage'] as const) {
        const found = only(plan, part);
        expect(found.length, `${e.id} ${part}`).toBeLessThanOrEqual(1);
        for (const p of found) {
          drawn += 1;
          const b = placementBounds(p);
          expect(b.z0, `${e.id} ${part}`).toBeCloseTo(plan.baseBox.d / 2, 5);
          expect(inside(b, plan.lot!.lot), `${e.id} ${part}`).toBe(true);
        }
      }
    }
    expect(drawn).toBeGreaterThan(0);
  });

  it('lines bollards along the front walk, never across the walk to the door', () => {
    let drawn = 0;
    for (const e of stores) {
      const plan = kitOf(e, 0, 'S');
      for (const b of only(plan, 'bollard')) {
        drawn += 1;
        const r = placementBounds(b);
        expect(inside(r, plan.lot!.frontWalk!), e.id).toBe(true);
        if (plan.lot!.walk) expect(overlap(r, plan.lot!.walk), e.id).toBe(false);
      }
    }
    expect(drawn).toBeGreaterThan(0);
  });

  it('carries refrigeration condensers on the roof, more at each level where the roof holds them', () => {
    const counts = stores
      .filter((e) => e.bodyFootprint === undefined)
      .map((e) => {
        const plan = kitOf(e, 0, 'S');
        const condensers = only(plan, 'condenser');
        for (const c of condensers) {
          expect(c.offset[1] - c.size[1] / 2, e.id).toBeGreaterThanOrEqual(e.height - 1e-6);
        }
        return condensers.length;
      });
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[2]!).toBeGreaterThanOrEqual(counts[0]!);
  });
});

describe('the lot’s furniture leaves a store’s lockers their ground', () => {
  it('reserves both end zones of the front wall for the kit', () => {
    for (const e of stores) {
      expect(hasPart(e, 'iceLocker'), e.id).toBe(true);
    }
  });
});
