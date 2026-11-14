/**
 * An industrial lot's yard parts over the real catalog: every part of the
 * plant stands on ground the lot's layout leaves free (or on the tank farm
 * that is the plant's own), a flare stands on the farm's paving and is piped
 * to a tank, and a roof stack stays on the roof.
 */
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { footprintForRotation } from '../shared/footprint';
import { ZoneType, type BuildingCatalogEntry } from '../shared/types';
import type { BuildingPart } from './archetypes';
import {
  kitPlanFor,
  placementBounds,
  TANK_HEIGHT_M,
  type KitPlan,
  type LocalRect,
  type PartPlacement,
} from './buildingkit';
import {
  computeCornerOffset,
  computeSiloClusterPlacements,
  hasSiloCluster,
  hasSmokestack,
  smokestackCorner,
  smokestackSize,
} from './props';

const industrial = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.filter(
  (e) => e.category === 'ind' && e.zone !== ZoneType.Agriculture,
);
type StreetSide = 'N' | 'E' | 'S' | 'W';
const SIDES: readonly StreetSide[] = ['N', 'E', 'S', 'W'];
const TURNS = [0, 1, 2, 3] as const;
/** A pipe rack crosses ground only on a bridge at least this clear (a loading berth's 14 ft). */
const BRIDGE_CLEAR_M = 4.3;
const EPS = 1e-6;

/** The plant's own parts that stand on the yard, as opposed to the body's facade parts and roof gear. */
const YARD_PARTS: ReadonlySet<BuildingPart> = new Set<BuildingPart>([
  'tanks',
  'bundWall',
  'bullet',
  'pipeRack',
  'processColumn',
  'coolingTower',
  'coolingFan',
  'flare',
  'flareTip',
  'silo',
  'baghouse',
  'stack',
  'yardFence',
  'chipPile',
  'stacker',
  'furnace',
  'stove',
  'skipBridge',
  'recoveryStack',
  'scrapYard',
  'gantry',
]);

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

const plans = industrial.flatMap((e) =>
  TURNS.flatMap((rotation) =>
    SIDES.map((side) => {
      const f = footprintForRotation(e, rotation);
      const plan = kitPlanFor(e, { id: 7, x: 10, z: 10, rotation }, streetOn(side, f.w, f.d))!;
      return { e, rotation, side, plan };
    }),
  ),
);
const lotted = plans.filter((p) => p.plan.lot);

const overlap = (a: LocalRect, b: LocalRect): boolean =>
  a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;
const inside = (a: LocalRect, b: LocalRect): boolean =>
  a.x0 >= b.x0 - EPS && a.x1 <= b.x1 + EPS && a.z0 >= b.z0 - EPS && a.z1 <= b.z1 + EPS;
const only = (plan: KitPlan, part: BuildingPart): PartPlacement[] =>
  plan.placements.filter((p) => p.part === part);

describe('an industrial plant’s yard parts', () => {
  it('has lots to measure for every kind', () => {
    for (const kind of [
      'workshop',
      'warehouse',
      'factory',
      'flex',
      'foodplant',
      'chemical',
      'metals',
      'paper',
    ]) {
      expect(
        lotted.some((p) => p.e.kind === kind),
        kind,
      ).toBe(true);
    }
  });

  it('never stand on a stall, aisle, drive, berth, trailer stall or walk, but for a bridge overhead', () => {
    let measured = 0;
    for (const { e, rotation, side, plan } of lotted) {
      const lot = plan.lot!;
      for (const p of plan.placements) {
        if (!YARD_PARTS.has(p.part)) continue;
        if (p.offset[1] - p.size[1] / 2 >= BRIDGE_CLEAR_M) continue;
        measured += 1;
        const b = placementBounds(p);
        for (const t of lot.taken) {
          if (t === lot.farm) continue;
          expect(overlap(b, t), `${e.id} r${rotation}${side} ${p.part}`).toBe(false);
        }
      }
    }
    expect(measured).toBeGreaterThan(0);
  });

  it('keep the tank farm’s tanks inside its paving, clear of every drive', () => {
    const farmed = lotted.filter((p) => p.plan.lot!.farm);
    expect(farmed.length).toBeGreaterThan(0);
    for (const { e, rotation, side, plan } of farmed) {
      for (const tank of only(plan, 'tanks')) {
        expect(inside(placementBounds(tank), plan.lot!.farm!), `${e.id} r${rotation}${side}`).toBe(
          true,
        );
      }
    }
  });

  it('keep a roof stack and a roof silo cluster on the roof, never over the car park', () => {
    let stacks = 0;
    for (const { e, plan } of plans) {
      if (!hasSmokestack(e) && !hasSiloCluster(e)) continue;
      const roof = plan.topBox;
      const roofRect = { x0: -roof.w / 2, x1: roof.w / 2, z0: -roof.d / 2, z1: roof.d / 2 };
      if (hasSmokestack(e)) {
        stacks += 1;
        const at = computeCornerOffset(roof, smokestackCorner(7));
        const s = smokestackSize(e);
        const foot = {
          x0: at.x - s.w / 2,
          x1: at.x + s.w / 2,
          z0: at.z - s.d / 2,
          z1: at.z + s.d / 2,
        };
        expect(inside(foot, roofRect), `${e.id} stack`).toBe(true);
        for (const t of plan.lot?.taken ?? [])
          expect(overlap(foot, t), `${e.id} stack`).toBe(false);
      }
      if (hasSiloCluster(e)) {
        for (const at of computeSiloClusterPlacements(roof, 7)) {
          expect(Math.abs(at.x) <= roof.w / 2 && Math.abs(at.z) <= roof.d / 2, `${e.id} silo`).toBe(
            true,
          );
        }
      }
    }
    expect(stacks).toBeGreaterThan(0);
  });
});

describe('a chemical plant’s flare', () => {
  const chemical = lotted.filter((p) => p.e.kind === 'chemical');

  it('stands on the tank farm’s paving inside the lot', () => {
    expect(chemical.length).toBeGreaterThan(0);
    for (const { e, rotation, side, plan } of chemical) {
      const flares = only(plan, 'flare');
      expect(flares, `${e.id} r${rotation}${side}`).toHaveLength(1);
      const b = placementBounds(flares[0]!);
      expect(inside(b, plan.lot!.farm!), `${e.id} r${rotation}${side} on paving`).toBe(true);
      expect(inside(b, plan.lot!.lot), `${e.id} r${rotation}${side} in lot`).toBe(true);
    }
  });

  it('is piped to the nearest tank by a run on a rack over the tank’s top', () => {
    for (const { e, rotation, side, plan } of chemical) {
      const [flare] = only(plan, 'flare');
      const fb = placementBounds(flare!);
      const tanks = only(plan, 'tanks').map(placementBounds);
      const near = tanks.reduce((a, t) => {
        const d = (r: LocalRect): number =>
          Math.hypot((r.x0 + r.x1) / 2 - flare!.offset[0], (r.z0 + r.z1) / 2 - flare!.offset[2]);
        return d(t) < d(a) ? t : a;
      });
      const run = only(plan, 'pipeRack').find(
        (r) =>
          r.size[1] < 1 &&
          overlap(placementBounds(r), {
            ...fb,
            x0: fb.x0 - 0.01,
            x1: fb.x1 + 0.01,
            z0: fb.z0 - 0.01,
            z1: fb.z1 + 0.01,
          }) &&
          overlap(placementBounds(r), near),
      );
      expect(run, `${e.id} r${rotation}${side}`).toBeDefined();
      expect(run!.offset[1] - run!.size[1] / 2).toBeGreaterThanOrEqual(TANK_HEIGHT_M - EPS);
    }
  });
});
