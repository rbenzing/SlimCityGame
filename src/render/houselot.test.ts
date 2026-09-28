import { describe, expect, it } from 'vitest';
import {
  CAR_HALF_LENGTH_M,
  DRIVE_WIDTH_M,
  POOL_RADIUS_M,
  TRAMPOLINE_RADIUS_M,
  driveRoadTiles,
  planHouseGround,
  planHouseLot,
  type HouseLotPlan,
  type LotRect,
} from './houselot';
import { HOUSE_FRONT_YARD_M, frontageSetbackFor } from './massing';
import type { StreetLookup } from './frontage';
import { TILE_METERS } from '../shared/constants';
import {
  BuildingState,
  ZoneType,
  type BuildingCatalogEntry,
  type BuildingInstance,
} from '../shared/types';

function entry(over: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'home',
    name: 'Home',
    category: 'res',
    zone: ZoneType.ResLow,
    level: 1,
    footprint: { w: 2, d: 2 },
    height: 4,
    color: 0,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...over,
  };
}

function home(over: Partial<BuildingInstance> = {}): BuildingInstance {
  return {
    id: 1,
    catalogId: 'home',
    x: 4,
    z: 6,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...over,
  };
}

const VERGE = 4.375;
const SIDEWALK = 1.875;

/** A straight street along row `z`, verge and sidewalk as a two-lane road has them. */
function streetRow(z: number, vergeM = VERGE): {
  roadAt: (x: number, z: number) => boolean;
  street: StreetLookup;
} {
  return {
    roadAt: (_x, tz) => tz === z,
    street: (_x, tz) => (tz === z ? { vergeM, sidewalkM: SIDEWALK } : null),
  };
}

const small = entry();
const villa = entry({ footprint: { w: 3, d: 3 }, height: 6.5 });
const terrace = entry({ zone: ZoneType.ResMediumRow, footprint: { w: 1, d: 4 }, height: 9 });

const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - 1e-6 && b.u0 < a.u1 - 1e-6 && a.v0 < b.v1 - 1e-6 && b.v0 < a.v1 - 1e-6;

/** Many homes of one kind along one street, so every seeded choice gets exercised. */
function streetOf(e: BuildingCatalogEntry, count = 60): HouseLotPlan[] {
  const { roadAt, street } = streetRow(6 + e.footprint.d);
  return Array.from(
    { length: count },
    (_, i) => planHouseLot(home({ id: i + 1, x: i * 4 }), e, roadAt, street)!,
  );
}

describe('planHouseLot — where the house stands', () => {
  const { roadAt, street } = streetRow(8);

  it('puts the front wall 5.5 m behind the sidewalk, the verge counting toward the yard', () => {
    const plan = planHouseLot(home(), small, roadAt, street)!;
    expect(plan.edge?.side).toBe('S');
    expect(plan.body.v0).toBeCloseTo(HOUSE_FRONT_YARD_M - VERGE, 6);
  });

  it('stands at the lot’s edge where the verge alone is deeper than the yard, never beyond it', () => {
    const wide = streetRow(8, 7.2);
    const plan = planHouseLot(home(), small, wide.roadAt, wide.street)!;
    expect(plan.body.v0).toBeCloseTo(0, 6);
  });

  it('keeps its place across the frontage, centred', () => {
    const plan = planHouseLot(home(), small, roadAt, street)!;
    expect((plan.body.u0 + plan.body.u1) / 2).toBeCloseTo(plan.edgeLenM / 2, 6);
  });

  it('moves the body the body renderers draw: a shift toward the street, no cut', () => {
    const shift = frontageSetbackFor(small, 4, 6, roadAt, street);
    expect(shift.spanXM).toBe(0);
    expect(shift.spanZM).toBe(0);
    expect(shift.centerXM).toBe(0);
    // South toward the street at row 8.
    expect(shift.centerZM).toBeGreaterThan(0);
  });

  it('leaves a home that fronts no street centred, with no drive, path or verge lawn', () => {
    const plan = planHouseLot(home(), small, () => false, () => null)!;
    expect(plan.edge).toBeNull();
    expect(plan.drives).toEqual([]);
    expect(plan.paths).toEqual([]);
    expect(plan.vergeLawn).toEqual([]);
    expect((plan.body.v0 + plan.body.v1) / 2).toBeCloseTo(plan.lotDepthM / 2, 6);
    expect(frontageSetbackFor(small, 4, 6, () => false)).toEqual({
      spanXM: 0,
      spanZM: 0,
      centerXM: 0,
      centerZM: 0,
    });
  });

  it('is nothing at all for a building that is not a home', () => {
    expect(planHouseLot(home(), entry({ zone: ZoneType.ResMedium }), roadAt, street)).toBeNull();
    expect(planHouseLot(home(), entry({ category: 'com', zone: ZoneType.ComLow }), roadAt, street)).toBeNull();
  });

  it('lays the same lot out the same way every time', () => {
    expect(planHouseLot(home({ id: 9 }), villa, roadAt, street)).toEqual(
      planHouseLot(home({ id: 9 }), villa, roadAt, street),
    );
  });
});

describe('planHouseLot — the drive', () => {
  it('runs from the carriageway across the sidewalk and the verge onto the lot', () => {
    for (const plan of streetOf(small)) {
      expect(plan.drives).toHaveLength(1);
      const drive = plan.drives[0]!;
      expect(drive.rect.u1 - drive.rect.u0).toBeCloseTo(DRIVE_WIDTH_M, 6);
      expect(drive.rect.v0).toBeCloseTo(-VERGE, 6);
      expect(drive.cut).toEqual({ u0: drive.rect.u0, u1: drive.rect.u1, v0: -(VERGE + SIDEWALK), v1: -VERGE });
      expect(drive.rect.u0).toBeGreaterThanOrEqual(0);
      expect(drive.rect.u1).toBeLessThanOrEqual(plan.edgeLenM);
    }
  });

  it('keeps its car on the drive and off the footway, nose to the house', () => {
    for (const plan of [...streetOf(small), ...streetOf(villa), ...streetOf(terrace, 10)]) {
      for (const drive of plan.drives) {
        expect(drive.car.v - CAR_HALF_LENGTH_M).toBeGreaterThanOrEqual(drive.rect.v0 - 1e-6);
        expect(drive.car.u).toBeGreaterThan(drive.rect.u0);
        expect(drive.car.u).toBeLessThan(drive.rect.u1);
      }
    }
  });

  it('never crosses a junction tile — it takes the other side of the house, or none', () => {
    // Side streets leaving the main street southward make T-junctions of the
    // frontage tiles they meet: the lot's frontage tiles are x = 4 and 5.
    const teesAt = (...xs: number[]) => {
      const roadAt = (x: number, z: number): boolean => z === 8 || (z > 8 && xs.includes(x));
      return {
        roadAt,
        street: ((x: number, z: number) =>
          roadAt(x, z) ? { vergeM: VERGE, sidewalkM: SIDEWALK } : null) as StreetLookup,
      };
    };
    for (let id = 1; id <= 20; id++) {
      const left = teesAt(4);
      const plan = planHouseLot(home({ id }), small, left.roadAt, left.street)!;
      expect(plan.edge?.side).toBe('S');
      for (const drive of plan.drives) expect(drive.cut.u0).toBeGreaterThanOrEqual(TILE_METERS);
      const both = teesAt(4, 5);
      expect(planHouseLot(home({ id }), small, both.roadAt, both.street)!.drives).toEqual([]);
    }
  });

  it('ends at every kind of cover along a street, a detached garage only where the lot is deep enough', () => {
    const plans = streetOf(villa);
    const covers = new Set(plans.flatMap((p) => p.drives.map((d) => d.cover)));
    expect([...covers].sort()).toEqual(['carport', 'detachedGarage', 'garage', 'spot']);
    for (const plan of plans) {
      for (const drive of plan.drives) {
        if (drive.cover !== 'detachedGarage') continue;
        expect(drive.coverRect!.v1).toBeLessThanOrEqual(plan.lotDepthM - 1 + 1e-6);
        expect(drive.coverRect!.v0).toBeGreaterThan(plan.body.v1);
      }
    }
  });

  it('attaches an attached garage to the house wall, its door toward the street', () => {
    const plan = streetOf(villa).find((p) => p.drives[0]?.cover === 'garage')!;
    const drive = plan.drives[0]!;
    const g = drive.coverRect!;
    const touches = Math.abs(g.u0 - plan.body.u1) < 1e-6 || Math.abs(g.u1 - plan.body.u0) < 1e-6;
    expect(touches).toBe(true);
    expect(drive.garageDoor!.v).toBeCloseTo(g.v0, 6);
  });

  it('names the road tiles its drives cross, so a lamp keeps out of them', () => {
    const { roadAt, street } = streetRow(8);
    const building = home({ id: 3 });
    const plan = planHouseGround(building, small, roadAt, street)!;
    const tiles = driveRoadTiles(building, small, plan);
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(t.z).toBe(8);
      const u0 = (t.x - building.x) * TILE_METERS;
      expect(plan.drives.some((d) => d.cut.u0 < u0 + TILE_METERS && d.cut.u1 > u0)).toBe(true);
    }
  });
});

describe('planHouseLot — rows', () => {
  it('makes a row along its street one home per frontage tile, each with its own pad and patio', () => {
    // The row's long east side meets a street down column 5.
    const roadAt = (x: number): boolean => x === 5;
    const street: StreetLookup = (x) => (x === 5 ? { vergeM: VERGE, sidewalkM: SIDEWALK } : null);
    const plan = planHouseLot(home(), terrace, roadAt, street)!;
    expect(plan.edge?.side).toBe('E');
    expect(plan.homes).toBe(4);
    expect(plan.doors).toHaveLength(4);
    expect(plan.drives).toHaveLength(4);
    for (const drive of plan.drives) {
      expect(['pad', 'integralGarage']).toContain(drive.cover);
      expect(drive.rect.v1).toBeCloseTo(plan.body.v0, 6);
    }
    expect(plan.yard.patios).toHaveLength(4);
    // A fence between each pair of neighbours, from the back wall to the back line.
    const dividers = plan.yard.fence.filter((f) => f.u0 === f.u1 && f.u0 > 1 && f.u0 < plan.edgeLenM - 1);
    expect(dividers).toHaveLength(3);
    expect(plan.yard.pool).toBeNull();
    expect(plan.yard.trampoline).toBeNull();
  });

  it('treats a row whose narrow end meets the street as one home', () => {
    const { roadAt, street } = streetRow(10);
    const plan = planHouseLot(home(), terrace, roadAt, street)!;
    expect(plan.edge?.side).toBe('S');
    expect(plan.homes).toBe(1);
    expect(plan.drives).toHaveLength(1);
  });
});

describe('planHouseLot — the yard', () => {
  it('never runs a fence through a drive, a carport or a garage', () => {
    for (const plan of [...streetOf(small), ...streetOf(villa), ...streetOf(terrace, 10)]) {
      const driven = plan.drives.flatMap((d) => (d.coverRect ? [d.rect, d.coverRect] : [d.rect]));
      for (const run of plan.yard.fence) {
        const line: LotRect = {
          u0: Math.min(run.u0, run.u1),
          u1: Math.max(run.u0, run.u1) + (run.u0 === run.u1 ? 1e-3 : 0),
          v0: Math.min(run.v0, run.v1),
          v1: Math.max(run.v0, run.v1) + (run.v0 === run.v1 ? 1e-3 : 0),
        };
        for (const d of driven) expect(overlaps(line, d)).toBe(false);
      }
    }
  });

  it('stands the pool, the trampoline and the trees inside the lot and clear of everything else', () => {
    const plans = [...streetOf(small), ...streetOf(villa)];
    expect(plans.some((p) => p.yard.pool)).toBe(true);
    expect(plans.some((p) => p.yard.trampoline)).toBe(true);
    for (const plan of plans) {
      const parts: LotRect[] = [];
      const circle = (p: { u: number; v: number }, r: number): LotRect => ({
        u0: p.u - r,
        u1: p.u + r,
        v0: p.v - r,
        v1: p.v + r,
      });
      if (plan.yard.pool) parts.push(circle(plan.yard.pool, POOL_RADIUS_M));
      if (plan.yard.trampoline) parts.push(circle(plan.yard.trampoline, TRAMPOLINE_RADIUS_M));
      for (const t of plan.yard.trees) parts.push(circle(t, 2));
      const taken = [
        plan.body,
        ...plan.yard.patios,
        ...plan.drives.flatMap((d) => (d.coverRect ? [d.rect, d.coverRect] : [d.rect])),
      ];
      parts.forEach((p, i) => {
        expect(p.u0).toBeGreaterThanOrEqual(0);
        expect(p.u1).toBeLessThanOrEqual(plan.edgeLenM);
        expect(p.v0).toBeGreaterThanOrEqual(plan.body.v1);
        expect(p.v1).toBeLessThanOrEqual(plan.lotDepthM);
        for (const t of taken) expect(overlaps(p, t)).toBe(false);
        for (const q of parts.slice(i + 1)) expect(overlaps(p, q)).toBe(false);
      });
    }
  });

  it('grows more trees in a bigger back yard', () => {
    const count = (plans: HouseLotPlan[]) => plans.reduce((n, p) => n + p.yard.trees.length, 0);
    expect(count(streetOf(villa))).toBeGreaterThan(count(streetOf(small)));
  });

  it('keeps the bushes along the front wall, off the door path and the drive', () => {
    for (const plan of streetOf(small)) {
      for (const bush of plan.yard.bushes) {
        expect(bush.v).toBeLessThan(plan.body.v0);
        for (const path of plan.paths) expect(bush.u > path.u0 && bush.u < path.u1).toBe(false);
        for (const drive of plan.drives) {
          expect(bush.u > drive.rect.u0 && bush.u < drive.rect.u1).toBe(false);
        }
      }
    }
  });
});
