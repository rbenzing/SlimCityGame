import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../app/persist';
import { RoadTier, type Command } from '../shared/types';
import {
  latestSaveData,
  roadRow,
  run,
  sandboxed,
  streetNorthOf,
  windTurbine,
  column,
  type Harness,
} from '../../tests/support/sim';

const street = roadRow(100, 100, 12);
let seq = 100;
const next = (): number => ++seq;

function funds(h: Harness): number {
  h.ticks(2);
  return h.lastSnapshot()!.stats.funds;
}

/** Reloads the city with `amount` in hand, the world as it stands. */
function setFunds(h: Harness, amount: number): void {
  h.sim.handleMessage({ type: 'requestSave' });
  const payload = decodeSave(latestSaveData(h));
  payload.meta.stats.funds = amount;
  h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
}

function town(): Harness {
  const h = sandboxed();
  expect(run(h, next(), [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: street }]).ok).toBe(
    true,
  );
  return h;
}

const place = (): Command => ({
  kind: 'placeBuilding',
  catalogId: windTurbine.id,
  x: 104,
  z: 101,
  rotation: 2,
});

describe('undo is exact for money', () => {
  const cases: [string, Command[], Command[]][] = [
    ['a road', [], [{ kind: 'bulldoze', tiles: [{ x: 105, z: 100 }] }]],
    ['a building', [place()], [{ kind: 'bulldoze', tiles: [{ x: 104, z: 101 }] }]],
    [
      'a bus stop',
      [{ kind: 'placeStop', stop: { x: 104, z: 100, side: 1, kind: 'shelter' } }],
      [{ kind: 'removeStop', x: 104, z: 100, side: 1 }],
    ],
    [
      'a power line',
      [place(), { kind: 'stringPowerLine', tiles: column(104, 102, 4), on: true }],
      [{ kind: 'bulldoze', tiles: column(104, 102, 4) }],
    ],
    [
      'a pipe',
      [{ kind: 'layWaterPipe', tiles: column(122, 100, 4), on: true }],
      [{ kind: 'bulldoze', tiles: column(122, 100, 4) }],
    ],
  ];

  for (const [name, setup, removal] of cases) {
    it(`leaves the funds where they were after removing ${name} and undoing it`, () => {
      const h = town();
      for (const c of setup) expect(run(h, next(), [c]).ok).toBe(true);
      const before = funds(h);
      const removed = run(h, next(), removal);
      expect(removed.ok).toBe(true);
      expect(removed.cost).toBeLessThan(0);
      expect(funds(h)).toBeGreaterThan(before);
      const undone = run(h, next(), removed.inverse);
      expect(undone.ok).toBe(true);
      expect(undone.cost).toBe(-removed.cost);
      expect(funds(h)).toBe(before);
      // Redo takes it away again at its own price.
      const redone = run(h, next(), removal);
      expect(redone.ok).toBe(true);
      expect(redone.cost).toBe(removed.cost);
      expect(funds(h)).toBe(before - removed.cost);
    });
  }

  it('leaves the funds where they were after placing a building and undoing it', () => {
    const h = town();
    const before = funds(h);
    const placed = run(h, next(), [place()]);
    expect(placed.ok).toBe(true);
    expect(placed.cost).toBeGreaterThan(0);
    const after = funds(h);
    expect(after).toBe(before - placed.cost);
    const undone = run(h, next(), placed.inverse);
    expect(undone.ok).toBe(true);
    expect(funds(h)).toBe(before);
    // Redo lands where the original edit left the funds.
    expect(run(h, next(), [place()]).ok).toBe(true);
    expect(funds(h)).toBe(after);
  });

  it('leaves the funds where they were after laying a road and undoing it', () => {
    const h = town();
    const before = funds(h);
    const laid = run(h, next(), [streetNorthOf(130, 130, 6)]);
    expect(laid.ok).toBe(true);
    const after = funds(h);
    expect(after).toBeLessThan(before);
    expect(run(h, next(), laid.inverse).ok).toBe(true);
    expect(funds(h)).toBe(before);
    expect(run(h, next(), [streetNorthOf(130, 130, 6)]).ok).toBe(true);
    expect(funds(h)).toBe(after);
  });

  it('ends every inverse in a settle of the opposite cost, never -0', () => {
    const h = town();
    const placed = run(h, next(), [place()]);
    expect(placed.inverse[placed.inverse.length - 1]).toEqual({
      kind: 'settle',
      cost: -placed.cost,
    });
    // Pulling a pipe up costs nothing, so its inverse settles at zero.
    const tiles = column(122, 100, 2);
    expect(run(h, next(), [{ kind: 'layWaterPipe', tiles, on: true }]).ok).toBe(true);
    const off = run(h, next(), [{ kind: 'layWaterPipe', tiles, on: false }]);
    expect(off.cost).toBe(0);
    const last = off.inverse[off.inverse.length - 1];
    expect(last).toMatchObject({ kind: 'settle' });
    const settled = (last as { cost: number }).cost;
    expect(Object.is(settled, -0)).toBe(false);
  });

  it('refuses the undo of a bulldoze when the refund has been spent, changing nothing', () => {
    const h = town();
    run(h, next(), [place()]);
    const removed = run(h, next(), [{ kind: 'bulldoze', tiles: [{ x: 104, z: 101 }] }]);
    expect(removed.ok).toBe(true);
    setFunds(h, 0);
    const refused = run(h, next(), removed.inverse);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('funds');
    expect(funds(h)).toBe(0);
    // The building is still gone: placing it fresh at no cost would be refused for funds only.
    setFunds(h, 1_000_000);
    expect(run(h, next(), [place()]).ok).toBe(true);
  });

  it('leaves the funds as they stood when an undo is refused part way', () => {
    const h = town();
    const placed = run(h, next(), [place()]);
    expect(placed.ok).toBe(true);
    // The second command cannot be applied (nothing stands there to remove).
    const batch: Command[] = [
      ...placed.inverse.slice(0, -1),
      { kind: 'removeStop', x: 1, z: 1, side: 0 },
      { kind: 'settle', cost: -placed.cost },
    ];
    const before = funds(h);
    const refused = run(h, next(), batch);
    expect(refused.ok).toBe(false);
    expect(funds(h)).toBe(before);
  });

  it('takes back a refused batch whole even when the city cannot pay to put a building back', () => {
    const h = town();
    expect(run(h, next(), [place()]).ok).toBe(true);
    setFunds(h, 10);
    const refused = run(h, next(), [
      { kind: 'bulldoze', tiles: [{ x: 104, z: 101 }] },
      { kind: 'removeStop', x: 1, z: 1, side: 0 },
    ]);
    expect(refused.ok).toBe(false);
    expect(funds(h)).toBe(10);
    // The building still stands, so a bulldoze finds it.
    const again = run(h, next(), [{ kind: 'bulldoze', tiles: [{ x: 104, z: 101 }] }]);
    expect(again.ok).toBe(true);
    expect(again.cost).toBeLessThan(0);
  });

  it('refuses a lone settle and a settle that is not last as invalid', () => {
    const h = town();
    const before = funds(h);
    const lone = run(h, next(), [{ kind: 'settle', cost: -500 }]);
    expect(lone.ok).toBe(false);
    expect(lone.reason).toBe('invalid');
    const early = run(h, next(), [
      { kind: 'settle', cost: -500 },
      { kind: 'bulldoze', tiles: [{ x: 105, z: 100 }] },
    ]);
    expect(early.ok).toBe(false);
    expect(early.reason).toBe('invalid');
    expect(funds(h)).toBe(before);
    // The road the refused batch would have bulldozed is still there.
    expect(run(h, next(), [{ kind: 'bulldoze', tiles: [{ x: 105, z: 100 }] }]).ok).toBe(true);
  });

  it('settles the same with unlimited money on', () => {
    const h = town();
    run(h, next(), [{ kind: 'setUnlimitedMoney', on: true }]);
    const placed = run(h, next(), [place()]);
    expect(placed.ok).toBe(true);
    const removed = run(h, next(), [{ kind: 'bulldoze', tiles: [{ x: 104, z: 101 }] }]);
    expect(removed.ok).toBe(true);
    setFunds(h, 0);
    // Undo costs the refund back, which the empty purse cannot cover but unlimited money can.
    expect(run(h, next(), removed.inverse).ok).toBe(true);
    expect(funds(h)).toBe(removed.cost);
  });
});
