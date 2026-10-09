/**
 * A lot's frontage: which of its edges faces a road, the frame everything laid
 * out along that edge is measured in, and how much of the road tile beyond it
 * is grass verge and how much sidewalk.
 *
 * Coordinate conventions (matching the rest of src/render):
 *  - `roadAt(tileX, tileZ)` takes TILE coordinates (integers) and answers
 *    "is this grid tile a road tile".
 *  - Frames are in WORLD METERS.
 *
 * Pure: no three.js, no scene.
 */
import { isStreetTier, RoadTier } from '../shared/types';
import type { RoadProfile } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { carriagewayHalfWidthOf, carriagewayShiftOf, kerbWidthOf } from '../shared/roadprofile';
import { carriagewayHalfWidthMeters, curbWidthMeters } from './roadsmesh';
import { findRoadFacingEdge, type RoadFacingEdge, type Side } from '../shared/roadedge';

/**
 * Grass verge between a building's footprint edge and the near edge of the
 * adjacent street's sidewalk. The road tile is TILE_METERS wide and centered
 * on the carriageway, so the verge is whatever is left over once the
 * carriageway half-width and the sidewalk are taken out — 0 on wide tiers
 * whose sidewalk already reaches the tile boundary.
 *
 * Half of a corridor nothing divides is the exception: it stands against the
 * edge it shares with its other half, which leaves its far side — the only
 * side a lot can front — that much more verge.
 */
export function vergeDepthMeters(tier: RoadTier, profile?: RoadProfile): number {
  const half = profile ? carriagewayHalfWidthOf(profile) : carriagewayHalfWidthMeters(tier);
  // Whatever the paved strip does not take. Measured against a full footway
  // instead, a road that keeps only a kerb leaves a band that is neither verge
  // nor pavement and nothing covers.
  const paved = sidewalkDepthMeters(tier, profile);
  const shift = profile ? Math.abs(carriagewayShiftOf(profile)) : 0;
  return Math.max(0, TILE_METERS / 2 + shift - half - paved);
}

/** Depth of the sidewalk band a curb cut crosses, clamped to what fits inside the road tile. */
export function sidewalkDepthMeters(tier: RoadTier, profile?: RoadProfile): number {
  // The road's own answer for how wide the paved strip beside it is. Worked
  // out again here it drifts from it: a motorway keeps a kerb rather than a
  // pavement, and a tile with room to spare would otherwise hand it one.
  return profile ? kerbWidthOf(profile) : curbWidthMeters(tier);
}

/** The street on one tile, as the lot beside it reads it. */
export interface StreetTile {
  /** Grass between the tile's edge and the back of its sidewalk, in metres. */
  vergeM: number;
  /** The paved strip beside the carriageway — a footway, or a bare kerb — in metres. */
  sidewalkM: number;
}

/** The street on a tile, or null where the tile holds none: no road, or a railway. */
export type StreetLookup = (tileX: number, tileZ: number) => StreetTile | null;

/** A lookup that finds no street anywhere — the default for renderers built without one. */
export const NO_STREETS: StreetLookup = () => null;

/**
 * The street lookup for a grid: a tile's tier decides whether it is a street
 * at all, and its own cross-section, where it carries a composed one, how wide
 * its verge and sidewalk are.
 */
export function streetLookupOf(
  tierAt: (tileX: number, tileZ: number) => RoadTier,
  profileAt: (tileX: number, tileZ: number) => RoadProfile | null,
): StreetLookup {
  return (x, z) => {
    const tier = tierAt(x, z);
    if (!isStreetTier(tier)) return null;
    const profile = profileAt(x, z) ?? undefined;
    return {
      vergeM: vergeDepthMeters(tier, profile),
      sidewalkM: sidewalkDepthMeters(tier, profile),
    };
  };
}

export { findRoadFacingEdge, type RoadFacingEdge, type Side } from '../shared/roadedge';

const SIDES_CLOCKWISE: readonly Side[] = ['N', 'E', 'S', 'W'];

/**
 * A side on the map, named in the frame of a building turned `rotation`
 * quarter turns: the side of its own unrotated footprint that ends up there.
 * A quarter turn carries the local east side to the map's north.
 */
export function localSideOf(side: Side, rotation: 0 | 1 | 2 | 3): Side {
  return SIDES_CLOCKWISE[(SIDES_CLOCKWISE.indexOf(side) + rotation) % 4]!;
}

/** The edge a home fronts: the same search, over streets only — a drive never meets a railway. */
export function findStreetFacingEdge(
  x: number,
  z: number,
  w: number,
  d: number,
  street: StreetLookup,
): RoadFacingEdge | null {
  return findRoadFacingEdge(x, z, w, d, (tx, tz) => street(tx, tz) !== null);
}

/**
 * A side's local coordinate frame: `edgeStart` is the along-edge world
 * origin, `buildingLine` is the perpendicular world coordinate of the
 * building's own footprint edge, and `outwardSign`/`alongX` describe how
 * (along, depthTiles) map onto world (x, z). depthTiles = 0 sits exactly on
 * the building's edge line; positive depthTiles moves outward, toward the
 * road side.
 */
export interface EdgeFrame {
  edgeStart: number;
  buildingLine: number;
  outwardSign: 1 | -1;
  alongX: boolean;
}

export function edgeFrameFor(side: Side, x: number, z: number, w: number, d: number): EdgeFrame {
  const westX = x * TILE_METERS;
  const eastX = (x + w) * TILE_METERS;
  const northZ = z * TILE_METERS;
  const southZ = (z + d) * TILE_METERS;
  switch (side) {
    case 'N':
      return { edgeStart: westX, buildingLine: northZ, outwardSign: -1, alongX: true };
    case 'S':
      return { edgeStart: westX, buildingLine: southZ, outwardSign: 1, alongX: true };
    case 'E':
      return { edgeStart: northZ, buildingLine: eastX, outwardSign: 1, alongX: false };
    case 'W':
      return { edgeStart: northZ, buildingLine: westX, outwardSign: -1, alongX: false };
    default:
      throw new RangeError(`edgeFrameFor: unknown side ${side as string}`);
  }
}

export function frameToWorld(
  frame: EdgeFrame,
  along: number,
  depthTiles: number,
): { x: number; z: number } {
  const perp = frame.buildingLine + frame.outwardSign * depthTiles * TILE_METERS;
  return frame.alongX
    ? { x: frame.edgeStart + along, z: perp }
    : { x: perp, z: frame.edgeStart + along };
}
