import { describe, expect, it } from 'vitest';
import {
  composeProfile,
  editsOf,
  layRefusal,
  NO_EDITS,
  presetProfileForTier,
  profilesEqual,
  roadPriceOf,
  ROAD_PRESETS,
  tilesAcross,
} from './roadprofile';
import {
  DEFAULT_SOUND_WALL_HEIGHT_M,
  insertionLossDb,
  noiseTransmission,
  OPEN_EDGE,
  SOUND_WALL_HEIGHTS_M,
  soundWallPrice,
} from './soundwall';
import { RoadTier, type RoadProfile } from './types';

const motorway = presetProfileForTier(RoadTier.Highway);
const motorwaySpec = ROAD_PRESETS.find((s) => s.tier === RoadTier.Highway)!;
const ramp = presetProfileForTier(RoadTier.Ramp);
const walled = (base: RoadProfile, side: 'left' | 'right' | 'both', height = 4.5): RoadProfile =>
  composeProfile(base, { ...NO_EDITS, soundWall: side, soundWallHeight: height });

describe('what a wall cuts', () => {
  it('cuts 5 dB at the line of sight and 1.5 dB a metre above it', () => {
    expect(SOUND_WALL_HEIGHTS_M.map(insertionLossDb)).toEqual([5, 7.25, 9.5]);
  });

  it('spans what US highway agencies build to: feasible at 5 dB, a goal of 7 to 10', () => {
    const losses = SOUND_WALL_HEIGHTS_M.map(insertionLossDb);
    expect(Math.min(...losses)).toBe(5);
    expect(Math.max(...losses)).toBeLessThanOrEqual(10);
  });

  it('lets through the share of sound energy its loss leaves: 10^(−dB/10)', () => {
    expect(SOUND_WALL_HEIGHTS_M.map(noiseTransmission)).toEqual([81, 48, 29]);
    expect(noiseTransmission(6)).toBeLessThan(OPEN_EDGE);
  });
});

describe('what a wall costs', () => {
  it('costs about ¢5.4 a metre of height, per side, per tile of motorway', () => {
    expect(SOUND_WALL_HEIGHTS_M.map((h) => Math.round(soundWallPrice(h).cost))).toEqual([
      16, 24, 32,
    ]);
  });

  it('keeps the motorway’s own ratio of upkeep to price', () => {
    const wall = soundWallPrice(4.5);
    expect(wall.upkeep / wall.cost).toBeCloseTo(
      motorwaySpec.upkeepPerTile / motorwaySpec.costPerTile,
      10,
    );
  });

  it('adds one wall’s price per side to the road it stands beside', () => {
    const one = roadPriceOf(motorwaySpec, walled(motorway, 'right', 3));
    const both = roadPriceOf(motorwaySpec, walled(motorway, 'both', 3));
    expect(one.costPerTile).toBe(Math.round(motorwaySpec.costPerTile + soundWallPrice(3).cost));
    expect(both.costPerTile).toBe(
      Math.round(motorwaySpec.costPerTile + 2 * soundWallPrice(3).cost),
    );
    expect(one.unlockMilestone).toBe(motorwaySpec.unlockMilestone);
  });

  it('charges each wall of a corridor once, across the two runs it is laid as', () => {
    const sixLanes = composeProfile(motorway, { ...NO_EDITS, lanes: 6 });
    const walledSix = walled(sixLanes, 'both', 6);
    expect(tilesAcross(walledSix)).toBe(2);
    const perRun =
      roadPriceOf(motorwaySpec, walledSix).costPerTile -
      roadPriceOf(motorwaySpec, sixLanes).costPerTile;
    expect(2 * perRun).toBeCloseTo(2 * soundWallPrice(6).cost, -0.5);
  });
});

describe('composing a wall into a motorway', () => {
  it('lays it outermost on the side asked for, at the height asked for', () => {
    const left = walled(motorway, 'left', 3);
    expect(left.pieces[0]).toEqual({ kind: 'soundWall', width: 0.6, height: 3 });
    expect(left.pieces.slice(1)).toEqual(motorway.pieces);
    const right = walled(motorway, 'right', 6);
    expect(right.pieces[right.pieces.length - 1]).toEqual({
      kind: 'soundWall',
      width: 0.6,
      height: 6,
    });
    const both = walled(motorway, 'both');
    expect(both.pieces.filter((p) => p.kind === 'soundWall')).toHaveLength(2);
  });

  it('reads back what it was composed with', () => {
    const edits = editsOf(walled(motorway, 'right', 6));
    expect(edits.soundWall).toBe('right');
    expect(edits.soundWallHeight).toBe(6);
    expect(editsOf(motorway).soundWall).toBe('none');
    expect(editsOf(motorway).soundWallHeight).toBe(DEFAULT_SOUND_WALL_HEIGHT_M);
  });

  it('gives the preset back when the wall is taken off again', () => {
    const off = composeProfile(walled(motorway, 'both'), { ...NO_EDITS, soundWall: 'none' });
    expect(profilesEqual(off, motorway)).toBe(true);
  });

  it('tells walls of different heights apart', () => {
    expect(profilesEqual(walled(motorway, 'left', 3), walled(motorway, 'left', 6))).toBe(false);
  });

  it('puts one on a slip road too', () => {
    expect(walled(ramp, 'right').pieces.some((p) => p.kind === 'soundWall')).toBe(true);
    expect(layRefusal(walled(ramp, 'both', 6))).toBeNull();
  });

  it('puts none on a street, whose class does not carry one', () => {
    const street = presetProfileForTier(RoadTier.TwoLane);
    expect(walled(street, 'both').pieces.some((p) => p.kind === 'soundWall')).toBe(false);
  });
});

describe('room for a wall', () => {
  it('fits both sides of a three-lane motorway', () => {
    expect(layRefusal(walled(motorway, 'both', 6))).toBeNull();
  });

  it('fits both sides of four lanes, built at the motorway’s 3.6 m', () => {
    const four = composeProfile(motorway, { ...NO_EDITS, lanes: 4 });
    expect(tilesAcross(walled(four, 'both'))).toBe(1);
    expect(layRefusal(walled(four, 'both'))).toBeNull();
  });

  it('finds no room beside a carriageway that already reaches the tile’s edge', () => {
    // Four lanes at the old 3.75 m and their shoulders: 19.2 m of a 20 m tile.
    const wide: RoadProfile = {
      ...motorway,
      pieces: [
        motorway.pieces[0]!,
        ...Array.from({ length: 4 }, () => ({ ...motorway.pieces[1]! })),
        motorway.pieces[motorway.pieces.length - 1]!,
      ],
    };
    expect(layRefusal(wide)).toBeNull();
    for (const side of ['left', 'right'] as const) {
      expect(layRefusal(walled(wide, side))).toBe(
        'No room beside the carriageway for a sound wall',
      );
    }
  });

  it('fits the outer edges of a six-lane corridor', () => {
    const six = composeProfile(motorway, { ...NO_EDITS, lanes: 6 });
    expect(layRefusal(walled(six, 'both', 6))).toBeNull();
  });

  it('refuses a wall anywhere but the edge, and at a height walls are not built to', () => {
    const inside: RoadProfile = {
      ...motorway,
      pieces: [
        motorway.pieces[0]!,
        { kind: 'soundWall', width: 0.6, height: 3 },
        ...motorway.pieces.slice(1),
      ],
    };
    expect(layRefusal(inside)).toBe('A sound wall stands at the edge of the road');
    const odd: RoadProfile = {
      ...motorway,
      pieces: [{ kind: 'soundWall', width: 0.6, height: 5 }, ...motorway.pieces],
    };
    expect(layRefusal(odd)).toBe('A sound wall is 3, 4.5, 6 m tall');
  });
});
