import { describe, expect, it } from 'vitest';
import { armSlot, DEFAULT_ALLOWED, Movement, withArmAllowed } from './approach';
import {
  approachAhead,
  AUXILIARY_ZONE_TILES,
  auxiliaryLaneAt,
  isRampNodeAt,
  narrowingAhead,
  rampMouthAt,
  oppositeFlow,
  pocketedCrossSection,
  roadDegree,
  SHARED_TURN_LANE_MAX_TILES,
  sharedTurnLaneAt,
} from './approachzone';
import { presetProfileForTier, worldOrderedProfile } from './roadprofile';
import { taperTilesFor } from './taper';
import type { ApproachSurroundings } from './approachzone';
import type { CorridorHalf, JunctionControl, RoadProfile } from './types';
import { RoadFlow, RoadTier } from './types';

/**
 * A road laid out by hand: `#` is a tile with road on it. Rows are z and
 * columns are x, so the map reads the way the world looks from above.
 */
function world(
  map: string,
  junctions: Record<
    string,
    { control?: JunctionControl; turns?: number; laneTurns?: readonly number[] }
  > = {},
  /** Tiles a direction was drawn on — everything else is two-way. */
  flows: Record<string, RoadFlow> = {},
): ApproachSurroundings {
  const rows = map
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  const at = (x: number, z: number): string => rows[z]?.[x] ?? '.';
  return {
    hasRoad: (x, z) => at(x, z) !== '.',
    laneTurnsAt: (x, z, arm) => junctions[`${x},${z}`]?.laneTurns?.[armSlot(arm) ?? 0] ?? 0,
    controlAt: (x, z) => junctions[`${x},${z}`]?.control,
    turnsAt: (x, z) => junctions[`${x},${z}`]?.turns ?? 0,
    // '#' is a four-lane road and 'n' the two-lane street it narrows into;
    // everything the walk asks about width it asks through here.
    flowAt: (x, z) => flows[`${x},${z}`] ?? RoadFlow.None,
    // None of these maps draws a corridor: every tile is a road in its own
    // right, so no neighbour is anybody's other half.
    corridorHalfAt: () => 'none',
    profileIdAt: (x, z) => (at(x, z) === '.' ? 0 : 1),
    profileAt: (x, z) => {
      const c = at(x, z);
      if (c === '#') return presetProfileForTier(RoadTier.FourLane);
      if (c === 'n') return presetProfileForTier(RoadTier.TwoLane);
      if (c === 'o') return presetProfileForTier(RoadTier.OneWay);
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

  /** A tee at (2,2): legs west, east and south, and open ground north of it. */
  const TEE = `
    .....
    .....
    #####
    ..#..
    ..#..
    ..#..
  `;

  it('allows an arm of a tee only the turns the tee has legs for', () => {
    const signal = { '2,2': { control: 'signal' as JunctionControl } };
    // Arriving from the west, heading east: the left turn would be north, and
    // there is no road north of this junction to make it onto.
    const fromWest = approachAhead(1, 2, 3, world(TEE, signal));
    expect(fromWest).toBeDefined();
    expect(fromWest!.allowed & Movement.Left).toBe(0);
    expect(fromWest!.allowed & Movement.Through).not.toBe(0);
    expect(fromWest!.allowed & Movement.Right).not.toBe(0);
    // And the stem, arriving from the south heading north, may only turn.
    const fromSouth = approachAhead(2, 4, 3, world(TEE, signal));
    expect(fromSouth).toBeDefined();
    expect(fromSouth!.allowed & Movement.Through).toBe(0);
    expect(fromSouth!.allowed & Movement.Left).not.toBe(0);
    expect(fromSouth!.allowed & Movement.Right).not.toBe(0);
  });

  it('builds no turn bay for a left turn the junction has nowhere to make', () => {
    const signal = { '2,2': { control: 'signal' as JunctionControl } };
    // The same arm at a full crossroads earns one, which is what says the tee
    // is being refused for its missing leg and not for something else.
    expect(
      approachAhead(1, 2, 3, world(CROSSROADS, { '2,2': { control: 'signal' } }))?.pocket,
    ).toBe(true);
    expect(approachAhead(1, 2, 3, world(TEE, signal))?.pocket).toBe(false);
  });

  /** The crossroads with a ONE-WAY street for its north leg. */
  const ONE_WAY_LEG = `
    ..o..
    ..o..
    #####
    ..#..
    ..#..
  `;

  it('counts a one-way leg running at the junction as nowhere to turn', () => {
    const signal = { '2,2': { control: 'signal' as JunctionControl } };
    // The north leg is one-way SOUTHBOUND — coming at the junction — so the
    // arm from the west has a road on its left it may not turn onto.
    const wrongWay = approachAhead(
      1,
      2,
      3,
      world(ONE_WAY_LEG, signal, { '2,0': RoadFlow.South, '2,1': RoadFlow.South }),
    );
    expect(wrongWay).toBeDefined();
    expect(wrongWay!.allowed & Movement.Left).toBe(0);
    expect(wrongWay!.pocket).toBe(false);
    // Turned round to run away from the junction, it is a left turn again.
    const rightWay = approachAhead(
      1,
      2,
      3,
      world(ONE_WAY_LEG, signal, { '2,0': RoadFlow.North, '2,1': RoadFlow.North }),
    );
    expect(rightWay!.allowed & Movement.Left).not.toBe(0);
    expect(rightWay!.pocket).toBe(true);
    // A two-way leg is a leg either way round: the direction it happened to be
    // drawn in is not a bar, which is what the world records on every tile.
    const twoWay = approachAhead(
      1,
      2,
      3,
      world(CROSSROADS, signal, { '2,0': RoadFlow.South, '2,1': RoadFlow.South }),
    );
    expect(twoWay!.allowed & Movement.Left).not.toBe(0);
  });

  /**
   * Two crossroads on one street, `gap` tiles of street between them. The
   * street is `street` ('#' four-lane, 'n' two-lane); the roads crossing it
   * are four-lane.
   */
  const block = (gap: number, street = '#'): string => {
    const row = (mark: (x: number) => string): string =>
      Array.from({ length: gap + 8 }, (_, x) => mark(x)).join('');
    const cross = [3, 3 + gap + 1];
    const side = row((x) => (cross.includes(x) ? '#' : '.'));
    const main = row((x) => (cross.includes(x) ? '#' : x >= 1 && x <= gap + 6 ? street : '.'));
    return [side, side, main, side, side].join('\n');
  };
  /** Both of a block's junctions under `control`. */
  const held = (gap: number, control: JunctionControl) => ({
    '3,2': { control },
    [`${4 + gap},2`]: { control },
  });

  it('carries a shared turn lane through a short block where both junctions hold the street', () => {
    // A tile anywhere between the two junctions: every one of them, including
    // the middle one that approaches neither more than the other.
    for (const gap of [1, 2, 4, SHARED_TURN_LANE_MAX_TILES]) {
      const w = world(block(gap), held(gap, 'signal'));
      for (let x = 4; x < 4 + gap; x++) {
        expect({ gap, x, shared: sharedTurnLaneAt(x, 2, w) }).toEqual({ gap, x, shared: true });
      }
    }
  });

  it('gives a two-lane street one where it stops for bigger roads at both ends', () => {
    const w = world(block(4, 'n'), held(4, 'stop'));
    expect(sharedTurnLaneAt(6, 2, w)).toBe(true);
  });

  it('lays none where nothing holds the street — it runs through both junctions', () => {
    // Side streets that give way to it, or junctions nothing controls: no bay
    // would be built at either end, so there is nothing for a shared lane to
    // stand in for.
    expect(sharedTurnLaneAt(6, 2, world(block(4, 'n')))).toBe(false);
    expect(sharedTurnLaneAt(6, 2, world(block(4)))).toBe(false);
  });

  it('lays none where only one end holds the street', () => {
    const w = world(block(4), { '3,2': { control: 'signal' } });
    expect(sharedTurnLaneAt(6, 2, w)).toBe(false);
  });

  it('leaves a block with a real length of road in the middle alone', () => {
    const gap = SHARED_TURN_LANE_MAX_TILES + 1;
    const w = world(block(gap), held(gap, 'signal'));
    // The tile in the middle is too far from both to be in either's way.
    const middle = 4 + Math.floor(gap / 2);
    expect(sharedTurnLaneAt(middle, 2, w)).toBe(false);
  });

  it('says nothing of a junction itself, or of a street with one end open', () => {
    const w = world(block(4));
    expect(sharedTurnLaneAt(3, 2, w)).toBe(false); // the junction tile
    // The stretch beyond the far junction runs off the end of the map, so it
    // has a junction one way and nothing the other.
    expect(sharedTurnLaneAt(9, 2, w)).toBe(false);
  });

  it('is what the cross-section takes, over any bay the junction would give', () => {
    const street = presetProfileForTier(RoadTier.TwoLane);
    const bay = pocketedCrossSection(street, undefined, RoadFlow.None, true);
    expect(bay.pieces.some((p) => p.kind === 'centreTurn')).toBe(true);
    // And without it the road is the road: nothing is added for its own sake.
    expect(pocketedCrossSection(street, undefined, RoadFlow.None, false)).toBe(street);
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
  // lane at 1:15, so it takes 112 m — six 20 m tiles.
  const LENGTH = taperTilesFor('urban', 7.5);

  it('takes as long as the class’s own ratio says', () => {
    expect(LENGTH).toBe(6);
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
    expect(narrowingAhead(2, 3, w)).toMatchObject({ remaining: LENGTH - 1 });
    // LENGTH tiles back is the head of the taper; the one past it is just road.
    expect(narrowingAhead(2, 8 - LENGTH - 1, w)).toBeUndefined();
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
      laneTurnsAt: () => 0,
      controlAt: () => undefined,
      turnsAt: () => 0,
      flowAt: (x, z) => (ramp.has(`${x},${z}`) ? rampFlow : RoadFlow.None),
      corridorHalfAt: () => 'none',
      profileIdAt: (x, z) => (has(x, z) ? 1 : 0),
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

describe('a corridor half is a road in its own right', () => {
  // Two carriageways of one six-lane road running north-south in columns 2 and
  // 3, crossed by a street at z = 6. Each half is flagged as its own side and
  // both carry the same cross-section, which is what makes them one road.
  const SIX_LANE_ID = 40;
  const corridor = (
    junctions: Record<string, { control?: JunctionControl; turns?: number }> = {},
  ): ApproachSurroundings => {
    const half = (x: number): CorridorHalf => (x === 2 ? 'left' : x === 3 ? 'right' : 'none');
    const onCorridor = (x: number, z: number): boolean => (x === 2 || x === 3) && z >= 0 && z <= 12;
    const onStreet = (x: number, z: number): boolean => z === 6 && x >= 0 && x <= 6;
    const has = (x: number, z: number): boolean => onCorridor(x, z) || onStreet(x, z);
    return {
      hasRoad: has,
      laneTurnsAt: () => 0,
      controlAt: (x, z) => junctions[`${x},${z}`]?.control,
      turnsAt: (x, z) => junctions[`${x},${z}`]?.turns ?? 0,
      flowAt: (x, z) => (onCorridor(x, z) ? RoadFlow.South : RoadFlow.None),
      corridorHalfAt: (x, z) => (onCorridor(x, z) ? half(x) : 'none'),
      profileIdAt: (x, z) => (onCorridor(x, z) ? SIX_LANE_ID : has(x, z) ? 1 : 0),
      profileAt: (x, z) => (has(x, z) ? presetProfileForTier(RoadTier.TwoLane) : null),
    };
  };

  it('does not count its other half as a road meeting it', () => {
    const w = corridor();
    // Away from the crossing a half has road ahead, road behind, and its
    // partner alongside. Counting the partner would make it a T.
    expect(roadDegree(2, 2, w)).toBe(2);
    expect(roadDegree(3, 2, w)).toBe(2);
  });

  it('counts a street that really does meet it', () => {
    const w = corridor();
    // The left half at the crossing has the street arriving from the west.
    expect(roadDegree(2, 6, w)).toBe(3);
  });

  it('finds the junction ahead of it, which a road it never saw could not', () => {
    const w = corridor({ '2,6': { control: 'signal' }, '3,6': { control: 'signal' } });
    for (const x of [2, 3]) {
      const ahead = approachAhead(x, 4, 3, w);
      expect(ahead, `half at x=${x}`).toBeDefined();
      expect(ahead!.toward).toBe(RoadFlow.South);
      expect(ahead!.distance).toBe(1);
    }
  });

  it('does not mistake the length of the road for a junction to approach', () => {
    // Nothing crosses this one, so no tile of either half approaches anything.
    const bare: ApproachSurroundings = {
      ...corridor(),
      hasRoad: (x, z) => (x === 2 || x === 3) && z >= 0 && z <= 12,
    };
    expect(approachAhead(2, 4, 3, bare)).toBeUndefined();
    expect(approachAhead(3, 8, 3, bare)).toBeUndefined();
  });
});

/**
 * A motorway map: N/E/S/W are highway tiles drawn that way, n/e/s/w ramp tiles,
 * and '#' a two-lane street. Rows are z and columns are x.
 */
function motorwayWorld(map: string): ApproachSurroundings {
  const rows = map
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  const at = (x: number, z: number): string => rows[z]?.[x] ?? '.';
  const DIRECTION: Record<string, RoadFlow> = {
    n: RoadFlow.North,
    e: RoadFlow.East,
    s: RoadFlow.South,
    w: RoadFlow.West,
  };
  return {
    hasRoad: (x, z) => at(x, z) !== '.',
    laneTurnsAt: () => 0,
    controlAt: () => undefined,
    turnsAt: () => 0,
    flowAt: (x, z) => DIRECTION[at(x, z).toLowerCase()] ?? RoadFlow.None,
    corridorHalfAt: () => 'none',
    profileIdAt: (x, z) => (at(x, z) === '.' ? 0 : 1),
    profileAt: (x, z) => {
      const c = at(x, z);
      if ('NESW'.includes(c)) return presetProfileForTier(RoadTier.Highway);
      if ('nesw'.includes(c)) return presetProfileForTier(RoadTier.Ramp);
      if (c === '#') return presetProfileForTier(RoadTier.TwoLane);
      return null;
    },
  };
}

describe('two carriageways side by side are two roads to the approach walk', () => {
  const DUAL = `
    ..SN..
    ..SN..
    ..SN..
    ..SN..
    ..SN..
    ..SN..
    ..SN..
    ..SN..
  `;

  it('counts only a carriageway’s own run as its arms', () => {
    const w = motorwayWorld(DUAL);
    expect(roadDegree(2, 4, w)).toBe(2);
    expect(roadDegree(3, 4, w)).toBe(2);
  });

  it('finds no junction for either carriageway to approach', () => {
    const w = motorwayWorld(DUAL);
    for (let z = 0; z < 8; z++) {
      expect(approachAhead(2, z, 5, w), `S at ${z}`).toBeUndefined();
      expect(approachAhead(3, z, 5, w), `N at ${z}`).toBeUndefined();
    }
  });
});

describe('a ramp leaving a motorway is a diverge, not a junction', () => {
  /**
   * A southbound motorway at x = 4, and a ramp leaving it westward at z = 6 —
   * off the right-hand side of the traffic, where an exit is — down to a
   * street at x = 0.
   */
  const DIVERGE = `
    #...S.
    #...S.
    #...S.
    #...S.
    #...S.
    #...S.
    #wwwS.
    #...S.
    #...S.
    #...S.
    #...S.
    #...S.
  `;

  it('gives the motorway no junction to approach, so no arrows and no bay', () => {
    // Nobody on the motorway stops or chooses a lane at the ramp: the ones
    // leaving are already in the auxiliary lane, and everyone else carries on.
    const w = motorwayWorld(DIVERGE);
    for (let z = 0; z < 6; z++) expect(approachAhead(4, z, 5, w), `z ${z}`).toBeUndefined();
  });

  it('carries the auxiliary lane across the node, not up to it and then gone', () => {
    const w = motorwayWorld(DIVERGE);
    const before = auxiliaryLaneAt(4, 5, w);
    expect(before, 'the lane runs up to the ramp').toBeDefined();
    const node = auxiliaryLaneAt(4, 6, w);
    expect(node, 'and across the tile the ramp leaves from').toBeDefined();
    expect(node!.side).toBe(before!.side);
    expect(node!.openness).toBe(1);
  });

  it('still lets the ramp approach the street at its far end, which IS a junction', () => {
    const w = motorwayWorld(DIVERGE);
    const terminal = approachAhead(1, 6, 5, w);
    expect(terminal).toBeDefined();
    expect(terminal!.toward).toBe(RoadFlow.West);
  });
});

describe('a ramp that runs alongside before it joins', () => {
  /**
   * An eastbound motorway along z = 1. The on-ramp comes up column 3 from a
   * street, elbows east at (3,2), runs beside the motorway and ends at (6,2),
   * where it merges into the motorway tile (6,1).
   */
  const ON_RAMP = `
    ...............
    EEEEEEEEEEEEEEE
    ...eeee........
    ...n...........
    ...n...........
    ...n...........
    ###############
  `;
  /**
   * The same motorway with an off-ramp: it starts beside the motorway at
   * (4,2), where it diverges from (4,1), runs east and elbows south at (7,2).
   */
  const OFF_RAMP = `
    ...............
    EEEEEEEEEEEEEEE
    ....eees.......
    .......s.......
    .......s.......
    .......s.......
    ###############
  `;

  it('is its own road along the stretch, so the motorway beside it is a plain run', () => {
    const w = motorwayWorld(ON_RAMP);
    for (const x of [3, 4, 5]) expect(roadDegree(x, 1, w), `x ${x}`).toBe(2);
  });

  it('makes the tile it merges into a ramp node, and nothing before it', () => {
    const w = motorwayWorld(ON_RAMP);
    expect(isRampNodeAt(6, 1, w)).toBe(true);
    for (const x of [3, 4, 5]) expect(isRampNodeAt(x, 1, w), `x ${x}`).toBe(false);
  });

  it('runs the acceleration lane on from the merge, for the traffic that joined', () => {
    const w = motorwayWorld(ON_RAMP);
    const node = auxiliaryLaneAt(6, 1, w);
    expect(node?.merging).toBe(true);
    const beyond = auxiliaryLaneAt(7, 1, w);
    expect(beyond, 'the lane runs on beyond the merge').toBeDefined();
    expect(beyond!.merging).toBe(true);
    expect(beyond!.side).toBe(node!.side);
    expect(auxiliaryLaneAt(4, 1, w), 'and not back along the stretch').toBeUndefined();
  });

  it('runs the deceleration lane up to a diverge, and not beyond it', () => {
    const w = motorwayWorld(OFF_RAMP);
    expect(isRampNodeAt(4, 1, w)).toBe(true);
    const node = auxiliaryLaneAt(4, 1, w);
    expect(node?.merging).toBe(false);
    const before = auxiliaryLaneAt(3, 1, w);
    expect(before, 'the lane runs up to the diverge').toBeDefined();
    expect(before!.merging).toBe(false);
    expect(auxiliaryLaneAt(6, 1, w), 'and not on along the stretch').toBeUndefined();
  });

  it('gives the motorway no junction to approach, on or off', () => {
    for (const map of [ON_RAMP, OFF_RAMP]) {
      const w = motorwayWorld(map);
      for (let x = 0; x < 12; x++) expect(approachAhead(x, 1, 5, w), `x ${x}`).toBeUndefined();
    }
  });
});

describe('where a ramp alongside meets the motorway tile it joins', () => {
  const ON_RAMP = `
    ...............
    EEEEEEEEEEEEEEE
    ...eeee........
    ...n...........
  `;
  const OFF_RAMP = `
    ...............
    EEEEEEEEEEEEEEE
    ....eees.......
    .......s.......
  `;
  const HEAD_ON = `
    ...............
    EEEEEEEEEEEEEEE
    ......s........
    ......s........
  `;

  it('opens a merge over the downstream half, where the ramp has narrowed into the lane', () => {
    expect(rampMouthAt(6, 1, motorwayWorld(ON_RAMP))).toEqual({
      arm: RoadFlow.South,
      opens: RoadFlow.East,
    });
  });

  it('opens a diverge over the upstream half, where the ramp peels away', () => {
    expect(rampMouthAt(4, 1, motorwayWorld(OFF_RAMP))).toEqual({
      arm: RoadFlow.South,
      opens: RoadFlow.West,
    });
  });

  it('says nothing for a head-on ramp a save holds, which keeps its centred mouth', () => {
    expect(rampMouthAt(6, 1, motorwayWorld(HEAD_ON))).toBeUndefined();
  });

  it('says nothing off a ramp node', () => {
    expect(rampMouthAt(2, 1, motorwayWorld(ON_RAMP))).toBeUndefined();
  });
});

describe('a one-way road’s turn bay is on the driver’s left, whichever way it runs', () => {
  /**
   * A one-way street with a parking lane on the driver's left, packed so tight
   * that the bay has to be carved out of that parking lane to fit at all.
   */
  const tight: RoadProfile = {
    class: 'oneWay',
    pieces: [
      { kind: 'sidewalk', width: 2.5 },
      { kind: 'parking', width: 2.4 },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
      { kind: 'sidewalk', width: 2.5 },
    ],
  };

  it('takes the bay out of the parking on its own side, heading any way', () => {
    // Laid in world order, the driver's left is the high offset heading south
    // or west. A bay that looked for its parking on the low side there found
    // none, and squeezed the lanes instead of giving up the bay it was beside.
    for (const flow of [RoadFlow.North, RoadFlow.East, RoadFlow.South, RoadFlow.West]) {
      const out = pocketedCrossSection(
        worldOrderedProfile(tight, flow),
        {
          toward: flow,
          distance: 0,
          allowed: DEFAULT_ALLOWED,
          pocket: true,
          openness: 1,
          laneAllowed: 0,
        },
        flow,
      );
      expect(
        out.pieces.filter((p) => p.kind === 'travel'),
        `flow ${flow}`,
      ).toHaveLength(4);
      expect(
        out.pieces.some((p) => p.kind === 'parking'),
        `flow ${flow}`,
      ).toBe(false);
    }
  });
});

describe('a crossing tile, where a road passes over', () => {
  /** The crossroads, but the east-west road passes OVER the north-south one at (2,2). */
  const overpass = (): ApproachSurroundings => ({
    ...world(CROSSROADS, { '2,2': { control: 'signal' } }),
    overAxisAt: (x, z) => (x === 2 && z === 2 ? 'x' : null),
  });

  it('is no junction: the road beneath runs straight on through it', () => {
    expect(roadDegree(2, 2, overpass())).toBe(2);
  });

  it('gives the road beneath no approach to a junction there, and no bay', () => {
    expect(approachAhead(2, 1, 3, overpass())).toBeUndefined();
  });
});
