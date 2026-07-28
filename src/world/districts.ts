/**
 * SlimCity district paint: a per-tile
 * district id layer, painted/erased exactly like world/grid.ts's setZones
 * paints zones — pure, no three.js/DOM, worker-owned (GridState.district,
 * src/shared/types.ts).
 *
 * Unlike zone painting, district assignment carries NO buildability/frontage
 * gate: any in-bounds tile — water, road, building, empty, already-zoned —
 * can belong to a district, since a district is an administrative/policy
 * region, not a construction rule.
 *
 * Mirrors world/grid.ts setZones's exact contract: paintDistrict stamps
 * `districtId` onto every in-bounds tile of `tiles` and returns exactly the
 * tiles actually applied (a subset when some fall out of bounds). The undo
 * inverse is built the SAME WAY the worker already builds it for paintZone
 * (see worker.entry.ts's paintZone handler): capture each requested tile's
 * PREVIOUS district id before calling paintDistrict, then group the applied
 * tiles by that previous id into one `{ kind: 'paintDistrict', districtId:
 * prev, tiles }` inverse Command per previous id. paintDistrict itself stays
 * command-agnostic (like setZones) so this module never imports Command.
 */
import type { TilePoint } from '../shared/types';

/**
 * The minimal read-only+writable slice of GridState this module needs. A
 * real GridState satisfies this structurally; tests can hand-build just this
 * layer — mirrors world/zonable.ts's ZonableGridSource / render/zonegrid.ts's
 * ZoneGridSource narrow-interface pattern.
 */
export interface DistrictGridSource {
  size: number;
  district: Uint8Array;
}

const indexOf = (size: number, x: number, z: number): number => z * size + x;

const inBoundsOf = (size: number, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < size && z < size;

/**
 * Stamps `districtId` (0 = erase back to unassigned, 1..255 = District.id)
 * onto every in-bounds tile of `tiles`, overwriting whatever district id (if
 * any) was there before. Returns exactly the tiles actually applied — i.e.
 * `tiles` minus any that were out of bounds — same return contract as
 * world/grid.ts's setZones.
 */
export function paintDistrict(
  g: DistrictGridSource,
  districtId: number,
  tiles: TilePoint[],
): TilePoint[] {
  const applied: TilePoint[] = [];
  for (const t of tiles) {
    const { x, z } = t;
    if (!inBoundsOf(g.size, x, z)) continue;
    g.district[indexOf(g.size, x, z)] = districtId;
    applied.push({ x, z });
  }
  return applied;
}

/** The district id (0 = unassigned) currently painted at (x, z); 0 if out of bounds. */
export function districtAt(g: DistrictGridSource, x: number, z: number): number {
  if (!inBoundsOf(g.size, x, z)) return 0;
  return g.district[indexOf(g.size, x, z)] ?? 0;
}

/** Every tile currently carrying `districtId`, row-major (z-major, x-minor). */
export function districtTiles(g: DistrictGridSource, districtId: number): TilePoint[] {
  const { size } = g;
  const tiles: TilePoint[] = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (g.district[indexOf(size, x, z)] === districtId) tiles.push({ x, z });
    }
  }
  return tiles;
}
