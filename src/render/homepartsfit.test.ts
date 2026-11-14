import { describe, expect, it } from 'vitest';
import {
  CHIMNEY_FLUE_M,
  CHIMNEY_STACK_M,
  ENTRY_CLEAR_M,
  PARAPET_ABOVE_ROOF_M,
  STOOP_FOOT_LANDING_M,
  planHouseLot,
  type HouseLotPlan,
  type LotRect,
} from './houselot';
import { BuildingState, ZoneType, type BuildingCatalogEntry } from '../shared/types';

const VERGE = 4.375;
const SIDEWALK = 1.875;
/** A car is 1.8 m wide and 4.6 m long, its centre where the lot plan puts it. */
const CAR_HALF_WIDTH_M = 0.9;
const CAR_HALF_LENGTH_M = 2.3;

function entry(over: Partial<BuildingCatalogEntry>): BuildingCatalogEntry {
  return {
    id: 'home',
    name: 'Home',
    category: 'res',
    zone: ZoneType.ResLow,
    kind: 'detached',
    level: 1,
    footprint: { w: 1, d: 2 },
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

const FORMS: Record<string, Partial<BuildingCatalogEntry>> = {
  ranch: {},
  cape: { height: 5, level: 2 },
  colonial: { height: 6.5, level: 3 },
  duplex: { kind: 'duplex', height: 6.4 },
  fourplex: { kind: 'fourplex', height: 7.3 },
  row: { zone: ZoneType.ResMediumRow, kind: 'townhouse', height: 9 },
};
const FOOTPRINTS: readonly [number, number][] = [
  [1, 2],
  [2, 2],
  [2, 1],
  [3, 3],
];

/** Every plan of a form over the seeds, on each footprint, along a straight street. */
function plansOf(form: string, count = 150): HouseLotPlan[] {
  const out: HouseLotPlan[] = [];
  for (const [w, d] of FOOTPRINTS) {
    const ent = entry({ ...FORMS[form], footprint: { w, d } });
    const z = 6 + d;
    const roadAt = (_x: number, tz: number): boolean => tz === z;
    const street = (_x: number, tz: number) =>
      tz === z ? { vergeM: VERGE, sidewalkM: SIDEWALK } : null;
    for (let id = 1; id <= count; id++) {
      const plan = planHouseLot(
        {
          id,
          catalogId: 'home',
          x: id * 4,
          z: 6,
          rotation: 0,
          level: 1,
          state: BuildingState.Active,
          problems: 0,
        },
        ent,
        roadAt,
        street,
      );
      if (plan) out.push(plan);
    }
  }
  return out;
}

/** The shortest distance between two rects, 0 where they touch or overlap. */
function gap(a: LotRect, b: LotRect): number {
  const du = Math.max(a.u0 - b.u1, b.u0 - a.u1, 0);
  const dv = Math.max(a.v0 - b.v1, b.v0 - a.v1, 0);
  return Math.hypot(du, dv);
}

/** What a home's entry is made of: the stoop or porch, its steps, posts, piers and roof. */
function entryParts(plan: HouseLotPlan): LotRect[] {
  const { porch, entries } = plan.kit;
  const parts = [...entries];
  if (porch) {
    parts.push(porch.floor.rect, porch.roof.rect);
    for (const box of [...porch.steps, ...porch.posts, ...porch.piers]) parts.push(box.rect);
  }
  return parts;
}

describe('a home’s entry and its parking', () => {
  it('keeps every pad, drive and car 0.3 m clear of the stoop, porch, posts and steps', () => {
    for (const form of Object.keys(FORMS)) {
      for (const plan of plansOf(form)) {
        for (const part of entryParts(plan)) {
          for (const drive of plan.drives) {
            const car = {
              u0: drive.car.u - CAR_HALF_WIDTH_M,
              u1: drive.car.u + CAR_HALF_WIDTH_M,
              v0: drive.car.v - CAR_HALF_LENGTH_M,
              v1: drive.car.v + CAR_HALF_LENGTH_M,
            };
            expect(gap(part, drive.rect), `${form} pad`).toBeGreaterThanOrEqual(
              ENTRY_CLEAR_M - 1e-6,
            );
            expect(gap(part, car), `${form} car`).toBeGreaterThanOrEqual(ENTRY_CLEAR_M - 1e-6);
          }
        }
      }
    }
  });

  it('leaves 0.915 m of clear landing at the foot of every stoop, no pad or car on it', () => {
    for (const form of Object.keys(FORMS)) {
      for (const plan of plansOf(form)) {
        for (const stoop of plan.kit.entries) {
          const landing = {
            u0: stoop.u0,
            u1: stoop.u1,
            v0: stoop.v0 - STOOP_FOOT_LANDING_M,
            v1: stoop.v0,
          };
          // The landing lies on the lot, short of the footway.
          expect(landing.v0).toBeGreaterThan(-VERGE);
          for (const drive of plan.drives) {
            expect(gap(landing, drive.rect), `${form} landing`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('seats a row’s stoop beside its own pad, never across the party wall from it', () => {
    for (const plan of plansOf('row')) {
      expect(plan.homes).toBe(3);
      plan.doors.forEach((door, k) => {
        const own = plan.drives[k]!;
        expect(door.u - own.rect.u1).toBeGreaterThanOrEqual(ENTRY_CLEAR_M + 0.8 - 1e-6);
      });
    }
  });
});

describe('a colonial’s chimney', () => {
  it('is a plumb masonry stack on the ground against an end wall, 0.6 m over the ridge', () => {
    let stacks = 0;
    for (const plan of plansOf('colonial')) {
      const ridge = plan.kit.heightM + plan.kit.roof.riseM;
      for (const { rect, y0, y1 } of plan.kit.chimneys) {
        stacks++;
        expect(y0).toBe(0);
        expect(y1).toBeCloseTo(ridge + 0.6, 6);
        // A stack, not a post: 0.53 m through the wall by 0.97 m along it.
        expect(rect.u1 - rect.u0).toBeCloseTo(CHIMNEY_FLUE_M, 6);
        expect(rect.v1 - rect.v0).toBeCloseTo(CHIMNEY_STACK_M, 6);
        const atWall = [plan.body.u0, plan.body.u1].some((u) => rect.u0 < u && u < rect.u1);
        expect(atWall).toBe(true);
      }
    }
    expect(stacks).toBeGreaterThan(0);
  });
});

describe('a row’s party-wall parapets', () => {
  it('stand on the wall top and follow the roof 0.76 m proud of it, none off the body', () => {
    let checked = 0;
    for (const plan of plansOf('row')) {
      const { heightM, roof } = plan.kit;
      const { body } = plan;
      const mid = (body.v0 + body.v1) / 2;
      const half = (body.v1 - body.v0) / 2;
      expect(plan.kit.parapets).toHaveLength(2);
      for (const parapet of plan.kit.parapets) {
        checked++;
        expect(parapet.y0).toBe(heightM);
        expect(parapet.y1 - heightM).toBeCloseTo(PARAPET_ABOVE_ROOF_M, 6);
        expect(parapet.rect.v0).toBeCloseTo(body.v0, 6);
        expect(parapet.rect.v1).toBeCloseTo(body.v1, 6);
        for (const k of [0, 0.25, 0.5, 0.75, 1]) {
          const v = body.v0 + k * 2 * half;
          const slope = heightM + roof.riseM * (1 - Math.abs(v - mid) / half);
          const top = parapet.y1 + roof.riseM * (1 - Math.abs(v - mid) / half);
          expect(top - slope).toBeCloseTo(PARAPET_ABOVE_ROOF_M, 6);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
