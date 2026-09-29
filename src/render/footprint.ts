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
/**
 * Highest terrain height (world meters) under a world-metre rectangle that
 * need not fall on tile lines — a barn standing somewhere on its lot. The
 * surface is piecewise-linear across each tile, so its maximum over the
 * rectangle lies on a tile corner inside it or on the rectangle's own edge;
 * sampling both every tile line and every metre of the edge finds it.
 */
export function maxHeightOverRect(
  heightAt: (x: number, z: number) => number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const lines = (a: number, b: number): number[] => {
    const out = [a, b];
    for (let t = Math.ceil(a / TILE_METERS) * TILE_METERS; t < b; t += TILE_METERS) out.push(t);
    for (let t = Math.ceil(a); t < b; t += 1) out.push(t);
    return out;
  };
  let max = -Infinity;
  for (const x of lines(x0, x1)) {
    for (const z of lines(z0, z1)) max = Math.max(max, heightAt(x, z));
  }
  return max;
}

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
