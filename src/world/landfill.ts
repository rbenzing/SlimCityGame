/**
 * SlimCity landfill area paint: a per-tile membership layer (GridState.landfill)
 * painted/erased like world/districts.ts paints districts. Collected trash piles
 * up on these tiles; painting more expands the landfill's capacity.
 *
 * Unlike a district (which carries no gate), a tile can only JOIN a landfill if
 * it is empty land — in-bounds, not water, not carrying a road or a building —
 * since a real trash pile can't sit on the road network or on top of a building.
 * Erasing is ungated (any in-bounds tile can be cleared back to non-landfill).
 *
 * Pure, no three.js/DOM, worker-owned. Mirrors world/districts.ts's
 * command-agnostic contract: paintLandfill stamps membership onto every eligible
 * in-bounds tile of `tiles` and returns exactly the tiles actually applied, so
 * the worker builds the undo inverse the same way it does for paintDistrict.
 */
import type { TilePoint } from '../shared/types';

/**
 * The minimal slice of GridState this module needs. A real GridState satisfies
 * this structurally; tests hand-build just these layers — same narrow-interface
 * pattern as world/districts.ts's DistrictGridSource.
 */
export interface LandfillGridSource {
  size: number;
  landfill: Uint8Array;
  water: Uint8Array;
  roadTier: Uint8Array;
  buildingId: Uint32Array;
}

const indexOf = (size: number, x: number, z: number): number => z * size + x;

const inBoundsOf = (size: number, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < size && z < size;

/** True when (x, z) is empty land a landfill tile may occupy (no water/road/building). */
export function canLandfill(g: LandfillGridSource, x: number, z: number): boolean {
  if (!inBoundsOf(g.size, x, z)) return false;
  const i = indexOf(g.size, x, z);
  return g.water[i] === 0 && g.roadTier[i] === 0 && (g.buildingId[i] ?? 0) === 0;
}

/**
 * Paints (`on` = true) or erases (`on` = false) landfill membership onto every
 * eligible in-bounds tile of `tiles`. Painting skips tiles that fail
 * `canLandfill`; erasing applies to any in-bounds tile. Returns exactly the
 * tiles actually changed-or-kept (out-of-bounds / ineligible-for-paint dropped)
 * — same return contract as world/districts.ts's paintDistrict.
 */
export function paintLandfill(g: LandfillGridSource, tiles: TilePoint[], on: boolean): TilePoint[] {
  const applied: TilePoint[] = [];
  for (const t of tiles) {
    const { x, z } = t;
    if (!inBoundsOf(g.size, x, z)) continue;
    if (on) {
      if (!canLandfill(g, x, z)) continue;
      g.landfill[indexOf(g.size, x, z)] = 1;
    } else {
      g.landfill[indexOf(g.size, x, z)] = 0;
    }
    applied.push({ x, z });
  }
  return applied;
}

/** Whether (x, z) is currently a landfill tile; false if out of bounds. */
export function landfillAt(g: LandfillGridSource, x: number, z: number): boolean {
  if (!inBoundsOf(g.size, x, z)) return false;
  return (g.landfill[indexOf(g.size, x, z)] ?? 0) === 1;
}

/** Every landfill tile, row-major (z-major, x-minor). */
export function landfillTiles(g: LandfillGridSource): TilePoint[] {
  const { size } = g;
  const tiles: TilePoint[] = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (g.landfill[indexOf(size, x, z)] === 1) tiles.push({ x, z });
    }
  }
  return tiles;
}

/** Count of landfill tiles — the area's capacity is this × LANDFILL_CAPACITY_PER_TILE. */
export function landfillTileCount(g: LandfillGridSource): number {
  let count = 0;
  const n = g.size * g.size;
  for (let i = 0; i < n; i++) if (g.landfill[i] === 1) count += 1;
  return count;
}
