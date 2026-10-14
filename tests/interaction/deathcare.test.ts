import { describe, expect, it } from 'vitest';
import {
  BIG_TOWN_MILESTONE,
  MAP_SIZE,
  REGIONAL_FUNERAL_FEE,
  TICKS_PER_MONTH,
} from '../../src/shared/constants';
import { RoadTier } from '../../src/shared/types';
import type { SelectionInfo, WorkerToMain } from '../../src/shared/types';
import { decodeSave, encodeSave, type SaveMeta } from '../../src/app/persist';
import {
  initialized,
  latestSaveData,
  roadRow,
  run,
  standingBuildings,
  type Harness,
} from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

const tile = (x: number, z: number): number => z * MAP_SIZE + x;

/** A fresh sim at `milestoneLevel` with its saved death-care block patched by `patch`. */
function loaded(
  milestoneLevel: number,
  patch: (meta: SaveMeta) => void = () => {},
  tick = 0,
): Harness {
  const h = initialized();
  h.sim.handleMessage({ type: 'requestSave' });
  const payload = decodeSave(latestSaveData(h));
  payload.meta.stats.milestoneLevel = milestoneLevel;
  payload.meta.stats.funds = 100_000;
  payload.header.tick = tick;
  patch(payload.meta);
  h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
  return h;
}

const saved = (h: Harness): SaveMeta => {
  h.sim.handleMessage({ type: 'requestSave' });
  return decodeSave(latestSaveData(h)).meta;
};

const deathCare = (h: Harness) => h.lastSnapshot()!.deathCare!;

function selectionOf(h: Harness, buildingId: number): SelectionInfo {
  h.sim.handleMessage({ type: 'select', buildingId });
  const msgs = h.messages.filter(
    (m): m is Extract<WorkerToMain, { type: 'selection' }> => m.type === 'selection',
  );
  return msgs[msgs.length - 1]!.info!;
}

/** A street along z = 100 from x = 60 to 119 and a cemetery plopped on it. */
function withCemetery(h: Harness): number {
  run(h, 10, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 100, 60) }]);
  expect(
    run(h, 11, [{ kind: 'placeBuilding', catalogId: 'cemetery', x: 80, z: 101, rotation: 0 }]).ok,
  ).toBe(true);
  h.ticks(4);
  return [...standingBuildings(h).values()].find((b) => b.catalogId === 'cemetery')!.id;
}

describe('death care through the worker', () => {
  it('loads a save with no deathCare block, and a slice-one one, with nothing uncollected and no interments', () => {
    for (const block of [
      undefined,
      { deathRemainder: 0.25, deaths: 3, reletRemainder: 0, relets: 0 },
    ]) {
      const h = loaded(BIG_TOWN_MILESTONE, (meta) => {
        meta.deathCare = block;
      });
      h.ticks(20);
      expect(deathCare(h)).toEqual({ facilities: [], uncollected: 0, regionalThisMonth: 0 });
      expect(saved(h).deathCare).toMatchObject({
        interments: [],
        backlog: [],
        regionalThisMonth: 0,
      });
    }
  });

  it('collects bodies regionally below Big Town, leaving none, and bills the month at the fee', () => {
    const h = loaded(
      BIG_TOWN_MILESTONE - 1,
      (meta) => {
        meta.deathCare = {
          deathRemainder: 0,
          deaths: 5,
          reletRemainder: 0,
          relets: 0,
          backlog: [
            { tile: tile(70, 70), count: 3, sinceTick: 0 },
            { tile: tile(71, 70), count: 2, sinceTick: 0 },
          ],
        };
      },
      TICKS_PER_MONTH - 20,
    );
    const fundsBefore = h.lastSnapshot()!.stats.funds;
    h.ticks(4);
    expect(deathCare(h)).toMatchObject({ uncollected: 0, regionalThisMonth: 5 });
    expect(saved(h).deathCare!.backlog).toEqual([]);

    // The settlement bills them, once, as an expense: no roads, no buildings, no loan.
    h.ticks(40);
    const stats = h.lastSnapshot()!.stats;
    expect(stats.monthlyExpenses).toBeCloseTo(5 * REGIONAL_FUNERAL_FEE, 9);
    expect(stats.funds).toBeCloseTo(fundsBefore - 5 * REGIONAL_FUNERAL_FEE, 9);
    expect(deathCare(h).regionalThisMonth).toBe(0);
  }, 60_000);

  it('leaves the bodies where they fell from Big Town with no cemetery, reporting the oldest', () => {
    const h = loaded(BIG_TOWN_MILESTONE, (meta) => {
      meta.deathCare = {
        deathRemainder: 0,
        deaths: 2,
        reletRemainder: 0,
        relets: 0,
        backlog: [
          { tile: tile(70, 70), count: 1, sinceTick: 30 },
          { tile: tile(75, 72), count: 1, sinceTick: 10 },
        ],
      };
    });
    h.ticks(40);
    expect(deathCare(h)).toEqual({
      facilities: [],
      uncollected: 2,
      uncollectedAt: { x: 75, z: 72 },
      regionalThisMonth: 0,
    });
  });

  it('has a cemetery take the bodies on its street, show its plots, and keep both across a save', () => {
    const h = loaded(BIG_TOWN_MILESTONE);
    const cemeteryId = withCemetery(h);
    expect(deathCare(h).facilities).toEqual([{ id: cemeteryId, used: 0, total: 780 }]);
    expect(selectionOf(h, cemeteryId).deathCare).toEqual({ used: 0, total: 780 });

    // Two bodies on the street, one stranded far from any road.
    const meta = saved(h);
    meta.deathCare = {
      ...meta.deathCare!,
      backlog: [
        { tile: tile(90, 99), count: 2, sinceTick: 5 },
        { tile: tile(200, 200), count: 1, sinceTick: 5 },
      ],
    };
    const payload = decodeSave(latestSaveData(h));
    payload.meta = meta;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    h.ticks(30);

    expect(deathCare(h)).toMatchObject({
      facilities: [{ id: cemeteryId, used: 2, total: 780 }],
      uncollected: 1,
      uncollectedAt: { x: 200, z: 200 },
    });
    expect(selectionOf(h, cemeteryId).deathCare).toEqual({ used: 2, total: 780 });

    const after = saved(h).deathCare!;
    expect(after.interments).toEqual([{ id: cemeteryId, count: 2 }]);
    expect(after.backlog).toEqual([{ tile: tile(200, 200), count: 1, sinceTick: 5 }]);
  }, 60_000);

  it('does not show plots on a building that is not a cemetery', () => {
    const h = loaded(BIG_TOWN_MILESTONE);
    run(h, 10, [{ kind: 'placeBuilding', catalogId: 'wind-turbine', x: 60, z: 60, rotation: 0 }]);
    const id = [...standingBuildings(h).values()].find((b) => b.catalogId === 'wind-turbine')!.id;
    expect(selectionOf(h, id).deathCare).toBeUndefined();
  });
});
