/** Finding water on the map a series is standing on, from the game's own water bodies. */

/** WaterKind values (src/shared/waterbodies.ts). */
export const OCEAN = 1;
export const LAKE = 2;
export const RIVER = 3;

/** Every tile index of one kind. */
export const tilesOf = (b, kind) => {
  const out = [];
  for (let i = 0; i < b.kind.length; i++) if (b.kind[i] === kind) out.push(i);
  return out;
};

/** The 4-connected run of tiles of one kind that holds tile `start`. */
export function runOf(b, start) {
  const n = b.size;
  const kind = b.kind[start];
  const seen = new Set([start]);
  const list = [start];
  for (let h = 0; h < list.length; h++) {
    const i = list[h];
    const x = i % n;
    const z = (i - x) / n;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const j = nz * n + nx;
      if (b.kind[j] === kind && !seen.has(j)) {
        seen.add(j);
        list.push(j);
      }
    }
  }
  return list;
}

/** The tile of `list` nearest its own centroid, as { x, z }. */
export function centre(list, n) {
  const xs = list.map((i) => i % n);
  const zs = list.map((i) => Math.floor(i / n));
  const cx = xs.reduce((a, v) => a + v, 0) / list.length;
  const cz = zs.reduce((a, v) => a + v, 0) / list.length;
  let best = 0;
  for (let k = 1; k < list.length; k++)
    if (Math.hypot(xs[k] - cx, zs[k] - cz) < Math.hypot(xs[best] - cx, zs[best] - cz)) best = k;
  return { x: xs[best], z: zs[best] };
}

export const readBodies = (page) => page.evaluate(() => window.__slimcity.readWaterBodies());
