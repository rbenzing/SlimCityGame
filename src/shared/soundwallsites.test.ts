import { describe, expect, it } from 'vitest';
import {
  carriagewayHalfWidthOf,
  composeProfile,
  corridorHalfProfile,
  NO_EDITS,
  presetProfileForTier,
  withAuxiliaryLane,
  worldOrderedProfile,
} from './roadprofile';
import { soundWallsAt, WALL_EDGE, type SoundWallReader } from './soundwallsites';
import { corridorHalfOf, RoadFlow, RoadTier, storedFlow, type RoadProfile } from './types';

const motorway = presetProfileForTier(RoadTier.Highway);
const walled = (side: 'left' | 'right' | 'both', base = motorway): RoadProfile =>
  composeProfile(base, { ...NO_EDITS, soundWall: side, soundWallHeight: 4.5 });

const EAST_WEST = WALL_EDGE.east | WALL_EDGE.west;
const NORTH_SOUTH = WALL_EDGE.north | WALL_EDGE.south;

/** One tile at (0, 0) carrying `profile` drawn `flow`, joined to the neighbours `mask` names. */
function tile(profile: RoadProfile, flow: number, mask: number): SoundWallReader {
  return {
    sectionAt: (x, z) =>
      x === 0 && z === 0
        ? corridorHalfProfile(worldOrderedProfile(profile, flow), corridorHalfOf(flow))
        : null,
    flowAt: () => flow,
    maskAt: () => mask,
  };
}

const edgesOf = (reader: SoundWallReader): number[] =>
  soundWallsAt(0, 0, reader).map((s) => s.edge);

describe('which edge a wall stands on', () => {
  it('puts the driver’s left on the north edge of a road heading east, and the right on the south', () => {
    expect(edgesOf(tile(walled('left'), RoadFlow.East, EAST_WEST))).toEqual([WALL_EDGE.north]);
    expect(edgesOf(tile(walled('right'), RoadFlow.East, EAST_WEST))).toEqual([WALL_EDGE.south]);
  });

  it('turns them round for a road heading west, whose left is to the south', () => {
    expect(edgesOf(tile(walled('left'), RoadFlow.West, EAST_WEST))).toEqual([WALL_EDGE.south]);
    expect(edgesOf(tile(walled('right'), RoadFlow.West, EAST_WEST))).toEqual([WALL_EDGE.north]);
  });

  it('puts the left on the west edge heading north, and on the east edge heading south', () => {
    expect(edgesOf(tile(walled('left'), RoadFlow.North, NORTH_SOUTH))).toEqual([WALL_EDGE.west]);
    expect(edgesOf(tile(walled('left'), RoadFlow.South, NORTH_SOUTH))).toEqual([WALL_EDGE.east]);
  });

  it('stands both, at the height chosen', () => {
    const sites = soundWallsAt(0, 0, tile(walled('both'), RoadFlow.East, EAST_WEST));
    expect(sites.map((s) => s.edge)).toEqual([WALL_EDGE.north, WALL_EDGE.south]);
    expect(sites.every((s) => s.heightM === 4.5 && s.alongX)).toBe(true);
  });

  it('stands nothing for a road with no wall, or no road', () => {
    expect(edgesOf(tile(motorway, RoadFlow.East, EAST_WEST))).toEqual([]);
    expect(soundWallsAt(5, 5, tile(walled('both'), RoadFlow.East, EAST_WEST))).toEqual([]);
  });
});

describe('where a wall opens', () => {
  it('opens across a slip road’s mouth, and keeps the far side', () => {
    const rampOnTheSouth = EAST_WEST | WALL_EDGE.south;
    expect(edgesOf(tile(walled('both'), RoadFlow.East, rampOnTheSouth))).toEqual([WALL_EDGE.north]);
  });

  it('opens round the inside of a corner', () => {
    const turningNorth = WALL_EDGE.west | WALL_EDGE.north;
    expect(edgesOf(tile(walled('both'), RoadFlow.East, turningNorth))).toEqual([WALL_EDGE.south]);
  });
});

describe('where across the tile a wall stands', () => {
  it('stands its base against the carriageway’s edge', () => {
    const sites = soundWallsAt(0, 0, tile(walled('both'), RoadFlow.East, EAST_WEST));
    const reach = carriagewayHalfWidthOf(motorway);
    expect(sites.map((s) => [s.outward, s.faceOffsetM])).toEqual([
      [-1, -reach],
      [1, reach],
    ]);
  });

  it('follows the drawn section outward where the motorway grows an auxiliary lane, so the lane runs inside the wall', () => {
    const own = tile(walled('both'), RoadFlow.East, EAST_WEST);
    const section = own.sectionAt(0, 0)!;
    const grown = withAuxiliaryLane(section, 1)!;
    const sites = soundWallsAt(0, 0, { ...own, drawnAt: () => grown });
    // The same two edges as ever: which edge is the own section's answer.
    expect(sites.map((s) => s.edge)).toEqual([WALL_EDGE.north, WALL_EDGE.south]);
    // The faces stand at the drawn carriageway's edges, which moved out by half
    // the lane's width each; the one on the lane's side has the lane inside it.
    const reach = carriagewayHalfWidthOf(grown);
    expect(reach).toBeGreaterThan(carriagewayHalfWidthOf(section));
    expect(sites.map((s) => s.faceOffsetM)).toEqual([-reach, reach]);
    for (const site of sites)
      expect(Math.abs(site.faceOffsetM) + 0.6).toBeLessThanOrEqual(10 + 1e-9);
    // A reader with no drawn section, the noise field's, gets the own section's answer as before.
    expect(soundWallsAt(0, 0, own).map((s) => s.faceOffsetM)).toEqual([
      -carriagewayHalfWidthOf(section),
      carriagewayHalfWidthOf(section),
    ]);
  });

  it('stands each half of a six-lane corridor’s wall at that half’s outer edge', () => {
    const six = walled('both', composeProfile(motorway, { ...NO_EDITS, lanes: 6 }));
    const low = soundWallsAt(0, 0, tile(six, storedFlow(RoadFlow.East, 'left'), EAST_WEST));
    const high = soundWallsAt(0, 0, tile(six, storedFlow(RoadFlow.East, 'right'), EAST_WEST));
    expect(low.map((s) => s.edge)).toEqual([WALL_EDGE.north]);
    expect(high.map((s) => s.edge)).toEqual([WALL_EDGE.south]);
    // Each half is pushed against the edge the two share, so its wall stands
    // inside its own tile, on the side away from the other half.
    for (const site of [...low, ...high]) {
      expect(Math.abs(site.faceOffsetM) + 0.6).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
});
