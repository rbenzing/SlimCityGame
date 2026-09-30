import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingState, ZoneType } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance, FarmKind } from '../shared/types';
import {
  FarmRenderer,
  TRUCK_SPEED_M_PER_S,
  TRUCK_STOP_S,
  cowPose,
  measureTruckRound,
  truckLapSeconds,
  truckPose,
  truckWorkingAt,
} from './farms';
import { isWindowCool, isWindowLit } from './buildings';
import { orchardTrees, paddockHerd, planFarm, type FarmRect } from './farmlot';

const farm = (kind: FarmKind, level: number, w: number, d: number): BuildingCatalogEntry => ({
  id: `farm-${kind}-${level}`,
  name: kind,
  category: 'ind',
  zone: ZoneType.Agriculture,
  level,
  farm: kind,
  footprint: { w, d },
  height: 9 + level,
  color: 0x7a3a2c,
  residents: 4,
  jobs: level,
  powerUse: 0.2,
  waterUse: 0,
  cost: 0,
  upkeep: 0,
  unlockMilestone: 0,
});
const catalog = [
  farm('crops', 1, 4, 5),
  farm('crops', 3, 6, 7),
  farm('orchard', 1, 4, 5),
  farm('pasture', 2, 5, 6),
];
const standing = (
  catalogId: string,
  state: BuildingState = BuildingState.Active,
  id = 1,
): BuildingInstance => ({ id, catalogId, x: 10, z: 10, rotation: 0, level: 1, state, problems: 0 });
const dirtNorth = (_x: number, z: number): boolean => z === 9;
const flat = (): number => 3;

function renderer(): FarmRenderer {
  return new FarmRenderer(new THREE.Scene(), flat, catalog, dirtNorth);
}

describe('cowPose', () => {
  const paddock: FarmRect = { x0: 200, z0: 230, x1: 300, z1: 320 };

  it('keeps every head clear of the fence at every hour', () => {
    for (let i = 0; i < 6; i++) {
      for (let t = 0; t < 3_600_000; t += 37_000) {
        const { x, z } = cowPose(paddock, 5, i, t);
        expect(x).toBeGreaterThanOrEqual(paddock.x0 + 4 - 1e-9);
        expect(x).toBeLessThanOrEqual(paddock.x1 - 4 + 1e-9);
        expect(z).toBeGreaterThanOrEqual(paddock.z0 + 4 - 1e-9);
        expect(z).toBeLessThanOrEqual(paddock.z1 - 4 + 1e-9);
      }
    }
  });

  it('faces the way it walks, and walks at a grazing pace', () => {
    const a = cowPose(paddock, 5, 2, 100_000);
    const b = cowPose(paddock, 5, 2, 101_000);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    expect(Math.abs(Math.atan2(Math.sin(heading - a.yaw), Math.cos(heading - a.yaw)))).toBeLessThan(
      0.1,
    );
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(0.4);
  });

  it('is the same for the same farm, head and time, and different between heads', () => {
    expect(cowPose(paddock, 5, 1, 42_000)).toEqual(cowPose(paddock, 5, 1, 42_000));
    expect(cowPose(paddock, 5, 1, 42_000)).not.toEqual(cowPose(paddock, 5, 2, 42_000));
  });
});

describe('FarmRenderer', () => {
  it('stands a crop farm’s barn roof, farmhouse and silo, and no trees or herd', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-crops-1')], updated: [], removed: [] });
    expect(r.partCount('barnRoof')).toBe(1);
    expect(r.partCount('houseBody')).toBe(1);
    expect(r.partCount('houseRoof')).toBe(1);
    expect(r.partCount('silo')).toBe(1);
    expect(r.partCount('siloDome')).toBe(1);
    expect(r.partCount('crown')).toBe(0);
    expect(r.herdSize()).toBe(0);
  });

  it('grows a large crop farm two silos and two bins', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-crops-3')], updated: [], removed: [] });
    expect(r.partCount('silo')).toBe(2);
    expect(r.partCount('bin')).toBe(2);
    expect(r.partCount('binRoof')).toBe(2);
  });

  it('plants an orchard tree by tree, each a trunk under a crown', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-orchard-1')], updated: [], removed: [] });
    const plan = planFarm(standing('farm-orchard-1'), catalog[2]!, dirtNorth)!;
    expect(r.partCount('crown')).toBe(orchardTrees(plan).length);
    expect(r.partCount('trunk')).toBe(orchardTrees(plan).length);
    expect(r.partCount('silo')).toBe(0);
  });

  it('fences a paddock and grazes its herd in it', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-pasture-2')], updated: [], removed: [] });
    const plan = planFarm(standing('farm-pasture-2'), catalog[3]!, dirtNorth)!;
    expect(r.herdSize()).toBe(paddockHerd(plan));
    expect(r.partCount('post')).toBeGreaterThan(0);
    expect(r.partCount('rail')).toBe(r.partCount('post') * 2);
  });

  it('shows only the barn frame and bare ground while a farm is going up', () => {
    const r = renderer();
    r.apply({
      added: [standing('farm-pasture-2', BuildingState.Constructing)],
      updated: [],
      removed: [],
    });
    expect(r.partCount('barnRoof')).toBe(0);
    expect(r.herdSize()).toBe(0);
  });

  it('keeps an abandoned farm’s buildings but not its herd', () => {
    const r = renderer();
    r.apply({
      added: [standing('farm-pasture-2', BuildingState.Abandoned)],
      updated: [],
      removed: [],
    });
    expect(r.partCount('barnRoof')).toBe(1);
    expect(r.partCount('post')).toBeGreaterThan(0);
    expect(r.herdSize()).toBe(0);
  });

  it('gives back every part when a farm goes, and rebuilds it whole when it changes', () => {
    const r = renderer();
    r.apply({ added: [standing('farm-pasture-2')], updated: [], removed: [] });
    const posts = r.partCount('post');
    r.apply({ added: [], updated: [standing('farm-pasture-2')], removed: [] });
    expect(r.partCount('post')).toBe(posts);
    r.apply({ added: [], updated: [], removed: [1] });
    expect(r.herdSize()).toBe(0);
    // Freed slots are recycled rather than removed, so the next farm reuses them.
    r.apply({
      added: [standing('farm-pasture-2', BuildingState.Active, 2)],
      updated: [],
      removed: [],
    });
    expect(r.partCount('post')).toBe(posts);
  });

  describe('the farmhouse at night', () => {
    const panes = (r: FarmRenderer): number => {
      const { window, windowWarm, windowCool } = r.windowCounts();
      return window + windowWarm + windowCool;
    };

    it('glazes eight windows, all dark by day', () => {
      const r = renderer();
      r.apply({ added: [standing('farm-crops-1')], updated: [], removed: [] });
      expect(panes(r)).toBe(8);
      expect(r.litWindowCount()).toBe(0);
    });

    it('lights them by the town’s own rule as night falls, and only ever more of them', () => {
      for (const id of [1, 2, 3, 4, 5]) {
        const r = renderer();
        r.apply({
          added: [standing('farm-crops-1', BuildingState.Active, id)],
          updated: [],
          removed: [],
        });
        let before = 0;
        for (const night of [0.25, 0.5, 0.75, 1]) {
          r.setNightFactor(night);
          const expected = Array.from({ length: 8 }, (_, i) => isWindowLit(id, i, night)).filter(
            Boolean,
          ).length;
          expect(r.litWindowCount()).toBe(expected);
          expect(r.litWindowCount()).toBeGreaterThanOrEqual(before);
          expect(panes(r)).toBe(8);
          before = r.litWindowCount();
        }
        const cool = Array.from(
          { length: 8 },
          (_, i) => isWindowLit(id, i, 1) && isWindowCool(id, i),
        );
        expect(r.windowCounts().windowCool).toBe(cool.filter(Boolean).length);
      }
    });

    it('lights some window of a lived-in farmhouse at full night', () => {
      const lit = [1, 2, 3, 4, 5].map((id) => {
        const r = renderer();
        r.apply({
          added: [standing('farm-crops-1', BuildingState.Active, id)],
          updated: [],
          removed: [],
        });
        r.setNightFactor(1);
        return r.litWindowCount();
      });
      expect(lit.some((n) => n > 0)).toBe(true);
    });

    it('keeps an abandoned farmhouse dark', () => {
      const r = renderer();
      r.apply({
        added: [standing('farm-crops-1', BuildingState.Abandoned)],
        updated: [],
        removed: [],
      });
      r.setNightFactor(1);
      expect(panes(r)).toBe(8);
      expect(r.litWindowCount()).toBe(0);
    });
  });

  describe('the farm truck', () => {
    const plan = planFarm(standing('farm-crops-1'), catalog[0]!, dirtNorth)!;
    const round = measureTruckRound(plan.truckRoute!, plan.truckStop);
    const park = plan.truckRoute![0]!;
    // An instance matrix is stored in float32, a hundredth of a millimetre out here.
    const near = (a: { x: number; z: number } | null, b: { x: number; z: number }): boolean =>
      a !== null && Math.hypot(a.x - b.x, a.z - b.z) < 1e-3;

    it('keeps one truck on a working farm, and none going up or abandoned', () => {
      const r = renderer();
      r.apply({
        added: [
          standing('farm-crops-1', BuildingState.Active, 1),
          standing('farm-crops-1', BuildingState.Constructing, 2),
          standing('farm-crops-1', BuildingState.Abandoned, 3),
        ],
        updated: [],
        removed: [],
      });
      expect(r.truckCount()).toBe(1);
      r.apply({ added: [], updated: [], removed: [1] });
      expect(r.truckCount()).toBe(0);
    });

    it('drives at its yard speed, stops by the silos, and comes back to where it parks', () => {
      const toStop = round.stopAt / TRUCK_SPEED_M_PER_S;
      expect(truckPose(round, 0)).toMatchObject(park);
      // A second on the straight out along the drive, before its first turn.
      const a = truckPose(round, 0.1);
      const b = truckPose(round, 1.1);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(TRUCK_SPEED_M_PER_S, 6);
      // Facing the way it drives.
      const off = a.yaw - Math.atan2(b.x - a.x, b.z - a.z);
      expect(Math.abs(Math.atan2(Math.sin(off), Math.cos(off)))).toBeLessThan(1e-9);
      const stop = round.points[plan.truckStop]!;
      for (const t of [toStop + 0.01, toStop + TRUCK_STOP_S / 2, toStop + TRUCK_STOP_S - 0.01]) {
        expect(near(truckPose(round, t), stop)).toBe(true);
      }
      expect(near(truckPose(round, truckLapSeconds(round)), park)).toBe(true);
      expect(near(truckPose(round, truckLapSeconds(round) + 100), park)).toBe(true);
    });

    it('works from sunrise to sunset', () => {
      expect(truckWorkingAt(5.9 / 24)).toBe(false);
      expect(truckWorkingAt(6 / 24)).toBe(true);
      expect(truckWorkingAt(17.9 / 24)).toBe(true);
      expect(truckWorkingAt(18 / 24)).toBe(false);
    });

    it('stays parked through the night and sets out when the day begins', () => {
      const r = renderer();
      r.apply({ added: [standing('farm-crops-1')], updated: [], removed: [] });
      r.setDayFraction(2 / 24);
      r.update(50_000);
      expect(near(r.truckAt(1), park)).toBe(true);
      r.setDayFraction(8 / 24);
      r.update(60_000);
      expect(near(r.truckAt(1), park)).toBe(true);
      r.update(70_000);
      expect(near(r.truckAt(1), truckPose(round, 10))).toBe(true);
    });

    it('finishes the round it is on when the day ends, then parks', () => {
      const r = renderer();
      r.apply({ added: [standing('farm-crops-1')], updated: [], removed: [] });
      r.setDayFraction(12 / 24);
      r.update(0);
      r.setDayFraction(19 / 24);
      r.update(5_000);
      expect(near(r.truckAt(1), truckPose(round, 5))).toBe(true);
      const lapMs = truckLapSeconds(round) * 1000;
      r.update(lapMs + 1_000);
      expect(near(r.truckAt(1), park)).toBe(true);
      r.update(lapMs + 60_000);
      expect(near(r.truckAt(1), park)).toBe(true);
    });
  });

  it('draws nothing for a building that is not a farm', () => {
    const house = {
      ...farm('crops', 1, 2, 2),
      id: 'house',
      zone: ZoneType.ResLow,
      farm: undefined,
    };
    const r = new FarmRenderer(new THREE.Scene(), flat, [house], dirtNorth);
    r.apply({ added: [standing('house')], updated: [], removed: [] });
    expect(r.partCount('barnRoof')).toBe(0);
    expect(r.partCount('houseBody')).toBe(0);
  });
});
