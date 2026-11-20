import { describe, expect, it } from 'vitest';
import {
  FOOTWAY,
  auditRun,
  crosswalkFindings,
  footwayPatches,
  judgeFootway,
  judgeOverpass,
  rowLampOffsets,
  seamSteps,
  type Band,
  type RunTile,
} from '../../tools/probes/lib/checks.mjs';

const ASPHALT = '0.42,0.42,0.43';
const WHITE = '0.95,0.95,0.96';

const band = (color: string, from: number, to: number, nearShift = 0, farShift = 0): Band => ({
  color,
  axis: 'x',
  from,
  to,
  near: { from: from + nearShift, to: to + nearShift },
  far: { from: from + farShift, to: to + farShift },
});

/** A tile of a north-south run on x = 5 laying asphalt `half` metres each side of the centre. */
const tile = (z: number, half = 5, extra: Partial<RunTile> = {}): RunTile => ({
  at: z,
  x: 5,
  z,
  paint: [band('asphalt', -half, half), band('white', -half + 0.5, -half + 0.65)],
  grid: { lanes: 2, width: half * 2 },
  mesh: { lanes: 2, width: half * 2 },
  ...extra,
});

const run = (tiles: RunTile[]) => ({
  tag: 'two-lane-straight',
  tiles,
  measured: { axis: 'x' as const, x: 5, from: 0, to: tiles.length - 1 },
  junctions: [],
});

describe('seamSteps', () => {
  it('lets a mark that starts or stops pass, and flags paint that moved on both tiles', () => {
    const a = [band('asphalt', -5, 5), band('white', -4, -3.8)];
    expect(seamSteps(a, [band('asphalt', -5, 5)])).toEqual([]);
    const moved = seamSteps(a, [band('asphalt', -5, 5), band('white', -2.5, -2.3)]);
    expect(moved.map((s) => s.label)).toEqual(['band white']);
  });

  it('flags the road edge stepping across a seam, and not a taper that is continuous there', () => {
    const wide = [band('asphalt', -5, 5)];
    expect(seamSteps(wide, [band('asphalt', -3, 3)])[0]!.label).toBe('edge');
    // A band that eases from 10 m wide at its near end to 8 m at its far end meets the next
    // tile's 8 m near end with no step, though its whole span is wider than that tile's.
    const easing = [{ ...band('asphalt', -5, 5), far: { from: -4, to: 4 } }];
    expect(seamSteps(easing, [band('asphalt', -4, 4)])).toEqual([]);
  });
});

describe('auditRun', () => {
  const plain = Array.from({ length: 14 }, (_, z) => tile(z));

  it('passes a run whose every tile lays the same section', () => {
    expect(auditRun(run(plain)).failures).toEqual([]);
  });

  it('names a tile whose width and section differ from its run', () => {
    const tiles = plain.map((t) => (t.z === 7 ? tile(7, 4.5) : t));
    const { failures } = auditRun(run(tiles));
    expect(failures.some((f) => f.includes('(5,7) is 9.000m wide'))).toBe(true);
    expect(failures.some((f) => f.includes('(5,7) lays a different section'))).toBe(true);
  });

  it('fails a road whose edge jumps between neighbouring tiles', () => {
    const tiles = plain.map((t) => (t.z >= 7 ? tile(t.z, 3) : t));
    const { failures } = auditRun(run(tiles));
    expect(failures.some((f) => f.includes("the road's edge steps 2.00m"))).toBe(true);
  });

  it('fails where the grid and the mesh disagree about the lanes drawn', () => {
    const tiles = plain.map((t) => (t.z === 7 ? { ...t, mesh: { lanes: 4, width: 10 } } : t));
    expect(auditRun(run(tiles)).failures).toEqual([
      expect.stringContaining('(5,7) grid says 2 lanes/10.00m, mesh draws 4/10.00m'),
    ]);
  });

  it('reports nothing laid when no tile has paint, and a note when too few tiles are clear', () => {
    const bare = plain.map((t) => ({ ...t, paint: [] }));
    expect(auditRun(run(bare)).failures).toEqual(['two-lane-straight: nothing was laid']);
    const short = auditRun(run(plain.slice(0, 6)));
    expect(short.notes.some((n) => n.includes('uniformity not checked'))).toBe(true);
  });
});

describe('judgeOverpass', () => {
  const base = { tag: 'x', expectedTier: 1, raisedRows: [] as number[] };
  it('accepts crossed over with the road beneath intact, and a whole refusal', () => {
    expect(judgeOverpass({ ...base, crossedOver: true, tierBeneath: 1 }).failure).toBeUndefined();
    expect(judgeOverpass({ ...base, crossedOver: false, tierBeneath: 1 }).verdict).toBe('refused');
  });
  it('fails an overpass that took the road beneath, and a deck half in the air', () => {
    expect(judgeOverpass({ ...base, crossedOver: true, tierBeneath: 2 }).failure).toMatch(/took/);
    const half = judgeOverpass({ ...base, crossedOver: false, tierBeneath: 1, raisedRows: [4, 5] });
    expect(half.failure).toMatch(/2 tiles of the deck stand in the air/);
  });
});

/** A 10 by 10 surface with footway cells where `mark(r, c)` is true. */
const surface = (mark: (r: number, c: number) => boolean) =>
  Array.from({ length: 100 }, (_, i) => (mark(Math.floor(i / 10), i % 10) ? FOOTWAY : ASPHALT));

describe('footway patches', () => {
  // A crossroads: footway only in the four corner blocks, one patch each.
  const crossroads = surface((r, c) => (r < 3 || r > 6) && (c < 3 || c > 6));

  it('labels one patch a corner, so a crossroads is four and every corner joins', () => {
    const walk = footwayPatches(crossroads, 10);
    expect(walk.patches).toBe(4);
    const verdict = judgeFootway(walk, []);
    expect(verdict.corners).toBe(4);
    expect(verdict.broken).toEqual([]);
  });

  it('breaks a corner whose two sides arrive as separate patches', () => {
    const apart = surface((r, c) => (r < 3 && c >= 4 && c <= 6) || (r >= 4 && r <= 6 && c < 3));
    const walk = footwayPatches(apart, 10);
    expect(walk.patches).toBe(2);
    expect(walk.shares('n', 'w')).toBe(false);
    expect(judgeFootway(walk, [])).toMatchObject({ corners: 1, broken: ['NW'] });
  });

  it('asks whether the pavement runs past an access mouth, and says nothing where none arrives', () => {
    // A pavement strip along the north edge, unbroken, then broken at the middle.
    const whole = surface((r) => r === 0);
    const cut = surface((r, c) => r === 0 && c !== 5);
    expect(footwayPatches(whole, 10).runsPast('n')).toBe(true);
    expect(footwayPatches(cut, 10).runsPast('n')).toBe(false);
    expect(
      footwayPatches(
        surface(() => false),
        10,
      ).runsPast('n'),
    ).toBeNull();
    const verdict = judgeFootway(footwayPatches(cut, 10), ['n']);
    expect(verdict).toMatchObject({ mouths: 1, cut: ['N'] });
  });
});

describe('crosswalkFindings', () => {
  const COLS = 48;
  const cells = (paint: (r: number, c: number) => boolean) =>
    Array.from({ length: COLS * COLS }, (_, i) =>
      paint(Math.floor(i / COLS), i % COLS) ? WHITE : ASPHALT,
    );
  /** Bars three cells wide on a four-cell pitch in row 20, from column 4 to column 43. */
  const bars = (c: number) => c >= 4 && c < 44 && (c - 4) % 4 < 2;

  it('accepts an even run of bars across both halves', () => {
    const found = crosswalkFindings(
      cells((r, c) => r === 20 && bars(c)),
      COLS,
    );
    expect(found.failures).toEqual([]);
    expect(found.bars).toBe(10);
  });

  it('fails a stop line over the shared edge, a lost rhythm and a missing crosswalk', () => {
    const stop = crosswalkFindings(
      cells((r, c) => (r === 20 && bars(c)) || (r === 30 && c > 6 && c < 40)),
      COLS,
    );
    expect(stop.failures).toEqual([expect.stringContaining('stop line')]);
    const uneven = crosswalkFindings(
      cells((r, c) => r === 20 && bars(c) && c !== 20 && c !== 21 && c !== 22),
      COLS,
    );
    expect(uneven.failures.some((f) => f.includes('lose their rhythm'))).toBe(true);
    expect(
      crosswalkFindings(
        cells(() => false),
        COLS,
      ).failures,
    ).toEqual([expect.stringContaining('no crosswalk')]);
  });
});

describe('rowLampOffsets', () => {
  it('measures poles from the centre of one row, ignoring poles of other rows and columns', () => {
    // Row 2 of 20 m tiles is centred on z = 50 m.
    const poles = [
      { x: 60, z: 53.75 },
      { x: 60, z: 44 },
      { x: 60, z: 150 },
      { x: 500, z: 50 },
    ];
    expect(rowLampOffsets(poles, { z: 2, x0: 1, x1: 10, tile: 20 })).toEqual([3.75, 6]);
  });
});
