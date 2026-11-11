import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import { LOT_TREE_SCALE, ParkedCarRenderer } from './parked';
import { lotPlanFor, lotPointToWorld, type LotPlan } from './lotplan';
import { isWalkUpEntry } from './archetypes';
import { kitPlanFor, placementBounds } from './buildingkit';
import { footprintForRotation } from '../shared/footprint';
import {
  BuildingState,
  VehicleKind,
  type BuildingCatalogEntry,
  type BuildingInstance,
} from '../shared/types';
import type { LotRect } from '../shared/lotlayout';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
/** Every kind that lays a car park on its lot: suburban commerce, industry and the walk-ups. */
const parkers = catalog.filter(
  (e) => (e.category === 'com' || e.category === 'ind' || isWalkUpEntry(e)) && e.zone !== 9,
);

type Side = 'N' | 'S' | 'E' | 'W';
const SIDES: readonly Side[] = ['N', 'S', 'E', 'W'];
const ROTATIONS = [0, 1, 2, 3] as const;
/** The broadleaf's canopy reaches this far from its trunk at full size. */
const CROWN_REACH_M = 1.85;

/** The tiles of a road along one side of a footprint at (x, z), a tile out. */
function roadBeside(side: Side, x: number, z: number, w: number, d: number): Set<string> {
  const tiles = new Set<string>();
  for (let i = -1; i <= Math.max(w, d) + 1; i++) {
    if (side === 'N') tiles.add(`${x + i},${z - 1}`);
    if (side === 'S') tiles.add(`${x + i},${z + d}`);
    if (side === 'W') tiles.add(`${x - 1},${z + i}`);
    if (side === 'E') tiles.add(`${x + w},${z + i}`);
  }
  return tiles;
}

interface Pt {
  x: number;
  z: number;
}

interface Pose {
  x: number;
  z: number;
  yaw: number;
  length: number;
  width: number;
}

/** The four corners of a vehicle's footprint in world metres (nose is local +Z). */
function corners(p: Pose): Pt[] {
  const hl = p.length / 2;
  const hw = p.width / 2;
  const s = Math.sin(p.yaw);
  const c = Math.cos(p.yaw);
  return [
    [hw, hl],
    [-hw, hl],
    [-hw, -hl],
    [hw, -hl],
  ].map(([lx, lz]) => ({ x: p.x + lx! * c + lz! * s, z: p.z - lx! * s + lz! * c }));
}

/** Whether two convex quads overlap by more than two centimetres (separating-axis test). */
function quadsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q.z - p.z;
      const nz = p.x - q.x;
      const len = Math.hypot(nx, nz);
      const proj = (pts: Pt[]): [number, number] => {
        const v = pts.map((pt) => pt.x * nx + pt.z * nz);
        return [Math.min(...v), Math.max(...v)];
      };
      const [a0, a1] = proj(a);
      const [b0, b1] = proj(b);
      if (a1 - b0 <= 0.02 * len || b1 - a0 <= 0.02 * len) return false;
    }
  }
  return true;
}

const worldRect = (plan: LotPlan, r: LotRect): Pt[] =>
  [
    [r.u0, r.v0],
    [r.u1, r.v0],
    [r.u1, r.v1],
    [r.u0, r.v1],
  ].map(([u, v]) => lotPointToWorld(plan.frame, u!, v!));

/** Whether every corner lies inside the quad, to a hand's breadth (a long vehicle's tail may overhang its aisle edge). */
function insideQuad(pts: Pt[], quad: Pt[], slack: number): boolean {
  const e1 = { x: quad[1]!.x - quad[0]!.x, z: quad[1]!.z - quad[0]!.z };
  const e2 = { x: quad[3]!.x - quad[0]!.x, z: quad[3]!.z - quad[0]!.z };
  const l1 = Math.hypot(e1.x, e1.z);
  const l2 = Math.hypot(e2.x, e2.z);
  return pts.every((p) => {
    const dx = p.x - quad[0]!.x;
    const dz = p.z - quad[0]!.z;
    const a = (dx * e1.x + dz * e1.z) / l1;
    const b = (dx * e2.x + dz * e2.z) / l2;
    return a >= -slack && a <= l1 + slack && b >= -slack && b <= l2 + slack;
  });
}

/** The distance from a point to a quad's outline, or 0 when it lies inside. */
function distanceToQuad(p: Pt, quad: Pt[]): number {
  if (insideQuad([p], quad, 0)) return 0;
  let best = Infinity;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % quad.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz)));
  }
  return best;
}

interface Case {
  entry: BuildingCatalogEntry;
  side: Side;
  rotation: 0 | 1 | 2 | 3;
  /** The level the building stands at. */
  level: number;
}

/** Every parking kind at every level it comes in, on each of the four street sides, at all four rotations. */
const cases: Case[] = parkers.flatMap((entry) =>
  SIDES.flatMap((side) =>
    ROTATIONS.map((rotation) => ({ entry, side, rotation, level: entry.level ?? 1 })),
  ),
);

const X = 20;
const Z = 20;

interface Rendered {
  plan: LotPlan;
  renderer: ParkedCarRenderer;
  cars: Pose[];
  trucks: Pose[];
}

function render(c: Case): Rendered | null {
  const lot = footprintForRotation(c.entry, c.rotation);
  const road = roadBeside(c.side, X, Z, lot.w, lot.d);
  const roadAt = (tx: number, tz: number): boolean => road.has(`${tx},${tz}`);
  const plan = lotPlanFor(c.entry, X, Z, roadAt, c.rotation, null);
  if (!plan || plan.layout.provided === 0) return null;
  const renderer = new ParkedCarRenderer(new THREE.Scene(), () => 0, [c.entry], roadAt);
  const building: BuildingInstance = {
    id: 7,
    catalogId: c.entry.id,
    x: X,
    z: Z,
    rotation: c.rotation,
    level: c.level,
    state: BuildingState.Active,
    problems: 0,
  };
  renderer.apply({ added: [building], removed: [], updated: [] });
  const trucks = renderer.berthTruckSlotsFor(7).map((ref) => {
    const m = new THREE.Matrix4();
    renderer.getCarMatrix(ref, m);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(p, q, s);
    return { x: p.x, z: p.z, yaw: 2 * Math.atan2(q.y, q.w), length: s.z, width: s.x };
  });
  return { plan, renderer, cars: renderer.stallWorldPositions(7), trucks };
}

describe('a lot car park, one vehicle to a stall', () => {
  it('draws one car in each stall, inside it, and no two vehicles touch', () => {
    const faults: string[] = [];
    let lots = 0;
    for (const c of cases) {
      const r = render(c);
      if (!r) continue;
      lots += 1;
      const { plan, cars, trucks } = r;
      const key = `${c.entry.id} ${c.side} rot ${c.rotation} L${c.level}`;
      const stalls = plan.layout.stalls;
      if (cars.length !== stalls.length)
        faults.push(`${key}: ${cars.length} cars, ${stalls.length} stalls`);
      cars.forEach((p, i) => {
        const stall = stalls[i];
        if (stall && !insideQuad(corners(p), worldRect(plan, stall.rect), 0.25)) {
          faults.push(`${key}: car ${i} stands outside its stall`);
        }
      });
      const all = [...cars, ...trucks];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          if (quadsOverlap(corners(all[i]!), corners(all[j]!)))
            faults.push(`${key}: vehicles ${i} and ${j} overlap`);
        }
      }
    }
    expect(lots).toBeGreaterThan(0);
    expect(faults).toEqual([]);
  });

  it('keeps every vehicle off the drive aisles, the hatched access aisles and the body', () => {
    const faults: string[] = [];
    for (const c of cases) {
      const r = render(c);
      if (!r) continue;
      const { plan, cars, trucks } = r;
      const keep = [...plan.layout.aisles, ...plan.layout.accessAisles, plan.layout.body].map(
        (rect) => worldRect(plan, rect),
      );
      [...cars, ...trucks].forEach((p, i) => {
        keep.forEach((quad, k) => {
          if (quadsOverlap(corners(p), quad)) {
            faults.push(
              `${c.entry.id} ${c.side} rot ${c.rotation}: vehicle ${i} stands in ground ${k}`,
            );
          }
        });
      });
    }
    expect(faults).toEqual([]);
  });

  it('parks cars in stalls and trucks only in the loading berths of an industrial lot', () => {
    let trucked = 0;
    for (const c of cases) {
      const r = render(c);
      if (!r) continue;
      const { plan, renderer, trucks } = r;
      for (const ref of renderer.stallSlotsFor(7)) expect(ref.kind).toBe(VehicleKind.Car);
      for (const ref of renderer.berthTruckSlotsFor(7)) expect(ref.kind).toBe(VehicleKind.Truck);
      expect(trucks.length, c.entry.id).toBe(
        c.entry.category === 'ind' ? plan.layout.berths.length : 0,
      );
      trucks.forEach((truck, b) => {
        expect(
          insideQuad(corners(truck), worldRect(plan, plan.layout.berths[b]!), 0.05),
          `${c.entry.id} ${c.side} rot ${c.rotation}: truck ${b} stands outside its berth`,
        ).toBe(true);
        trucked += 1;
      });
    }
    expect(trucked).toBeGreaterThan(0);
  });

  it('reports the stalls drawn on its own lot, and none at the kerb, for a building that lays a car park', () => {
    for (const c of cases) {
      const r = render(c);
      if (!r) continue;
      expect(r.renderer.ownStallCount(7), c.entry.id).toBe(r.plan.layout.stalls.length);
      expect(r.renderer.ownStallCount(7), c.entry.id).toBe(r.renderer.stallSlotsFor(7).length);
      expect(r.renderer.kerbStallCount(7), c.entry.id).toBe(0);
    }
  });

  it('keeps a lot tree on its island: the trunk in no stall and the crown clear of every car', () => {
    const crown = CROWN_REACH_M * LOT_TREE_SCALE;
    const faults: string[] = [];
    let trees = 0;
    for (const c of cases) {
      const r = render(c);
      if (!r) continue;
      const { plan, cars, trucks } = r;
      const at = plan.layout.trees.map((t) => lotPointToWorld(plan.frame, t.u, t.v));
      const stallQuads = plan.layout.stalls.map((s) => worldRect(plan, s.rect));
      const aisleQuads = [...plan.layout.aisles, ...plan.layout.accessAisles].map((rect) =>
        worldRect(plan, rect),
      );
      for (const t of at) {
        trees += 1;
        const key = `${c.entry.id} ${c.side} rot ${c.rotation}`;
        if ([...stallQuads, ...aisleQuads].some((q) => distanceToQuad(t, q) === 0)) {
          faults.push(`${key}: a tree trunk stands in a stall or aisle`);
        }
        for (const p of [...cars, ...trucks]) {
          if (distanceToQuad(t, corners(p)) < crown)
            faults.push(`${key}: a tree crown reaches a vehicle`);
        }
      }
    }
    expect(trees).toBeGreaterThan(0);
    expect(faults).toEqual([]);
  });
});

describe('a building that parks at the kerb', () => {
  it('reports no stall of its own, and its kerb stalls apart', () => {
    const tower = catalog.find((e) => e.id === 'res-tower-1')!;
    const road = roadBeside('S', X, Z, tower.footprint.w, tower.footprint.d);
    const roadAt = (tx: number, tz: number): boolean => road.has(`${tx},${tz}`);
    const renderer = new ParkedCarRenderer(new THREE.Scene(), () => 0, [tower], roadAt);
    renderer.apply({
      added: [
        {
          id: 3,
          catalogId: tower.id,
          x: X,
          z: Z,
          rotation: 0,
          level: 1,
          state: BuildingState.Active,
          problems: 0,
        },
      ],
      removed: [],
      updated: [],
    });
    expect(renderer.ownStallCount(3)).toBe(0);
    expect(renderer.kerbStallCount(3)).toBe(renderer.stallSlotsFor(3).length);
  });
});

describe('what stands on a car park ground', () => {
  /** The ground parts a lot's kit stands on its car park; none may stand on a stall, an aisle or a berth. */
  const GROUND_PARTS = ['signPole', 'menuBoard', 'dumpsterEnclosure'];

  it('puts no sign, menu board or bin in a stall, a hatched access aisle, a berth or a trailer stall', () => {
    const faults: string[] = [];
    let checked = 0;
    for (const entry of parkers) {
      for (const side of SIDES) {
        for (const rotation of ROTATIONS) {
          const lot = footprintForRotation(entry, rotation);
          const road = roadBeside(side, X, Z, lot.w, lot.d);
          const plan = kitPlanFor(entry, { id: 7, x: X, z: Z, rotation }, (x, z) =>
            road.has(`${x},${z}`),
          );
          const lotPlan = lotPlanFor(entry, X, Z, (x, z) => road.has(`${x},${z}`), rotation);
          if (!plan?.lot || !lotPlan) continue;
          // The kit lot's `hard` list runs: stalls, hatched aisles, drive aisles, throat, berths, trailer stalls, islands.
          const { layout } = lotPlan;
          const stallGround = layout.stalls.length + layout.accessAisles.length;
          const beforeBerths = stallGround + layout.aisles.length + (layout.throat ? 1 : 0);
          const keep = [
            ...plan.lot.hard.slice(0, stallGround),
            ...plan.lot.hard.slice(
              beforeBerths,
              beforeBerths + layout.berths.length + layout.trailerStalls.length,
            ),
          ];
          for (const part of plan.placements.filter((p) => GROUND_PARTS.includes(p.part))) {
            checked += 1;
            const b = placementBounds(part);
            for (const r of keep) {
              if (
                b.x0 < r.x1 - 0.01 &&
                r.x0 < b.x1 - 0.01 &&
                b.z0 < r.z1 - 0.01 &&
                r.z0 < b.z1 - 0.01
              ) {
                faults.push(
                  `${entry.id} ${side} rot ${rotation}: ${part.part} stands in a stall or berth`,
                );
                break;
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(faults).toEqual([]);
  });
});
