import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { POWER_LINE_REFUSALS } from '../../src/shared/placement';
import { PowerLineKind, RoadTier } from '../../src/shared/types';
import type { Command } from '../../src/shared/types';
import {
  column,
  holdOlderLine,
  initialized,
  latestSaveGrid,
  roadRow,
  run,
  standingBuildings,
} from '../support/sim';
import type { Harness } from '../support/sim';
import { guardRoadNetwork } from '../support/guard';

guardRoadNetwork();

const savedGrid = (h: Harness) => {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveGrid(h);
};
const kindAt = (h: Harness, x: number, z: number): number =>
  savedGrid(h).powerLine[tileIndex(x, z)]!;

const line = (tiles: { x: number; z: number }[], on = true): Command => ({
  kind: 'stringPowerLine',
  tiles,
  on,
});
const turbine = (x: number, z: number): Command => ({
  kind: 'placeBuilding',
  catalogId: 'wind-turbine',
  x,
  z,
  rotation: 0,
});

describe('a line the player strings starts at a source', () => {
  it('refuses a run that touches no source and no line, with its own sentence, charging nothing', () => {
    const h = initialized();
    const funds = h.lastSnapshot()!.stats.funds;
    const ack = run(h, 1, [line(roadRow(80, 80, 6))]);
    expect(ack.ok).toBe(false);
    expect(ack.reason).toBe(POWER_LINE_REFUSALS.mustStartAtSource);
    expect(ack.reason).toBe('A line must start at a power station, a substation or a live line.');
    expect(ack.cost).toBe(0);
    expect(kindAt(h, 82, 80)).toBe(0);
    expect(h.lastSnapshot()!.stats.funds).toBe(funds);
  });

  it('accepts a run that begins beside a generator, and lays it as the newer kind', () => {
    const h = initialized();
    expect(run(h, 1, [turbine(64, 56)]).ok).toBe(true);
    const ack = run(h, 2, [line(column(65, 56, 6))]);
    expect(ack.ok).toBe(true);
    expect(kindAt(h, 65, 58)).toBe(PowerLineKind.Strung);
  });

  it('accepts a run that begins beside a substation, and one that continues a line', () => {
    const h = initialized();
    expect(
      run(h, 1, [
        { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(80, 80, 20) },
        { kind: 'placeBuilding', catalogId: 'substation', x: 90, z: 78, rotation: 0 },
      ]).ok,
    ).toBe(true);
    expect(run(h, 2, [line(roadRow(92, 78, 5))]).ok).toBe(true);
    expect(kindAt(h, 94, 78)).toBe(PowerLineKind.Strung);
    // A run that touches that line, and nothing else, is live too.
    expect(run(h, 3, [line(column(96, 70, 8))]).ok).toBe(true);
    expect(kindAt(h, 96, 72)).toBe(PowerLineKind.Strung);
  });

  it('undoes and redoes a run of old and new tiles each to its own byte', () => {
    const h = initialized();
    expect(run(h, 1, [turbine(64, 56)]).ok).toBe(true);
    const older = column(65, 56, 3);
    holdOlderLine(h, older);
    const fresh = column(65, 59, 3);
    expect(run(h, 2, [line(fresh)]).ok).toBe(true);
    const all = [...older, ...fresh];

    const pulled = run(h, 3, [line(all, false)]);
    expect(pulled.ok).toBe(true);
    for (const t of all) expect(kindAt(h, t.x, t.z)).toBe(0);

    const restored = run(h, 4, pulled.inverse);
    expect(restored.ok).toBe(true);
    for (const t of older) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Held);
    for (const t of fresh) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Strung);

    // Undoing the undo pulls the same tiles down again.
    expect(run(h, 5, restored.inverse).ok).toBe(true);
    for (const t of all) expect(kindAt(h, t.x, t.z)).toBe(0);
  });

  it('restores a run whose source has since gone, which a new run could not be', () => {
    const h = initialized();
    expect(run(h, 1, [turbine(64, 56)]).ok).toBe(true);
    const tiles = column(65, 56, 4);
    expect(run(h, 2, [line(tiles)]).ok).toBe(true);
    const pulled = run(h, 3, [line(tiles, false)]);
    expect(run(h, 4, [{ kind: 'bulldoze', tiles: [{ x: 64, z: 56 }] }]).ok).toBe(true);
    expect(run(h, 5, [line(tiles)]).reason).toBe(POWER_LINE_REFUSALS.mustStartAtSource);
    expect(run(h, 6, pulled.inverse).ok).toBe(true);
    expect(kindAt(h, 65, 58)).toBe(PowerLineKind.Strung);
  });

  it('leaves a line standing when its source is removed', () => {
    const h = initialized();
    expect(run(h, 1, [turbine(64, 56)]).ok).toBe(true);
    const tiles = column(65, 56, 4);
    expect(run(h, 2, [line(tiles)]).ok).toBe(true);
    expect(run(h, 3, [{ kind: 'bulldoze', tiles: [{ x: 64, z: 56 }] }]).ok).toBe(true);
    expect([...standingBuildings(h).values()].some((b) => b.catalogId === 'wind-turbine')).toBe(
      false,
    );
    for (const t of tiles) expect(kindAt(h, t.x, t.z)).toBe(PowerLineKind.Strung);
  });
});
