import { TILE_METERS } from '../shared/constants';

/**
 * Highest terrain height (world meters) under a world-metre rectangle that
 * need not fall on tile lines — a barn standing somewhere on its lot. The
 * surface is piecewise-linear across each tile, so its maximum over the
 * rectangle lies on a tile corner inside it or on the rectangle's own edge;
 * sampling both every tile line and every metre of the edge finds it.
 */
/**
 * Highest terrain under a body standing centred at (cx, cz) with local
 * extents w across and d deep, turned by `rotation` quarter turns. A body is
 * set back inside its footprint, so this is the ground it actually stands on;
 * sampling the whole footprint instead let a higher far corner — a street
 * climbing past the lot, a neighbour's plateau — lift the body off its own
 * levelled pad.
 */
export function maxHeightUnderBody(
  heightAt: (x: number, z: number) => number,
  cx: number,
  cz: number,
  w: number,
  d: number,
  rotation: number,
): number {
  const [ex, ez] = rotation % 2 === 1 ? [d, w] : [w, d];
  return maxHeightOverRect(heightAt, cx - ex / 2, cz - ez / 2, cx + ex / 2, cz + ez / 2);
}

export function maxHeightOverRect(
  heightAt: (x: number, z: number) => number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  return extremeHeightOverRect(heightAt, x0, z0, x1, z1, Math.max, -Infinity);
}

/**
 * Lowest terrain under a world-metre rectangle, found the same way: the
 * ground a draped park's hidden pad sinks to, so nothing of it shows through
 * the lawn laid on the slope above.
 */
export function minHeightOverRect(
  heightAt: (x: number, z: number) => number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  return extremeHeightOverRect(heightAt, x0, z0, x1, z1, Math.min, Infinity);
}

function extremeHeightOverRect(
  heightAt: (x: number, z: number) => number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  pick: (a: number, b: number) => number,
  start: number,
): number {
  const lines = (a: number, b: number): number[] => {
    const out = [a, b];
    for (let t = Math.ceil(a / TILE_METERS) * TILE_METERS; t < b; t += TILE_METERS) out.push(t);
    for (let t = Math.ceil(a); t < b; t += 1) out.push(t);
    return out;
  };
  let found = start;
  for (const x of lines(x0, x1)) {
    for (const z of lines(z0, z1)) found = pick(found, heightAt(x, z));
  }
  return found;
}
