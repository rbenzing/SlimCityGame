/**
 * The grounds plan over the real catalog: every commercial and industrial
 * entry at every turn, on both street axes, with and without a residential
 * neighbour, keeps its furnishings off the car park, the walks, the doors and
 * the body, inside the lot, and carries the pieces the lot has room for.
 */
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import type { BuildingCatalogEntry } from '../shared/types';
import { lotLayoutFor } from '../shared/lotparking';
import { MIN_FRONT_WALK_M } from '../shared/parkingcode';
import type { LotLayout, LotRect } from '../shared/lotlayout';
import {
  doorClearances,
  droppedTrees,
  FRONTAGE_TREE_SPACING_M,
  LOT_HOME_BUFFER_M,
  LOT_LIGHT_HEIGHT_M,
  LOT_LIGHT_HOME_REACH_M,
  LOT_LIGHT_NEAR_HOMES_M,
  LOT_LIGHT_SPACING_HEIGHTS,
  planLotGrounds as planUncached,
  type GroundsPiece,
  type HomeSide,
  type LotGroundsFacts,
  type LotGroundsPlan,
} from '../shared/lotgrounds';
import { groundsFactsFor } from './lotplan';

/** Each lot is planned once however many rules read it. */
const planned = new WeakMap<LotLayout, Map<string, LotGroundsPlan>>();
function planLotGrounds(layout: LotLayout, facts: LotGroundsFacts): LotGroundsPlan {
  let byFacts = planned.get(layout);
  if (!byFacts) planned.set(layout, (byFacts = new Map()));
  const key = JSON.stringify(facts);
  let plan = byFacts.get(key);
  if (!plan) byFacts.set(key, (plan = planUncached(layout, facts)));
  return plan;
}

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const lots = catalog.filter((e) => e.category === 'com' || e.category === 'ind');

const EPS = 0.01;
const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - EPS && b.u0 < a.u1 - EPS && a.v0 < b.v1 - EPS && b.v0 < a.v1 - EPS;
const inside = (r: LotRect, lot: LotRect): boolean =>
  r.u0 >= lot.u0 - EPS && r.u1 <= lot.u1 + EPS && r.v0 >= lot.v0 - EPS && r.v1 <= lot.v1 + EPS;

/** Whether a fence line passes through the open inside of a rect rather than along its edge. */
function linePasses(line: LotRect, r: LotRect): boolean {
  if (Math.abs(line.v1 - line.v0) < EPS) {
    return (
      r.v0 < line.v0 - EPS && line.v0 < r.v1 - EPS && r.u0 < line.u1 - EPS && line.u0 < r.u1 - EPS
    );
  }
  return (
    r.u0 < line.u0 - EPS && line.u0 < r.u1 - EPS && r.v0 < line.v1 - EPS && line.v0 < r.v1 - EPS
  );
}

/** Ground a piece may never meet, whatever it is. */
function solidGround(layout: LotLayout): LotRect[] {
  return [
    layout.body,
    ...layout.stalls.map((s) => s.rect),
    ...layout.accessAisles,
    ...layout.berths,
    ...layout.trailerStalls,
    ...(layout.forecourt ? [layout.forecourt] : []),
    ...(layout.rearYard ? [layout.rearYard] : []),
    ...(layout.driveThrough?.rects ?? []),
  ];
}

/** Ground vehicles drive on: only a painted crossing may meet it. */
const drivenGround = (layout: LotLayout): LotRect[] => [
  ...layout.aisles,
  ...(layout.throat ? [layout.throat] : []),
];

const isWalk = (p: GroundsPiece): boolean => p.kind === 'walk' || p.kind === 'crossing';
const isLine = (p: GroundsPiece): boolean => p.kind === 'fence' || p.kind === 'gate';
const AT_WALL: ReadonlySet<string> = new Set(['bed', 'bench', 'bin', 'bikeRack']);

const HOME_SETS: readonly (readonly HomeSide[])[] = [[], ['u-'], ['v+'], ['u-', 'u+', 'v+']];

interface Variant {
  label: string;
  layout: LotLayout;
  entry: BuildingCatalogEntry;
  homes: readonly HomeSide[];
}

function variants(): Variant[] {
  const out: Variant[] = [];
  for (const entry of lots) {
    // A lot laid along the street either way: the other turns repeat these two shapes.
    for (const alongX of [true, false]) {
      const layout = lotLayoutFor(entry, 0, alongX);
      if (!layout) continue;
      for (const homes of HOME_SETS) {
        out.push({ label: `${entry.id} ${alongX ? 'x' : 'z'} [${homes}]`, layout, entry, homes });
      }
    }
  }
  return out;
}

const ALL = variants();

describe('lot grounds plan over the catalog', () => {
  it('covers every commercial and industrial lot', () => {
    expect(new Set(ALL.map((v) => v.entry.id)).size).toBeGreaterThanOrEqual(60);
  });

  it('keeps every piece inside its lot, off the street footway', () => {
    const faults: string[] = [];
    for (const v of ALL) {
      const plan = planLotGrounds(v.layout, groundsFactsFor(v.entry, v.homes));
      for (const p of plan.pieces) {
        if (!inside(p.rect, v.layout.lot)) faults.push(`${v.label} ${p.kind}`);
      }
    }
    expect(faults).toEqual([]);
  });

  it('keeps every piece off stalls, access aisles, berths, the forecourt, yards and the body', () => {
    const faults: string[] = [];
    for (const v of ALL) {
      const plan = planLotGrounds(v.layout, groundsFactsFor(v.entry, v.homes));
      const solid = solidGround(v.layout);
      for (const p of plan.pieces) {
        const meets = isLine(p) ? linePasses : overlaps;
        if (solid.some((s) => meets(p.rect, s))) faults.push(`${v.label} ${p.kind}`);
      }
    }
    expect(faults).toEqual([]);
  });

  it('keeps every piece but a painted crossing off the aisles and the drive', () => {
    const faults: string[] = [];
    for (const v of ALL) {
      const plan = planLotGrounds(v.layout, groundsFactsFor(v.entry, v.homes));
      const driven = drivenGround(v.layout);
      const front = v.layout.frontWalk;
      for (const p of plan.pieces) {
        if (p.kind === 'crossing' || isLine(p)) continue;
        // The front walk lies over the aisle's end, and the wall furniture stands on it.
        if (AT_WALL.has(p.kind) && front && inside(p.rect, front)) continue;
        if (p.kind === 'walk' && p.laid) continue;
        if (driven.some((a) => overlaps(p.rect, a))) faults.push(`${v.label} ${p.kind}`);
      }
    }
    expect(faults).toEqual([]);
  });

  it('puts a crossing only where a walk meets driven ground', () => {
    for (const v of ALL) {
      const plan = planLotGrounds(v.layout, groundsFactsFor(v.entry, v.homes));
      for (const p of plan.pieces.filter((q) => q.kind === 'crossing')) {
        expect(
          drivenGround(v.layout).some((a) => overlaps(a, p.rect)),
          v.label,
        ).toBe(true);
      }
    }
  });

  it('keeps every other piece off the walks and leaves the front walk a clear lane', () => {
    const faults: string[] = [];
    for (const v of ALL) {
      const plan = planLotGrounds(v.layout, groundsFactsFor(v.entry, v.homes));
      const walks = [
        ...plan.pieces.filter(isWalk).map((p) => p.rect),
        ...(v.layout.entranceWalk ? [v.layout.entranceWalk] : []),
      ];
      const front = v.layout.frontWalk;
      for (const p of plan.pieces) {
        if (isWalk(p) || isLine(p)) continue;
        if (walks.some((w) => overlaps(p.rect, w))) faults.push(`${v.label} ${p.kind} on a walk`);
        if (front && overlaps(p.rect, front)) {
          const depth = p.rect.v1 - p.rect.v0;
          const lane = front.v1 - front.v0 - depth;
          const onWall = Math.abs(p.rect.v1 - v.layout.body.v0) < EPS;
          if (!AT_WALL.has(p.kind) || !onWall || lane < MIN_FRONT_WALK_M - EPS) {
            faults.push(`${v.label} ${p.kind} blocks the front walk`);
          }
        }
      }
    }
    expect(faults).toEqual([]);
  });

  it('keeps every piece off the doors, the walk to the door excepted', () => {
    const faults: string[] = [];
    for (const v of ALL) {
      const plan = planLotGrounds(v.layout, groundsFactsFor(v.entry, v.homes));
      const doors = doorClearances(v.layout);
      for (const p of plan.pieces) {
        if (isWalk(p)) continue;
        if (doors.some((d) => overlaps(p.rect, d))) faults.push(`${v.label} ${p.kind}`);
      }
    }
    expect(faults).toEqual([]);
  });

  it('keeps pieces off one another', () => {
    const faults: string[] = [];
    for (const v of ALL) {
      const plan = planLotGrounds(v.layout, groundsFactsFor(v.entry, v.homes));
      const solid = plan.pieces.filter((p) => !isLine(p));
      for (let i = 0; i < solid.length; i++) {
        for (let j = i + 1; j < solid.length; j++) {
          if (overlaps(solid[i]!.rect, solid[j]!.rect)) {
            faults.push(`${v.label} ${solid[i]!.kind}/${solid[j]!.kind}`);
          }
        }
      }
    }
    expect(faults).toEqual([]);
  });

  it('is the same plan for the same lot', () => {
    for (const v of ALL.slice(0, 60)) {
      const facts = groundsFactsFor(v.entry, v.homes);
      expect(planLotGrounds(v.layout, facts)).toEqual(planLotGrounds(v.layout, facts));
    }
  });
});

describe('the pieces a lot has room for', () => {
  const plans = ALL.map((v) => ({
    v,
    plan: planLotGrounds(v.layout, groundsFactsFor(v.entry, v.homes)),
  }));
  const count = (plan: { pieces: GroundsPiece[] }, kind: GroundsPiece['kind']): number =>
    plan.pieces.filter((p) => p.kind === kind).length;

  it('walks every lot whose layout has a walk from the street to the door', () => {
    for (const { v, plan } of plans) {
      if (v.layout.entranceWalk) expect(count(plan, 'walk'), v.label).toBeGreaterThanOrEqual(1);
    }
  });

  it('walks every strip, workshop, warehouse, factory and plant lot, through an island where no gap is clear', () => {
    const faults: string[] = [];
    for (const { v, plan } of plans) {
      const k = v.entry.kind;
      // A lot longer than deep is only ever stood with its long side on the street.
      const stood =
        v.layout.lot.u1 >= v.layout.lot.v1 || v.entry.footprint.w <= v.entry.footprint.d;
      const must =
        stood &&
        (k === 'strip' ||
          (v.entry.category === 'ind' && k !== 'flex') ||
          v.entry.id.startsWith('com-shop') ||
          v.entry.id === 'com-low-1');
      if (must && count(plan, 'walk') + count(plan, 'crossing') === 0) faults.push(v.label);
    }
    expect(faults).toEqual([]);
  });

  it('paves an island a walk runs through, above its kerb, and drops its tree', () => {
    let through = 0;
    for (const { v, plan } of plans) {
      const raised = plan.pieces.filter((p) => p.raised);
      if (raised.length === 0) continue;
      through += 1;
      const dropped = droppedTrees(v.layout);
      for (const t of dropped) expect(v.layout.trees).toContain(t);
      for (const t of v.layout.trees) {
        const inWalk = raised.some(
          (p) => t.u > p.rect.u0 && t.u < p.rect.u1 && t.v > p.rect.v0 && t.v < p.rect.v1,
        );
        if (inWalk) expect(dropped).toContain(t);
      }
    }
    expect(through).toBeGreaterThan(10);
  });

  it('keeps a bin at the door of every lot whose front walk leaves a clear lane for it', () => {
    for (const { v, plan } of plans) {
      const front = v.layout.frontWalk;
      if (!front || v.layout.forecourt || front.v1 - front.v0 < 0.6 + MIN_FRONT_WALK_M + EPS)
        continue;
      const door = doorClearances(v.layout)[0]!;
      if (v.layout.body.u1 - (door.u1 + 0.2) < 0.6) continue;
      expect(count(plan, 'bin'), v.label).toBe(1);
    }
  });

  it('lights every lot with a planted island or a perimeter strip', () => {
    for (const { v, plan } of plans) {
      if (v.layout.islands.length === 0 && v.layout.provided < 10) continue;
      // Cart corrals fill a market's islands, and homes on every side leave no strip for a pole.
      if (groundsFactsFor(v.entry).kitIslandFurniture && v.homes.length > 0) continue;
      expect(count(plan, 'light'), v.label).toBeGreaterThanOrEqual(1);
    }
  });

  it('plants the street frontage of a lot with ten spaces or more', () => {
    const big = plans.filter(({ v }) => v.layout.provided >= 10 && v.homes.length === 0);
    expect(big.length).toBeGreaterThan(0);
    for (const { v, plan } of big) expect(count(plan, 'shrub'), v.label).toBeGreaterThan(0);
  });

  it('gives a fenced works its fence and a gate where the drive reaches it', () => {
    for (const { v, plan } of plans) {
      const fenced = v.entry.category === 'ind' && v.entry.kind !== 'flex';
      expect(count(plan, 'fence') > 0, v.label).toBe(fenced);
      if (!fenced) expect(count(plan, 'gate'), v.label).toBe(0);
    }
  });

  it('never lays a sign or a refuse enclosure where the kit stands its own', () => {
    for (const { v, plan } of plans) {
      const facts = groundsFactsFor(v.entry, v.homes);
      if (facts.kitSign) {
        expect(count(plan, 'monument') + count(plan, 'pylon'), v.label).toBe(0);
      }
      if (facts.kitRefuse) expect(count(plan, 'refuse'), v.label).toBe(0);
    }
  });

  it('stands lights apart and short beside homes, a pole height from their lot line', () => {
    const faults: string[] = [];
    for (const { v, plan } of plans) {
      const lights = plan.pieces.filter((p) => p.kind === 'light');
      const lot = v.layout.lot;
      for (const l of lights) {
        const u = (l.rect.u0 + l.rect.u1) / 2;
        const w = (l.rect.v0 + l.rect.v1) / 2;
        const dist = v.homes.map((s) =>
          s === 'u-' ? u - lot.u0 : s === 'u+' ? lot.u1 - u : lot.v1 - w,
        );
        const nearest = Math.min(Infinity, ...dist);
        const near = nearest < LOT_LIGHT_HOME_REACH_M;
        const height = near ? LOT_LIGHT_NEAR_HOMES_M : LOT_LIGHT_HEIGHT_M;
        if (l.height !== height) faults.push(`${v.label} light height ${l.height}`);
        if (near && nearest < height - EPS) faults.push(`${v.label} light ${nearest} from homes`);
        for (const m of lights) {
          if (m === l) continue;
          const d = Math.hypot(u - (m.rect.u0 + m.rect.u1) / 2, w - (m.rect.v0 + m.rect.v1) / 2);
          if (d < LOT_LIGHT_SPACING_HEIGHTS * LOT_LIGHT_NEAR_HOMES_M - EPS) {
            faults.push(`${v.label} lights ${d} apart`);
          }
        }
      }
    }
    expect(faults).toEqual([]);
  });

  it('plants a deeper buffer on a side that abuts homes and trees it a frontage apart', () => {
    for (const { v, plan } of plans.filter(({ v: x }) => x.homes.includes('u-'))) {
      const lot = v.layout.lot;
      const trees = plan.pieces.filter(
        (p) => p.kind === 'tree' && p.rect.u1 <= lot.u0 + LOT_HOME_BUFFER_M + EPS,
      );
      const vs = trees.map((t) => t.rect.v0).sort((a, b) => a - b);
      for (let i = 1; i < vs.length; i++) {
        expect(vs[i]! - vs[i - 1]!, v.label).toBeGreaterThanOrEqual(FRONTAGE_TREE_SPACING_M - EPS);
      }
    }
  });
});
