import { describe, expect, it } from 'vitest';
import {
  CAR_HALF_LENGTH_M,
  CHIMNEY_FLUE_M,
  CHIMNEY_STACK_M,
  DOOR_WIDTH_M,
  DORMER_WIDTH_M,
  DRIVE_WIDTH_M,
  PARAPET_ABOVE_ROOF_M,
  PARAPET_THICKNESS_M,
  POOL_RADIUS_M,
  PORCH_DEPTH_M,
  POST_M,
  SHUTTER_THICKNESS_M,
  TRAMPOLINE_RADIUS_M,
  driveRoadTiles,
  houseStyleOf,
  planHouseGround,
  planHouseLot,
  type HouseLotPlan,
  type KitBox,
  type LotRect,
} from './houselot';
import { housePaneMargins, windowGrid } from './facade';
import { HOUSE_FRONT_YARD_M, frontageSetbackFor, tierHeightOf } from './massing';
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
    kind: 'detached',
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
function streetRow(
  z: number,
  vergeM = VERGE,
): {
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
const terrace = entry({
  zone: ZoneType.ResMediumRow,
  kind: 'townhouse',
  footprint: { w: 1, d: 2 },
  height: 9,
});

const overlaps = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - 1e-6 && b.u0 < a.u1 - 1e-6 && a.v0 < b.v1 - 1e-6 && b.v0 < a.v1 - 1e-6;

/** Many homes of one kind along one street, so every seeded choice gets exercised. */
function streetOf(e: BuildingCatalogEntry, count = 60): HouseLotPlan[] {
  const { roadAt, street } = streetRow(6 + e.footprint.d);
  return Array.from({ length: count }, (_, i) =>
    planHouseLot(home({ id: i + 1, x: i * 4 }), e, roadAt, street)!,
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
    const plan = planHouseLot(
      home(),
      small,
      () => false,
      () => null,
    )!;
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
    expect(
      planHouseLot(home(), entry({ zone: ZoneType.ResMedium, kind: 'garden' }), roadAt, street),
    ).toBeNull();
    expect(
      planHouseLot(
        home(),
        entry({ category: 'com', zone: ZoneType.ComLow, kind: undefined }),
        roadAt,
        street,
      ),
    ).toBeNull();
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
      expect(drive.cut).toEqual({
        u0: drive.rect.u0,
        u1: drive.rect.u1,
        v0: -(VERGE + SIDEWALK),
        v1: -VERGE,
      });
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
  it('makes a row three homes per frontage tile, each with its own pad and patio', () => {
    // The row's narrow end meets the street along row 8.
    const { roadAt, street } = streetRow(8);
    const plan = planHouseLot(home(), terrace, roadAt, street)!;
    expect(plan.edge?.side).toBe('S');
    expect(plan.homes).toBe(3);
    expect(plan.doors).toHaveLength(3);
    expect(plan.drives).toHaveLength(3);
    for (const drive of plan.drives) {
      expect(['pad', 'integralGarage']).toContain(drive.cover);
      expect(drive.rect.v1).toBeCloseTo(plan.body.v0, 6);
    }
    // Each home's pad and door stay inside its own share of the frontage and clear of each other.
    const unitW = (plan.body.u1 - plan.body.u0) / 3;
    plan.drives.forEach((drive, k) => {
      const u0 = plan.body.u0 + k * unitW;
      expect(drive.rect.u0).toBeGreaterThanOrEqual(u0);
      expect(drive.rect.u1).toBeLessThan(plan.doors[k]!.u - DOOR_WIDTH_M / 2);
      expect(plan.doors[k]!.u + DOOR_WIDTH_M / 2).toBeLessThanOrEqual(u0 + unitW);
    });
    expect(plan.yard.patios).toHaveLength(3);
    // A fence between each pair of neighbours, from the back wall to the back line.
    const dividers = plan.yard.fence.filter(
      (f) => f.u0 === f.u1 && f.u0 > 1 && f.u0 < plan.edgeLenM - 1,
    );
    expect(dividers).toHaveLength(2);
    expect(plan.yard.pool).toBeNull();
    expect(plan.yard.trampoline).toBeNull();
  });

  it('keeps a row three homes when the street meets its long side, as on a corner', () => {
    const roadAt = (x: number): boolean => x === 5;
    const street: StreetLookup = (x) => (x === 5 ? { vergeM: VERGE, sidewalkM: SIDEWALK } : null);
    const plan = planHouseLot(home(), terrace, roadAt, street)!;
    expect(plan.edge?.side).toBe('E');
    expect(plan.homes).toBe(3);
    expect(plan.doors).toHaveLength(3);
    expect(plan.drives).toHaveLength(3);
  });

  it('lays a duplex out as two homes across its frontage, a door and a drive each', () => {
    const duplex = entry({ kind: 'duplex', footprint: { w: 2, d: 1 }, height: 6.4 });
    const { roadAt, street } = streetRow(7);
    const plan = planHouseLot(home(), duplex, roadAt, street)!;
    expect(plan.homes).toBe(2);
    expect(plan.doors).toHaveLength(2);
    expect(plan.drives).toHaveLength(2);
    expect(plan.body.u1 - plan.body.u0).toBeCloseTo(16, 9);
  });

  it('still fits two pads and two doors across a duplex end-on to the street, 12 m wide', () => {
    const duplex = entry({ kind: 'duplex', footprint: { w: 1, d: 2 }, height: 6.4 });
    const { roadAt, street } = streetRow(8);
    const plan = planHouseLot(home(), duplex, roadAt, street)!;
    expect(plan.body.u1 - plan.body.u0).toBeCloseTo(12, 9);
    expect(plan.homes).toBe(2);
    expect(plan.doors).toHaveLength(2);
    expect(plan.drives).toHaveLength(2);
    expect(plan.drives[0]!.rect.u1).toBeLessThan(plan.doors[0]!.u - DOOR_WIDTH_M / 2);
  });

  it('gives a detached house one door and one drive, whatever its lot', () => {
    for (const plan of [...streetOf(small), ...streetOf(villa)]) {
      expect(plan.homes).toBe(1);
      expect(plan.doors).toHaveLength(1);
      expect(plan.drives.length).toBeLessThanOrEqual(1);
    }
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

const kitRanch = entry({ footprint: { w: 1, d: 2 }, height: 4, level: 1 });
const kitCape = entry({ footprint: { w: 1, d: 2 }, height: 5, level: 2 });
const kitColonial = entry({ footprint: { w: 1, d: 2 }, height: 6.5, level: 3 });
const kitDuplex = entry({ kind: 'duplex', footprint: { w: 1, d: 2 }, height: 6.4 });
const kitFourplex = entry({ kind: 'fourplex', footprint: { w: 1, d: 2 }, height: 7.3 });

const near = (a: number, b: number, digits = 6): void => expect(a).toBeCloseTo(b, digits);

describe('planHouseLot — the house kit by level', () => {
  it('reads a detached house as a ranch, a Cape or a colonial by level, and the attached kinds by kind', () => {
    expect(houseStyleOf(kitRanch)).toBe('ranch');
    expect(houseStyleOf(kitCape)).toBe('cape');
    expect(houseStyleOf(kitColonial)).toBe('colonial');
    expect(houseStyleOf(kitDuplex)).toBe('attached');
    expect(houseStyleOf(kitFourplex)).toBe('attached');
    expect(houseStyleOf(terrace)).toBe('row');
  });

  it('gives a ranch a 5:12 roof with 0.46 m eaves all round, an interior chimney and a stoop, and no shutters', () => {
    for (const { kit, body } of streetOf(kitRanch, 20)) {
      expect(kit.style).toBe('ranch');
      near(kit.roof.slope, 5 / 12);
      near(kit.roof.rect.u0, body.u0 - 0.46);
      near(kit.roof.rect.u1, body.u1 + 0.46);
      near(kit.roof.rect.v0, body.v0 - 0.46);
      near(kit.roof.rect.v1, body.v1 + 0.46);

      expect(kit.chimneys).toHaveLength(1);
      const chimney = kit.chimneys[0]!;
      near(chimney.rect.u1 - chimney.rect.u0, CHIMNEY_FLUE_M);
      near(chimney.rect.v1 - chimney.rect.v0, CHIMNEY_FLUE_M);
      near((chimney.rect.v0 + chimney.rect.v1) / 2, (body.v0 + body.v1) / 2); // through the ridge
      near(chimney.y1, 4 + kit.roof.riseM + 0.9);

      expect(kit.stoops).toHaveLength(1);
      const stoop = kit.stoops[0]!;
      near(stoop.rect.u1 - stoop.rect.u0, 1.2);
      near(stoop.rect.v1 - stoop.rect.v0, 1.5);
      near(stoop.y1, 0.2);

      expect(kit.shutters).toEqual([]);
      expect(kit.dormers).toEqual([]);
      expect(kit.porticos).toEqual([]);
      expect(kit.porch).toBeNull();
    }
  });

  it('gives a Cape an 8:12 roof with 0.2 m eaves, a central chimney, a portico on a three-riser stoop and two dormers', () => {
    for (const { kit, body } of streetOf(kitCape, 20)) {
      expect(kit.style).toBe('cape');
      near(kit.roof.slope, 8 / 12);
      near(kit.roof.eaveM, 0.2);
      near(kit.roof.rakeM, 0.2);
      near(kit.roof.rect.v0, body.v0 - 0.2);

      expect(kit.chimneys).toHaveLength(1);
      const c = kit.chimneys[0]!.rect;
      near((c.u0 + c.u1) / 2, (body.u0 + body.u1) / 2);
      near(kit.chimneys[0]!.y1, 5 + kit.roof.riseM + 0.9);

      expect(kit.porticos).toHaveLength(1);
      expect(kit.stoops).toHaveLength(3);
      const [landing, tread2, tread1] = kit.stoops as [KitBox, KitBox, KitBox];
      near(landing.y1, 0.6);
      expect(landing.rect.v1 - landing.rect.v0).toBeGreaterThanOrEqual(0.9);
      near(tread2.rect.v1 - tread2.rect.v0, 0.25);
      near(tread1.rect.v1 - tread1.rect.v0, 0.25);
      near(tread2.y1, 0.4);
      near(tread1.y1, 0.2);

      // Two dormers, evenly spaced, each 1.4 m wide and 0.75 m or more in from an end wall.
      expect(kit.dormers).toHaveLength(2);
      const edges = kit.dormers.map((d) => [d.u - DORMER_WIDTH_M / 2, d.u + DORMER_WIDTH_M / 2]);
      const gaps = [
        edges[0]![0]! - body.u0,
        edges[1]![0]! - edges[0]![1]!,
        body.u1 - edges[1]![1]!,
      ];
      for (const gap of gaps) {
        near(gap, gaps[0]!);
        expect(gap).toBeGreaterThanOrEqual(0.75);
      }
      for (const d of kit.dormers) {
        near(d.y, 5.3);
        near(d.v, body.v0 + 0.3 / kit.roof.slope); // on the street slope, 0.3 m up from the eave
      }
    }
  });

  it('gives a colonial a boxed eave, a chimney at a gable end that clears the ridge by 0.6 m, and an entry', () => {
    const plans = streetOf(kitColonial, 80);
    const ends = new Set<string>();
    const counts = new Set<number>();
    for (const { kit, body, drives } of plans) {
      expect(kit.style).toBe('colonial');
      near(kit.roof.slope, 8 / 12);
      near(kit.roof.eaveM, 0.46);
      near(kit.roof.rakeM, 0.2);
      counts.add(kit.chimneys.length);
      for (const { rect, y0, y1 } of kit.chimneys) {
        near(rect.u1 - rect.u0, CHIMNEY_FLUE_M);
        near(rect.v1 - rect.v0, CHIMNEY_STACK_M);
        near(y1, 6.5 + kit.roof.riseM + 0.6);
        expect(y0).toBe(0);
        const west = Math.abs(rect.u0 - (body.u0 - 0.33)) < 1e-6;
        const east = Math.abs(rect.u1 - (body.u1 + 0.33)) < 1e-6;
        expect(west || east).toBe(true);
        ends.add(west ? 'west' : 'east');
        // A chimney never stands in a drive or a garage.
        for (const d of drives) {
          expect(overlaps(rect, d.rect)).toBe(false);
          if (d.coverRect) expect(overlaps(rect, d.coverRect)).toBe(false);
        }
      }
    }
    expect([...ends].sort()).toEqual(['east', 'west']);
    expect(counts.has(2)).toBe(true);
    expect(counts.has(1)).toBe(true);
    // The entry is a portico on a stoop or, by seed, a porch.
    expect(plans.some((p) => p.kit.porch)).toBe(true);
    expect(plans.some((p) => p.kit.porticos.length === 1)).toBe(true);
    for (const { kit } of plans) expect(Boolean(kit.porch) !== kit.porticos.length > 0).toBe(true);
  });

  it('builds a porch 1.8 m deep across the frontage less a metre each side, 0.6 m up on three risers', () => {
    const porches = streetOf(kitColonial, 80).filter((p) => p.kit.porch);
    expect(porches.length).toBeGreaterThan(0);
    for (const { kit, body, doors } of porches) {
      const porch = kit.porch!;
      near(porch.floor.rect.v1 - porch.floor.rect.v0, PORCH_DEPTH_M);
      near(porch.floor.rect.u0, body.u0 + 1);
      near(porch.floor.rect.u1, body.u1 - 1);
      near(porch.floor.y1, 0.6);
      // Two treads below the floor make the third riser.
      expect(porch.steps.map((s) => s.y1.toFixed(2))).toEqual(['0.40', '0.20']);
      for (const step of porch.steps) near(step.rect.v1 - step.rect.v0, 0.25);
      // Posts 0.25 m square and 2.4 m over the floor, an even number so none stands before the door.
      expect(porch.posts.length % 2).toBe(0);
      for (const post of porch.posts) {
        near(post.rect.u1 - post.rect.u0, POST_M);
        near(post.y1 - post.y0, 2.4);
        expect(post.rect.u1 < doors[0]!.u - 0.8 || post.rect.u0 > doors[0]!.u + 0.8).toBe(true);
      }
      // The shed roof leaves the wall 2.9 m over the floor and sits on the posts.
      near(porch.roof.wallM - porch.floor.y1, 2.9);
      near(porch.roof.lowM, porch.posts[0]!.y1);
    }
  });

  it('never builds a porch where a drive would run through it', () => {
    const { roadAt, street } = streetRow(8);
    for (let id = 1; id <= 80; id++) {
      const plan = planHouseLot(home({ id, x: 4 }), kitColonial, roadAt, street)!;
      if (!plan.kit.porch) continue;
      const footprint = plan.kit.entries[0]!;
      for (const d of plan.drives) expect(overlaps(footprint, d.rect)).toBe(false);
    }
  });
});

describe('planHouseLot — shutters stand on the facade’s own grid', () => {
  const shuttered = [kitCape, kitColonial, kitDuplex, kitFourplex, terrace];

  it('puts a pair either side of a window, centred on its bay, half a window wide and as tall as it', () => {
    for (const e of shuttered) {
      const tier = tierHeightOf(e);
      const { cols, rows } = windowGrid(e, tier);
      // The window is the facade's own metre-sized pane.
      const pane = housePaneMargins(e, tier)!;
      expect(pane).not.toBeNull();
      for (const { kit, body } of streetOf(e, 12)) {
        expect(kit.shutters.length).toBeGreaterThan(0);
        const bayW = (body.u1 - body.u0) / cols;
        const bayH = kit.heightM / rows;
        const windowW = bayW * (1 - 2 * pane.x);
        const byBay = new Map<string, number[]>();
        for (const s of kit.shutters) {
          near(s.rect.v1, body.v0);
          near(s.rect.v1 - s.rect.v0, SHUTTER_THICKNESS_M);
          near(s.rect.u1 - s.rect.u0, windowW / 2); // half of a window
          near(s.y1 - s.y0, (1 - 2 * pane.y) * bayH);
          const centre = (s.rect.u0 + s.rect.u1) / 2;
          const bay = Math.floor((centre - body.u0) / bayW);
          expect(bay).toBeGreaterThanOrEqual(0);
          expect(bay).toBeLessThan(cols);
          const bayCentre = body.u0 + (bay + 0.5) * bayW;
          near(Math.abs(centre - bayCentre), (3 * windowW) / 4);
          const key = `${bay}:${s.y0.toFixed(4)}`;
          byBay.set(key, [...(byBay.get(key) ?? []), centre - bayCentre]);
        }
        for (const offsets of byBay.values()) {
          if (offsets.length === 2) near(offsets[0]! + offsets[1]!, 0); // the pair's midpoint is the bay's
        }
      }
    }
  });

  it('keeps a shutter off the face only where a door, a stoop or a garage leaf stands before the window', () => {
    for (const e of shuttered) {
      for (const { kit, doors } of streetOf(e, 40)) {
        for (const s of kit.shutters) {
          if (s.y0 >= 2.1) continue;
          for (const d of doors) {
            expect(s.rect.u1 <= d.u - 0.9 + 1e-9 || s.rect.u0 >= d.u + 0.9 - 1e-9).toBe(true);
          }
        }
      }
    }
    // Upstairs, the same bay keeps its pair.
    const plan = streetOf(kitColonial, 1)[0]!;
    expect(plan.kit.shutters.some((s) => s.y0 > 3)).toBe(true);
  });
});

describe('planHouseLot — attached homes and rows', () => {
  it('gives a duplex and a fourplex the colonial’s parts: a stoop at each door, shutters, a gable-end chimney, no porch', () => {
    for (const e of [kitDuplex, kitFourplex]) {
      for (const { kit, body, doors } of streetOf(e, 30)) {
        expect(kit.style).toBe('attached');
        expect(doors).toHaveLength(2);
        expect(kit.stoops).toHaveLength(6);
        expect(kit.porch).toBeNull();
        expect(kit.porticos).toEqual([]);
        expect(kit.dormers).toEqual([]);
        expect(kit.shutters.length).toBeGreaterThan(0);
        expect(kit.chimneys.length).toBeGreaterThan(0);
        for (const c of kit.chimneys) {
          expect(c.y0).toBe(0);
          near(c.y1, e.height + kit.roof.riseM + 0.6);
          expect(c.rect.u1 <= body.u0 + 0.2 + 1e-9 || c.rect.u0 >= body.u1 - 0.2 - 1e-9).toBe(true);
        }
        // 8:12 over the span, or the rise cap's flatter line where a 16 m span would pass it.
        near(kit.roof.slope, Math.min(8 / 12, 4.5 / ((body.v1 - body.v0) / 2)));
        near(kit.roof.eaveM, 0.46);
        near(kit.roof.rakeM, 0.2);
      }
    }
  });

  it('stands a row’s party-wall parapets 0.76 m over the roof at each boundary, 0.3 m thick, and a stoop at every door', () => {
    for (const { kit, body, doors, homes } of streetOf(terrace, 10)) {
      expect(homes).toBe(3);
      expect(kit.style).toBe('row');
      near(kit.roof.slope, 5 / 12);
      near(kit.roof.rakeM, 0.2);
      expect(kit.chimneys).toEqual([]);
      expect(kit.parapets).toHaveLength(2);
      const unitW = (body.u1 - body.u0) / 3;
      kit.parapets.forEach((p, i) => {
        near((p.rect.u0 + p.rect.u1) / 2, body.u0 + (i + 1) * unitW);
        near(p.rect.u1 - p.rect.u0, PARAPET_THICKNESS_M);
        // The band stands 0.76 m over the eave line; the roof's gable section sits on it.
        near(p.y0, terrace.height);
        near(p.y1, terrace.height + PARAPET_ABOVE_ROOF_M);
        near(p.rect.v0, body.v0);
        near(p.rect.v1, body.v1);
      });
      expect(kit.stoops).toHaveLength(3 * doors.length);
      expect(kit.shutters.length).toBeGreaterThan(0);
    }
  });

  it('keeps a row’s shutters clear of its garage leaves', () => {
    for (const { kit, drives } of streetOf(terrace, 30)) {
      for (const d of drives) {
        if (d.cover !== 'integralGarage') continue;
        const c = (d.garageDoor!.u0 + d.garageDoor!.u1) / 2;
        for (const s of kit.shutters) {
          if (s.y0 >= 2.13) continue;
          expect(s.rect.u1 <= c - 1.22 + 1e-9 || s.rect.u0 >= c + 1.22 - 1e-9).toBe(true);
        }
      }
    }
  });
});

describe('planHouseLot — the kit turns with the lot', () => {
  const sides = {
    N: (x: number, z: number): boolean => z === 5 && x >= 0 && x < 40,
    S: (x: number, z: number): boolean => z === 8 && x >= 0 && x < 40,
    E: (x: number, z: number): boolean => x === 5 && z >= 0 && z < 40,
    W: (x: number, z: number): boolean => x === 3 && z >= 0 && z < 40,
  };
  const everyBox = (plan: HouseLotPlan): LotRect[] => {
    const { kit } = plan;
    const porch = kit.porch ? [kit.porch.floor, ...kit.porch.steps, ...kit.porch.posts] : [];
    return [
      kit.roof.rect,
      ...(kit.porch ? [kit.porch.roof.rect] : []),
      ...[...kit.chimneys, ...kit.stoops, ...porch, ...kit.shutters, ...kit.parapets].map(
        (b) => b.rect,
      ),
      ...kit.dormers.map((d) => ({
        u0: d.u - DORMER_WIDTH_M / 2,
        u1: d.u + DORMER_WIDTH_M / 2,
        v0: d.v,
        v1: d.v + 3,
      })),
    ];
  };

  it('keeps every part inside the lot and off the sidewalk, whichever side the street is on', () => {
    for (const side of ['N', 'S', 'E', 'W'] as const) {
      const roadAt = sides[side];
      const street: StreetLookup = (x, z) =>
        roadAt(x, z) ? { vergeM: VERGE, sidewalkM: SIDEWALK } : null;
      for (const e of [kitRanch, kitCape, kitColonial, kitDuplex, kitFourplex, terrace]) {
        for (let id = 1; id <= 40; id++) {
          const plan = planHouseLot(home({ id, x: 4, z: 6 }), e, roadAt, street)!;
          expect(plan.edge?.side).toBe(side);
          for (const r of everyBox(plan)) {
            expect(r.u0).toBeGreaterThanOrEqual(-1e-9);
            expect(r.u1).toBeLessThanOrEqual(plan.edgeLenM + 1e-9);
            expect(r.v0).toBeGreaterThanOrEqual(-VERGE);
            expect(r.v1).toBeLessThanOrEqual(plan.lotDepthM);
          }
        }
      }
    }
  });

  it('keeps the front bushes clear of every stoop and porch', () => {
    for (const e of [kitRanch, kitCape, kitColonial, kitDuplex, terrace]) {
      for (const { kit, yard } of streetOf(e, 40)) {
        for (const bush of yard.bushes) {
          for (const r of kit.entries) {
            expect(bush.u > r.u0 - 0.6 && bush.u < r.u1 + 0.6).toBe(false);
          }
        }
      }
    }
  });
});
