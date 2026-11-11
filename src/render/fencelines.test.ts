import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HouseRoofRenderer } from './houses';
import { FenceBook, MIN_FENCE_RUN_M, fenceLotOf, trimFence, type FenceLot } from './fencelines';
import { planHouseLot, type FenceRun, type HouseLotPlan } from './houselot';
import type { StreetLookup } from './frontage';
import { TILE_METERS } from '../shared/constants';
import {
  BuildingState,
  ZoneType,
  type BuildingCatalogEntry,
  type BuildingInstance,
  type ParcelFrame,
} from '../shared/types';

function entry(w: number, d: number, id = 'home'): BuildingCatalogEntry {
  return {
    id,
    name: id,
    category: 'res',
    zone: ZoneType.ResLow,
    kind: 'detached',
    level: 1,
    footprint: { w, d },
    height: 4,
    color: 0,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
  };
}

function home(over: Partial<BuildingInstance>, catalogId = 'home'): BuildingInstance {
  return {
    id: 1,
    catalogId,
    x: 4,
    z: 6,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...over,
  };
}

const noRoad = (): boolean => false;
const noStreets: StreetLookup = () => null;
/** A straight street along tile row `z`. */
const streetRow = (
  z: number,
): { roadAt: (x: number, tz: number) => boolean; street: StreetLookup } => ({
  roadAt: (_x, tz) => tz === z,
  street: (_x, tz) => (tz === z ? { vergeM: 4.375, sidewalkM: 1.875 } : null),
});

interface Laid {
  id: number;
  plan: HouseLotPlan;
  lot: FenceLot;
  runs: FenceRun[];
}

/** Every home planned, put in a book in the order given, and its fence cut back among the rest. */
function lay(
  buildings: readonly BuildingInstance[],
  e: BuildingCatalogEntry,
  roadAt: (x: number, z: number) => boolean,
  street: StreetLookup,
): Map<number, Laid> {
  const book = new FenceBook();
  const plans = new Map<number, HouseLotPlan>();
  for (const b of buildings) {
    const plan = planHouseLot(b, e, roadAt, street)!;
    plans.set(b.id, plan);
    book.set(fenceLotOf(b.id, plan, true));
  }
  const out = new Map<number, Laid>();
  for (const b of buildings) {
    const lot = book.get(b.id)!;
    out.set(b.id, {
      id: b.id,
      plan: plans.get(b.id)!,
      lot,
      runs: trimFence(lot, book.neighboursOf(lot), roadAt),
    });
  }
  return out;
}

/** Ids whose home has a fence when it stands alone, and ids whose home has none. */
function fencedIds(
  e: BuildingCatalogEntry,
  street: StreetLookup,
  roadAt: (x: number, z: number) => boolean,
) {
  const yes: number[] = [];
  const no: number[] = [];
  for (let id = 1; id <= 300; id++) {
    const plan = planHouseLot(home({ id }), e, roadAt, street)!;
    (plan.yard.fence.length > 0 ? yes : no).push(id);
  }
  return { yes, no };
}

interface Seg {
  a: { x: number; z: number };
  b: { x: number; z: number };
}

const segsOf = (l: Laid): Seg[] =>
  l.runs.map((r) => ({ a: l.lot.toWorld(r.u0, r.v0), b: l.lot.toWorld(r.u1, r.v1) }));

const cross = (ax: number, az: number, bx: number, bz: number): number => ax * bz - az * bx;

/** Do two segments cross properly, a touch at an end not counting? */
function crosses(s: Seg, t: Seg): boolean {
  const d1 = cross(s.b.x - s.a.x, s.b.z - s.a.z, t.a.x - s.a.x, t.a.z - s.a.z);
  const d2 = cross(s.b.x - s.a.x, s.b.z - s.a.z, t.b.x - s.a.x, t.b.z - s.a.z);
  const d3 = cross(t.b.x - t.a.x, t.b.z - t.a.z, s.a.x - t.a.x, s.a.z - t.a.z);
  const d4 = cross(t.b.x - t.a.x, t.b.z - t.a.z, s.b.x - t.a.x, s.b.z - t.a.z);
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}

/** The length two near-parallel segments lie along each other, within half a metre. */
function sharedLength(s: Seg, t: Seg): number {
  const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
  const dx = (s.b.x - s.a.x) / len;
  const dz = (s.b.z - s.a.z) / len;
  const tl = Math.hypot(t.b.x - t.a.x, t.b.z - t.a.z);
  if (Math.abs(cross(dx, dz, (t.b.x - t.a.x) / tl, (t.b.z - t.a.z) / tl)) > 0.15) return 0;
  if (Math.abs(cross(dx, dz, t.a.x - s.a.x, t.a.z - s.a.z)) > 0.5) return 0;
  const p0 = (t.a.x - s.a.x) * dx + (t.a.z - s.a.z) * dz;
  const p1 = (t.b.x - s.a.x) * dx + (t.b.z - s.a.z) * dz;
  return Math.max(0, Math.min(len, Math.max(p0, p1)) - Math.max(0, Math.min(p0, p1)));
}

function insideStrictly(poly: readonly { x: number; z: number }[], x: number, z: number): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = cross(b.x - a.x, b.z - a.z, x - a.x, z - a.z);
    if (Math.abs(c) < 1e-6) return false;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** No fence enters another lot, house or drive, crosses another fence or doubles one, or is shorter than a panel. */
function expectKeptToOwnLine(laid: Map<number, Laid>): void {
  const all = [...laid.values()];
  for (const a of all) {
    for (const s of segsOf(a)) {
      const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
      expect(len).toBeGreaterThanOrEqual(MIN_FENCE_RUN_M - 1e-9);
      for (let t = 0; t <= len; t += 0.2) {
        const x = s.a.x + ((s.b.x - s.a.x) * t) / len;
        const z = s.a.z + ((s.b.z - s.a.z) * t) / len;
        for (const b of all) {
          if (b === a) continue;
          expect(insideStrictly(b.lot.outline, x, z), `lot ${a.id} fence in lot ${b.id}`).toBe(
            false,
          );
          for (const block of b.lot.blocks) {
            expect(
              insideStrictly(block, x, z),
              `lot ${a.id} fence in lot ${b.id}'s house or drive`,
            ).toBe(false);
          }
        }
      }
      for (const b of all) {
        if (b === a) continue;
        for (const o of segsOf(b)) {
          expect(crosses(s, o), `fences of ${a.id} and ${b.id} cross`).toBe(false);
          expect(sharedLength(s, o), `fences of ${a.id} and ${b.id} share a line`).toBeLessThan(
            0.2,
          );
        }
      }
    }
  }
}

describe('a fence keeps to its own lot line', () => {
  const e = entry(2, 2);
  const { roadAt, street } = streetRow(8);
  const { yes, no } = fencedIds(e, street, roadAt);

  it('draws one fence where two grid lots share a line, the lower id owning it', () => {
    const [low, high] = [yes[0]!, yes[1]!];
    // The higher id on the left, so the lower owns the line from the right.
    const laid = lay([home({ id: high, x: 4 }), home({ id: low, x: 6 })], e, roadAt, street);
    const onLine = (l: Laid): FenceRun[] =>
      l.runs.filter(
        (r) => r.u0 === r.u1 && Math.abs(l.lot.toWorld(r.u0, 0).x - 6 * TILE_METERS) < 0.3,
      );
    expect(onLine(laid.get(low)!).length).toBeGreaterThan(0);
    expect(onLine(laid.get(high)!)).toHaveLength(0);
    expectKeptToOwnLine(laid);
  });

  it('lets the higher id fence the line when the lower has no fence', () => {
    const [bare, fenced] = [no[0]!, yes.find((id) => id > no[0]!)!];
    const laid = lay([home({ id: bare, x: 4 }), home({ id: fenced, x: 6 })], e, roadAt, street);
    expect(laid.get(bare)!.runs).toHaveLength(0);
    const onLine = laid
      .get(fenced)!
      .runs.filter(
        (r) =>
          r.u0 === r.u1 &&
          Math.abs(laid.get(fenced)!.lot.toWorld(r.u0, 0).x - 6 * TILE_METERS) < 0.3,
      );
    expect(onLine.length).toBeGreaterThan(0);
  });

  it('keeps every fence off its neighbours along a street of mixed homes', () => {
    const ids = [...yes.slice(0, 8), ...no.slice(0, 4)].sort((a, b) => a - b);
    const laid = lay(
      ids.map((id, i) => home({ id, x: 4 + i * 2 })),
      e,
      roadAt,
      street,
    );
    expectKeptToOwnLine(laid);
    expect([...laid.values()].some((l) => l.runs.length > 0)).toBe(true);
  });

  it("opens a gap where a neighbour's drive passes the line", () => {
    const wide = entry(3, 3);
    const s = streetRow(9);
    const ids = fencedIds(wide, s.street, s.roadAt).yes.slice(0, 10);
    const laid = lay(
      ids.map((id, i) => home({ id, x: 4 + i * 3, z: 6 })),
      wide,
      s.roadAt,
      s.street,
    );
    expectKeptToOwnLine(laid);
    const withDrive = [...laid.values()].filter((l) => l.plan.drives.length > 0);
    expect(withDrive.length).toBeGreaterThan(0);
  });

  it('obeys the same rule on estate and acre lots', () => {
    for (const [w, d] of [
      [2, 3],
      [3, 3],
    ] as const) {
      const big = entry(w, d);
      const s = streetRow(6 + d);
      const ids = fencedIds(big, s.street, s.roadAt);
      const mixed = [ids.no[0]!, ids.yes[0]!, ids.yes[1]!, ids.no[1]!, ids.yes[2]!];
      const laid = lay(
        mixed.map((id, i) => home({ id, x: 4 + i * w, z: 6 }, 'home')),
        big,
        s.roadAt,
        s.street,
      );
      expectKeptToOwnLine(laid);
      // A home with no fence of its own is never left bare on a line a fenced neighbour owns: one stands there.
      expect(laid.get(ids.no[0]!)!.runs).toHaveLength(0);
      expect(laid.get(ids.yes[0]!)!.runs.length).toBeGreaterThan(0);
    }
  });

  it('gives the same fences whatever order the homes arrive in', () => {
    const ids = yes.slice(0, 6);
    const forward = ids.map((id, i) => home({ id, x: 4 + i * 2 }));
    const a = lay(forward, e, roadAt, street);
    const b = lay([...forward].reverse(), e, roadAt, street);
    for (const id of ids) expect(b.get(id)!.runs).toEqual(a.get(id)!.runs);
  });

  it('drops a fence where nothing a sound panel long is left', () => {
    const narrow = entry(1, 1);
    const s = streetRow(7);
    const laid = lay([home({ id: yes[0]!, x: 4, z: 6 })], narrow, s.roadAt, (x, z) =>
      s.street(x, z),
    );
    for (const l of laid.values()) {
      for (const r of l.runs) {
        expect(Math.hypot(r.u1 - r.u0, r.v1 - r.v0)).toBeGreaterThanOrEqual(MIN_FENCE_RUN_M);
      }
    }
  });
});

describe('a turned lot keeps its fence off its neighbours', () => {
  /** Lots along a kerb arc of radius `radius` about the origin, their backs toward the centre or away. */
  function arc(
    inner: boolean,
    step: number,
    ids: readonly number[],
    radius = 100,
  ): BuildingInstance[] {
    return ids.map((id, i) => {
      const phi = i * step;
      const k = { x: radius * Math.cos(phi), z: radius * Math.sin(phi) };
      const w = 20;
      // The frame's origin is the front-left corner, half a frontage back along the kerb.
      const heading = inner ? phi + Math.PI / 2 : phi - Math.PI / 2;
      const along = { x: Math.cos(heading), z: Math.sin(heading) };
      const frame: ParcelFrame = {
        x: k.x - (along.x * w) / 2 + 400,
        z: k.z - (along.z * w) / 2 + 400,
        heading,
      };
      return home({ id, x: 0, z: 0, frame });
    });
  }
  const e = entry(1, 2);
  const ids = Array.from({ length: 300 }, (_, i) => i + 1);
  const fenced = fencedIds(e, noStreets, noRoad).yes.slice(0, 9);

  for (const [name, inner, step] of [
    ['an inner bend, lots touching at the back', true, 0.333],
    ['an inner bend, lots overlapping', true, 0.2],
    ['an outer bend, lots fanning out', false, 0.2],
  ] as const) {
    it(`keeps every fence to its own lot on ${name}`, () => {
      expect(ids.length).toBeGreaterThan(0);
      const laid = lay(arc(inner, step, fenced), e, noRoad, noStreets);
      expectKeptToOwnLine(laid);
      expect([...laid.values()].some((l) => l.runs.length > 0)).toBe(true);
    });
  }

  it("cuts a fence back where an overlapping neighbour's outline meets it", () => {
    const planned = arc(true, 0.2, fenced).map((b) => planHouseLot(b, e, noRoad, noStreets)!);
    const planLen = planned.reduce((n, p) => n + p.yard.fence.length, 0);
    const laid = lay(arc(true, 0.2, fenced), e, noRoad, noStreets);
    const cutLen = [...laid.values()].reduce((n, l) => n + l.runs.length, 0);
    expect(planLen).toBeGreaterThan(0);
    const total = (runs: readonly FenceRun[]): number =>
      runs.reduce((n, r) => n + Math.hypot(r.u1 - r.u0, r.v1 - r.v0), 0);
    const plannedMetres = planned.reduce((n, p) => n + total(p.yard.fence), 0);
    const keptMetres = [...laid.values()].reduce((n, l) => n + total(l.runs), 0);
    expect(keptMetres).toBeLessThan(plannedMetres);
    expect(cutLen).toBeGreaterThanOrEqual(0);
  });
});

describe('HouseRoofRenderer fences', () => {
  const e = entry(2, 2, 'res-low-1');
  const { roadAt, street } = streetRow(8);
  const ids = fencedIds(entry(2, 2), street, roadAt).yes.slice(0, 5);
  const homes = ids.map((id, i) => home({ id, x: 4 + i * 2 }, 'res-low-1'));

  const fenceMatrices = (r: HouseRoofRenderer, owners: readonly number[]): string[] =>
    owners
      .flatMap((id) =>
        r.slotsFor(id, 'fence').map((slot) => {
          const m = new THREE.Matrix4();
          r.getPartMatrix('fence', slot, m);
          return m.elements.map((v) => v.toFixed(4)).join(',');
        }),
      )
      .sort();

  const make = (): HouseRoofRenderer =>
    new HouseRoofRenderer(new THREE.Scene(), () => 0, [e], roadAt, street);

  it('stands the same fences whatever order the homes arrive in', () => {
    const a = make();
    a.apply({ added: homes, updated: [], removed: [] });
    const b = make();
    for (const h of [...homes].reverse()) b.apply({ added: [h], updated: [], removed: [] });
    expect(fenceMatrices(b, ids)).toEqual(fenceMatrices(a, ids));
    expect(fenceMatrices(a, ids).length).toBeGreaterThan(0);
  });

  it('re-lays the neighbours when a home leaves, as if it had never stood', () => {
    const a = make();
    a.apply({ added: homes, updated: [], removed: [] });
    a.apply({ added: [], updated: [], removed: [ids[2]!] });
    const fresh = make();
    fresh.apply({ added: homes.filter((h) => h.id !== ids[2]), updated: [], removed: [] });
    const rest = ids.filter((id) => id !== ids[2]);
    expect(fenceMatrices(a, rest)).toEqual(fenceMatrices(fresh, rest));
    expect(a.slotsFor(ids[2]!, 'fence')).toHaveLength(0);
  });

  it('draws no fence for a home still going up', () => {
    const r = make();
    r.apply({
      added: homes.map((h) => ({ ...h, state: BuildingState.Constructing })),
      updated: [],
      removed: [],
    });
    expect(r.partCount('fence')).toBe(0);
  });
});
