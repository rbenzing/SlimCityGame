import { describe, expect, it } from 'vitest';
import { TILE_METERS } from '../shared/constants';
import { BuildingState, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance, FarmKind } from '../shared/types';
import {
  BIN_DIAMETER_M,
  HOUSE_RIDGE_M,
  TRUCK_SIZE_M,
  WINDOW_H_M,
  CROP_BAND_ROWS,
  CROP_ROW_M,
  ORCHARD_IN_ROW_M,
  ORCHARD_ROW_M,
  SILO_DIAMETER_M,
  YARD_DEPTH_M,
  cropBands,
  farmGateSide,
  orchardTrees,
  paddockHerd,
  planFarm,
  type FarmRect,
} from './farmlot';

const farm = (kind: FarmKind, level: number, w: number, d: number): BuildingCatalogEntry => ({
  id: `farm-${kind}-${level}`,
  name: kind,
  category: 'ind',
  zone: ZoneType.Agriculture,
  level,
  kind,
  footprint: { w, d },
  height: 9,
  color: 0x7a3a2c,
  residents: 4,
  jobs: 1,
  powerUse: 0.2,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
});
const at = (x: number, z: number): BuildingInstance => ({
  id: 7,
  catalogId: 'farm',
  x,
  z,
  rotation: 0,
  level: 1,
  state: BuildingState.Active,
  problems: 0,
});
/** A dirt road along one side of the lot at (10, 10). */
const dirtAlong =
  (side: 'N' | 'E' | 'S' | 'W', w: number, d: number, distance = 1) =>
  (tx: number, tz: number): boolean => {
    if (side === 'N') return tz === 10 - distance;
    if (side === 'S') return tz === 10 + d - 1 + distance;
    if (side === 'W') return tx === 10 - distance;
    return tx === 10 + w - 1 + distance;
  };

const inside = (inner: FarmRect, outer: FarmRect): boolean =>
  inner.x0 >= outer.x0 - 1e-9 &&
  inner.z0 >= outer.z0 - 1e-9 &&
  inner.x1 <= outer.x1 + 1e-9 &&
  inner.z1 <= outer.z1 + 1e-9;
const overlaps = (a: FarmRect, b: FarmRect): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const area = (r: FarmRect): number => (r.x1 - r.x0) * (r.z1 - r.z0);

describe('farmGateSide', () => {
  it.each(['N', 'E', 'S', 'W'] as const)('opens the gate onto a dirt road to the %s', (side) => {
    expect(farmGateSide(10, 10, 4, 5, dirtAlong(side, 4, 5))).toBe(side);
  });

  it('finds a dirt road a few tiles off, as far as a farm reaches for one', () => {
    expect(farmGateSide(10, 10, 4, 5, dirtAlong('E', 4, 5, 3))).toBe('E');
  });

  it('prefers the nearest road', () => {
    const near = dirtAlong('S', 4, 5, 1);
    const far = dirtAlong('N', 4, 5, 2);
    expect(farmGateSide(10, 10, 4, 5, (x, z) => near(x, z) || far(x, z))).toBe('S');
  });
});

describe('planFarm', () => {
  it('plans nothing for a building that is not a farm', () => {
    const house = { ...farm('crops', 1, 2, 2), zone: ZoneType.ResLow, kind: 'detached' as const };
    expect(planFarm(at(10, 10), house, () => false)).toBeNull();
  });

  describe.each([
    ['crops', 1, 4, 5],
    ['crops', 3, 6, 7],
    ['orchard', 2, 5, 6],
    ['pasture', 3, 6, 7],
  ] as const)('a %s farm at level %i', (kind, level, w, d) => {
    describe.each(['N', 'E', 'S', 'W'] as const)('gated to the %s', (side) => {
      const plan = planFarm(at(10, 10), farm(kind, level, w, d), dirtAlong(side, w, d))!;

      it('covers exactly its lot, farmstead and field between them', () => {
        expect(plan.lot).toEqual({
          x0: 10 * TILE_METERS,
          z0: 10 * TILE_METERS,
          x1: (10 + w) * TILE_METERS,
          z1: (10 + d) * TILE_METERS,
        });
        expect(inside(plan.yard, plan.lot)).toBe(true);
        expect(inside(plan.field, plan.lot)).toBe(true);
        expect(overlaps(plan.yard, plan.field)).toBe(false);
        expect(area(plan.yard) + area(plan.field)).toBeCloseTo(area(plan.lot), 6);
      });

      it('puts the farmstead in the strip along the dirt road', () => {
        const depth =
          side === 'N' || side === 'S' ? plan.yard.z1 - plan.yard.z0 : plan.yard.x1 - plan.yard.x0;
        expect(depth).toBeCloseTo(YARD_DEPTH_M, 6);
        const touchesGateEdge = {
          N: plan.yard.z0 === plan.lot.z0,
          S: plan.yard.z1 === plan.lot.z1,
          W: plan.yard.x0 === plan.lot.x0,
          E: plan.yard.x1 === plan.lot.x1,
        }[side];
        expect(touchesGateEdge).toBe(true);
        for (const r of [plan.house, plan.barn, plan.apron])
          expect(inside(r, plan.yard)).toBe(true);
      });

      it('runs the drive from the lot line at the gate', () => {
        const atGate = {
          N: plan.drive.z0 === plan.lot.z0,
          S: plan.drive.z1 === plan.lot.z1,
          W: plan.drive.x0 === plan.lot.x0,
          E: plan.drive.x1 === plan.lot.x1,
        }[side];
        expect(atGate).toBe(true);
        expect(overlaps(plan.drive, plan.house)).toBe(false);
        expect(overlaps(plan.drive, plan.barn)).toBe(false);
      });

      it('stands the house, the barn, the silos and the bins apart', () => {
        expect(overlaps(plan.house, plan.barn)).toBe(false);
        const round = (p: { x: number; z: number }, diameter: number): FarmRect => ({
          x0: p.x - diameter / 2,
          z0: p.z - diameter / 2,
          x1: p.x + diameter / 2,
          z1: p.z + diameter / 2,
        });
        const rounds = [
          ...plan.silos.map((s) => round(s, SILO_DIAMETER_M)),
          ...plan.bins.map((b) => round(b, BIN_DIAMETER_M)),
        ];
        for (const r of rounds) {
          expect(inside(r, plan.apron)).toBe(true);
          expect(overlaps(r, plan.barn)).toBe(false);
          expect(overlaps(r, plan.house)).toBe(false);
        }
        for (let i = 0; i < rounds.length; i++) {
          for (let j = i + 1; j < rounds.length; j++)
            expect(overlaps(rounds[i]!, rounds[j]!)).toBe(false);
        }
      });

      it('runs the barn ridge along the gate edge and the rows away from it', () => {
        const alongX = side === 'N' || side === 'S';
        expect(plan.barn.ridgeAlongX).toBe(alongX);
        expect(plan.rowsAlongX).toBe(!alongX);
      });

      it('sets eight windows in the farmhouse walls, each facing out, two toward the road', () => {
        const { house } = plan;
        expect(plan.houseWindows).toHaveLength(8);
        const onWall = (x: number, z: number): boolean =>
          x >= house.x0 - 1e-6 &&
          x <= house.x1 + 1e-6 &&
          z >= house.z0 - 1e-6 &&
          z <= house.z1 + 1e-6 &&
          [x - house.x0, house.x1 - x, z - house.z0, house.z1 - z].some((d) => Math.abs(d) < 1e-6);
        const road = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[side];
        let towardRoad = 0;
        for (const w of plan.houseWindows) {
          expect(onWall(w.x, w.z)).toBe(true);
          expect(Math.hypot(w.nx, w.nz)).toBeCloseTo(1, 9);
          // A metre out along its facing is outside the house.
          const ox = w.x + w.nx;
          const oz = w.z + w.nz;
          expect(ox > house.x0 && ox < house.x1 && oz > house.z0 && oz < house.z1).toBe(false);
          if (w.nx === road[0] && w.nz === road[1]) towardRoad += 1;
          expect(w.sill + WINDOW_H_M).toBeLessThan(HOUSE_RIDGE_M);
        }
        expect(towardRoad).toBe(2);
      });

      it('sends the truck round a closed loop inside the yard, clear of every building', () => {
        const route = plan.truckRoute!;
        expect(route).not.toBeNull();
        expect(route[0]).toEqual(route[route.length - 1]);
        const half = TRUCK_SIZE_M[0] / 2;
        const clearOf = (x: number, z: number, r: FarmRect): number =>
          Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
        const samples = route.flatMap((p, i) =>
          i === 0 ? [p] : [p, { x: (p.x + route[i - 1]!.x) / 2, z: (p.z + route[i - 1]!.z) / 2 }],
        );
        for (const p of samples) {
          expect(clearOf(p.x, p.z, plan.barn)).toBeGreaterThan(half);
          expect(clearOf(p.x, p.z, plan.house)).toBeGreaterThan(half);
          for (const s of plan.silos) {
            expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeGreaterThan(SILO_DIAMETER_M / 2 + half);
          }
          for (const b of plan.bins) {
            expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeGreaterThan(BIN_DIAMETER_M / 2 + half);
          }
          const box = { x0: p.x - half, z0: p.z - half, x1: p.x + half, z1: p.z + half };
          expect(inside(box, plan.yard)).toBe(true);
        }
        // It parks on the drive, and it stops beyond the silos.
        const park = route[0]!;
        const { drive } = plan;
        expect(
          park.x >= drive.x0 && park.x <= drive.x1 && park.z >= drive.z0 && park.z <= drive.z1,
        ).toBe(true);
        expect(plan.truckStop).toBeGreaterThan(0);
        expect(plan.truckStop).toBeLessThan(route.length - 1);
      });
    });
  });

  it('keeps an orchard’s fruit in its packing barn: no silo, no bins', () => {
    const plan = planFarm(at(10, 10), farm('orchard', 3, 6, 7), dirtAlong('N', 6, 7))!;
    expect(plan.silos).toHaveLength(0);
    expect(plan.bins).toHaveLength(0);
  });

  it('picks a growing crop or ripe grain by the farm, and keeps it', () => {
    const entry = farm('crops', 1, 4, 5);
    const ripeness = (id: number): boolean =>
      planFarm({ ...at(10, 10), id }, entry, dirtAlong('N', 4, 5))!.ripe;
    expect(ripeness(3)).toBe(ripeness(3));
    const all = Array.from({ length: 40 }, (_, i) => ripeness(i + 1));
    expect(all).toContain(true);
    expect(all).toContain(false);
  });

  it('adds grain bins beside a crop farm’s silo as it grows', () => {
    const lots: ReadonlyArray<readonly [number, number]> = [
      [4, 5],
      [5, 6],
      [6, 7],
    ];
    const counts = [1, 2, 3].map((level) => {
      const [w, d] = lots[level - 1]!;
      const plan = planFarm(at(10, 10), farm('crops', level, w, d), dirtAlong('N', w, d))!;
      return [plan.silos.length, plan.bins.length];
    });
    expect(counts).toEqual([
      [1, 0],
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('what the field holds', () => {
  const planOf = (kind: FarmKind, side: 'N' | 'E'): ReturnType<typeof planFarm> =>
    planFarm(at(10, 10), farm(kind, 3, 6, 7), dirtAlong(side, 6, 7));

  it.each(['N', 'E'] as const)(
    'tiles a crop field with bands of crop and furrow, gated %s',
    (side) => {
      const plan = planOf('crops', side)!;
      const bands = cropBands(plan);
      const covered = bands.reduce((sum, b) => sum + area(b.rect), 0);
      expect(covered).toBeCloseTo(area(plan.field), 6);
      for (const b of bands) expect(inside(b.rect, plan.field)).toBe(true);
      for (let i = 1; i < bands.length; i++)
        expect(overlaps(bands[i - 1]!.rect, bands[i]!.rect)).toBe(false);
      // Three rows of crop to every row of furrow, at 30-inch rows.
      const crop = bands.find((b) => !b.furrow)!.rect;
      const furrow = bands.find((b) => b.furrow)!.rect;
      const across = (r: FarmRect): number => (plan.rowsAlongX ? r.z1 - r.z0 : r.x1 - r.x0);
      expect(across(crop)).toBeCloseTo((CROP_BAND_ROWS - 1) * CROP_ROW_M, 6);
      expect(across(furrow)).toBeCloseTo(CROP_ROW_M, 6);
    },
  );

  it('plants an orchard in rows at orchard spacing, every tree inside the orchard', () => {
    const plan = planOf('orchard', 'N')!;
    const trees = orchardTrees(plan);
    for (const t of trees) {
      expect(t.x).toBeGreaterThan(plan.field.x0);
      expect(t.x).toBeLessThan(plan.field.x1);
      expect(t.z).toBeGreaterThan(plan.field.z0);
      expect(t.z).toBeLessThan(plan.field.z1);
    }
    // 120 m × 110 m of orchard at 4.9 m × 6.1 m, back from the edges by half a row.
    const perArea = trees.length / area(plan.field);
    expect(perArea).toBeGreaterThan(0.8 / (ORCHARD_IN_ROW_M * ORCHARD_ROW_M));
    expect(perArea).toBeLessThanOrEqual(1 / (ORCHARD_IN_ROW_M * ORCHARD_ROW_M));
  });

  it('stocks a paddock one head to every four tiles, and never leaves it empty', () => {
    const plan = planOf('pasture', 'N')!;
    const tiles = area(plan.field) / (TILE_METERS * TILE_METERS);
    expect(paddockHerd(plan)).toBe(Math.floor(tiles / 4));
    const tiny = { ...plan, field: { x0: 0, z0: 0, x1: 20, z1: 20 } };
    expect(paddockHerd(tiny)).toBe(1);
  });
});
