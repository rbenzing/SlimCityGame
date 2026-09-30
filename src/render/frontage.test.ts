import { describe, expect, it } from 'vitest';
import {
  findStreetFacingEdge,
  sidewalkDepthMeters,
  streetLookupOf,
  vergeDepthMeters,
} from './frontage';
import { RoadTier } from '../shared/types';
import type { RoadProfile } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { corridorHalfProfile } from '../shared/roadprofile';

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

describe('vergeDepthMeters', () => {
  it('leaves half of an undivided corridor its extra verge on the side a lot fronts', () => {
    const lane = (flow: 'fwd' | 'back') => ({ kind: 'travel' as const, width: 3.6, flow });
    const walk = { kind: 'sidewalk' as const, width: 1.9 };
    const arterial: RoadProfile = {
      class: 'arterial',
      pieces: [
        walk,
        lane('back'),
        lane('back'),
        lane('back'),
        lane('fwd'),
        lane('fwd'),
        lane('fwd'),
        walk,
      ],
    };
    const half = corridorHalfProfile(arterial, 'left');
    // Tile edge to the back of the footway: the carriageway sits against the
    // far edge of the tile, 10.8 m of it and 1.9 m of footway.
    expect(vergeDepthMeters(RoadTier.Avenue, half)).toBeCloseTo(TILE_METERS - 10.8 - 1.9, 6);
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
