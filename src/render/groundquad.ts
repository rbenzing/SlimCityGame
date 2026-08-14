/**
 * Terrain-conforming ground quads — the one way this city lays anything flat on
 * the ground: aprons, driveways, lot pads, parking bays.
 *
 * A ground surface drawn as a single four-corner quad is only correct where the
 * ground is flat. Over any slope the quad is a plane through its own corners
 * while the terrain between them curves, so a rise bulges straight through the
 * middle of it and a dip leaves it hanging in the air. The fix is to subdivide
 * to cells small enough that the terrain has no curve left to hide inside one,
 * sample the real surface at every cell corner, and split each cell on the SAME
 * diagonal the terrain mesh uses — a quad split the other way crosses the
 * terrain's own triangles and clips along the seam even when all four corners
 * are correct.
 *
 * Everything here is pure given `heightAt`, and takes world meters.
 */

/**
 * Max sub-cell size, in meters. The terrain carries a vertex every tile, so
 * cells this size sit well inside one and the sampled corners reproduce the
 * terrain's own interpolation rather than approximating it.
 */
export const CONFORM_MAX_CELL_M = 2;

/** The terrain PlaneGeometry's diagonal runs (x0,z1)-(x1,z0); ours must match. */
function pushCell(
  positions: number[],
  colors: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yOffset: number,
  color: readonly [number, number, number],
  heightAt: (x: number, z: number) => number,
): void {
  const y00 = heightAt(x0, z0) + yOffset;
  const y10 = heightAt(x1, z0) + yOffset;
  const y11 = heightAt(x1, z1) + yOffset;
  const y01 = heightAt(x0, z1) + yOffset;
  positions.push(x0, y00, z0, x0, y01, z1, x1, y10, z0);
  positions.push(x0, y01, z1, x1, y11, z1, x1, y10, z0);
  for (let i = 0; i < 6; i++) colors.push(color[0], color[1], color[2]);
}

/**
 * Appends an axis-aligned world-space rect to `positions`/`colors` as a fan of
 * terrain-conforming cells. `x0`/`z0` must be the low corner.
 */
export function pushConformingQuad(
  positions: number[],
  colors: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yOffset: number,
  color: readonly [number, number, number],
  heightAt: (x: number, z: number) => number,
  maxCellM: number = CONFORM_MAX_CELL_M,
): void {
  const nx = Math.max(1, Math.ceil((x1 - x0) / maxCellM));
  const nz = Math.max(1, Math.ceil((z1 - z0) / maxCellM));
  const stepX = (x1 - x0) / nx;
  const stepZ = (z1 - z0) / nz;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const cx0 = x0 + ix * stepX;
      const cz0 = z0 + iz * stepZ;
      pushCell(
        positions,
        colors,
        cx0,
        cz0,
        cx0 + stepX,
        cz0 + stepZ,
        yOffset,
        color,
        heightAt,
      );
    }
  }
}

/** Vertices a conforming quad of this size will produce — for budgeting a merged mesh. */
export function conformingQuadVertexCount(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  maxCellM: number = CONFORM_MAX_CELL_M,
): number {
  const nx = Math.max(1, Math.ceil((x1 - x0) / maxCellM));
  const nz = Math.max(1, Math.ceil((z1 - z0) / maxCellM));
  return nx * nz * 6;
}
