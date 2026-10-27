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
import type { ParcelFrame, RoadProfile } from '../shared/types';
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
 * A lot edge's local coordinate frame: its origin is the world point of the
 * edge's start on the building's own footprint line, `heading` the direction
 * `along` runs (radians about +Y, 0 = +X), and `mirror` which way depth
 * leaves the edge: 1 turns outward a quarter left of `along`, as a parcel
 * frame's −v does; −1 turns it right. (along, depthTiles) map onto world
 * (x, z) from there. depthTiles = 0 sits exactly on the building's edge line;
 * positive depthTiles moves outward, toward the road side.
 */
export interface EdgeFrame {
  x: number;
  z: number;
  heading: number;
  mirror: 1 | -1;
}

/** The frame's unit axes: `a` along the edge, `o` outward across it. A quarter turn's cos and sin are exact. */
export function frameAxes(frame: EdgeFrame): { ax: number; az: number; ox: number; oz: number } {
  const ax = snap(Math.cos(frame.heading));
  const az = snap(Math.sin(frame.heading));
  return { ax, az, ox: frame.mirror * az, oz: frame.mirror * -ax };
}

/** A cos or sin within rounding of 0 or ±1 is that, so a grid frame's axes are exact. */
function snap(t: number): number {
  if (Math.abs(t) < AXIS_EPSILON) return 0;
  if (Math.abs(t - 1) < AXIS_EPSILON) return 1;
  if (Math.abs(t + 1) < AXIS_EPSILON) return -1;
  return t;
}

const AXIS_EPSILON = 1e-9;

/** Does the frame run on a grid axis — a quarter turn, so a box in it is drawn axis-aligned. */
export function isAxisAligned(frame: EdgeFrame): boolean {
  const { ax, az } = frameAxes(frame);
  return ax === 0 || az === 0;
}

/** On an axis-aligned frame, does `along` run on world X (else on world Z). */
export function frameAlongX(frame: EdgeFrame): boolean {
  return frameAxes(frame).az === 0;
}

/**
 * The frame of a grid lot's side: a north or south side runs east with its
 * origin at the lot's west corner, an east or west side runs south from the
 * lot's north corner; south and west mirror north and east, so a lot's
 * layout is the same picture on every side.
 */
export function edgeFrameFor(side: Side, x: number, z: number, w: number, d: number): EdgeFrame {
  const westX = x * TILE_METERS;
  const eastX = (x + w) * TILE_METERS;
  const northZ = z * TILE_METERS;
  const southZ = (z + d) * TILE_METERS;
  switch (side) {
    case 'N':
      return { x: westX, z: northZ, heading: 0, mirror: 1 };
    case 'S':
      return { x: westX, z: southZ, heading: 0, mirror: -1 };
    case 'E':
      return { x: eastX, z: northZ, heading: Math.PI / 2, mirror: 1 };
    case 'W':
      return { x: westX, z: northZ, heading: Math.PI / 2, mirror: -1 };
    default:
      throw new RangeError(`edgeFrameFor: unknown side ${side as string}`);
  }
}

/** The lot frame of a parcel turned to its street: `along` is the parcel's u, depth outward its −v. */
export function edgeFrameOfParcel(frame: ParcelFrame): EdgeFrame {
  return { x: frame.x, z: frame.z, heading: frame.heading, mirror: 1 };
}

export function frameToWorld(
  frame: EdgeFrame,
  along: number,
  depthTiles: number,
): { x: number; z: number } {
  const { ax, az, ox, oz } = frameAxes(frame);
  const depth = depthTiles * TILE_METERS;
  return { x: frame.x + along * ax + depth * ox, z: frame.z + along * az + depth * oz };
}

/** The inverse of `frameToWorld`, in metres: how far along the edge and how far outward across it a world point lies. */
export function frameToLocal(
  frame: EdgeFrame,
  x: number,
  z: number,
): { along: number; outwardM: number } {
  const { ax, az, ox, oz } = frameAxes(frame);
  const dx = x - frame.x;
  const dz = z - frame.z;
  return { along: dx * ax + dz * az, outwardM: dx * ox + dz * oz };
}

/** A lot direction turned into the world: `du` along the edge, `dv` inward, away from the street. */
export function frameDirection(
  frame: EdgeFrame,
  du: number,
  dv: number,
): { x: number; z: number } {
  const { ax, az, ox, oz } = frameAxes(frame);
  return { x: du * ax - dv * ox, z: du * az - dv * oz };
}

/** The yaw that points a part's front (+Z) into the lot, away from the street. */
export function inwardYaw(frame: EdgeFrame): number {
  const { ox, oz } = frameAxes(frame);
  return Math.atan2(0 - ox, 0 - oz);
}

/** The yaw that points a part's front (+Z) out to the street. */
export function outwardYaw(frame: EdgeFrame): number {
  return inwardYaw(frame) + Math.PI;
}
