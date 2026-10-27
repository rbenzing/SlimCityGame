import { describe, expect, it } from 'vitest';
import {
  edgeFrameFor,
  edgeFrameOfParcel,
  findRoadFacingEdge,
  findStreetFacingEdge,
  frameDirection,
  frameToLocal,
  frameToWorld,
  inwardYaw,
  isAxisAligned,
  frameAlongX,
  localSideOf,
  outwardYaw,
  sidewalkDepthMeters,
  streetLookupOf,
  vergeDepthMeters,
  type Side,
} from './frontage';
import { RoadTier } from '../shared/types';
import type { ParcelFrame, RoadProfile } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { corridorHalfProfile } from '../shared/roadprofile';
import { toWorld } from '../shared/lotframe';

describe('edgeFrameFor', () => {
  // A 2 × 3 lot at tile (4, 6): west 80, east 120, north 120, south 180.
  const sides: Record<Side, (along: number, depthM: number) => { x: number; z: number }> = {
    N: (a, p) => ({ x: 80 + a, z: 120 - p }),
    S: (a, p) => ({ x: 80 + a, z: 180 + p }),
    E: (a, p) => ({ x: 120 + p, z: 120 + a }),
    W: (a, p) => ({ x: 80 - p, z: 120 + a }),
  };
  const samples: [number, number][] = [
    [0, 0],
    [7.5, 0.25],
    [33.3, -0.4375],
    [12.125, 1],
  ];

  it('maps (along, depth) onto the map exactly as each grid side always has', () => {
    for (const side of ['N', 'S', 'E', 'W'] as const) {
      const frame = edgeFrameFor(side, 4, 6, 2, 3);
      for (const [along, depthTiles] of samples) {
        const want = sides[side](along, depthTiles * TILE_METERS);
        const got = frameToWorld(frame, along, depthTiles);
        expect(got.x, `${side} x`).toBe(want.x);
        expect(got.z, `${side} z`).toBe(want.z);
      }
    }
  });

  it('inverts on every grid side', () => {
    for (const side of ['N', 'S', 'E', 'W'] as const) {
      const frame = edgeFrameFor(side, 4, 6, 2, 3);
      for (const [along, depthTiles] of samples) {
        const p = frameToWorld(frame, along, depthTiles);
        const back = frameToLocal(frame, p.x, p.z);
        expect(back.along).toBeCloseTo(along, 9);
        expect(back.outwardM).toBeCloseTo(depthTiles * TILE_METERS, 9);
      }
    }
  });

  it('keeps the yaws each side always had and runs along X on the north and south sides', () => {
    expect(inwardYaw(edgeFrameFor('N', 0, 0, 1, 1))).toBe(0);
    expect(inwardYaw(edgeFrameFor('S', 0, 0, 1, 1))).toBe(Math.PI);
    expect(inwardYaw(edgeFrameFor('E', 0, 0, 1, 1))).toBe(-Math.PI / 2);
    expect(inwardYaw(edgeFrameFor('W', 0, 0, 1, 1))).toBe(Math.PI / 2);
    expect(outwardYaw(edgeFrameFor('N', 0, 0, 1, 1))).toBe(Math.PI);
    expect(frameAlongX(edgeFrameFor('N', 0, 0, 1, 1))).toBe(true);
    expect(frameAlongX(edgeFrameFor('S', 0, 0, 1, 1))).toBe(true);
    expect(frameAlongX(edgeFrameFor('E', 0, 0, 1, 1))).toBe(false);
    expect(frameAlongX(edgeFrameFor('W', 0, 0, 1, 1))).toBe(false);
    for (const side of ['N', 'S', 'E', 'W'] as const) {
      expect(isAxisAligned(edgeFrameFor(side, 0, 0, 1, 1))).toBe(true);
    }
  });

  it('turns a lot direction exactly on every grid side', () => {
    expect(frameDirection(edgeFrameFor('N', 0, 0, 1, 1), 1, 0)).toEqual({ x: 1, z: 0 });
    expect(frameDirection(edgeFrameFor('N', 0, 0, 1, 1), 0, 1)).toEqual({ x: 0, z: 1 });
    expect(frameDirection(edgeFrameFor('S', 0, 0, 1, 1), 0, 1)).toEqual({ x: 0, z: -1 });
    expect(frameDirection(edgeFrameFor('E', 0, 0, 1, 1), 1, 0)).toEqual({ x: 0, z: 1 });
    expect(frameDirection(edgeFrameFor('E', 0, 0, 1, 1), 0, 1)).toEqual({ x: -1, z: 0 });
    expect(frameDirection(edgeFrameFor('W', 0, 0, 1, 1), 0, 1)).toEqual({ x: 1, z: 0 });
  });
});

describe('edgeFrameOfParcel', () => {
  const parcel: ParcelFrame = { x: 212.5, z: -40.25, heading: 0.83 };
  const frame = edgeFrameOfParcel(parcel);

  it('runs along the parcel’s u with depth outward its −v, the one transform the parcel uses', () => {
    for (const [u, v] of [
      [0, 0],
      [11, 29],
      [40, -1.875],
    ]) {
      const want = toWorld(parcel, u!, v!);
      const got = frameToWorld(frame, u!, -v! / TILE_METERS);
      expect(got.x).toBeCloseTo(want.x, 9);
      expect(got.z).toBeCloseTo(want.z, 9);
    }
    expect(isAxisAligned(frame)).toBe(false);
  });

  it('turns a part’s +Z into the lot by the road’s heading, so +X runs along the street', () => {
    const yaw = inwardYaw(frame);
    expect(yaw).toBeCloseTo(-parcel.heading, 12);
    // three.js turns +X by yaw to (cos yaw, −sin yaw): the street's direction.
    expect(Math.cos(yaw)).toBeCloseTo(Math.cos(parcel.heading), 12);
    expect(-Math.sin(yaw)).toBeCloseTo(Math.sin(parcel.heading), 12);
    const inward = frameDirection(frame, 0, 1);
    expect(inward.x).toBeCloseTo(-Math.sin(parcel.heading), 12);
    expect(inward.z).toBeCloseTo(Math.cos(parcel.heading), 12);
  });

  it('is the north frame on a north-fronting grid lot', () => {
    const grid = edgeFrameOfParcel({ x: 80, z: 120, heading: 0 });
    for (const [along, depth] of [
      [3, 0.25],
      [17.5, -1],
    ]) {
      expect(frameToWorld(grid, along!, depth!)).toEqual(
        frameToWorld(edgeFrameFor('N', 4, 6, 2, 3), along!, depth!),
      );
    }
  });
});

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
