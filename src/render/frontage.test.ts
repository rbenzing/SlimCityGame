import { describe, expect, it } from 'vitest';
import {
  findRoadFacingEdge,
  findStreetFacingEdge,
  localSideOf,
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

describe('findRoadFacingEdge', () => {
  const roads = (tiles: Array<[number, number]>) => {
    const set = new Set(tiles.map(([x, z]) => `${x},${z}`));
    return (x: number, z: number): boolean => set.has(`${x},${z}`);
  };

  it('faces the street it borders for the longest stretch, on a bend', () => {
    // A 2x2 lot at (4, 4) on the inside of a bend: one road tile touches its
    // north edge, two run along its east edge.
    const bend = roads([
      [4, 3],
      [6, 4],
      [6, 5],
    ]);
    const edge = findRoadFacingEdge(4, 4, 2, 2, bend);
    expect(edge?.side).toBe('E');
    expect(edge?.edgeTiles).toBe(2);
    expect(edge?.roadTileX).toBe(6);
  });

  it('faces the side street along a cul-de-sac rather than the road end beside it', () => {
    // The street runs west to east and stops at x = 9; a lot at (8, 5) stands
    // beside its last two tiles and a lot's east edge reaches nothing.
    const street = roads([
      [6, 4],
      [7, 4],
      [8, 4],
      [9, 4],
    ]);
    const edge = findRoadFacingEdge(8, 5, 2, 2, street);
    expect(edge?.side).toBe('N');
    expect(edge?.roadTileX).toBe(8);
  });

  it('faces the road end when that is the only street the lot touches', () => {
    const street = roads([[5, 4]]);
    // Lot beyond the end, west of the last tile.
    expect(findRoadFacingEdge(3, 4, 2, 1, street)?.side).toBe('E');
  });

  it('breaks a tie between sides N, then E, then S, then W', () => {
    const corner = roads([
      [4, 3],
      [6, 4],
      [4, 6],
      [3, 4],
    ]);
    expect(findRoadFacingEdge(4, 4, 2, 2, corner)?.side).toBe('N');
    expect(
      findRoadFacingEdge(
        4,
        4,
        2,
        2,
        roads([
          [6, 4],
          [4, 6],
        ]),
      )?.side,
    ).toBe('E');
  });

  it('is null for a lot no street borders', () => {
    expect(findRoadFacingEdge(4, 4, 2, 2, roads([[9, 9]]))).toBeNull();
  });
});

describe('localSideOf', () => {
  it('is the identity for an upright building', () => {
    for (const side of ['N', 'E', 'S', 'W'] as const) expect(localSideOf(side, 0)).toBe(side);
  });

  it('names the building side a quarter turn carries onto each map side', () => {
    // Turned a quarter, a building's east side faces north on the map.
    expect(localSideOf('N', 1)).toBe('E');
    expect(localSideOf('W', 1)).toBe('N');
    expect(localSideOf('S', 1)).toBe('W');
    expect(localSideOf('E', 1)).toBe('S');
    expect(localSideOf('N', 2)).toBe('S');
    expect(localSideOf('N', 3)).toBe('W');
  });
});
