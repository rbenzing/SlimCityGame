import { describe, expect, it } from 'vitest';
import { SEA_LEVEL, TERRAFORM_COST_PER_METER_TILE } from '../shared/constants';
import { RoadTier } from '../shared/types';
import type { GridState, TilePoint } from '../shared/types';
import { createGrid } from './grid';
import {
  applyHeightPatch,
  computeTerraformPatch,
  readHeightPatch,
  terraformFalloff,
  type TerraformCommand,
} from './terraform';

const idx = (x: number, z: number, size: number) => z * size + x;

function terraformCmd(
  overrides: Partial<TerraformCommand> & { mode: TerraformCommand['mode']; center: TilePoint },
): TerraformCommand {
  return { kind: 'terraform', radius: 3, strength: 2, ...overrides } as TerraformCommand;
}

describe('terraformFalloff (kernel shape/bounds)', () => {
  it('is 1 exactly at the center (distance 0)', () => {
    expect(terraformFalloff(0, 4)).toBe(1);
  });

  it('is 0 exactly at the radius boundary', () => {
    expect(terraformFalloff(4, 4)).toBe(0);
  });

  it('is 0 beyond the radius (clamped, never negative)', () => {
    expect(terraformFalloff(5, 4)).toBe(0);
    expect(terraformFalloff(1000, 4)).toBe(0);
  });

  it('eases smoothly and monotonically between the center and the edge', () => {
    const near = terraformFalloff(1, 4);
    const mid = terraformFalloff(2, 4);
    const far = terraformFalloff(3, 4);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeLessThan(1);
    // Exact smoothstep value at the midpoint: t=0.5 -> eased=0.5 -> falloff=0.5.
    expect(mid).toBeCloseTo(0.5, 10);
  });

  it('degenerates to a single point when radius <= 0 (defensive, never hit by TERRAFORM_BRUSH_MIN..MAX)', () => {
    expect(terraformFalloff(0, 0)).toBe(1);
    expect(terraformFalloff(0.01, 0)).toBe(0);
    expect(terraformFalloff(0, -5)).toBe(1);
    expect(terraformFalloff(1, -5)).toBe(0);
  });
});

describe('computeTerraformPatch — bounding box & row-major layout', () => {
  it('sizes the patch to the clamped bounding box and maps local (col,row) to world (x+col, z+row)', () => {
    const g = createGrid(5);
    g.height.fill(10);
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center: { x: 2, z: 2 }, radius: 1, strength: 1 }),
    );
    expect(result).not.toBeNull();
    expect(result!.patch.x).toBe(1);
    expect(result!.patch.z).toBe(1);
    expect(result!.patch.w).toBe(3);
    expect(result!.patch.h).toBe(3);
    // World tile (2,2) is local col=1,row=1 -> index 1*3+1=4.
    expect(result!.patch.heights[1 * 3 + 1]).toBeCloseTo(10.5, 6); // strength1 * falloff1 * 0.5
  });

  it('clamps the bounding box to the grid edge near a border', () => {
    const g = createGrid(5);
    g.height.fill(10);
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center: { x: 0, z: 0 }, radius: 1, strength: 1 }),
    );
    expect(result).not.toBeNull();
    expect(result!.patch.x).toBe(0);
    expect(result!.patch.z).toBe(0);
    expect(result!.patch.w).toBe(2);
    expect(result!.patch.h).toBe(2);
  });

  it('returns null when the brush bounding box falls entirely off the grid', () => {
    const g = createGrid(5);
    g.height.fill(10);
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center: { x: -100, z: -100 }, radius: 2, strength: 3 }),
    );
    expect(result).toBeNull();
  });
});

describe('computeTerraformPatch — structure exclusion', () => {
  it('leaves road and building tiles unchanged, even under the brush center, while nearby free tiles change', () => {
    const size = 9;
    const g = createGrid(size);
    g.height.fill(10);
    g.roadTier[idx(4, 4, size)] = RoadTier.TwoLane; // dead center of the brush
    g.buildingId[idx(4, 3, size)] = 7; // distance 1, would otherwise change a lot

    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center: { x: 4, z: 4 }, radius: 3, strength: 2 }),
    );
    expect(result).not.toBeNull();
    const { patch, inverse } = result!;

    const localOf = (x: number, z: number) => (z - patch.z) * patch.w + (x - patch.x);
    expect(patch.heights[localOf(4, 4)]).toBe(10); // road tile: unchanged
    expect(patch.heights[localOf(4, 3)]).toBe(10); // building tile: unchanged
    expect(inverse.heights[localOf(4, 4)]).toBe(10);
    expect(inverse.heights[localOf(4, 3)]).toBe(10);

    // A free tile at distance 2 (not excluded) DOES change, by the documented formula.
    const freeFalloff = terraformFalloff(2, 3);
    expect(freeFalloff).toBeGreaterThan(0);
    expect(patch.heights[localOf(4, 2)]).toBeCloseTo(10 + 2 * freeFalloff * 0.5, 5);
  });

  it('returns null when every tile the brush could affect is structure-excluded', () => {
    // radius=1: only the exact center tile has nonzero falloff (edge/corner
    // tiles sit at distance >= radius, i.e. falloff 0) — excluding the
    // center alone empties the whole affected set.
    const g = createGrid(3);
    g.height.fill(10);
    g.roadTier[idx(1, 1, 3)] = RoadTier.TwoLane;
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center: { x: 1, z: 1 }, radius: 1, strength: 3 }),
    );
    expect(result).toBeNull();
  });
});

describe('computeTerraformPatch — per-mode math', () => {
  function centeredGrid(
    size: number,
    flatHeight: number,
    spikeAt?: { x: number; z: number; height: number },
  ): GridState {
    const g = createGrid(size);
    g.height.fill(flatHeight);
    if (spikeAt) g.height[idx(spikeAt.x, spikeAt.z, size)] = spikeAt.height;
    return g;
  }

  it('raise: adds strength * falloff * 0.5 meters at the center (falloff 1)', () => {
    const g = centeredGrid(7, 10);
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center: { x: 3, z: 3 }, radius: 3, strength: 3 }),
    );
    expect(result).not.toBeNull();
    const local = (result!.patch.h >> 1) * result!.patch.w + (result!.patch.w >> 1); // center of an odd-sized patch
    expect(result!.patch.heights[local]).toBeCloseTo(10 + 3 * 1 * 0.5, 6); // 11.5
  });

  it('lower: subtracts strength * falloff * 0.5 meters at the center', () => {
    const g = centeredGrid(7, 10);
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'lower', center: { x: 3, z: 3 }, radius: 3, strength: 3 }),
    );
    expect(result).not.toBeNull();
    const local = (result!.patch.h >> 1) * result!.patch.w + (result!.patch.w >> 1);
    expect(result!.patch.heights[local]).toBeCloseTo(10 - 3 * 1 * 0.5, 6); // 8.5
  });

  it('level: lerps toward targetHeight by strength * falloff * 0.25 (sub-1 factor, no clamp)', () => {
    const g = centeredGrid(5, 10);
    const result = computeTerraformPatch(
      g,
      terraformCmd({
        mode: 'level',
        center: { x: 2, z: 2 },
        radius: 2,
        strength: 1,
        targetHeight: 16,
      }),
    );
    expect(result).not.toBeNull();
    const local = (result!.patch.h >> 1) * result!.patch.w + (result!.patch.w >> 1);
    // t = 1 * 1 * 0.25 = 0.25 -> 10 + (16-10)*0.25 = 11.5
    expect(result!.patch.heights[local]).toBeCloseTo(11.5, 6);
  });

  it('level: clamps the lerp factor to 1 so a strong stroke lands exactly on targetHeight, never past it', () => {
    const g = centeredGrid(5, 10);
    const result = computeTerraformPatch(
      g,
      terraformCmd({
        mode: 'level',
        center: { x: 2, z: 2 },
        radius: 2,
        strength: 5,
        targetHeight: 16,
      }),
    );
    expect(result).not.toBeNull();
    const local = (result!.patch.h >> 1) * result!.patch.w + (result!.patch.w >> 1);
    // Unclamped t = 5*1*0.25 = 1.25 would overshoot to 10+(16-10)*1.25=17.5 — must clamp to 16.
    expect(result!.patch.heights[local]).toBeCloseTo(16, 6);
  });

  it('level: returns null when targetHeight is missing', () => {
    const g = centeredGrid(5, 10);
    const cmd = {
      kind: 'terraform',
      mode: 'level',
      center: { x: 2, z: 2 },
      radius: 2,
      strength: 2,
    } as TerraformCommand;
    expect(computeTerraformPatch(g, cmd)).toBeNull();
  });

  it('smooth: lerps the center toward the 4-neighbor mean by strength * falloff * 0.25', () => {
    const g = centeredGrid(5, 10, { x: 2, z: 2, height: 20 });
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'smooth', center: { x: 2, z: 2 }, radius: 2, strength: 1 }),
    );
    expect(result).not.toBeNull();
    const local = (result!.patch.h >> 1) * result!.patch.w + (result!.patch.w >> 1);
    // Mean of 4 flat (=10) neighbors is 10. t = 1*1*0.25 = 0.25 -> 20 + (10-20)*0.25 = 17.5
    expect(result!.patch.heights[local]).toBeCloseTo(17.5, 6);
  });

  it('smooth: clamps the lerp factor to 1 so a max-strength stroke lands exactly on the neighbor mean', () => {
    const g = centeredGrid(5, 10, { x: 2, z: 2, height: 20 });
    const atOne = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'smooth', center: { x: 2, z: 2 }, radius: 2, strength: 4 }),
    );
    const overOne = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'smooth', center: { x: 2, z: 2 }, radius: 2, strength: 5 }),
    );
    expect(atOne).not.toBeNull();
    expect(overOne).not.toBeNull();
    const local = (atOne!.patch.h >> 1) * atOne!.patch.w + (atOne!.patch.w >> 1);
    // strength=4: t=4*1*0.25=1 exactly -> lands on the mean (10).
    expect(atOne!.patch.heights[local]).toBeCloseTo(10, 6);
    // strength=5 would overshoot to 20+(10-20)*1.25=7.5 without the clamp — must match the clamped strength=4 result instead.
    expect(overOne!.patch.heights[local]).toBeCloseTo(10, 6);
  });

  it('smooth: averages only in-bounds neighbors at a grid corner', () => {
    const g = createGrid(5);
    g.height.fill(10);
    g.height[idx(0, 0, 5)] = 30; // corner spike, only 2 in-bounds neighbors (E and S)
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'smooth', center: { x: 0, z: 0 }, radius: 2, strength: 1 }),
    );
    expect(result).not.toBeNull();
    const localOf = (x: number, z: number) =>
      (z - result!.patch.z) * result!.patch.w + (x - result!.patch.x);
    // Mean of the two in-bounds neighbors (both 10) is 10. t = 1*1*0.25 = 0.25 -> 30 + (10-30)*0.25 = 25
    expect(result!.patch.heights[localOf(0, 0)]).toBeCloseTo(25, 6);
  });
});

describe('computeTerraformPatch — cost formula', () => {
  it('charges TERRAFORM_COST_PER_METER_TILE * |delta| for a single affected tile', () => {
    // radius=1: only the exact center has nonzero falloff (see the exclusion
    // describe block above for the same reasoning) — an easy, exact hand check.
    const g = createGrid(5);
    g.height.fill(10);
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center: { x: 2, z: 2 }, radius: 1, strength: 1 }),
    );
    expect(result).not.toBeNull();
    expect(result!.changedTiles).toBe(1);
    // delta = 1*1*0.5 = 0.5 -> cost = 0.5 * 0.5 = 0.25
    expect(result!.cost).toBeCloseTo(TERRAFORM_COST_PER_METER_TILE * 0.5, 6);
  });

  it('sums |delta| across every changed tile for a wider brush', () => {
    const size = 9;
    const g = createGrid(size);
    g.height.fill(10);
    const center = { x: 4, z: 4 };
    const radius = 3;
    const strength = 2;
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center, radius, strength }),
    );
    expect(result).not.toBeNull();

    // Independently recompute the expected sum straight from the exported
    // kernel + the spec'd 0.5 coefficient, over the same bounding box.
    let expectedSum = 0;
    let expectedCount = 0;
    for (let z = 1; z <= 7; z++) {
      for (let x = 1; x <= 7; x++) {
        const dx = x - center.x;
        const dz = z - center.z;
        const falloff = terraformFalloff(Math.sqrt(dx * dx + dz * dz), radius);
        const delta = strength * falloff * 0.5;
        if (delta !== 0) {
          expectedSum += Math.abs(delta);
          expectedCount += 1;
        }
      }
    }
    expect(result!.changedTiles).toBe(expectedCount);
    expect(result!.cost).toBeCloseTo(TERRAFORM_COST_PER_METER_TILE * expectedSum, 3);
  });

  it('returns null (zero cost, zero changed tiles) for a zero-strength stroke', () => {
    const g = createGrid(5);
    g.height.fill(10);
    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center: { x: 2, z: 2 }, radius: 2, strength: 0 }),
    );
    expect(result).toBeNull();
  });
});

describe('applyHeightPatch — inverse exactly restores (float-exact)', () => {
  it('restores every height to its exact original float32 value after patch then inverse', () => {
    const size = 7;
    const g = createGrid(size);
    for (let i = 0; i < size * size; i++) {
      g.height[i] = ((i * 31) % 97) / 4 - 12; // deterministic, irregular fractional/negative values
    }
    g.roadTier[idx(3, 3, size)] = RoadTier.TwoLane; // exercise the excluded-tile path too
    const originalHeights = g.height.slice();

    const result = computeTerraformPatch(
      g,
      terraformCmd({ mode: 'raise', center: { x: 3, z: 3 }, radius: 3, strength: 4 }),
    );
    expect(result).not.toBeNull();

    applyHeightPatch(g, result!.patch);
    expect(Array.from(g.height)).not.toEqual(Array.from(originalHeights)); // the stroke actually did something

    applyHeightPatch(g, result!.inverse);
    expect(Array.from(g.height)).toEqual(Array.from(originalHeights)); // and undoing it restores bit-for-bit
  });

  it('restores exactly through a direct hand-built patch/inverse pair (terraformSet-shaped)', () => {
    const g = createGrid(4);
    g.height.set([
      1.5, -2.25, 3.75, 0, 8.125, -6.5, 2.5, 4.25, -1, 9.75, 0.25, -3.125, 6.625, -8.875, 5.5,
      1.125,
    ]);
    const before = g.height.slice();

    const patch = readHeightPatch(g, 1, 1, 2, 2); // capture current heights first
    const edited = patch.heights.map((v) => v + 100);
    applyHeightPatch(g, { ...patch, heights: edited });
    expect(Array.from(g.height)).not.toEqual(Array.from(before));

    applyHeightPatch(g, patch); // patch still holds the pre-edit capture — the exact inverse
    expect(Array.from(g.height)).toEqual(Array.from(before));
  });
});

describe('applyHeightPatch — water re-derive & tree clearing', () => {
  it('floods newly-submerged tiles, clears their trees, and leaves already-water/already-dry tiles correctly alone', () => {
    const size = 4;
    const g = createGrid(size);
    g.height.fill(5); // everything above SEA_LEVEL (0) to start
    g.trees[idx(1, 1, size)] = 200; // stays dry
    g.trees[idx(2, 1, size)] = 150; // about to submerge
    g.height[idx(3, 1, size)] = -2; // already below sea level
    g.water[idx(3, 1, size)] = 1;
    g.trees[idx(3, 1, size)] = 77; // already-water tile that (unusually) still carries trees

    applyHeightPatch(g, {
      x: 1,
      z: 1,
      w: 3,
      h: 1,
      heights: new Float32Array([5, -3, -2]), // (1,1) stays dry; (2,1) newly floods; (3,1) stays flooded
    });

    expect(g.height[idx(1, 1, size)]).toBe(5);
    expect(g.water[idx(1, 1, size)]).toBe(0);
    expect(g.trees[idx(1, 1, size)]).toBe(200);

    expect(g.height[idx(2, 1, size)]).toBe(-3);
    expect(g.water[idx(2, 1, size)]).toBe(1);
    expect(g.trees[idx(2, 1, size)]).toBe(0); // newly submerged: cleared

    expect(g.height[idx(3, 1, size)]).toBe(-2);
    expect(g.water[idx(3, 1, size)]).toBe(1);
    expect(g.trees[idx(3, 1, size)]).toBe(77); // already water before this patch: left alone
  });

  it('un-floods a tile raised back above sea level', () => {
    const g = createGrid(3);
    g.height[idx(1, 1, 3)] = -1;
    g.water[idx(1, 1, 3)] = 1;

    applyHeightPatch(g, { x: 1, z: 1, w: 1, h: 1, heights: new Float32Array([2]) });

    expect(g.water[idx(1, 1, 3)]).toBe(0);
  });

  it('treats height exactly at SEA_LEVEL as land, not water (strict less-than)', () => {
    const g = createGrid(3);
    applyHeightPatch(g, { x: 1, z: 1, w: 1, h: 1, heights: new Float32Array([SEA_LEVEL]) });
    expect(g.water[idx(1, 1, 3)]).toBe(0);
    applyHeightPatch(g, {
      x: 1,
      z: 1,
      w: 1,
      h: 1,
      heights: new Float32Array([SEA_LEVEL - 0.0001]),
    });
    expect(g.water[idx(1, 1, 3)]).toBe(1);
  });

  it('skips cells outside the grid without throwing', () => {
    const g = createGrid(3);
    expect(() =>
      applyHeightPatch(g, { x: 2, z: 2, w: 3, h: 3, heights: new Float32Array(9).fill(-5) }),
    ).not.toThrow();
    expect(g.height[idx(2, 2, 3)]).toBe(-5);
  });
});

describe('readHeightPatch', () => {
  it('captures the current heights over a rect, row-major', () => {
    const size = 4;
    const g = createGrid(size);
    g.height.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const patch = readHeightPatch(g, 1, 1, 2, 2);
    expect(patch.x).toBe(1);
    expect(patch.z).toBe(1);
    expect(Array.from(patch.heights)).toEqual([5, 6, 9, 10]); // (1,1) (2,1) (1,2) (2,2)
  });

  it('reads 0 for cells outside the grid (defensive)', () => {
    const g = createGrid(3);
    g.height.fill(9);
    const patch = readHeightPatch(g, 2, 2, 2, 2); // extends 1 col/row past the edge
    // local (0,0)=(2,2) in-bounds=9; local (1,0)=(3,2) OOB=0; local (0,1)=(2,3) OOB=0; local(1,1)=(3,3) OOB=0
    expect(Array.from(patch.heights)).toEqual([9, 0, 0, 0]);
  });
});
