/**
 * An industrial lot's yard parts over the real catalog: every part of the
 * plant stands on ground the lot's layout leaves free (or on the tank farm
 * that is the plant's own), a flare stands on the farm's paving and is piped
 * to a tank, and a roof stack stays on the roof.
 */
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { footprintForRotation } from '../shared/footprint';
import type { LotRect } from '../shared/lotlayout';
import { lotLayoutFor } from '../shared/lotparking';
import { ZoneType, type BuildingCatalogEntry } from '../shared/types';
import type { BuildingPart } from './archetypes';
import {
  kitPlanFor,
  placementBounds,
  RECOVERY_STACK_DIAMETER_M,
  RECOVERY_STACK_HEIGHT_M,
  RECOVERY_STACK_TOP_RATIO,
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
  'stackPlinth',
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

/** Whether `plan` has a paved yard that `rects` all stand inside, and the first that does not. */
const strays = (plan: KitPlan, parts: readonly BuildingPart[]): PartPlacement[] =>
  plan.placements.filter(
    (p) => parts.includes(p.part) && !(plan.lot?.farm && inside(placementBounds(p), plan.lot.farm)),
  );

describe('a chemical plant’s bund wall', () => {
  const chemical = lotted.filter((p) => p.e.kind === 'chemical');

  it('stands on the farm’s paving, the paving reaching the wall’s outer face on every side', () => {
    let walls = 0;
    for (const { e, rotation, side, plan } of chemical) {
      for (const wall of only(plan, 'bundWall')) {
        walls += 1;
        expect(inside(placementBounds(wall), plan.lot!.farm!), `${e.id} r${rotation}${side}`).toBe(
          true,
        );
      }
    }
    expect(walls).toBeGreaterThan(0);
  });

  it('keeps a bund round every chemical plant, drawn in only as far as the lot forces', () => {
    for (const { e, rotation, side, plan } of chemical) {
      expect(only(plan, 'bundWall').length, `${e.id} r${rotation}${side}`).toBe(3);
    }
  });
});

describe('a food plant’s and a steelworks’ hardstanding', () => {
  const yards = lotted.filter((p) => p.e.kind === 'foodplant' || p.e.kind === 'metals');
  const PLANT_PARTS: readonly BuildingPart[] = [
    'silo',
    'furnace',
    'stove',
    'stack',
    'scrapYard',
    'gantry',
  ];

  it('lays a paved yard behind the body for every lot that has the ground', () => {
    const paved = yards.filter((p) => p.plan.lot!.farm);
    expect(paved.length).toBeGreaterThan(0);
    for (const kind of ['foodplant', 'metals']) {
      expect(
        paved.some((p) => p.e.kind === kind),
        kind,
      ).toBe(true);
    }
  });

  it('stands every yard part on that paving', () => {
    let measured = 0;
    for (const { e, rotation, side, plan } of yards) {
      if (!plan.lot!.farm) continue;
      const mine = plan.placements.filter((p) => PLANT_PARTS.includes(p.part));
      measured += mine.length;
      expect(strays(plan, PLANT_PARTS), `${e.id} r${rotation}${side}`).toEqual([]);
    }
    expect(measured).toBeGreaterThan(0);
  });

  it('joins the paving to the drive: it touches an aisle or the throat, and takes no stall, berth or trailer stall', () => {
    const touching = (a: LotRect, b: LotRect): boolean =>
      a.u0 <= b.u1 + EPS && b.u0 <= a.u1 + EPS && a.v0 <= b.v1 + EPS && b.v0 <= a.v1 + EPS;
    const crossing = (a: LotRect, b: LotRect): boolean =>
      a.u0 < b.u1 - EPS && b.u0 < a.u1 - EPS && a.v0 < b.v1 - EPS && b.v0 < a.v1 - EPS;
    let paved = 0;
    for (const e of industrial.filter((x) =>
      ['foodplant', 'metals', 'chemical'].includes(x.kind!),
    )) {
      for (const rotation of TURNS) {
        for (const alongX of [true, false]) {
          const layout = lotLayoutFor(e, rotation, alongX)!;
          const yard = layout.rearYard;
          if (!yard) continue;
          paved += 1;
          const label = `${e.id} r${rotation} ${alongX ? 'x' : 'z'}`;
          const drive = [
            ...layout.aisles,
            ...layout.accessAisles,
            ...(layout.throat ? [layout.throat] : []),
          ];
          expect(
            drive.some((t) => touching(t, yard)),
            `${label} touches the drive`,
          ).toBe(true);
          const ground = [
            layout.body,
            ...layout.stalls.map((s) => s.rect),
            ...layout.berths,
            ...layout.trailerStalls,
            ...layout.aisles,
            ...layout.accessAisles,
          ];
          for (const t of ground)
            expect(crossing(yard, t), `${label} keeps off the ground`).toBe(false);
        }
      }
    }
    expect(paved).toBeGreaterThan(0);
  });
});

describe('a paper mill’s recovery stack', () => {
  const paper = lotted.filter((p) => p.e.kind === 'paper');
  const part = (plan: KitPlan, name: BuildingPart): PartPlacement => only(plan, name)[0]!;

  it('is a 90 m shaft a fifteenth as wide at its foot, tapering to a narrower mouth', () => {
    expect(RECOVERY_STACK_HEIGHT_M).toBe(90);
    expect(RECOVERY_STACK_DIAMETER_M).toBeCloseTo(RECOVERY_STACK_HEIGHT_M / 15, 9);
    expect(RECOVERY_STACK_TOP_RATIO).toBeGreaterThan(0.6);
    expect(RECOVERY_STACK_TOP_RATIO).toBeLessThan(0.9);
    expect(paper.length).toBeGreaterThan(0);
    for (const { e, plan } of paper) {
      const shaft = part(plan, 'recoveryStack');
      expect(shaft.size, e.id).toEqual([
        RECOVERY_STACK_DIAMETER_M,
        RECOVERY_STACK_HEIGHT_M,
        RECOVERY_STACK_DIAMETER_M,
      ]);
      expect(shaft.offset[1] - shaft.size[1] / 2).toBeCloseTo(0, 9);
    }
  });

  it('carries a dark band at its mouth and a platform ring, wider than the shaft, partway up', () => {
    for (const { e, plan } of paper) {
      const shaft = part(plan, 'recoveryStack');
      const band = part(plan, 'stackBand');
      const ring = part(plan, 'stackRing');
      expect(band.offset[1] + band.size[1] / 2, `${e.id} band top`).toBeCloseTo(
        RECOVERY_STACK_HEIGHT_M,
        9,
      );
      expect(band.size[1], `${e.id} band`).toBeGreaterThanOrEqual(2);
      const ringAt = ring.offset[1];
      expect(ringAt).toBeGreaterThan(RECOVERY_STACK_HEIGHT_M / 2);
      expect(ringAt).toBeLessThan(RECOVERY_STACK_HEIGHT_M - band.size[1]);
      const wide =
        RECOVERY_STACK_DIAMETER_M * (1 - (1 - RECOVERY_STACK_TOP_RATIO) * (ringAt / shaft.size[1]));
      expect(ring.size[0], `${e.id} ring`).toBeGreaterThan(wide);
      expect(ring.size[1]).toBeLessThanOrEqual(0.5);
    }
  });

  it('stands on a low plinth that holds its whole foot, on the lot', () => {
    for (const { e, rotation, side, plan } of paper) {
      const shaft = placementBounds(part(plan, 'recoveryStack'));
      const plinth = part(plan, 'stackPlinth');
      expect(inside(shaft, placementBounds(plinth)), `${e.id} r${rotation}${side}`).toBe(true);
      expect(plinth.size[0]).toBeCloseTo(RECOVERY_STACK_DIAMETER_M + 1, 9);
      expect(plinth.size[1]).toBeLessThanOrEqual(2);
      expect(inside(placementBounds(plinth), plan.lot!.lot)).toBe(true);
    }
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
