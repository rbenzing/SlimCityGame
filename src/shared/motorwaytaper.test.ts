import { describe, expect, it } from 'vitest';
import { narrowingAhead } from './approachzone';
import type { ApproachSurroundings } from './approachzone';
import { composeProfile, NO_EDITS, presetProfileForTier } from './roadprofile';
import { RoadFlow, RoadTier } from './types';

/** A motorway down column 2 with four lanes to row `JOIN - 1` and the three-lane preset from `JOIN`. */
const JOIN = 10;
const LAST = 13;
const fourLanes = composeProfile(presetProfileForTier(RoadTier.Highway), { ...NO_EDITS, lanes: 4 });
const threeLanes = presetProfileForTier(RoadTier.Highway);
const lanesOf = (p: { pieces: readonly { kind: string }[] }): number =>
  p.pieces.filter((piece) => piece.kind === 'travel').length;

const motorway: ApproachSurroundings = {
  hasRoad: (x, z) => x === 2 && z >= 0 && z <= LAST,
  laneTurnsAt: () => 0,
  controlAt: () => undefined,
  turnsAt: () => 0,
  flowAt: () => RoadFlow.None,
  corridorHalfAt: () => 'none',
  profileIdAt: (x, z) => (x === 2 && z >= 0 && z <= LAST ? 1 : 0),
  profileAt: (x, z) => {
    if (x !== 2 || z < 0 || z > LAST) return null;
    return z < JOIN ? fourLanes : threeLanes;
  },
};

describe('a motorway that loses a lane', () => {
  it('drops from four lanes to three where the preset begins', () => {
    expect(lanesOf(fourLanes)).toBe(4);
    expect(lanesOf(threeLanes)).toBe(3);
  });

  it('tapers the four-lane tiles down to the join, tile by tile, toward the narrower road', () => {
    const taper = Array.from({ length: LAST + 1 }, (_, z) => narrowingAhead(2, z, motorway));
    const tapering = taper.flatMap((t, z) => (t ? [{ z, ...t }] : []));
    expect(tapering.length).toBeGreaterThan(1);
    // Every tapering tile is on the wide side, in the run just before the join.
    for (const t of tapering) {
      expect(t.z).toBeLessThan(JOIN);
      expect(t.toward).toBe(RoadFlow.South);
    }
    expect(tapering[tapering.length - 1]!.z).toBe(JOIN - 1);
    // The closing runs down tile by tile to nothing at the join.
    const remaining = tapering.map((t) => t.remaining);
    expect(remaining).toEqual([...remaining].sort((a, b) => b - a));
    expect(remaining[remaining.length - 1]).toBe(0);
  });

  it('says nothing to the narrower road it drops into, nor to the stretch before the taper', () => {
    for (let z = JOIN; z <= LAST; z++)
      expect(narrowingAhead(2, z, motorway), `z ${z}`).toBeUndefined();
    expect(narrowingAhead(2, 0, motorway)).toBeUndefined();
  });
});
