import { describe, expect, it } from 'vitest';
import { tileIndex } from '../shared/constants';
import { composeProfile, NO_EDITS, presetProfileForTier } from '../shared/roadprofile';
import { noiseTransmission, OPEN_EDGE } from '../shared/soundwall';
import { RoadFlow, RoadTier, type GridState, type RoadProfile } from '../shared/types';
import { createGrid } from './grid';
import { noiseWallsOf } from './noisewalls';

const EAST = 2;
const WEST = 8;
const SOUTH = 4;
const WALLED_ID = 13;

const motorway = presetProfileForTier(RoadTier.Highway);
const profiles = (walled: RoadProfile) => (id: number) =>
  id === WALLED_ID ? walled : id === RoadTier.Highway ? motorway : null;

/** A motorway along z = 50 from x = 40 to 44, drawn east, carrying profile `id`. */
function motorwayRow(id: number, ramp?: { x: number }): GridState {
  const g = createGrid();
  for (let x = 40; x <= 44; x++) {
    const i = tileIndex(x, 50);
    g.roadTier[i] = RoadTier.Highway;
    g.roadProfile[i] = id;
    g.roadFlow[i] = RoadFlow.East;
    g.roadMask[i] = (x > 40 ? WEST : 0) | (x < 44 ? EAST : 0) | (ramp?.x === x ? SOUTH : 0);
  }
  return g;
}

describe('the noise edges the roads’ walls stand on', () => {
  it('stands nothing where no road carries a wall', () => {
    expect(noiseWallsOf(motorwayRow(RoadTier.Highway), profiles(motorway))).toBeNull();
  });

  it('cuts each walled edge by the wall’s transmission and leaves the rest open', () => {
    const both = composeProfile(motorway, { ...NO_EDITS, soundWall: 'both', soundWallHeight: 6 });
    const walls = noiseWallsOf(motorwayRow(WALLED_ID), profiles(both))!;
    const t = noiseTransmission(6);
    for (let x = 40; x <= 44; x++) {
      // North edge of (x, 50) is the south edge of (x, 49).
      expect(walls.south[tileIndex(x, 49)]).toBe(t);
      expect(walls.south[tileIndex(x, 50)]).toBe(t);
      // Along the road nothing is cut.
      expect(walls.east[tileIndex(x, 50)]).toBe(OPEN_EDGE);
    }
    expect(walls.south[tileIndex(45, 50)]).toBe(OPEN_EDGE);
    expect(walls.south[tileIndex(40, 51)]).toBe(OPEN_EDGE);
  });

  it('leaves the edge a slip road leaves by open', () => {
    const right = composeProfile(motorway, { ...NO_EDITS, soundWall: 'right', soundWallHeight: 3 });
    const walls = noiseWallsOf(motorwayRow(WALLED_ID, { x: 42 }), profiles(right))!;
    expect(walls.south[tileIndex(41, 50)]).toBe(noiseTransmission(3));
    expect(walls.south[tileIndex(42, 50)]).toBe(OPEN_EDGE);
    expect(walls.south[tileIndex(43, 50)]).toBe(noiseTransmission(3));
    // The left side carries none.
    expect(walls.south[tileIndex(42, 49)]).toBe(OPEN_EDGE);
  });
});
