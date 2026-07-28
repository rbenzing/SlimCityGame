/**
 * SlimCity terrain sculpting (landscaping & water):
 * pure height-patch math for the four landscaping brushes (raise, lower,
 * level, smooth) plus the grid-side effects of committing an edit (water
 * mask re-derive, tree clearing on newly-submerged tiles). No three.js/DOM
 * here — sim-worker-owned, unit-testable without a GPU, same convention as
 * world/grid.ts and world/roads.ts.
 *
 * `HeightPatch` is deliberately NOT imported from shared/types.ts (module
 * agents must not edit that file): it is the same shape, structurally, as
 * both the `terraformSet` command payload and each SimSnapshot.heightPatches
 * entry, so it is assignable to either without a named type existing there.
 */
import { SEA_LEVEL, TERRAFORM_COST_PER_METER_TILE } from '../shared/constants';
import { RoadTier } from '../shared/types';
import type { Command, GridState } from '../shared/types';

/** The 'terraform' member of the Command union — one brush stroke. */
export type TerraformCommand = Extract<Command, { kind: 'terraform' }>;
/** The 'terraformSet' member of the Command union — a direct patch restore. */
export type TerraformSetCommand = Extract<Command, { kind: 'terraformSet' }>;

/**
 * A rectangular region of heights, row-major w*h: local (col, row) sits at
 * index row * w + col, i.e. world tile (x + col, z + row) — the exact layout
 * documented on the `terraformSet` command and SimSnapshot.heightPatches.
 */
export interface HeightPatch {
  x: number;
  z: number;
  w: number;
  h: number;
  heights: Float32Array;
}

export interface TerraformPatchResult {
  /** NEW heights over the affected rect (excluded/untouched tiles keep their original value). */
  patch: HeightPatch;
  /** PREVIOUS heights over the same rect — the exact undo of `patch`. */
  inverse: HeightPatch;
  /** cents charged: TERRAFORM_COST_PER_METER_TILE * sum(|delta height|) over tiles that actually changed. */
  cost: number;
  /** Count of tiles whose height actually changed (excludes falloff==0 and structure-excluded tiles). */
  changedTiles: number;
}

// ---------------------------------------------------------------------------
// Per-mode math coefficients
// ---------------------------------------------------------------------------

/** raise/lower: +/- strength * falloff * RATE meters, applied once per stroke. */
const RAISE_LOWER_RATE = 0.5;
/**
 * level/smooth: lerp factor toward the target/mean is strength * falloff *
 * RATE, clamped to 1 so a single stroke never overshoots past the target
 * (a lerp factor > 1 would push the height past its destination, which
 * "lerp toward" does not mean).
 */
const LERP_RATE = 0.25;

/** Orthogonal neighbor offsets: +N, +E, +S, +W (same convention as world/grid.ts). */
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Smoothstep falloff over the brush disc: 1 at the center, 0 at (and beyond)
 * `radius`, eased (zero slope at both ends) in between. `radius <= 0`
 * degenerates to a single point (falloff 1 exactly at distance 0, else 0) —
 * a defensive guard never hit by the documented TERRAFORM_BRUSH_MIN..MAX
 * range, but it keeps this pure function total over any numeric input.
 */
export function terraformFalloff(distance: number, radius: number): number {
  if (radius <= 0) return distance <= 0 ? 1 : 0;
  const t = Math.min(1, Math.max(0, distance / radius));
  const eased = t * t * (3 - 2 * t);
  return 1 - eased;
}

/** strength * falloff * LERP_RATE, clamped to [0, 1] (see LERP_RATE doc above). */
function lerpFactor(strength: number, falloff: number): number {
  return Math.min(1, Math.max(0, strength * falloff * LERP_RATE));
}

/** 4-orthogonal-neighbor mean height, averaging only in-bounds neighbors (edge/corner tiles average fewer). */
function neighborMeanHeight(g: GridState, x: number, z: number): number {
  let sum = 0;
  let count = 0;
  for (const [ox, oz] of NEIGHBOR_OFFSETS) {
    const nx = x + ox;
    const nz = z + oz;
    if (nx < 0 || nz < 0 || nx >= g.size || nz >= g.size) continue;
    sum += g.height[nz * g.size + nx]!;
    count += 1;
  }
  return count > 0 ? sum / count : g.height[z * g.size + x]!;
}

function nextHeight(
  g: GridState,
  x: number,
  z: number,
  oldH: number,
  mode: TerraformCommand['mode'],
  falloff: number,
  strength: number,
  targetHeight: number | undefined,
): number {
  switch (mode) {
    case 'raise':
      return oldH + strength * falloff * RAISE_LOWER_RATE;
    case 'lower':
      return oldH - strength * falloff * RAISE_LOWER_RATE;
    case 'level': {
      // The caller (computeTerraformPatch) already rejects the whole stroke
      // when targetHeight is missing; this branch just keeps TS satisfied.
      if (targetHeight === undefined) return oldH;
      return oldH + (targetHeight - oldH) * lerpFactor(strength, falloff);
    }
    case 'smooth': {
      const mean = neighborMeanHeight(g, x, z);
      return oldH + (mean - oldH) * lerpFactor(strength, falloff);
    }
  }
}

/**
 * One brush stroke -> a height patch. Tiles carrying a road
 * (roadTier !== RoadTier.None) or a building (buildingId !== 0) are EXCLUDED
 * from the kernel: their height is copied through unchanged in both `patch`
 * and `inverse`, and they never count toward `changedTiles`/`cost`.
 *
 * Returns null when nothing would change: the brush's bounding box falls
 * entirely off the grid, every covered tile is structure-excluded, every
 * falloff-scaled delta rounds to exactly zero, or ('level' only) the
 * required `targetHeight` is missing.
 */
export function computeTerraformPatch(
  g: GridState,
  cmd: TerraformCommand,
): TerraformPatchResult | null {
  const { mode, center, radius, strength, targetHeight } = cmd;
  if (mode === 'level' && targetHeight === undefined) return null;

  const r = Math.max(0, radius);
  const minX = Math.max(0, Math.floor(center.x - r));
  const maxX = Math.min(g.size - 1, Math.ceil(center.x + r));
  const minZ = Math.max(0, Math.floor(center.z - r));
  const maxZ = Math.min(g.size - 1, Math.ceil(center.z + r));
  if (minX > maxX || minZ > maxZ) return null;

  const w = maxX - minX + 1;
  const h = maxZ - minZ + 1;
  const heights = new Float32Array(w * h);
  const invHeights = new Float32Array(w * h);
  let changedTiles = 0;
  let deltaSum = 0;

  for (let row = 0; row < h; row++) {
    const z = minZ + row;
    for (let col = 0; col < w; col++) {
      const x = minX + col;
      const idx = z * g.size + x;
      const local = row * w + col;
      const oldH = g.height[idx]!;
      invHeights[local] = oldH;

      const excluded = g.roadTier[idx] !== RoadTier.None || g.buildingId[idx] !== 0;
      if (excluded) {
        heights[local] = oldH;
        continue;
      }

      const dx = x - center.x;
      const dz = z - center.z;
      const falloff = terraformFalloff(Math.sqrt(dx * dx + dz * dz), r);
      heights[local] = nextHeight(g, x, z, oldH, mode, falloff, strength, targetHeight);

      const newH = heights[local]!;
      if (newH !== oldH) {
        changedTiles += 1;
        deltaSum += Math.abs(newH - oldH);
      }
    }
  }

  if (changedTiles === 0) return null;

  return {
    patch: { x: minX, z: minZ, w, h, heights },
    inverse: { x: minX, z: minZ, w, h, heights: invHeights },
    cost: TERRAFORM_COST_PER_METER_TILE * deltaSum,
    changedTiles,
  };
}

/**
 * Writes `patch.heights` into `g.height`, then re-derives `g.water` (height <
 * SEA_LEVEL) and zeroes `g.trees` on tiles that just BECAME water within the
 * patch rect. Used both for a fresh terraform stroke and a terraformSet
 * restore (undo/redo) — same shape, same effects, either direction. Cells
 * outside the grid (defensive; never produced by computeTerraformPatch or
 * readHeightPatch) are skipped rather than throwing.
 */
export function applyHeightPatch(g: GridState, patch: HeightPatch): void {
  const { x: baseX, z: baseZ, w, h, heights } = patch;
  for (let row = 0; row < h; row++) {
    const z = baseZ + row;
    if (z < 0 || z >= g.size) continue;
    for (let col = 0; col < w; col++) {
      const x = baseX + col;
      if (x < 0 || x >= g.size) continue;
      const idx = z * g.size + x;
      const newHeight = heights[row * w + col]!;
      g.height[idx] = newHeight;

      const wasWater = g.water[idx] !== 0;
      const isWater = newHeight < SEA_LEVEL;
      g.water[idx] = isWater ? 1 : 0;
      if (isWater && !wasWater) {
        g.trees[idx] = 0;
      }
    }
  }
}

/**
 * Captures the CURRENT heights under `{x,z,w,h}` as a HeightPatch — used by
 * the worker to build the exact counter-patch (inverse) before applying a
 * direct `terraformSet` restore, so redoing/undoing again stays exact. Cells
 * outside the grid (defensive) read 0.
 */
export function readHeightPatch(
  g: GridState,
  x: number,
  z: number,
  w: number,
  h: number,
): HeightPatch {
  const heights = new Float32Array(w * h);
  for (let row = 0; row < h; row++) {
    const gz = z + row;
    for (let col = 0; col < w; col++) {
      const gx = x + col;
      if (gx < 0 || gz < 0 || gx >= g.size || gz >= g.size) continue;
      heights[row * w + col] = g.height[gz * g.size + gx]!;
    }
  }
  return { x, z, w, h, heights };
}
