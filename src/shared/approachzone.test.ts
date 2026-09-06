import { describe, expect, it } from 'vitest';
import { DEFAULT_ALLOWED, Movement, withArmAllowed } from './approach';
import {
  approachAhead,
  AUXILIARY_ZONE_TILES,
  auxiliaryLaneAt,
  narrowingAhead,
  oppositeFlow,
  roadDegree,
} from './approachzone';
import { presetProfileForTier } from './roadprofile';
import { taperTilesFor } from './taper';
import type { ApproachSurroundings } from './approachzone';
import type { JunctionControl, RoadProfile } from './types';
import { RoadFlow, RoadTier } from './types';

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
  const at = (x: number, z: number): string => rows[z]?.[x] ?? '.';
  return {
    hasRoad: (x, z) => at(x, z) !== '.',
    controlAt: (x, z) => junctions[`${x},${z}`]?.control,
    turnsAt: (x, z) => junctions[`${x},${z}`]?.turns ?? 0,
    // '#' is a four-lane road and 'n' the two-lane street it narrows into;
    // everything the walk asks about width it asks through here.
    flowAt: () => RoadFlow.None,
    profileAt: (x, z) => {
      const c = at(x, z);
      if (c === '#') return presetProfileForTier(RoadTier.FourLane);
      if (c === 'n') return presetProfileForTier(RoadTier.TwoLane);
      return null;
    },
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

  it('opens the bay as the junction nears, and holds it full against the stop line', () => {
    const w = world(LONG_ARM, { '2,3': { control: 'signal' } });
    const at = (z: number): number => approachAhead(2, z, 3, w)!.openness;
    // The tile at the stop line has the whole bay; the one behind it is still
    // opening, and never more open than the one in front.
    expect(at(2)).toBe(1);
    expect(at(1)).toBeLessThan(1);
    expect(at(1)).toBeGreaterThan(0);
    // A tile carrying no bay is not half of one.
    expect(approachAhead(2, 1, 3, world(LONG_ARM))!.openness).toBe(1);
  });

  it('holds the bay full where the zone leaves no room for a taper', () => {
    const w = world(CROSSROADS, { '2,2': { control: 'signal' } });
    expect(approachAhead(2, 1, 1, w)!.openness).toBe(1);
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

describe('the lane drop a tile is running into', () => {
  /** A four-lane road running north into a two-lane street at z = 9. */
  const NARROWS = `
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..#..
    ..n..
    ..n..
  `;
  // 15 m of carriageway down to 7.5 m is a 7.5 m drop; a town street closes a
  // lane at 1:15, so it takes seven 16 m tiles.
  const LENGTH = taperTilesFor('urban', 7.5);

  it('takes as long as the class’s own ratio says', () => {
    expect(LENGTH).toBe(7);
  });

  it('closes the lanes over the taper, tile by tile, and not before it', () => {
    const w = world(NARROWS);
    // The tile against the narrow street has nothing left to close.
    expect(narrowingAhead(2, 8, w)).toMatchObject({
      remaining: 0,
      length: LENGTH,
      closed: 7.5,
      toward: RoadFlow.South,
    });
    expect(narrowingAhead(2, 7, w)).toMatchObject({ remaining: 1 });
    expect(narrowingAhead(2, 2, w)).toMatchObject({ remaining: 6 });
    // Seven tiles back is the head of the taper; the eighth is just road.
    expect(narrowingAhead(2, 1, w)).toBeUndefined();
  });

  it('says nothing to the narrow road, which is not the one closing lanes', () => {
    expect(narrowingAhead(2, 9, world(NARROWS))).toBeUndefined();
  });

  it('gives the taper to the wide side, whichever way the road is read', () => {
    const widens = `
      ..n..
      ..n..
      ..#..
      ..#..
      ..#..
    `;
    // The narrow street closes nothing: a road GAINS its lane at the join,
    // because there is nothing to close.
    expect(narrowingAhead(2, 1, world(widens))).toBeUndefined();
    // The wide road beside it is the one whose lanes are running out, and it
    // is closing them toward the street.
    expect(narrowingAhead(2, 2, world(widens))).toMatchObject({
      toward: RoadFlow.North,
      remaining: 0,
    });
  });

  it('does not taper around a corner, since a closing lane cannot turn one', () => {
    const corner = `
      ..#..
      ..#..
      ..##n
    `;
    expect(narrowingAhead(2, 1, world(corner))).toBeUndefined();
  });

  it('gives a stretch that narrows both ways to the nearer drop', () => {
    const between = `
      ..n..
      ..#..
      ..#..
      ..#..
      ..n..
    `;
    expect(narrowingAhead(2, 1, between ? world(between) : world(between))).toMatchObject({
      toward: RoadFlow.North,
      remaining: 0,
    });
    expect(narrowingAhead(2, 3, world(between))).toMatchObject({
      toward: RoadFlow.South,
      remaining: 0,
    });
  });
});

describe('the auxiliary lane a motorway grows beside a slip road', () => {
  const SLIM_MOTORWAY: RoadProfile = {
    class: 'highway',
    kerbs: true,
    pieces: [
      { kind: 'travel', width: 3.75, flow: 'back' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
    ],
  };
  const RAMP: RoadProfile = {
    class: 'ramp',
    kerbs: false,
    pieces: [
      { kind: 'shoulder', width: 1.2 },
      { kind: 'travel', width: 4.2, flow: 'fwd' },
      { kind: 'shoulder', width: 2.4 },
    ],
  };

  /**
   * A motorway running north-south at x=2 with a slip road leaving eastward
   * from (2,4) to a street at x=6. `rampFlow` is the way the slip road was
   * drawn: East leaves the motorway, West joins it.
   */
  function interchange(rampFlow: RoadFlow): ApproachSurroundings {
    const motorway = new Set<string>();
    for (let z = 0; z <= 16; z++) motorway.add(`2,${z}`);
    const ramp = new Set<string>();
    for (let x = 3; x <= 5; x++) ramp.add(`${x},4`);
    const street = new Set<string>();
    for (let z = 2; z <= 7; z++) street.add(`6,${z}`);
    const has = (x: number, z: number): boolean =>
      motorway.has(`${x},${z}`) || ramp.has(`${x},${z}`) || street.has(`${x},${z}`);
    return {
      hasRoad: has,
      controlAt: () => undefined,
      turnsAt: () => 0,
      flowAt: (x, z) => (ramp.has(`${x},${z}`) ? rampFlow : RoadFlow.None),
      profileAt: (x, z) => {
        if (motorway.has(`${x},${z}`)) return SLIM_MOTORWAY;
        if (ramp.has(`${x},${z}`)) return RAMP;
        if (street.has(`${x},${z}`)) return presetProfileForTier(RoadTier.TwoLane);
        return null;
      },
    };
  }

  it('runs UP to a turn-off, on the kerb of the direction that takes it', () => {
    const w = interchange(RoadFlow.East);
    // The slip road leaves eastward, so it is the northbound driver's — their
    // right-hand kerb is the east one — and they approach from the south.
    const near = auxiliaryLaneAt(2, 5, w);
    expect(near).toBeDefined();
    expect(near!.merging).toBe(false);
    expect(near!.side).toBe(1);
    expect(near!.openness).toBe(1);
    // It opens from nothing at the back of the zone to full at the turn-off.
    expect(auxiliaryLaneAt(2, 8, w)!.openness).toBeLessThan(near!.openness);
    // Southbound traffic, north of the junction, is taking nothing and gets
    // nothing: the turn-off is not theirs.
    expect(auxiliaryLaneAt(2, 3, w)).toBeUndefined();
  });

  it('runs ON from a join, for the traffic that came up the slip road', () => {
    const w = interchange(RoadFlow.West);
    // Drawn westward, the slip road runs INTO the motorway. Traffic joining it
    // is heading north, and its lane to get up to speed in lies beyond the
    // join — north of it.
    const beyond = auxiliaryLaneAt(2, 3, w);
    expect(beyond).toBeDefined();
    expect(beyond!.merging).toBe(true);
    expect(beyond!.side).toBe(1);
    expect(auxiliaryLaneAt(2, 5, w)).toBeUndefined();
  });

  it('says nothing where the slip road never recorded which way it runs', () => {
    const w = interchange(RoadFlow.None);
    expect(auxiliaryLaneAt(2, 5, w)).toBeUndefined();
    expect(auxiliaryLaneAt(2, 3, w)).toBeUndefined();
  });

  it('reaches back only as far as the zone, and no further', () => {
    const w = interchange(RoadFlow.East);
    expect(auxiliaryLaneAt(2, 4 + AUXILIARY_ZONE_TILES, w)).toBeDefined();
    expect(auxiliaryLaneAt(2, 4 + AUXILIARY_ZONE_TILES + 1, w)).toBeUndefined();
  });
});
