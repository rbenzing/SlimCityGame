import { describe, expect, it } from 'vitest';
import {
  findStreetFacingEdge,
  sidewalkDepthMeters,
  streetLookupOf,
  vergeDepthMeters,
} from './frontage';
import { RoadTier } from '../shared/types';

describe('streetLookupOf', () => {
  const tierAt = (x: number): RoadTier =>
    x === 0 ? RoadTier.TwoLane : x === 1 ? RoadTier.RailTrack : RoadTier.None;
  const street = streetLookupOf(tierAt, () => null);

  it('reads a street’s verge and sidewalk from its tier', () => {
    expect(street(0, 0)).toEqual({
      vergeM: vergeDepthMeters(RoadTier.TwoLane),
      sidewalkM: sidewalkDepthMeters(RoadTier.TwoLane),
    });
  });

  it('finds no street on a railway or on open ground', () => {
    expect(street(1, 0)).toBeNull();
    expect(street(2, 0)).toBeNull();
  });
});

describe('findStreetFacingEdge', () => {
  it('passes over a railway beside the lot for the street beyond it', () => {
    // A 2x2 lot at (4, 6): rail along its north edge, a street along its south.
    const street = streetLookupOf(
      (_x, z) => (z === 5 ? RoadTier.RailTrack : z === 8 ? RoadTier.TwoLane : RoadTier.None),
      () => null,
    );
    expect(findStreetFacingEdge(4, 6, 2, 2, street)?.side).toBe('S');
  });
});
