import { TILE_METERS } from '../shared/constants';

/**
 * Highest terrain height (world meters) anywhere under a building's tile
 * footprint. A footprint's tile-corner grid lands exactly on the terrain
 * mesh's own vertices, and the mesh surface is piecewise-linear between them,
 * so the maximum over that rectangle is always attained at one of these
 * corners — sampling them is exact, not an approximation.
 *
 * Seating a building base at this height guarantees no part of the terrain can
 * poke up through the body on a slope (the alternative, sampling only the
 * footprint centre, lets uphill corners spike through). `heightAt` takes world
 * meters; `tileX`/`tileZ` are the footprint's origin tile and `w`/`d` its size
 * in tiles.
 */
export function maxHeightOverFootprint(
  heightAt: (x: number, z: number) => number,
  tileX: number,
  tileZ: number,
  w: number,
  d: number,
): number {
  let max = -Infinity;
  for (let iz = 0; iz <= d; iz++) {
    const worldZ = (tileZ + iz) * TILE_METERS;
    for (let ix = 0; ix <= w; ix++) {
      const h = heightAt((tileX + ix) * TILE_METERS, worldZ);
      if (h > max) max = h;
    }
  }
  return max;
}
