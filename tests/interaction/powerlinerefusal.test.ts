import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { POWER_LINE_REFUSALS } from '../../src/shared/placement';
import { RoadTier } from '../../src/shared/types';
import type { Command } from '../../src/shared/types';
import { column, initialized, latestSaveGrid, roadRow, run } from '../support/sim';
import type { Harness } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

/** The grid the worker holds now, read back off a fresh save. */
function savedGrid(h: Harness) {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveGrid(h);
}

const line = (tiles: { x: number; z: number }[]): Command => ({
  kind: 'stringPowerLine',
  tiles,
  on: true,
});

/** A new town with a two-lane street along row 60 from x = 58 to x = 77. */
function townWithAStreet() {
  const h = initialized();
  expect(
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(58, 60, 20) }]).ok,
  ).toBe(true);
  return h;
}

describe('stringing a power line past a street that already carries power', () => {
  it('refuses a run along the street with its own sentence, and strings nothing', () => {
    const h = townWithAStreet();
    const ack = run(h, 2, [line(roadRow(62, 60, 8))]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe(POWER_LINE_REFUSALS.alongStreet);
    expect(ack.cost).toBe(0);
    const grid = savedGrid(h);
    for (let x = 62; x < 70; x++) expect(grid.powerLine[tileIndex(x, 60)]).toBe(0);
  });

  it('refuses a run that comes off open ground and turns along the street', () => {
    const h = townWithAStreet();
    const ack = run(h, 2, [line([...column(65, 56, 4), ...roadRow(66, 60, 4)])]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe(POWER_LINE_REFUSALS.alongStreet);
  });

  it('allows a line that crosses the street at right angles, and undoes it exactly', () => {
    const h = townWithAStreet();
    const tiles = column(65, 56, 9);
    const ack = run(h, 2, [line(tiles)]);
    expect(ack.ok).toBe(true);
    expect(ack.inverse).toEqual([{ kind: 'stringPowerLine', tiles, on: false }]);
    expect(savedGrid(h).powerLine[tileIndex(65, 60)]).toBe(1);

    expect(run(h, 3, ack.inverse).ok).toBe(true);
    const grid = savedGrid(h);
    for (const t of tiles) expect(grid.powerLine[tileIndex(t.x, t.z)]).toBe(0);
  });

  it('allows a line along a gravel road, which carries no power of its own', () => {
    const h = initialized();
    expect(
      run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Gravel, tiles: roadRow(58, 60, 20) }]).ok,
    ).toBe(true);
    expect(run(h, 2, [line(roadRow(62, 60, 8))]).ok).toBe(true);
  });

  it('keeps a line an older save holds along a street, live, and leaves it alone', () => {
    const h = initialized();
    const along = roadRow(60, 60, 6);
    expect(run(h, 1, [line(along)]).ok).toBe(true);
    // The street is laid over the line afterwards: the state an older save holds.
    expect(
      run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(58, 60, 10) }]).ok,
    ).toBe(true);
    const grid = savedGrid(h);
    for (const t of along) expect(grid.powerLine[tileIndex(t.x, t.z)]).toBe(1);

    // Dragging over it again changes nothing, and is not the new refusal.
    const again = run(h, 3, [line(along)]);
    expect(again.reason).not.toBe(POWER_LINE_REFUSALS.alongStreet);
    const after = savedGrid(h);
    for (const t of along) expect(after.powerLine[tileIndex(t.x, t.z)]).toBe(1);
  });
});
