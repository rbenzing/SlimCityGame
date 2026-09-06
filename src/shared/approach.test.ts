import { describe, expect, it } from 'vitest';
import {
  approachZoneTiles,
  armAllowed,
  armIsRestricted,
  DEFAULT_ALLOWED,
  defaultLaneMovements,
  lanesServing,
  Movement,
  movementBetween,
  movementDelayShare,
  movementAllowed,
  movementName,
  MOVEMENTS,
  laneMovementsFor,
  permits,
  pocketLaneMovements,
  pocketWarranted,
  withArmAllowed,
} from './approach';
import { RoadFlow } from './types';
import type { RoadClassId } from './types';

describe('movementBetween reads the turn off the two headings', () => {
  it('names every turn from a driver heading north', () => {
    expect(movementBetween(RoadFlow.North, RoadFlow.North)).toBe(Movement.Through);
    expect(movementBetween(RoadFlow.North, RoadFlow.West)).toBe(Movement.Left);
    expect(movementBetween(RoadFlow.North, RoadFlow.East)).toBe(Movement.Right);
    expect(movementBetween(RoadFlow.North, RoadFlow.South)).toBe(Movement.UTurn);
  });

  it('says the same thing whichever way round the compass the driver came', () => {
    const cardinals = [RoadFlow.North, RoadFlow.East, RoadFlow.South, RoadFlow.West] as const;
    for (let i = 0; i < cardinals.length; i++) {
      const entering = cardinals[i]!;
      expect(movementBetween(entering, cardinals[i]!)).toBe(Movement.Through);
      expect(movementBetween(entering, cardinals[(i + 1) % 4]!)).toBe(Movement.Right);
      expect(movementBetween(entering, cardinals[(i + 2) % 4]!)).toBe(Movement.UTurn);
      expect(movementBetween(entering, cardinals[(i + 3) % 4]!)).toBe(Movement.Left);
    }
  });

  it('has nothing to say about a road that never recorded a direction', () => {
    expect(movementBetween(RoadFlow.None, RoadFlow.North)).toBeNull();
    expect(movementBetween(RoadFlow.North, RoadFlow.None)).toBeNull();
  });
});

describe('defaultLaneMovements widens the way a real approach widens', () => {
  const has = (set: number, m: Movement): boolean => (set & m) !== 0;

  it('lets a single lane do everything, because it has to', () => {
    const [only] = defaultLaneMovements(1);
    expect(has(only!, Movement.Left)).toBe(true);
    expect(has(only!, Movement.Through)).toBe(true);
    expect(has(only!, Movement.Right)).toBe(true);
  });

  it('shares the turns across two lanes', () => {
    const lanes = defaultLaneMovements(2);
    expect(lanes).toHaveLength(2);
    expect(has(lanes[0]!, Movement.Left)).toBe(true);
    expect(has(lanes[0]!, Movement.Right)).toBe(false);
    expect(has(lanes[1]!, Movement.Right)).toBe(true);
    expect(has(lanes[1]!, Movement.Left)).toBe(false);
    // Both carry the through movement, which is what a two-lane approach does.
    expect(lanesServing(Movement.Through, lanes)).toBe(2);
  });

  it('buys a dedicated left first, which is what a third lane is for', () => {
    const lanes = defaultLaneMovements(3);
    expect(lanes[0]).toBe(Movement.Left);
    expect(lanesServing(Movement.Left, lanes)).toBe(1);
    expect(lanesServing(Movement.Through, lanes)).toBe(2);
  });

  it('buys a dedicated right with the fourth, and runs the rest through', () => {
    const four = defaultLaneMovements(4);
    expect(four[0]).toBe(Movement.Left);
    expect(four[3]).toBe(Movement.Right);
    expect(lanesServing(Movement.Through, four)).toBe(2);

    const six = defaultLaneMovements(6);
    expect(lanesServing(Movement.Left, six)).toBe(1);
    expect(lanesServing(Movement.Right, six)).toBe(1);
    expect(lanesServing(Movement.Through, six)).toBe(4);
  });

  it('never offers a U-turn unasked, however wide the approach', () => {
    for (let n = 1; n <= 8; n++) {
      expect(permits(defaultLaneMovements(n), Movement.UTurn), `${n} lanes`).toBe(false);
    }
  });

  it('always leaves every other movement possible', () => {
    for (let n = 1; n <= 8; n++) {
      for (const m of [Movement.Left, Movement.Through, Movement.Right]) {
        expect(permits(defaultLaneMovements(n), m), `${n} lanes, ${movementName(m)}`).toBe(true);
      }
    }
  });

  it('has no lanes to describe on a road with none', () => {
    expect(defaultLaneMovements(0)).toEqual([]);
    expect(defaultLaneMovements(-2)).toEqual([]);
  });
});

describe('a movement no lane offers is a movement nobody makes', () => {
  it('reports a banned turn as banned', () => {
    const noLeft = [Movement.Through, Movement.Through | Movement.Right];
    expect(permits(noLeft, Movement.Left)).toBe(false);
    expect(permits(noLeft, Movement.Right)).toBe(true);
    expect(lanesServing(Movement.Left, noLeft)).toBe(0);
  });

  it('divides a movement’s delay by the service its lanes give it', () => {
    // An approach whose one lane does everything is the yardstick: it reads as
    // the single lane it is, which is what it has always cost.
    const single = defaultLaneMovements(1);
    expect(movementDelayShare(Movement.Through, single)).toBe(1);
    expect(movementDelayShare(Movement.Left, single)).toBe(1);

    // Four lanes: two of them do nothing but go straight, and one does nothing
    // but turn left, so both are worth more than a lane shared three ways.
    const four = defaultLaneMovements(4);
    expect(movementDelayShare(Movement.Through, four)).toBe(6);
    expect(movementDelayShare(Movement.Left, four)).toBe(3);
    // A banned movement has no queue to share; it reads as one rather than
    // dividing by nothing, since the caller should already have refused it.
    expect(movementDelayShare(Movement.UTurn, four)).toBe(1);
  });

  it('is worth more to a movement that has a lane to itself than one it shares', () => {
    // The same two lanes, the left turn sharing one of them and then given one.
    const shared = defaultLaneMovements(2);
    const pocketed = pocketLaneMovements(2, DEFAULT_ALLOWED);
    expect(movementDelayShare(Movement.Left, pocketed)).toBeGreaterThan(
      movementDelayShare(Movement.Left, shared),
    );
    // And every wider approach serves the through movement better than a
    // narrower one, which is what makes a wide road worth building.
    const service = [1, 2, 3, 4].map((n) =>
      movementDelayShare(Movement.Through, defaultLaneMovements(n)),
    );
    expect([...service].sort((a, b) => a - b)).toEqual(service);
  });
});

describe('the approach zone is as long as the queue it has to hold', () => {
  it('grows with the class, from a track to a motorway', () => {
    expect(approachZoneTiles('local')).toBe(2);
    expect(approachZoneTiles('collector')).toBe(3);
    expect(approachZoneTiles('arterial')).toBe(4);
    expect(approachZoneTiles('local')).toBeLessThan(approachZoneTiles('collector'));
    expect(approachZoneTiles('collector')).toBeLessThan(approachZoneTiles('arterial'));
    expect(approachZoneTiles('arterial')).toBeLessThan(approachZoneTiles('divided'));
  });

  it('gives every class an answer, and rail none, since it has no junctions', () => {
    const classes: RoadClassId[] = [
      'dirt',
      'alley',
      'rural',
      'local',
      'urban',
      'collector',
      'arterial',
      'divided',
      'oneWay',
      'highway',
      'ramp',
      'rail',
    ];
    for (const c of classes) expect(Number.isInteger(approachZoneTiles(c)), c).toBe(true);
    expect(approachZoneTiles('rail')).toBe(0);
  });
});

describe('the movement vocabulary', () => {
  it('is four distinct bits, each with a name', () => {
    expect(new Set(MOVEMENTS).size).toBe(4);
    let all = 0;
    for (const m of MOVEMENTS) {
      expect(movementName(m).length).toBeGreaterThan(0);
      expect(all & m).toBe(0); // no two movements share a bit
      all |= m;
    }
  });
});

describe('turn restrictions pack one nibble per arm', () => {
  const ARMS = [RoadFlow.North, RoadFlow.East, RoadFlow.South, RoadFlow.West] as const;

  it('reads an untouched junction as allowing every turn but the U', () => {
    for (const arm of ARMS) {
      expect(armAllowed(0, arm)).toBe(DEFAULT_ALLOWED);
      expect(armIsRestricted(0, arm)).toBe(false);
      expect(movementAllowed(0, arm, Movement.Left)).toBe(true);
      expect(movementAllowed(0, arm, Movement.UTurn)).toBe(false);
    }
  });

  it('sets one arm without disturbing the others', () => {
    let packed = 0;
    packed = withArmAllowed(packed, RoadFlow.East, Movement.Through | Movement.Right);
    expect(armAllowed(packed, RoadFlow.East)).toBe(Movement.Through | Movement.Right);
    expect(movementAllowed(packed, RoadFlow.East, Movement.Left)).toBe(false);
    for (const arm of ARMS) {
      if (arm === RoadFlow.East) continue;
      expect(armAllowed(packed, arm), String(arm)).toBe(DEFAULT_ALLOWED);
    }
  });

  it('holds all four arms at once, each saying something different', () => {
    let packed = 0;
    const wanted = [
      [RoadFlow.North, Movement.Through],
      [RoadFlow.East, Movement.Left | Movement.Through],
      [RoadFlow.South, Movement.Right],
      [RoadFlow.West, Movement.Left | Movement.Through | Movement.Right | Movement.UTurn],
    ] as const;
    for (const [arm, allowed] of wanted) packed = withArmAllowed(packed, arm, allowed);
    for (const [arm, allowed] of wanted) expect(armAllowed(packed, arm), String(arm)).toBe(allowed);
    // And it still fits the sixteen bits a save gives it.
    expect(packed).toBeLessThanOrEqual(0xffff);
    expect(packed).toBeGreaterThanOrEqual(0);
  });

  it('hands an arm back to the default with a null', () => {
    const packed = withArmAllowed(0, RoadFlow.South, Movement.Right);
    expect(armIsRestricted(packed, RoadFlow.South)).toBe(true);
    const back = withArmAllowed(packed, RoadFlow.South, null);
    expect(armIsRestricted(back, RoadFlow.South)).toBe(false);
    expect(armAllowed(back, RoadFlow.South)).toBe(DEFAULT_ALLOWED);
    expect(back).toBe(0);
  });

  it('ignores an arm that is not a cardinal, rather than corrupting a nibble', () => {
    expect(withArmAllowed(0, RoadFlow.None, Movement.Left)).toBe(0);
    expect(armAllowed(0xffff, RoadFlow.None)).toBe(DEFAULT_ALLOWED);
  });

  it('takes a banned movement out of every lane that offered it', () => {
    const noLeft = laneMovementsFor(3, Movement.Through | Movement.Right);
    expect(lanesServing(Movement.Left, noLeft)).toBe(0);
    expect(lanesServing(Movement.Through, noLeft)).toBe(2);
    // The lane that only had a left is left with nothing, and so carries no
    // arrow at all — which is what a banned turn looks like on the ground.
    expect(noLeft[0]).toBe(0);
  });

  it('leaves the lane sets alone when nothing is banned', () => {
    expect(laneMovementsFor(4, DEFAULT_ALLOWED)).toEqual(defaultLaneMovements(4));
  });
});

describe('the turn pocket an approach earns', () => {
  it('is warranted only where the junction holds the traffic and the arm turns left', () => {
    expect(pocketWarranted('signal', DEFAULT_ALLOWED)).toBe(true);
    expect(pocketWarranted('stop', DEFAULT_ALLOWED)).toBe(true);
    expect(pocketWarranted('yield', DEFAULT_ALLOWED)).toBe(true);
    expect(pocketWarranted('allWayStop', DEFAULT_ALLOWED)).toBe(true);
    // Nothing to queue for, and nowhere to put an approach flare.
    expect(pocketWarranted('none', DEFAULT_ALLOWED)).toBe(false);
    expect(pocketWarranted(null, DEFAULT_ALLOWED)).toBe(false);
    expect(pocketWarranted('roundabout', DEFAULT_ALLOWED)).toBe(false);
    // A pocket is the left turn's lane; an arm that cannot turn left, or that
    // cannot go through, has nothing to separate.
    expect(pocketWarranted('signal', Movement.Through | Movement.Right)).toBe(false);
    expect(pocketWarranted('signal', Movement.Left)).toBe(false);
  });

  it('gives the pocket to the left turn alone, and leaves the rest as they were', () => {
    // One running lane and a pocket: the pocket turns left, the lane it was
    // carved beside keeps everything else.
    expect(pocketLaneMovements(2, DEFAULT_ALLOWED)).toEqual([
      Movement.Left,
      Movement.Through | Movement.Right,
    ]);
    expect(pocketLaneMovements(3, DEFAULT_ALLOWED)).toEqual([
      Movement.Left,
      Movement.Through,
      Movement.Through | Movement.Right,
    ]);
    expect(pocketLaneMovements(4, DEFAULT_ALLOWED)).toEqual([
      Movement.Left,
      Movement.Through,
      Movement.Through,
      Movement.Right,
    ]);
  });

  it('still answers to a restriction: a banned turn is in no lane, pocket or not', () => {
    const noRight = pocketLaneMovements(2, Movement.Left | Movement.Through);
    expect(lanesServing(Movement.Right, noRight)).toBe(0);
    expect(lanesServing(Movement.Left, noRight)).toBe(1);
  });
});
