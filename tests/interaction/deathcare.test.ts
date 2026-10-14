import { describe, expect, it } from 'vitest';
import {
  BIG_TOWN_MILESTONE,
  EXHUMATION_FEE_PER_INTERMENT,
  MAP_SIZE,
  REGIONAL_FUNERAL_FEE,
  TICKS_PER_MONTH,
} from '../../src/shared/constants';
import { RoadTier } from '../../src/shared/types';
import type { CommandAck, SelectionInfo, WorkerToMain } from '../../src/shared/types';
import { decodeSave, encodeSave, type SaveMeta } from '../../src/app/persist';
import {
  catalog,
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
      expect(deathCare(h)).toEqual({
        facilities: [],
        crematoria: [],
        uncollected: 0,
        regionalThisMonth: 0,
      });
      expect(saved(h).deathCare).toMatchObject({
        interments: [],
        backlog: [],
        regionalThisMonth: 0,
        cremation: [],
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
      crematoria: [],
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

describe('the crematorium through the worker', () => {
  const crematoriumId = (h: Harness): number =>
    [...standingBuildings(h).values()].find((b) => b.catalogId === 'crematorium')!.id;

  it('is locked until Big Town', () => {
    const h = loaded(BIG_TOWN_MILESTONE - 1);
    run(h, 10, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 100, 60) }]);
    const ack = run(h, 11, [
      { kind: 'placeBuilding', catalogId: 'crematorium', x: 80, z: 101, rotation: 0 },
    ]);
    expect(ack).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('cremates the bodies on its street from the throughput it has banked, and counts them across a save', () => {
    const h = loaded(BIG_TOWN_MILESTONE);
    run(h, 10, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(60, 100, 60) }]);
    expect(
      run(h, 11, [{ kind: 'placeBuilding', catalogId: 'crematorium', x: 80, z: 101, rotation: 0 }])
        .ok,
    ).toBe(true);
    h.ticks(4);
    const id = crematoriumId(h);
    expect(selectionOf(h, id).deathCare).toEqual({ cremated: 0 });

    // A day's throughput banked, two bodies on the street and one stranded.
    const meta = saved(h);
    meta.deathCare = {
      ...meta.deathCare!,
      cremation: [{ id, credit: 8, cremated: 0 }],
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
      facilities: [],
      crematoria: [{ id, cremated: 2, room: 6 }],
      uncollected: 1,
      uncollectedAt: { x: 200, z: 200 },
    });
    expect(selectionOf(h, id).deathCare).toEqual({ cremated: 2 });
    expect(saved(h).deathCare!.cremation).toEqual([
      { id, credit: expect.closeTo(6.9, 0), cremated: 2 },
    ]);
  }, 60_000);
});

describe('demolishing a cemetery that holds interments', () => {
  const GRAVES = 780;
  const EXHUMATION = GRAVES * EXHUMATION_FEE_PER_INTERMENT;
  const cemeteryEntry = catalog.find((e) => e.id === 'cemetery')!;
  const REFUND = cemeteryEntry.cost / 2;
  const standing = (h: Harness): number | undefined =>
    [...standingBuildings(h).values()].find((b) => b.catalogId === 'cemetery')?.id;
  const funds = (h: Harness): number => saved(h).stats.funds;
  const interred = (h: Harness): { id: number; count: number }[] => saved(h).deathCare!.interments!;

  /** A cemetery on its street holding `count` burials, with `money` in hand. */
  function holding(count: number, money = 100_000): { h: Harness; id: number } {
    const h = loaded(BIG_TOWN_MILESTONE);
    const id = withCemetery(h);
    const meta = saved(h);
    meta.stats.funds = money;
    meta.deathCare = {
      ...meta.deathCare!,
      interments: count > 0 ? [{ id, count }] : [],
    };
    const payload = decodeSave(latestSaveData(h));
    payload.meta = meta;
    h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
    h.ticks(2);
    return { h, id };
  }
  const bulldoze = (h: Harness, seq: number): CommandAck =>
    run(h, seq, [{ kind: 'bulldoze', tiles: [{ x: 80, z: 101 }] }]);

  it('prices a grave at ¢14 on the death-care capital scale, a full cemetery at three times its build price', () => {
    // $2,850 is the median of four municipal disinterment-plus-reinterment schedules; $200 to the ¢ is the cemetery's own ¢3,500 for 780 plots at Homer AK's $898 a plot.
    const usdPerCent = (780 * 898) / cemeteryEntry.cost;
    expect(usdPerCent).toBeCloseTo(200.1, 1);
    expect(Math.floor(2_850 / 200)).toBe(EXHUMATION_FEE_PER_INTERMENT);
    expect(EXHUMATION).toBe(10_920);
    expect(EXHUMATION / cemeteryEntry.cost).toBeCloseTo(3.12, 2);
  });

  it('charges the exhumation on top of the 50% refund, and takes it from the funds', () => {
    const { h, id } = holding(GRAVES);
    const before = funds(h);
    const ack = bulldoze(h, 20);
    expect(ack.ok).toBe(true);
    expect(ack.cost).toBe(EXHUMATION - REFUND);
    expect(funds(h)).toBeCloseTo(before - (EXHUMATION - REFUND), 6);
    expect(standing(h)).toBeUndefined();
    expect(interred(h)).toEqual([]);
    expect(ack.inverse).toContainEqual(
      expect.objectContaining({ kind: 'placeBuilding', catalogId: 'cemetery', interments: GRAVES }),
    );
    expect(id).toBeGreaterThan(0);
  });

  it('charges an empty cemetery nothing: it demolishes for the refund alone, and its undo carries no burials', () => {
    const { h } = holding(0);
    const ack = bulldoze(h, 20);
    expect(ack).toMatchObject({ ok: true, cost: -REFUND });
    for (const command of ack.inverse) {
      if (command.kind === 'placeBuilding') expect(command.interments).toBeUndefined();
    }
  });

  it('charges only for the graves a partly full cemetery holds', () => {
    const { h } = holding(100);
    expect(bulldoze(h, 20).cost).toBe(100 * EXHUMATION_FEE_PER_INTERMENT - REFUND);
  });

  it('undoes into the same cemetery with its 780 interments and the charge handed back', () => {
    const { h } = holding(GRAVES);
    const before = funds(h);
    const demolished = bulldoze(h, 20);
    const undone = run(h, 21, demolished.inverse);

    expect(undone.ok).toBe(true);
    // The cemetery's price less the exhumation charge returned: the charge nets out exactly.
    expect(undone.cost).toBe(cemeteryEntry.cost - EXHUMATION);
    const id = standing(h)!;
    expect(id).toBeDefined();
    expect(interred(h)).toEqual([{ id, count: GRAVES }]);
    h.ticks(10);
    expect(deathCare(h).facilities).toEqual([{ id, used: GRAVES, total: 780 }]);
    expect(selectionOf(h, id).deathCare).toEqual({ used: GRAVES, total: 780 });
    // The same funds an empty cemetery's demolition and undo leave: half its price lost, as for any building, and nothing for the graves.
    expect(funds(h)).toBeCloseTo(before - REFUND, 6);
  });

  it('refuses a demolition the funds cannot pay, and leaves the cemetery standing with its dead', () => {
    const { h, id } = holding(GRAVES, EXHUMATION - 1);
    const ack = bulldoze(h, 20);
    expect(ack).toMatchObject({ ok: false, reason: 'funds' });
    expect(standing(h)).toBe(id);
    expect(interred(h)).toEqual([{ id, count: GRAVES }]);
    expect(funds(h)).toBeCloseTo(EXHUMATION - 1, 6);
  });

  it('is paid in hand before the refund comes back: funds of exactly the charge suffice', () => {
    const { h } = holding(GRAVES, EXHUMATION);
    expect(bulldoze(h, 20).ok).toBe(true);
    expect(funds(h)).toBeCloseTo(EXHUMATION - (EXHUMATION - REFUND), 6);
  });
});
