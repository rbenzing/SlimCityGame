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
import { computeLotLayout, type LotLayout, type LotRect } from '../shared/lotlayout';
import { lotLayoutFor, lotPlanFor, lotPointToWorld } from './lotplan';
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

  it.todo('P2: shop lots meet their code with kerb credit and larger lot variants');
  it.todo('P2: restaurant lots meet their code with kerb credit and larger lot variants');
  it.todo('P2: strip lots meet their code with kerb credit and larger lot variants');
  it.todo('P2: supermarket lots meet their code with kerb credit and larger lot variants');
  it.todo('P2: flex lots at levels 1 and 3 meet their code with larger lot variants');

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
  const roads: Record<
    'N' | 'E' | 'S' | 'W',
    (w: number, d: number) => (x: number, z: number) => boolean
  > = {
    N: () => (x, z) => z === 9 && x >= 10,
    S: (_, d) => (x, z) => z === 10 + d && x >= 10,
    E: (w) => (x, z) => x === 10 + w && z >= 10,
    W: () => (x, z) => x === 9 && z >= 10,
  };

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
