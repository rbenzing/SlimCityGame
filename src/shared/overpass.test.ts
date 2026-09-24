import { describe, expect, it } from 'vitest';
import { RoadTier } from './types';
import type { TilePoint } from './types';
import { atOneLevel, crossingShape, overpassRise } from './overpass';
import { GIRDER_DEPTH_M } from './bridgestyle';
import { OVERPASS_CLEARANCE_M, OVERPASS_RAIL_CLEARANCE_M } from './constants';

describe('overpassRise', () => {
  it('clears a road by the road clearance plus the over road’s own girder', () => {
    expect(overpassRise(RoadTier.Highway, RoadTier.TwoLane)).toBe(
      OVERPASS_CLEARANCE_M + GIRDER_DEPTH_M.box,
    );
    expect(overpassRise(RoadTier.TwoLane, RoadTier.Highway)).toBe(
      OVERPASS_CLEARANCE_M + GIRDER_DEPTH_M.beam,
    );
  });

  it('clears a railway by the rail clearance', () => {
    expect(overpassRise(RoadTier.TwoLane, RoadTier.RailTrack)).toBe(
      OVERPASS_RAIL_CLEARANCE_M + GIRDER_DEPTH_M.beam,
    );
  });
});

describe('crossingShape', () => {
  /** A drag running east along z = 5, from x = 2 to x = 8. */
  const drag: TilePoint[] = Array.from({ length: 7 }, (_, k) => ({ x: 2 + k, z: 5 }));
  const at = (roads: [number, number][]) => {
    const set = new Set(roads.map(([x, z]) => `${x},${z}`));
    return (x: number, z: number): boolean => set.has(`${x},${z}`);
  };

  it('is across where a road runs north-south straight under a straight drag', () => {
    expect(
      crossingShape(
        drag,
        3,
        at([
          [5, 4],
          [5, 6],
        ]),
      ),
    ).toBe('across');
  });

  it('is along where no road lies across the drag at that tile', () => {
    expect(crossingShape(drag, 3, at([]))).toBe('along');
  });

  it('is skew where the road below ends at the drag', () => {
    expect(crossingShape(drag, 3, at([[5, 4]]))).toBe('skew');
  });

  it('is skew where the drag ends on the crossing', () => {
    expect(
      crossingShape(
        drag,
        6,
        at([
          [8, 4],
          [8, 6],
        ]),
      ),
    ).toBe('skew');
  });

  it('is skew where a road below also runs along the drag’s line — a junction', () => {
    expect(
      crossingShape(
        drag,
        3,
        at([
          [5, 4],
          [5, 6],
          [4, 5],
        ]),
      ),
    ).toBe('skew');
  });

  it('is skew where the drag turns on the crossing', () => {
    const bend: TilePoint[] = [
      { x: 3, z: 5 },
      { x: 4, z: 5 },
      { x: 4, z: 6 },
    ];
    expect(
      crossingShape(
        bend,
        1,
        at([
          [4, 4],
          [5, 5],
        ]),
      ),
    ).toBe('skew');
  });

  it('reads a drag running north-south the same way', () => {
    const column: TilePoint[] = Array.from({ length: 5 }, (_, k) => ({ x: 5, z: 2 + k }));
    expect(
      crossingShape(
        column,
        2,
        at([
          [4, 4],
          [6, 4],
        ]),
      ),
    ).toBe('across');
  });
});

describe('atOneLevel', () => {
  it('joins decks within a grade step, and not beyond', () => {
    expect(atOneLevel(0, 2)).toBe(true);
    expect(atOneLevel(0, 4)).toBe(false);
  });
});
