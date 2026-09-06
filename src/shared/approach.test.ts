import { describe, expect, it } from 'vitest';
import {
  approachZoneTiles,
  defaultLaneMovements,
  lanesServing,
  Movement,
  movementBetween,
  movementDelayShare,
  movementName,
  MOVEMENTS,
  permits,
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

  it('divides a movement’s delay by the lanes serving it', () => {
    const lanes = defaultLaneMovements(4);
    expect(movementDelayShare(Movement.Through, lanes)).toBe(2);
    expect(movementDelayShare(Movement.Left, lanes)).toBe(1);
    // A banned movement has no queue to share; it reads as one rather than
    // dividing by nothing, since the caller should already have refused it.
    expect(movementDelayShare(Movement.UTurn, lanes)).toBe(1);
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
