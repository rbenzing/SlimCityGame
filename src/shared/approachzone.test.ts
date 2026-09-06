import { describe, expect, it } from 'vitest';
import { DEFAULT_ALLOWED, Movement, withArmAllowed } from './approach';
import { approachAhead, oppositeFlow, roadDegree } from './approachzone';
import type { ApproachSurroundings } from './approachzone';
import type { JunctionControl } from './types';
import { RoadFlow } from './types';

/**
 * A road laid out by hand: `#` is a tile with road on it. Rows are z and
 * columns are x, so the map reads the way the world looks from above.
 */
function world(
  map: string,
  junctions: Record<string, { control?: JunctionControl; turns?: number }> = {},
): ApproachSurroundings {
  const rows = map
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return {
    hasRoad: (x, z) => (rows[z]?.[x] ?? '.') === '#',
    controlAt: (x, z) => junctions[`${x},${z}`]?.control,
    turnsAt: (x, z) => junctions[`${x},${z}`]?.turns ?? 0,
  };
}

/** A crossroads at (2,2), with two tiles of road running out of every arm. */
const CROSSROADS = `
  ..#..
  ..#..
  #####
  ..#..
  ..#..
`;

/** The same crossroads at (2,3), with a longer arm running north out of it. */
const LONG_ARM = `
  ..#..
  ..#..
  ..#..
  #####
  ..#..
`;

describe('the approach zone', () => {
  it('counts the roads meeting on a tile', () => {
    const w = world(CROSSROADS);
    expect(roadDegree(2, 2, w)).toBe(4);
    expect(roadDegree(2, 1, w)).toBe(2);
    expect(roadDegree(2, 0, w)).toBe(1);
  });

  it('names the junction ahead and how far off it is', () => {
    const w = world(CROSSROADS, { '2,2': { control: 'signal' } });
    expect(approachAhead(2, 1, 3, w)).toMatchObject({ toward: RoadFlow.South, distance: 0 });
    expect(approachAhead(1, 2, 3, w)).toMatchObject({ toward: RoadFlow.East, distance: 0 });
    expect(approachAhead(3, 2, 3, w)).toMatchObject({ toward: RoadFlow.West, distance: 0 });
    // The far end of the arm is where the road stops, not an approach.
    expect(approachAhead(2, 0, 3, w)).toBeUndefined();
  });

  it('reaches back as many tiles as the zone is given, and no further', () => {
    const w = world(LONG_ARM, { '2,3': { control: 'signal' } });
    expect(approachAhead(2, 2, 3, w)).toMatchObject({ distance: 0, pocket: true });
    expect(approachAhead(2, 1, 3, w)).toMatchObject({ distance: 1, pocket: true });
    // The same tile with a two-tile zone is still inside it; with a one-tile
    // zone the junction is out of reach and the tile is just road.
    expect(approachAhead(2, 1, 2, w)).toMatchObject({ distance: 1 });
    expect(approachAhead(2, 1, 1, w)).toBeUndefined();
  });

  it('carries no pocket for a class with no approach zone at all', () => {
    const w = world(CROSSROADS, { '2,2': { control: 'signal' } });
    expect(approachAhead(2, 1, 0, w)).toMatchObject({ distance: 0, pocket: false });
  });

  it('gives a tile between two junctions to the nearer one, and to neither on a tie', () => {
    const tie = world(
      `
      ..#..
      #####
      ..#..
      #####
      ..#..
      `,
      { '2,1': { control: 'signal' }, '2,3': { control: 'signal' } },
    );
    expect(approachAhead(2, 2, 3, tie)).toBeUndefined();

    const nearer = world(
      `
      ..#..
      #####
      ..#..
      ..#..
      #####
      `,
      { '2,1': { control: 'signal' }, '2,4': { control: 'signal' } },
    );
    expect(approachAhead(2, 2, 3, nearer)).toMatchObject({ toward: RoadFlow.North, distance: 0 });
  });

  it('is not an approach where the road turns a corner into the junction', () => {
    const corner = world(
      `
      ..#..
      #####
      ..##.
      `,
      { '2,1': { control: 'signal' } },
    );
    expect(approachAhead(2, 2, 3, corner)).toBeUndefined();
  });

  it('reads the arm this tile is on, so a restriction is the one facing it', () => {
    const w = world(CROSSROADS, {
      '2,2': { control: 'signal', turns: withArmAllowed(0, RoadFlow.North, Movement.Through) },
    });
    // The tile north of the junction sits on the junction's north arm.
    expect(approachAhead(2, 1, 2, w)?.allowed).toBe(Movement.Through);
    expect(approachAhead(2, 3, 2, w)?.allowed).toBe(DEFAULT_ALLOWED);
  });

  it('earns a pocket only where the junction holds its traffic', () => {
    const pocketed = (control: JunctionControl | undefined): boolean =>
      approachAhead(2, 1, 2, world(CROSSROADS, { '2,2': { control } }))?.pocket ?? false;
    expect(pocketed('signal')).toBe(true);
    expect(pocketed('allWayStop')).toBe(true);
    expect(pocketed('stop')).toBe(true);
    expect(pocketed('yield')).toBe(true);
    expect(pocketed('none')).toBe(false);
    expect(pocketed(undefined)).toBe(false);
    // A roundabout's approach flares need more than a tile.
    expect(pocketed('roundabout')).toBe(false);
  });

  it('has no pocket on an arm that may not go through, or may not turn', () => {
    const armed = (allowed: number): boolean =>
      approachAhead(
        2,
        1,
        2,
        world(CROSSROADS, {
          '2,2': { control: 'signal', turns: withArmAllowed(0, RoadFlow.North, allowed) },
        }),
      )?.pocket ?? false;
    expect(armed(Movement.Left | Movement.Through)).toBe(true);
    expect(armed(Movement.Through)).toBe(false);
    expect(armed(Movement.Left)).toBe(false);
    // A pocket is the lane beside the centreline: it is the left turn's.
    expect(armed(Movement.Through | Movement.Right)).toBe(false);
  });

  it('turns a cardinal round', () => {
    expect(oppositeFlow(RoadFlow.North)).toBe(RoadFlow.South);
    expect(oppositeFlow(RoadFlow.West)).toBe(RoadFlow.East);
    expect(oppositeFlow(RoadFlow.None)).toBe(RoadFlow.None);
  });
});
