/**
 * Which edge of a lot faces its road, read the same by the sim and the
 * renderer: the edge a lot's car park opens onto, and the kerb of the street
 * across it that the lot fronts. Tile coordinates throughout; pure.
 */

export type Side = 'N' | 'E' | 'S' | 'W';

export interface RoadFacingEdge {
  side: Side;
  /** Length of the selected edge, in tiles (w for N/S, d for E/W). */
  edgeTiles: number;
  /** First road tile found along that side — the street the lot's driveway meets. */
  roadTileX: number;
  roadTileZ: number;
}

/** How many road tiles the strip holds, and the index of the first of them. */
function roadsInStrip(
  startX: number,
  startZ: number,
  length: number,
  axis: 'x' | 'z',
  roadAt: (x: number, z: number) => boolean,
): { count: number; first: number } {
  let count = 0;
  let first = -1;
  for (let i = 0; i < length; i++) {
    const tx = axis === 'x' ? startX + i : startX;
    const tz = axis === 'z' ? startZ + i : startZ;
    if (!roadAt(tx, tz)) continue;
    if (first < 0) first = i;
    count++;
  }
  return { count, first };
}

/**
 * Finds the building's road-facing footprint edge: the side whose
 * immediately-adjacent tile strip holds the most road tiles, the street the
 * lot runs along. So a lot on a bend or beside the end of a cul-de-sac faces
 * the street it borders for the longest stretch, not whichever side happens
 * to be searched first; sides tied on road tiles are broken N>E>S>W.
 * Returns null when no side is road-adjacent — callers park zero cars.
 */
export function findRoadFacingEdge(
  x: number,
  z: number,
  w: number,
  d: number,
  roadAt: (x: number, z: number) => boolean,
): RoadFacingEdge | null {
  if (w < 1 || d < 1) return null;

  const north = roadsInStrip(x, z - 1, w, 'x', roadAt);
  const east = roadsInStrip(x + w, z, d, 'z', roadAt);
  const south = roadsInStrip(x, z + d, w, 'x', roadAt);
  const west = roadsInStrip(x - 1, z, d, 'z', roadAt);
  const longest = Math.max(north.count, east.count, south.count, west.count);
  if (longest === 0) return null;

  if (north.count === longest) {
    return { side: 'N', edgeTiles: w, roadTileX: x + north.first, roadTileZ: z - 1 };
  }
  if (east.count === longest) {
    return { side: 'E', edgeTiles: d, roadTileX: x + w, roadTileZ: z + east.first };
  }
  if (south.count === longest) {
    return { side: 'S', edgeTiles: w, roadTileX: x + south.first, roadTileZ: z + d };
  }
  return { side: 'W', edgeTiles: d, roadTileX: x - 1, roadTileZ: z + west.first };
}

/** The side of the street a kerb is on, in world order: `low` is the low-coordinate kerb. */
export type KerbSide = 'low' | 'high';

/** Which kerb of the street across an edge a lot faces: the lot lies on that kerb's side. */
export function kerbSideFacing(side: Side): KerbSide {
  // The road is north of a lot on its N edge, so the lot is the road's
  // high-z side; on its E edge the road is east, so the lot is its low-x side.
  return side === 'N' || side === 'W' ? 'high' : 'low';
}
