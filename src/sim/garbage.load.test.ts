import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../app/persist';
import { LANDFILL_CAPACITY_PER_TILE } from '../shared/constants';
import { RoadTier } from '../shared/types';
import { initialized, roadRow, rows, run, type Harness } from '../../tests/support/sim';

/** A city with a 2x2 landfill, saved, then loaded back as a save of `version` holding `stored`. */
function loadedLandfill(version: number, stored: number): number {
  const h: Harness = initialized();
  expect(
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(98, 100, 8) }]).ok,
  ).toBe(true);
  const ack = run(h, 2, [{ kind: 'paintLandfill', tiles: rows(100, 101, 2, 2), on: true }]);
  expect(ack.ok).toBe(true);

  h.sim.handleMessage({ type: 'requestSave' });
  const first = h.messages.filter((m) => m.type === 'save').at(-1);
  if (!first || first.type !== 'save') throw new Error('no save message');
  const payload = decodeSave(first.data);
  payload.header.version = version;
  payload.meta.garbage = { landfillStored: stored, incinerators: [] };
  h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });

  h.sim.handleMessage({ type: 'requestSave' });
  const last = h.messages.filter((m) => m.type === 'save').at(-1);
  if (!last || last.type !== 'save') throw new Error('no save message');
  return decodeSave(last.data).meta.garbage!.landfillStored;
}

describe('loading a landfill fill', () => {
  it('rescales a version-14 fill counted at 600 a tile, keeping the fraction', () => {
    // Four tiles at the old 600 a tile held 2,400; 1,200 was half full.
    expect(loadedLandfill(14, 1_200)).toBe(2 * LANDFILL_CAPACITY_PER_TILE);
  });

  it('rescales 300 units, half an old tile, to half of 6,835,200', () => {
    expect(loadedLandfill(14, 300)).toBe(3_417_600);
  });

  it('loads a current-version fill unchanged', () => {
    expect(loadedLandfill(15, 1_200)).toBe(1_200);
  });
});
