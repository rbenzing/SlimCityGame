import { describe, expect, it } from 'vitest';
import { computePolePlacements } from './powerlines';
import type { TilePoint } from '../shared/types';

const run = (from: number, to: number, z: number): TilePoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: from + i, z }));

describe('computePolePlacements', () => {
  it('stands a pole on every tile of the line', () => {
    expect(computePolePlacements(run(2, 6, 3))).toHaveLength(5);
  });

  it('claims each span once, from its west end, so a run of N gives N-1 spans', () => {
    const poles = computePolePlacements(run(2, 6, 3));
    const spans = poles.filter((p) => p.spanEast).length + poles.filter((p) => p.spanSouth).length;
    expect(spans).toBe(4);
    // The last pole in the run carries no span onward.
    expect(poles[poles.length - 1]?.spanEast).toBe(false);
  });

  it('spans southward down a north-south run', () => {
    const poles = computePolePlacements([
      { x: 4, z: 1 },
      { x: 4, z: 2 },
      { x: 4, z: 3 },
    ]);
    expect(poles.filter((p) => p.spanSouth)).toHaveLength(2);
    expect(poles.some((p) => p.spanEast)).toBe(false);
  });

  it('turns a corner — the elbow carries a span each way', () => {
    // An L: east along z=0 to x=2, then south down x=2.
    const poles = computePolePlacements([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 1 },
    ]);
    const elbow = poles.find((p) => p.x === 2 && p.z === 0);
    expect(elbow?.spanEast).toBe(false); // nothing further east
    expect(elbow?.spanSouth).toBe(true); // the run turns down
  });

  it('leaves a gap unspanned — a broken line does not reach across it', () => {
    const poles = computePolePlacements([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      // x = 2 missing
      { x: 3, z: 0 },
      { x: 4, z: 0 },
    ]);
    const before = poles.find((p) => p.x === 1);
    expect(before?.spanEast).toBe(false);
    expect(poles.filter((p) => p.spanEast)).toHaveLength(2); // 0->1 and 3->4
  });

  it('stands nothing at all for no line', () => {
    expect(computePolePlacements([])).toEqual([]);
  });

  it('is deterministic — the same tiles always give the same poles', () => {
    const tiles = run(1, 5, 2);
    expect(computePolePlacements(tiles)).toEqual(computePolePlacements(tiles));
  });
});
