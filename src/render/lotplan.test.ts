/**
 * The parking-to-code contract over the real catalog: every suburban
 * commercial and industrial lot laid out by the shared requirement, inside
 * its lot at every turn, with the body it is drawn with.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import {
  BuildingState,
  ZoneType,
  type BuildingCatalogEntry,
  type BuildingKind,
} from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { bodyMetresFor, grossFloorSqFt } from '../shared/floorarea';
import {
  ACCESSIBLE_AISLE_M,
  ACCESSIBLE_CAR_WIDTH_M,
  adaAccessibleSpaces,
  adaVanSpaces,
  ISLAND_WIDTH_M,
  loadingBerths,
  lotParkingRequirement,
  SPACES_BETWEEN_ISLANDS,
  STALL_WIDTH_M,
  treesFor,
} from '../shared/parkingcode';
import { computeLotLayout, lotPaving, type LotLayout, type LotRect } from '../shared/lotlayout';
import { lotYardsFor } from '../shared/lotparking';
import { hasPart } from './archetypes';
import type { EdgeFrame } from './frontage';
import { lotLayoutFor, lotPlanFor, lotPointToWorld } from './lotplan';
import { DRIVE_Y_OFFSET, LOT_Y_OFFSET, LotRenderer, WALK_Y_OFFSET } from './lots';
import { computeSetbacks, frontageSetbackFor } from './massing';
import { ParkedCarRenderer } from './parked';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const suburban = catalog.filter((e) => lotParkingRequirement(e) !== null);

/** The kinds whose lots hold their code at every level, with their catalog width on the street. */
const FITTING: readonly BuildingKind[] = [
  'fuel',
  'workshop',
  'warehouse',
  'factory',
  'foodplant',
  'chemical',
  'metals',
  'paper',
];

/** Growth turns every unlotted kind so its catalog width lies along its street. */
const onStreet = (e: BuildingCatalogEntry): LotLayout => lotLayoutFor(e, 0, true)!;

const EPS = 1e-6;
const inside = (r: LotRect, lot: LotRect): boolean =>
  r.u0 >= lot.u0 - EPS && r.u1 <= lot.u1 + EPS && r.v0 >= lot.v0 - EPS && r.v1 <= lot.v1 + EPS;
const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - 0.01 && b.u0 < a.u1 - 0.01 && a.v0 < b.v1 - 0.01 && b.v0 < a.v1 - 0.01;

/** A street along one side of a w×d lot at (10, 10). */
const roads: Record<
  'N' | 'E' | 'S' | 'W',
  (w: number, d: number) => (x: number, z: number) => boolean
> = {
  N: () => (x, z) => z === 9 && x >= 10,
  S: (_, d) => (x, z) => z === 10 + d && x >= 10,
  E: (w) => (x, z) => x === 10 + w && z >= 10,
  W: () => (x, z) => x === 9 && z >= 10,
};

describe('every suburban commercial and industrial lot, laid out to code', () => {
  it('covers the suburban kinds and only them', () => {
    const kinds = new Set(suburban.map((e) => e.kind));
    for (const k of [...FITTING, 'shop', 'restaurant', 'strip', 'supermarket', 'flex'] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
    for (const k of ['office', 'hotel', 'mixed', 'crops'] as const)
      expect(kinds.has(k), k).toBe(false);
  });

  it.each(suburban.filter((e) => FITTING.includes(e.kind!)).map((e) => [e.id, e] as const))(
    '%s holds every space its floor asks for, its berths and its accessible spaces',
    (_, e) => {
      const req = lotParkingRequirement(e)!;
      const layout = onStreet(e);
      expect(layout.fits).toBe(true);
      expect(layout.provided).toBe(req.spaces);
      expect(layout.stalls).toHaveLength(req.spaces);
      expect(layout.shortfall).toBe(0);
      expect(layout.berths).toHaveLength(req.berths);
      expect(layout.accessible).toBe(adaAccessibleSpaces(layout.provided));
      expect(layout.vans).toBe(adaVanSpaces(layout.accessible));
    },
  );

  it('fits flex at its second level, long side on the street', () => {
    const flex2 = suburban.find((e) => e.kind === 'flex' && e.level === 2)!;
    expect(onStreet(flex2).fits).toBe(true);
  });

  const SHORT: readonly BuildingKind[] = ['shop', 'restaurant', 'strip', 'supermarket', 'flex'];
  /** A short kind's entry at each level, and the lots it may stand on there, smallest first. */
  const ladders = SHORT.flatMap((kind) =>
    suburban
      .filter((e) => e.kind === kind && e.bodyFootprint === undefined)
      .map((e) => {
        const lots = suburban
          .filter(
            (v) =>
              v === e || (v.bodyFootprint !== undefined && v.kind === kind && v.level === e.level),
          )
          .sort((a, b) => a.footprint.w * a.footprint.d - b.footprint.w * b.footprint.d);
        return [`${kind} L${e.level}`, e, lots] as const;
      }),
  );

  it.each(ladders)(
    '%s: its largest lot holds the whole code with no kerb credit, at every turn and frontage',
    (_, e, lots) => {
      const largest = lots[lots.length - 1]!;
      const req = lotParkingRequirement(e)!;
      expect(lotParkingRequirement(largest)).toEqual(req);
      for (const rotation of [0, 1, 2, 3] as const) {
        const lot = footprintForRotation(largest, rotation);
        for (const side of ['N', 'E', 'S', 'W'] as const) {
          const { layout } = lotPlanFor(largest, 10, 10, roads[side](lot.w, lot.d), rotation)!;
          expect(layout.fits, `${largest.id} turned ${rotation}, ${side}`).toBe(true);
          expect(layout.provided).toBe(req.spaces);
          expect(layout.berths).toHaveLength(req.berths);
        }
      }
    },
  );

  it.each(ladders)(
    '%s: each lot holds the code once the kerb credits what it cannot, larger lots needing less',
    (_, e, lots) => {
      const req = lotParkingRequirement(e)!;
      let previous = Infinity;
      for (const lot of lots) {
        // The least kerb credit that lets this lot, on the street as growth turns it, meet its code.
        let credit = 0;
        while (credit <= req.spaces && !lotLayoutFor(lot, 0, true, credit)!.fits) credit++;
        expect(credit, lot.id).toBeLessThanOrEqual(req.spaces);
        const layout = lotLayoutFor(lot, 0, true, credit)!;
        expect(layout.required).toBe(req.spaces - credit);
        expect(layout.provided).toBe(req.spaces - credit);
        expect(credit, lot.id).toBeLessThanOrEqual(previous);
        previous = credit;
      }
      // Only a kind's own lot may fall short of its code with no credit.
      expect(lotLayoutFor(lots[lots.length - 1]!, 0, true, 0)!.fits).toBe(true);
    },
  );

  it('lets the small-use exemption carry the corner shop: it holds nothing on site', () => {
    const corner = suburban.find((e) => e.id === 'com-low-1')!;
    const layout = onStreet(corner);
    expect(layout.required).toBe(0);
    expect(layout.fits).toBe(true);
    expect(layout.stalls).toHaveLength(0);
  });

  it('keeps the forecourt and the tank farm where the kit stands its canopy and tanks', () => {
    for (const e of suburban) {
      const yards = lotYardsFor(e);
      expect(yards.forecourtDepth !== undefined, e.id).toBe(hasPart(e, 'fuelCanopy'));
      expect(yards.rearYard !== undefined, e.id).toBe(hasPart(e, 'tanks'));
    }
  });

  it.each(suburban.map((e) => [e.id, e] as const))(
    '%s: a short lot draws what fits and says how short it is',
    (_, e) => {
      const layout = onStreet(e);
      expect(layout.provided).toBe(layout.stalls.length);
      expect(layout.shortfall).toBe(layout.required - layout.provided);
      // Never a space without the accessible spaces it owes.
      expect(layout.accessible).toBe(adaAccessibleSpaces(layout.provided));
    },
  );

  it('asks the code figure of every floor: spaces by kind, berths by the tables', () => {
    for (const e of suburban) {
      const req = lotParkingRequirement(e)!;
      const sqft = grossFloorSqFt(e);
      expect(req.grossSqFt).toBeCloseTo(sqft, 9);
      const table = e.category === 'ind' ? 'industrial' : 'retail';
      expect(req.berths, e.id).toBe(loadingBerths(table, sqft));
    }
  });

  it.each(suburban.map((e) => [e.id, e] as const))(
    '%s: an island at both ends of every row and after every ten spaces, and a tree per ten',
    (_, e) => {
      const layout = onStreet(e);
      // Group the row pieces by the band they share.
      const rows = new Map<string, { at: number; island: boolean }[]>();
      const add = (r: LotRect, alongU: boolean, island: boolean): void => {
        const key = alongU ? `u:${r.v0.toFixed(3)}` : `v:${r.u0.toFixed(3)}`;
        const list = rows.get(key) ?? [];
        list.push({ at: alongU ? r.u0 : r.v0, island });
        rows.set(key, list);
      };
      for (const s of layout.stalls) add(s.rect, s.nose[0] === 'v', false);
      for (const i of layout.islands) {
        const alongU = Math.abs(i.u1 - i.u0 - ISLAND_WIDTH_M) < 1e-6;
        add(i, alongU, true);
      }
      for (const [key, list] of rows) {
        list.sort((a, b) => a.at - b.at);
        expect(list[0]!.island, key).toBe(true);
        expect(list[list.length - 1]!.island, key).toBe(true);
        let run = 0;
        for (const item of list) {
          run = item.island ? 0 : run + 1;
          expect(run, key).toBeLessThanOrEqual(SPACES_BETWEEN_ISLANDS);
        }
      }
      expect(layout.trees).toHaveLength(treesFor(layout.provided));
      for (const t of layout.trees) {
        expect(
          layout.islands.some((i) => t.u >= i.u0 && t.u <= i.u1 && t.v >= i.v0 && t.v <= i.v1),
        ).toBe(true);
      }
    },
  );

  it.each(suburban.map((e) => [e.id, e] as const))(
    '%s: the accessible spaces are the ones nearest the entrance',
    (_, e) => {
      const layout = onStreet(e);
      const dist = (r: LotRect): number =>
        Math.hypot(
          Math.max(r.u0 - layout.entrance.u, 0, layout.entrance.u - r.u1),
          Math.max(r.v0 - layout.entrance.v, 0, layout.entrance.v - r.v1),
        );
      const accessible = layout.stalls.filter((s) => s.accessible).map((s) => dist(s.rect));
      if (accessible.length === 0) return;
      const nearest = Math.min(...accessible);
      // The row nearest the door is split at the door and laid outward both
      // ways, so a space across the split can be as near as the first
      // accessible one, give or take a stall and an island. Any space nearer
      // still stands between islands too close for an accessible space and
      // its aisle, so none could go there.
      const segment = (r: LotRect, alongU: boolean): number => {
        const band = layout.islands.filter((i) =>
          alongU ? Math.abs(i.v0 - r.v0) < 1e-6 : Math.abs(i.u0 - r.u0) < 1e-6,
        );
        const lo = Math.max(
          ...band.map((i) => (alongU ? i.u0 : i.v0)).filter((x) => x <= (alongU ? r.u0 : r.v0)),
        );
        const hi = Math.min(
          ...band.map((i) => (alongU ? i.u1 : i.v1)).filter((x) => x >= (alongU ? r.u1 : r.v1)),
        );
        return hi - lo;
      };
      const tightest = 2 * ISLAND_WIDTH_M + ACCESSIBLE_CAR_WIDTH_M + ACCESSIBLE_AISLE_M;
      const slack = STALL_WIDTH_M + ISLAND_WIDTH_M;
      for (const s of layout.stalls) {
        if (s.accessible || dist(s.rect) >= nearest - slack) continue;
        expect(segment(s.rect, s.nose[0] === 'v'), e.id).toBeLessThan(tightest);
      }
    },
  );
});

describe('the lot plan on the map', () => {
  it.each(suburban.map((e) => [e.id, e] as const))(
    '%s: everything stands inside its lot and clear of the body, at every turn and frontage',
    (_, e) => {
      for (const rotation of [0, 1, 2, 3] as const) {
        const lot = footprintForRotation(e, rotation);
        for (const side of ['N', 'E', 'S', 'W'] as const) {
          const plan = lotPlanFor(e, 10, 10, roads[side](lot.w, lot.d), rotation)!;
          expect(plan.edge.side).toBe(side);
          const { layout } = plan;
          const pieces = [
            ...layout.stalls.map((s) => s.rect),
            ...layout.accessAisles,
            ...layout.berths,
            ...layout.islands,
            ...layout.aisles,
            layout.body,
          ];
          for (const r of pieces) expect(inside(r, layout.lot)).toBe(true);
          for (const r of pieces.slice(0, -1)) expect(overlaps(r, layout.body)).toBe(false);
          // And on the map: the lot's corners are the footprint's.
          const a = lotPointToWorld(plan.frame, layout.lot.u0, layout.lot.v0);
          const b = lotPointToWorld(plan.frame, layout.lot.u1, layout.lot.v1);
          expect(Math.min(a.x, b.x)).toBeCloseTo(10 * TILE_METERS, 6);
          expect(Math.max(a.x, b.x)).toBeCloseTo((10 + lot.w) * TILE_METERS, 6);
          expect(Math.min(a.z, b.z)).toBeCloseTo(10 * TILE_METERS, 6);
          expect(Math.max(a.z, b.z)).toBeCloseTo((10 + lot.d) * TILE_METERS, 6);
        }
      }
    },
  );

  it.each(suburban.map((e) => [e.id, e] as const))(
    '%s: the drawn body is the plate its floor is counted on, at every turn',
    (_, e) => {
      const plate = bodyMetresFor(e);
      for (const rotation of [0, 1, 2, 3] as const) {
        const lot = footprintForRotation(e, rotation);
        const roadAt = roads.N(lot.w, lot.d);
        const { layout } = lotPlanFor(e, 10, 10, roadAt, rotation)!;
        const turned = rotation % 2 === 1 ? { w: plate.d, d: plate.w } : plate;
        expect(layout.body.u1 - layout.body.u0).toBeCloseTo(turned.w, 9);
        expect(layout.body.v1 - layout.body.v0).toBeCloseTo(turned.d, 9);
        const base = computeSetbacks(
          e,
          1,
          frontageSetbackFor(e, 10, 10, roadAt, undefined, rotation),
        ).boxes[0]!;
        expect(base.w).toBeCloseTo(plate.w, 9);
        expect(base.d).toBeCloseTo(plate.d, 9);
      }
    },
  );

  it('lays the same lot out the same way every time', () => {
    for (const e of suburban) {
      const req = lotParkingRequirement(e)!;
      const body = bodyMetresFor(e);
      const input = {
        along: e.footprint.w * TILE_METERS,
        depth: e.footprint.d * TILE_METERS,
        bodyAlong: body.w,
        bodyDepth: body.d,
        spaces: req.spaces,
        berths: req.berths,
      };
      expect(computeLotLayout(input)).toEqual(computeLotLayout({ ...input }));
    }
  });

  it('gives downtown kinds no lot plan: offices, hotels and mixed use park at the kerb', () => {
    const downtown = catalog.filter(
      (e) => e.zone === ZoneType.ComHigh || e.zone === ZoneType.Mixed,
    );
    expect(downtown.length).toBeGreaterThan(0);
    for (const e of downtown) {
      expect(lotPlanFor(e, 10, 10, roads.N(e.footprint.w, e.footprint.d)), e.id).toBeNull();
      expect(frontageSetbackFor(e, 10, 10, roads.N(e.footprint.w, e.footprint.d))).toEqual({
        spanXM: 0,
        spanZM: 0,
        centerXM: 0,
        centerZM: 0,
      });
    }
  });
});

describe('the car park as drawn', () => {
  const instance = (catalogId: string) => ({
    id: 1,
    catalogId,
    x: 10,
    z: 10,
    rotation: 0 as const,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
  });
  const north = (x: number, z: number): boolean => z === 9 && x >= 10 && x < 20;

  it('stands one car in each stall, inside it, and a tree in each planted island the rule asks for', () => {
    for (const id of ['ind-warehouse-3', 'com-strip-2', 'com-fuel-1']) {
      const e = catalog.find((c) => c.id === id)!;
      const renderer = new ParkedCarRenderer(new THREE.Scene(), () => 0, catalog, north);
      renderer.apply({ added: [instance(id)], removed: [], updated: [] });
      const plan = lotPlanFor(e, 10, 10, north)!;
      const cars = renderer.stallWorldPositions(1);
      expect(cars, id).toHaveLength(plan.layout.stalls.length);
      plan.layout.stalls.forEach((stall, i) => {
        const a = lotPointToWorld(plan.frame, stall.rect.u0, stall.rect.v0);
        const b = lotPointToWorld(plan.frame, stall.rect.u1, stall.rect.v1);
        const car = cars[i]!;
        const alongNose = stall.nose[0] === 'u' ? 'x' : 'z';
        const across = alongNose === 'x' ? 'z' : 'x';
        // Square in the stall across it; along it a long truck may stand out over the aisle.
        expect(car[across]).toBeGreaterThan(Math.min(a[across], b[across]));
        expect(car[across]).toBeLessThan(Math.max(a[across], b[across]));
      });
      expect(renderer.treePositionsFor(1), id).toHaveLength(plan.layout.trees.length);
    }
  });

  it('reaches every berth from a drawn aisle, and meets the street at the curb cut, however credited', () => {
    const touchesAlong = (a: LotRect, b: LotRect): boolean => {
      if (Math.abs(a.u0 - b.u1) < 0.01 || Math.abs(a.u1 - b.u0) < 0.01)
        return a.v0 <= b.v0 + 0.01 && a.v1 >= b.v1 - 0.01;
      if (Math.abs(a.v0 - b.v1) < 0.01 || Math.abs(a.v1 - b.v0) < 0.01)
        return a.u0 <= b.u0 + 0.01 && a.u1 >= b.u1 - 0.01;
      return false;
    };
    for (const e of suburban) {
      const req = lotParkingRequirement(e)!;
      for (const rotation of [0, 1] as const) {
        for (const alongX of [true, false]) {
          for (const credit of [0, Math.floor(req.spaces / 2), req.spaces]) {
            const layout = lotLayoutFor(e, rotation, alongX, credit)!;
            const id = `${e.id} turned ${rotation}, credit ${credit}`;
            for (const b of layout.berths) {
              expect(
                layout.aisles.some((a) => touchesAlong(a, b)),
                id,
              ).toBe(true);
            }
            if (layout.aisles.length === 0) continue;
            const cut = layout.curbCut;
            const atStreet = [...layout.aisles, ...(layout.throat ? [layout.throat] : [])].some(
              (a) => a.v0 < 0.01 && a.u0 < cut.u1 - 0.01 && a.u1 > cut.u0 + 0.01,
            );
            expect(atStreet, id).toBe(true);
          }
        }
      }
    }
  });

  it('draws no car park for a downtown office: its cars stand at the kerb', () => {
    const office = catalog.find((c) => c.kind === 'office')!;
    const renderer = new ParkedCarRenderer(new THREE.Scene(), () => 0, catalog, north);
    renderer.apply({ added: [instance(office.id)], removed: [], updated: [] });
    expect(renderer.hasStripeMesh(1)).toBe(false);
    expect(renderer.treePositionsFor(1)).toHaveLength(0);
    for (const car of renderer.stallWorldPositions(1)) {
      expect(car.z).toBeLessThan(10 * TILE_METERS); // in the street, not on the lot
    }
  });
});

describe('the lot’s paved ground', () => {
  /** A lot rectangle on the map. */
  const onMap = (
    frame: EdgeFrame,
    r: LotRect,
  ): { x0: number; x1: number; z0: number; z1: number } => {
    const a = lotPointToWorld(frame, r.u0, r.v0);
    const b = lotPointToWorld(frame, r.u1, r.v1);
    return {
      x0: Math.min(a.x, b.x),
      x1: Math.max(a.x, b.x),
      z0: Math.min(a.z, b.z),
      z1: Math.max(a.z, b.z),
    };
  };
  const within = (
    p: { x: number; z: number },
    r: { x0: number; x1: number; z0: number; z1: number },
  ): boolean => p.x > r.x0 - 1e-6 && p.x < r.x1 + 1e-6 && p.z > r.z0 - 1e-6 && p.z < r.z1 + 1e-6;

  interface Tri {
    x: number;
    z: number;
    y: number;
    area: number;
  }
  /** The lot renderer's ground for one building on flat land: each triangle's middle, its height and its area. */
  function groundOf(
    e: BuildingCatalogEntry,
    rotation: 0 | 1 | 2 | 3,
    roadAt: (x: number, z: number) => boolean,
  ): { tris: Tri[]; positions: number[]; colors: number[] } {
    const scene = new THREE.Scene();
    new LotRenderer(scene, () => 0, [e], roadAt).apply({
      added: [
        {
          id: 1,
          catalogId: e.id,
          x: 10,
          z: 10,
          rotation,
          level: e.level ?? 1,
          state: BuildingState.Active,
          problems: 0,
        },
      ],
      removed: [],
      updated: [],
    });
    const geometry = (scene.children[0] as THREE.Mesh).geometry;
    const positions = Array.from(geometry.getAttribute('position').array as Float32Array);
    const colors = Array.from(geometry.getAttribute('color').array as Float32Array);
    const tris: Tri[] = [];
    for (let i = 0; i < positions.length; i += 9) {
      const p = (k: number): number => positions[i + k]!;
      const [ax, ay, az, bx, bz, cx, cz] = [p(0), p(1), p(2), p(3), p(5), p(6), p(8)];
      tris.push({
        x: (ax + bx + cx) / 3,
        z: (az + bz + cz) / 3,
        y: ay,
        area: Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2,
      });
    }
    return { tris, positions, colors };
  }
  const at = (t: Tri, y: number): boolean => Math.abs(t.y - y) < 1e-4;

  /** The share of a laid-out lot left planted: everything its paving does not cover. */
  function plantedShare(layout: LotLayout): number {
    const { yard, concrete } = lotPaving(layout);
    const rects = [...yard, ...concrete];
    const us = [...new Set(rects.flatMap((r) => [r.u0, r.u1]))].sort((a, b) => a - b);
    const vs = [...new Set(rects.flatMap((r) => [r.v0, r.v1]))].sort((a, b) => a - b);
    let paved = 0;
    for (let i = 0; i + 1 < us.length; i++) {
      for (let j = 0; j + 1 < vs.length; j++) {
        const u = (us[i]! + us[i + 1]!) / 2;
        const v = (vs[j]! + vs[j + 1]!) / 2;
        if (rects.some((r) => u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1)) {
          paved += (us[i + 1]! - us[i]!) * (vs[j + 1]! - vs[j]!);
        }
      }
    }
    const { lot } = layout;
    return 1 - paved / ((lot.u1 - lot.u0) * (lot.v1 - lot.v0));
  }

  it.each(suburban.map((e) => [e.id, e] as const))(
    '%s: credited its whole code, it paves its body, its walks and only what its berths and yards need',
    (_, e) => {
      const req = lotParkingRequirement(e)!;
      for (const rotation of [0, 1, 2, 3] as const) {
        for (const alongX of [true, false]) {
          const layout = lotLayoutFor(e, rotation, alongX, req.spaces)!;
          expect(layout.stalls).toHaveLength(0);
          const { yard, concrete } = lotPaving(layout);
          const walks = [layout.frontWalk, layout.entranceWalk].filter((w) => w !== null);
          expect(concrete).toEqual([layout.body, ...walks]);
          const { body, frontWalk, entranceWalk } = layout;
          if (frontWalk) {
            // Along the body's street face, the body's width.
            expect(frontWalk.v1).toBeCloseTo(body.v0, 9);
            expect([frontWalk.u0, frontWalk.u1]).toEqual([body.u0, body.u1]);
          }
          if (entranceWalk) {
            // In from the street to the door.
            expect(entranceWalk.v0).toBe(0);
            expect(entranceWalk.v1).toBeCloseTo(frontWalk ? frontWalk.v0 : body.v0, 9);
            expect(layout.entrance.u).toBeGreaterThanOrEqual(entranceWalk.u0);
            expect(layout.entrance.u).toBeLessThanOrEqual(entranceWalk.u1);
          }
          const yards = [layout.forecourt, layout.rearYard].filter((r) => r !== null);
          if (req.berths === 0) {
            // No berth, so no drive: the curb cut is never cut.
            expect(layout.aisles).toHaveLength(0);
            expect(layout.throat).toBeNull();
            expect(yard).toEqual(yards);
          } else {
            const throat = layout.throat ? [layout.throat] : [];
            expect(yard).toEqual([...layout.aisles, ...throat, ...layout.berths, ...yards]);
          }
        }
      }
    },
  );

  it('draws a lot that holds nothing on site as lawn, the body’s slab and its walks, with no yard paving', () => {
    const corner = suburban.find((e) => e.id === 'com-low-1')!;
    for (const rotation of [0, 1, 2, 3] as const) {
      const lot = footprintForRotation(corner, rotation);
      const roadAt = roads.N(lot.w, lot.d);
      const { tris } = groundOf(corner, rotation, roadAt);
      const { frame, layout } = lotPlanFor(corner, 10, 10, roadAt, rotation)!;
      const slab = [layout.body, layout.frontWalk, layout.entranceWalk]
        .filter((r) => r !== null)
        .map((r) => onMap(frame, r));
      expect(tris.some((t) => at(t, DRIVE_Y_OFFSET))).toBe(false);
      const offSlab = tris.filter((t) => at(t, WALK_Y_OFFSET) && !slab.some((r) => within(t, r)));
      expect(offSlab).toEqual([]);
      expect(layout.frontWalk).not.toBeNull();
      expect(layout.entranceWalk).not.toBeNull();
    }
  });

  const markets = suburban.filter((e) => e.kind === 'supermarket');
  it.each(markets.map((e) => [e.id, e] as const))(
    '%s: paves only what its layout lays, and grass covers the rest of the lot, at every turn and frontage',
    (_, e) => {
      for (const rotation of [0, 1, 2, 3] as const) {
        const lot = footprintForRotation(e, rotation);
        const bounds = {
          x0: 10 * TILE_METERS,
          x1: (10 + lot.w) * TILE_METERS,
          z0: 10 * TILE_METERS,
          z1: (10 + lot.d) * TILE_METERS,
        };
        for (const side of ['N', 'E', 'S', 'W'] as const) {
          const roadAt = roads[side](lot.w, lot.d);
          const { frame, layout } = lotPlanFor(e, 10, 10, roadAt, rotation)!;
          const { yard, concrete } = lotPaving(layout);
          const yardOnMap = yard.map((r) => onMap(frame, r));
          const concreteOnMap = concrete.map((r) => onMap(frame, r));
          const islands = layout.islands.map((r) => onMap(frame, r));
          const { tris } = groundOf(e, rotation, roadAt);
          const id = `${e.id} turned ${rotation}, ${side}`;
          let lawn = 0;
          let paved = 0;
          const stray: Tri[] = [];
          for (const t of tris) {
            if (!within(t, bounds)) stray.push(t);
            if (at(t, LOT_Y_OFFSET)) {
              lawn += t.area;
            } else if (at(t, DRIVE_Y_OFFSET)) {
              paved += t.area;
              // Paving lies on a piece of the yard, never over a planted island.
              const onYard = yardOnMap.some((r) => within(t, r));
              if (!onYard || islands.some((r) => within(t, r))) stray.push(t);
            } else if (!at(t, WALK_Y_OFFSET) || !concreteOnMap.some((r) => within(t, r))) {
              stray.push(t);
            }
          }
          expect(stray, id).toEqual([]);
          const area = (r: LotRect): number => (r.u1 - r.u0) * (r.v1 - r.v0);
          expect(lawn).toBeCloseTo((bounds.x1 - bounds.x0) * (bounds.z1 - bounds.z0), 0);
          // Every piece of the yard is laid, each once.
          expect(paved).toBeCloseTo(
            yard.reduce((s, r) => s + area(r), 0),
            0,
          );
          expect(plantedShare(layout)).toBeGreaterThan(0);
        }
      }
    },
  );

  it.each(suburban.map((e) => [e.id, e] as const))(
    '%s: lays the same ground every time, at every turn, and the same planted share either way up',
    (_, e) => {
      for (const rotation of [0, 1, 2, 3] as const) {
        const lot = footprintForRotation(e, rotation);
        const roadAt = roads.N(lot.w, lot.d);
        const first = groundOf(e, rotation, roadAt);
        const again = groundOf(e, rotation, roadAt);
        expect(again.positions).toEqual(first.positions);
        expect(again.colors).toEqual(first.colors);
        if (rotation >= 2) {
          const turned = (r: 0 | 1 | 2 | 3): LotLayout => lotPlanFor(e, 10, 10, roadAt, r)!.layout;
          expect(plantedShare(turned(rotation))).toBeCloseTo(
            plantedShare(turned((rotation - 2) as 0 | 1)),
            9,
          );
        }
      }
    },
  );
});
