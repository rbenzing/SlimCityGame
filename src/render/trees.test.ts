import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  TreeRenderer,
  treeCountForDensity,
  isNearWater,
  speciesFor,
  clusterNoise,
  standMaturity,
  treeCountForTile,
  scaleRangeForStand,
  sampleTileOffset,
  hueValueJitter,
  seasonalTint,
  TREE_DENSITY_THRESHOLD,
  HIGH_DENSITY_THRESHOLD,
  MAX_TREES_PER_TILE,
  MAX_TREES_PER_TILE_DENSE,
  MAX_TREES_PER_TILE_SCATTERED,
  SCALE_MIN,
  SCALE_MAX,
  YOUNG_SCALE_MIN,
  YOUNG_SCALE_MAX,
  MATURE_SCALE_MIN,
  MATURE_SCALE_MAX,
  JITTER_MAX_FRACTION,
  MIN_SAME_TILE_SEPARATION_FRACTION,
  JITTER_RESAMPLE_ATTEMPTS,
  SAPLING_OUTLIER_PROBABILITY,
  CLUSTER_NOISE_MAX,
  CLUSTER_NOISE_CELL_TILES,
  LEAN_MAX_RADIANS,
  HUE_JITTER_MAX,
  VALUE_JITTER_MAX,
  PINE_ELEVATION_METERS,
  SHRUB_DENSITY_MAX,
  WATER_PROXIMITY_TILES,
  WINTER_TINT,
  SPRING_TINT,
  SUMMER_TINT,
  AUTUMN_TINT,
  type TreeSpecies,
} from './trees';
import { MapData } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

const flatHeightAt = (): number => 0;
const SPECIES_LIST: readonly TreeSpecies[] = ['broadleaf', 'pine', 'poplar', 'shrub'];

function makeMap(size: number, trees: number[], water: number[], height?: number[]): MapData {
  return {
    name: 'test',
    size,
    height: height ? Float32Array.from(height) : new Float32Array(size * size),
    water: Uint8Array.from(water),
    trees: Uint8Array.from(trees),
    seaLevel: 0,
    spawn: { x: 0, z: 0 },
  };
}

function instancedMeshesOf(scene: THREE.Scene): THREE.InstancedMesh[] {
  return scene.children.filter(
    (c) => (c as THREE.InstancedMesh).isInstancedMesh,
  ) as THREE.InstancedMesh[];
}

function isZeroScale(m: THREE.Matrix4): boolean {
  const e = m.elements;
  return e[0] === 0 && e[5] === 0 && e[10] === 0;
}

function decomposeAt(
  mesh: THREE.InstancedMesh,
  slot: number,
): { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 } {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(slot, m);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

function colorAt(mesh: THREE.InstancedMesh, slot: number): THREE.Color {
  const c = new THREE.Color();
  mesh.getColorAt(slot, c);
  return c;
}

/**
 * Sums treeCountForTile across every non-water tile of `map` for `seed` --
 * mirrors TreeRenderer's own land/water iteration (skip water, else
 * treeCountForTile(density, x, z, seed)), so tests can assert against the
 * documented per-tile formula instead of a hand-derived magic number that
 * cluster-noise modulation would
 * immediately make stale. treeCountForTile's own formula correctness is
 * independently covered by the dedicated describe block below.
 */
function expectedTotalTreeCount(map: MapData, seed: number): number {
  let total = 0;
  for (let z = 0; z < map.size; z++) {
    for (let x = 0; x < map.size; x++) {
      const idx = z * map.size + x;
      if ((map.water[idx] ?? 0) !== 0) continue;
      total += treeCountForTile(map.trees[idx] ?? 0, x, z, seed);
    }
  }
  return total;
}

/**
 * Minimal deterministic PRNG for feeding sampleTileOffset in tests. NOT the
 * production mulberry32 (that stays private to trees.ts, reached only via the
 * public API) -- this is test-only infrastructure for exercising
 * sampleTileOffset's rng parameter with a real, well-distributed, repeatable
 * stream (a splitmix-style hash-based generator).
 */
function testRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x9e3779b9) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('treeCountForDensity', () => {
  it('places zero trees at/under the threshold', () => {
    expect(treeCountForDensity(0)).toBe(0);
    expect(treeCountForDensity(TREE_DENSITY_THRESHOLD)).toBe(0); // exclusive boundary
  });

  it('follows the existing floor(density/96) rule (capped at 2) below the high-density band', () => {
    expect(treeCountForDensity(TREE_DENSITY_THRESHOLD + 1)).toBe(1); // 97 -> 1
    expect(treeCountForDensity(191)).toBe(1);
    expect(treeCountForDensity(192)).toBe(2);
    expect(treeCountForDensity(HIGH_DENSITY_THRESHOLD - 1)).toBe(MAX_TREES_PER_TILE); // 199 -> 2
  });

  it('places up to 3 trees/tile at density >= 200 (the new high-density rule)', () => {
    expect(treeCountForDensity(HIGH_DENSITY_THRESHOLD)).toBe(MAX_TREES_PER_TILE_DENSE);
    expect(treeCountForDensity(255)).toBe(MAX_TREES_PER_TILE_DENSE);
  });
});

describe('isNearWater', () => {
  it('detects a water tile at the query tile itself', () => {
    const map = makeMap(
      5,
      new Array(25).fill(0),
      (() => {
        const w = new Array(25).fill(0);
        w[2 * 5 + 2] = 1; // (2,2)
        return w;
      })(),
    );
    expect(isNearWater(map, 2, 2, WATER_PROXIMITY_TILES)).toBe(true);
  });

  it('detects water exactly at the radius boundary (Chebyshev distance)', () => {
    const w = new Array(36).fill(0);
    w[3 * 6 + 3] = 1; // water at (3,3)
    const map = makeMap(6, new Array(36).fill(0), w);
    expect(isNearWater(map, 1, 3, WATER_PROXIMITY_TILES)).toBe(true); // dx=2, dz=0 -> distance 2
    expect(isNearWater(map, 1, 1, WATER_PROXIMITY_TILES)).toBe(true); // dx=2, dz=2 -> distance 2
  });

  it('returns false once outside the radius', () => {
    const w = new Array(64).fill(0);
    w[3 * 8 + 3] = 1; // water at (3,3)
    const map = makeMap(8, new Array(64).fill(0), w);
    expect(isNearWater(map, 6, 3, WATER_PROXIMITY_TILES)).toBe(false); // dx=3 -> outside radius 2
    expect(isNearWater(map, 0, 6, WATER_PROXIMITY_TILES)).toBe(false);
  });

  it('a smaller radius shrinks the detection window', () => {
    const w = new Array(36).fill(0);
    w[3 * 6 + 3] = 1;
    const map = makeMap(6, new Array(36).fill(0), w);
    expect(isNearWater(map, 5, 3, WATER_PROXIMITY_TILES)).toBe(true); // distance 2, radius 2 -> true
    expect(isNearWater(map, 5, 3, 1)).toBe(false); // distance 2, radius 1 -> false
  });

  it('never throws when the search box clips the map edge', () => {
    const map = makeMap(4, new Array(16).fill(0), new Array(16).fill(0));
    expect(() => isNearWater(map, 0, 0, WATER_PROXIMITY_TILES)).not.toThrow();
    expect(isNearWater(map, 0, 0, WATER_PROXIMITY_TILES)).toBe(false);
  });

  it('returns false when there is no water anywhere on the map', () => {
    const map = makeMap(10, new Array(100).fill(0), new Array(100).fill(0));
    expect(isNearWater(map, 5, 5, WATER_PROXIMITY_TILES)).toBe(false);
  });
});

describe('speciesFor', () => {
  it('resolves to pine when only the elevation condition holds, regardless of seed', () => {
    expect(speciesFor(PINE_ELEVATION_METERS + 1, false, 200, 3, 3, 1)).toBe('pine');
    expect(speciesFor(PINE_ELEVATION_METERS + 1, false, 200, 3, 3, 999)).toBe('pine');
  });

  it('resolves to poplar when only the water-proximity condition holds', () => {
    expect(speciesFor(5, true, 200, 3, 3, 1)).toBe('poplar');
    expect(speciesFor(5, true, 200, 3, 3, 999)).toBe('poplar');
  });

  it('resolves to shrub when only the density condition holds', () => {
    expect(speciesFor(5, false, SHRUB_DENSITY_MAX - 1, 3, 3, 1)).toBe('shrub');
    expect(speciesFor(5, false, SHRUB_DENSITY_MAX - 1, 3, 3, 999)).toBe('shrub');
  });

  it('falls back to broadleaf when no special condition holds', () => {
    expect(speciesFor(PINE_ELEVATION_METERS, false, SHRUB_DENSITY_MAX, 3, 3, 1)).toBe('broadleaf');
    expect(speciesFor(5, false, 200, 3, 3, 1)).toBe('broadleaf');
  });

  it('is an exact boundary at the elevation threshold (> not >=)', () => {
    expect(speciesFor(PINE_ELEVATION_METERS, false, 200, 3, 3, 1)).toBe('broadleaf');
  });

  it('is an exact boundary at the density threshold (< not <=)', () => {
    expect(speciesFor(5, false, SHRUB_DENSITY_MAX, 3, 3, 1)).toBe('broadleaf');
  });

  it('is deterministic: same inputs always produce the same species', () => {
    const a = speciesFor(25, true, 50, 7, 11, 42);
    const b = speciesFor(25, true, 50, 7, 11, 42);
    expect(a).toBe(b);
  });

  it('when multiple bands overlap, the hash(x,z,seed) tiebreak picks only among the eligible bands (never broadleaf)', () => {
    // pine + poplar + shrub all eligible simultaneously at this tile.
    const results = new Set<TreeSpecies>();
    for (let seed = 0; seed < 60; seed++) {
      const species = speciesFor(30, true, 40, 9, 13, seed);
      expect(['pine', 'poplar', 'shrub']).toContain(species);
      results.add(species);
    }
    // The tiebreak actually mixes bands rather than always favoring one.
    expect(results.size).toBeGreaterThan(1);
  });

  it('the overlap tiebreak is itself deterministic per (x,z,seed)', () => {
    const a = speciesFor(30, true, 40, 9, 13, 7);
    const b = speciesFor(30, true, 40, 9, 13, 7);
    expect(a).toBe(b);
  });

  it('different tile coordinates can resolve differently under the same overlap + seed', () => {
    const results = new Set<TreeSpecies>();
    for (let x = 0; x < 40; x++) {
      results.add(speciesFor(30, true, 40, x, 5, 7));
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Natural scatter: cluster-noise density modulation, widened
// rejection-resampled jitter, and stand-correlated maturity/scale.
// ---------------------------------------------------------------------------

describe('clusterNoise', () => {
  it('stays within [0, CLUSTER_NOISE_MAX)', () => {
    for (let seed = 0; seed < 5; seed++) {
      for (let z = 0; z < 20; z++) {
        for (let x = 0; x < 20; x++) {
          const v = clusterNoise(x, z, seed);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(CLUSTER_NOISE_MAX);
        }
      }
    }
  });

  it('is deterministic for the same (x, z, seed)', () => {
    expect(clusterNoise(7, 13, 42)).toBe(clusterNoise(7, 13, 42));
  });

  it('varies across tile coordinates for a fixed seed (a field, not a constant)', () => {
    const values = new Set<number>();
    for (let x = 0; x < 32; x++) values.add(Number(clusterNoise(x, 0, 1).toFixed(6)));
    expect(values.size).toBeGreaterThan(1);
  });

  it('varies across seeds for the same tile', () => {
    const values = new Set<number>();
    for (let seed = 0; seed < 16; seed++) values.add(Number(clusterNoise(5, 5, seed).toFixed(6)));
    expect(values.size).toBeGreaterThan(1);
  });

  it('is smooth (bilinear-interpolated lattice hash), not a blocky per-tile jump', () => {
    const a = clusterNoise(10, 10, 5);
    const b = clusterNoise(10.001, 10, 5);
    const c = clusterNoise(10, 10.001, 5);
    expect(Math.abs(b - a)).toBeLessThan(0.01);
    expect(Math.abs(c - a)).toBeLessThan(0.01);
  });

  it('has a feature size within the spec-documented ~6-10 tile range', () => {
    expect(CLUSTER_NOISE_CELL_TILES).toBeGreaterThanOrEqual(6);
    expect(CLUSTER_NOISE_CELL_TILES).toBeLessThanOrEqual(10);
  });
});

describe('standMaturity', () => {
  it('stays within [0, 1)', () => {
    for (let seed = 0; seed < 5; seed++) {
      for (let z = 0; z < 20; z++) {
        for (let x = 0; x < 20; x++) {
          const v = standMaturity(x, z, seed);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      }
    }
  });

  it('is deterministic for the same (x, z, seed)', () => {
    expect(standMaturity(4, 9, 3)).toBe(standMaturity(4, 9, 3));
  });

  it('varies across tile coordinates for a fixed seed (stands differ, though each is internally smooth)', () => {
    const values = new Set<number>();
    for (let x = 0; x < 32; x++) values.add(Number(standMaturity(x, 0, 1).toFixed(6)));
    expect(values.size).toBeGreaterThan(1);
  });

  it('is decorrelated from clusterNoise (independent seed salt -- not a copy of the same field)', () => {
    let differs = false;
    for (let x = 0; x < 16 && !differs; x++) {
      for (let z = 0; z < 16 && !differs; z++) {
        if (Math.abs(standMaturity(x, z, 7) - clusterNoise(x, z, 7)) > 1e-6) differs = true;
      }
    }
    expect(differs).toBe(true);
  });
});

describe('treeCountForTile', () => {
  it('is always 0 at/under the density threshold, regardless of position, seed, or cluster noise', () => {
    for (let seed = 0; seed < 8; seed++) {
      expect(treeCountForTile(TREE_DENSITY_THRESHOLD, 3, 3, seed)).toBe(0);
      expect(treeCountForTile(0, 10, 10, seed)).toBe(0);
    }
  });

  it('matches the documented exact formula: clamp(round(base * clusterNoise), 0, MAX_TREES_PER_TILE_SCATTERED)', () => {
    const samples: Array<[number, number, number, number]> = [
      [140, 1, 0, 12345],
      [200, 2, 0, 12345],
      [255, 3, 0, 12345],
      [200, 0, 0, 1],
      [100, 2, 2, 1],
      [200, 5, 5, 777],
      [255, 0, 0, 4],
      [255, 0, 0, 6],
    ];
    for (const [density, x, z, seed] of samples) {
      const base = treeCountForDensity(density);
      const expected = Math.min(
        MAX_TREES_PER_TILE_SCATTERED,
        Math.max(0, Math.round(base * clusterNoise(x, z, seed))),
      );
      expect(treeCountForTile(density, x, z, seed)).toBe(expected);
    }
  });

  it('never exceeds MAX_TREES_PER_TILE_SCATTERED (4) even at maximum density and high cluster noise', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(treeCountForTile(255, 0, 0, seed)).toBeLessThanOrEqual(MAX_TREES_PER_TILE_SCATTERED);
      expect(treeCountForTile(255, 0, 0, seed)).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic for the same inputs', () => {
    expect(treeCountForTile(200, 6, 6, 55)).toBe(treeCountForTile(200, 6, 6, 55));
  });

  it('over a uniform high-density synthetic map, per-tile counts have variance > 0 and include both 0s and 4s (the v1 lattice fix)', () => {
    const size = 48;
    const seed = 1;
    const density = 200; // base 3 (>= HIGH_DENSITY_THRESHOLD): clusterNoise alone decides clearings vs. thickets
    const counts: number[] = [];
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        counts.push(treeCountForTile(density, x, z, seed));
      }
    }
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((acc, c) => acc + (c - mean) ** 2, 0) / counts.length;

    expect(variance).toBeGreaterThan(0);
    expect(counts).toContain(0); // a clearing
    expect(counts).toContain(4); // a thicket
  });
});

describe('scaleRangeForStand', () => {
  it('returns exactly the young range at maturity 0 (non-outlier)', () => {
    expect(scaleRangeForStand(0, false)).toEqual([YOUNG_SCALE_MIN, YOUNG_SCALE_MAX]);
  });

  it('returns exactly the mature range at maturity 1 (non-outlier)', () => {
    expect(scaleRangeForStand(1, false)).toEqual([MATURE_SCALE_MIN, MATURE_SCALE_MAX]);
  });

  it('lerps linearly at intermediate maturity', () => {
    const [min, max] = scaleRangeForStand(0.5, false);
    expect(min).toBeCloseTo((YOUNG_SCALE_MIN + MATURE_SCALE_MIN) / 2, 9);
    expect(max).toBeCloseTo((YOUNG_SCALE_MAX + MATURE_SCALE_MAX) / 2, 9);
  });

  it('forces the young range for a sapling outlier regardless of stand maturity', () => {
    expect(scaleRangeForStand(1, true)).toEqual([YOUNG_SCALE_MIN, YOUNG_SCALE_MAX]);
    expect(scaleRangeForStand(0.5, true)).toEqual([YOUNG_SCALE_MIN, YOUNG_SCALE_MAX]);
  });

  it('matches the spec-documented young/mature bounds exactly (UI-SPEC 6.12: young 0.45-0.9, mature 1.0-1.6)', () => {
    expect(YOUNG_SCALE_MIN).toBe(0.45);
    expect(YOUNG_SCALE_MAX).toBe(0.9);
    expect(MATURE_SCALE_MIN).toBe(1.0);
    expect(MATURE_SCALE_MAX).toBe(1.6);
  });
});

describe('sampleTileOffset', () => {
  const BOUND = JITTER_MAX_FRACTION * TILE_METERS;
  const MIN_SEP = MIN_SAME_TILE_SEPARATION_FRACTION * TILE_METERS;

  it('accepts the very first draw immediately when there is nothing to avoid (2 rng calls)', () => {
    let calls = 0;
    const rng = (): number => {
      calls++;
      return 0.75;
    };
    const [x, z] = sampleTileOffset(rng, [], MIN_SEP);
    expect(calls).toBe(2);
    expect(x).toBeCloseTo((0.75 * 2 - 1) * BOUND, 9);
    expect(z).toBeCloseTo((0.75 * 2 - 1) * BOUND, 9);
  });

  it('stays within +/-JITTER_MAX_FRACTION of a tile on both axes, empty or crowded', () => {
    const rng = testRng(1234);
    const existing: Array<[number, number]> = [];
    for (let i = 0; i < 50; i++) {
      const [x, z] = sampleTileOffset(rng, existing, MIN_SEP);
      expect(Math.abs(x)).toBeLessThanOrEqual(BOUND + 1e-9);
      expect(Math.abs(z)).toBeLessThanOrEqual(BOUND + 1e-9);
      existing.push([x, z]);
    }
  });

  it('rejects a too-close candidate and resamples from the SAME rng stream until the minimum separation is met', () => {
    // Attempt 1 draws an offset ~0.21m from the existing tree (well under a
    // 4m minimum separation) and must be rejected; attempt 2 draws one that
    // clears it and must be accepted.
    const draws = [0.51, 0.51, 0.9, 0.1];
    let i = 0;
    const rng = (): number => draws[i++]!;
    const existing: ReadonlyArray<readonly [number, number]> = [[0, 0]];

    const [x, z] = sampleTileOffset(rng, existing, MIN_SEP);

    expect(i).toBe(4); // consumed both attempts (2 draws each) -- did not stop at the too-close first draw
    expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(MIN_SEP);
  });

  it('falls back to the least-crowded candidate after exhausting JITTER_RESAMPLE_ATTEMPTS when no candidate can clear the minimum separation', () => {
    let calls = 0;
    const inner = testRng(42);
    const rng = (): number => {
      calls++;
      return inner();
    };
    // Larger than any two points within the +/-0.46-tile bound can ever be apart, so every attempt is rejected.
    const impossibleMinSep = 1000;
    const existing: ReadonlyArray<readonly [number, number]> = [[0, 0]];

    let result: [number, number] | undefined;
    expect(() => {
      result = sampleTileOffset(rng, existing, impossibleMinSep);
    }).not.toThrow();

    expect(calls).toBe(JITTER_RESAMPLE_ATTEMPTS * 2); // spent every attempt before giving up
    expect(Math.abs(result![0])).toBeLessThanOrEqual(BOUND + 1e-9);
    expect(Math.abs(result![1])).toBeLessThanOrEqual(BOUND + 1e-9);
  });

  it('is deterministic: an identical rng stream and existing offsets produce an identical result', () => {
    const existing: ReadonlyArray<readonly [number, number]> = [
      [1, 1],
      [-2, 3],
    ];
    const a = sampleTileOffset(testRng(99), existing, MIN_SEP);
    const b = sampleTileOffset(testRng(99), existing, MIN_SEP);
    expect(a).toEqual(b);
  });
});

describe('Natural scatter v2 tuning constants (UI-SPEC 6.12)', () => {
  it('widens jitter to +/-0.46 of a tile', () => {
    expect(JITTER_MAX_FRACTION).toBe(0.46);
  });

  it('never lets the widened jitter bleed into a neighboring tile', () => {
    expect(JITTER_MAX_FRACTION * 2).toBeLessThan(1);
  });

  it('sets the minimum same-tile separation to ~0.25 of a tile', () => {
    expect(MIN_SAME_TILE_SEPARATION_FRACTION).toBe(0.25);
  });

  it('caps cluster-noise modulation at 1.6x', () => {
    expect(CLUSTER_NOISE_MAX).toBe(1.6);
  });

  it('caps the scattered per-tile count at 4', () => {
    expect(MAX_TREES_PER_TILE_SCATTERED).toBe(4);
  });

  it('keeps the sapling-outlier chance occasional, not dominant', () => {
    expect(SAPLING_OUTLIER_PROBABILITY).toBeGreaterThan(0);
    expect(SAPLING_OUTLIER_PROBABILITY).toBeLessThan(0.5);
  });
});

describe('hueValueJitter', () => {
  it('is the identity multiplier at zero jitter', () => {
    const [r, g, b] = hueValueJitter(0, 0);
    expect(r).toBeCloseTo(1, 9);
    expect(g).toBeCloseTo(1, 9);
    expect(b).toBeCloseTo(1, 9);
  });

  it('matches the hand-computed values at the jitter extremes', () => {
    const [r1, g1, b1] = hueValueJitter(1, 1);
    expect(r1).toBeCloseTo(1 + HUE_JITTER_MAX + VALUE_JITTER_MAX, 9);
    expect(g1).toBeCloseTo(1 + VALUE_JITTER_MAX, 9);
    expect(b1).toBeCloseTo(1 - HUE_JITTER_MAX + VALUE_JITTER_MAX, 9);

    const [r2, g2, b2] = hueValueJitter(-1, -1);
    expect(r2).toBeCloseTo(1 - HUE_JITTER_MAX - VALUE_JITTER_MAX, 9);
    expect(g2).toBeCloseTo(1 - VALUE_JITTER_MAX, 9);
    expect(b2).toBeCloseTo(1 + HUE_JITTER_MAX - VALUE_JITTER_MAX, 9);
  });

  it('stays within the +/-6%-ish bound across the whole input domain', () => {
    for (let i = 0; i <= 10; i++) {
      const hueJitter = -1 + (i / 10) * 2;
      for (let j = 0; j <= 10; j++) {
        const valueJitter = -1 + (j / 10) * 2;
        const [r, g, b] = hueValueJitter(hueJitter, valueJitter);
        expect(r).toBeGreaterThanOrEqual(1 - HUE_JITTER_MAX - VALUE_JITTER_MAX - 1e-9);
        expect(r).toBeLessThanOrEqual(1 + HUE_JITTER_MAX + VALUE_JITTER_MAX + 1e-9);
        expect(g).toBeGreaterThanOrEqual(1 - VALUE_JITTER_MAX - 1e-9);
        expect(g).toBeLessThanOrEqual(1 + VALUE_JITTER_MAX + 1e-9);
        expect(b).toBeGreaterThanOrEqual(1 - HUE_JITTER_MAX - VALUE_JITTER_MAX - 1e-9);
        expect(b).toBeLessThanOrEqual(1 + HUE_JITTER_MAX + VALUE_JITTER_MAX + 1e-9);
      }
    }
  });
});

describe('seasonalTint', () => {
  it('matches the authored tint exactly at each anchor month', () => {
    expect(seasonalTint(1)).toEqual(WINTER_TINT);
    expect(seasonalTint(4)).toEqual(SPRING_TINT);
    expect(seasonalTint(7)).toEqual(SUMMER_TINT);
    expect(seasonalTint(10)).toEqual(AUTUMN_TINT);
  });

  it('interpolates halfway between two adjacent anchors', () => {
    const [r, g, b] = seasonalTint(2.5); // halfway winter(1) -> spring(4)
    expect(r).toBeCloseTo((WINTER_TINT[0] + SPRING_TINT[0]) / 2, 9);
    expect(g).toBeCloseTo((WINTER_TINT[1] + SPRING_TINT[1]) / 2, 9);
    expect(b).toBeCloseTo((WINTER_TINT[2] + SPRING_TINT[2]) / 2, 9);
  });

  it('wraps continuously from autumn (Oct) back to winter (Jan) across December', () => {
    const [r, g, b] = seasonalTint(12); // 2/3 of the way from autumn(10) to winter(13=1)
    const t = 2 / 3;
    expect(r).toBeCloseTo(AUTUMN_TINT[0] + (WINTER_TINT[0] - AUTUMN_TINT[0]) * t, 9);
    expect(g).toBeCloseTo(AUTUMN_TINT[1] + (WINTER_TINT[1] - AUTUMN_TINT[1]) * t, 9);
    expect(b).toBeCloseTo(AUTUMN_TINT[2] + (WINTER_TINT[2] - AUTUMN_TINT[2]) * t, 9);
  });

  it('treats month 13 the same as month 1, and month 0 the same as month 12', () => {
    expect(seasonalTint(13)).toEqual(seasonalTint(1));
    expect(seasonalTint(0)).toEqual(seasonalTint(12));
  });
});

// ---------------------------------------------------------------------------
// TreeRenderer
// ---------------------------------------------------------------------------

describe('TreeRenderer', () => {
  it('adds exactly one InstancedMesh per species (4 total), even when some species place nothing', () => {
    const map = makeMap(2, [200, 0, 0, 0], [0, 0, 0, 0]); // single broadleaf tile
    const scene = new THREE.Scene();
    const renderer = new TreeRenderer(scene, flatHeightAt);
    renderer.build(map, 1);

    expect(instancedMeshesOf(scene).length).toBe(4);
    for (const species of SPECIES_LIST) {
      expect(renderer.meshFor(species)).not.toBeNull();
    }
  });

  it('places cluster-noise-modulated tree counts only on land tiles above the density threshold (base rule: floor(density/96), capped at 2, or 3 at high density)', () => {
    // size 8 (not 4): the water-exclusion tile must sit outside
    // WATER_PROXIMITY_TILES of the other test tiles, or they'd legitimately
    // become poplar-eligible and this test would no longer be isolating the
    // density/threshold rule (species rules get their own dedicated test).
    const size = 8;
    const trees = new Array(size * size).fill(0);
    const water = new Array(size * size).fill(0);
    trees[0] = 0; // (0,0) none
    trees[1] = 140; // (1,0) -> base floor(140/96) = 1 (kept < 128's shrub band to stay broadleaf)
    trees[2] = 200; // (2,0) -> high-density rule -> base 3
    trees[3] = 255; // (3,0) -> high-density rule -> base 3 (cap)
    trees[1 * size + 0] = 96; // (0,1) exactly the threshold -> excluded ("> 96", not ">=")
    trees[7 * size + 7] = 250; // (7,7) high density but...
    water[7 * size + 7] = 1; //          ...on water -> excluded regardless of density (far from the other tiles, so it can't make them poplar-eligible)

    const map = makeMap(size, trees, water);
    const scene = new THREE.Scene();
    const renderer = new TreeRenderer(scene, flatHeightAt);
    renderer.build(map, 12345);

    // Flat elevation, no water nearby, all densities >= 128 -> every placed
    // tree resolves to broadleaf (species rules are covered separately).
    // per-tile counts are cluster-noise-modulated (see treeCountForTile), so
    // the total is no longer a flat
    // floor(density/96) sum done by hand; it's exactly the documented formula
    // summed across every land tile (treeCountForTile's own formula
    // correctness is independently covered above), which also proves the
    // threshold- and water-exclusion still gate correctly through build().
    expect(renderer.meshFor('broadleaf')?.count).toBe(expectedTotalTreeCount(map, 12345));
    expect(renderer.meshFor('pine')?.count).toBe(0);
    expect(renderer.meshFor('poplar')?.count).toBe(0);
    expect(renderer.meshFor('shrub')?.count).toBe(0);
  });

  it('assigns species per-tile matching speciesFor, on a hand-built multi-band map', () => {
    const size = 10;
    const trees = new Array(size * size).fill(0);
    const water = new Array(size * size).fill(0);
    const height = new Array(size * size).fill(0);

    // pine: high elevation, ordinary density, far from the only water tile.
    const pineIdx = 1 * size + 1;
    height[pineIdx] = 25;
    trees[pineIdx] = 200; // -> base 3

    // poplar: adjacent to water, ordinary (non-shrub) density.
    const poplarIdx = 4 * size + 4;
    trees[poplarIdx] = 150; // -> base 1
    const waterIdx = 4 * size + 5; // (5,4), Chebyshev distance 1 from (4,4)
    water[waterIdx] = 1;

    // shrub: low density, flat, far from water.
    const shrubIdx = 1 * size + 7;
    trees[shrubIdx] = 100; // -> base 1

    // broadleaf: flat, ordinary density, far from water (zero special bands).
    const broadleafIdx = 7 * size + 7;
    trees[broadleafIdx] = 180; // -> base 1

    const map = makeMap(size, trees, water, height);
    const scene = new THREE.Scene();
    const renderer = new TreeRenderer(scene, flatHeightAt);
    renderer.build(map, 42);

    // These exact counts are the cluster-noise-modulated result (treeCountForTile)
    // for these specific tile coordinates + seed=42 -- they happen to equal each
    // tile's base count here, but that's this seed's draw, not a guarantee; the
    // base rule and the exact modulation formula each have their own dedicated,
    // seed-independent tests above.
    expect(renderer.meshFor('pine')?.count).toBe(3);
    expect(renderer.meshFor('poplar')?.count).toBe(1);
    expect(renderer.meshFor('shrub')?.count).toBe(1);
    expect(renderer.meshFor('broadleaf')?.count).toBe(1);

    // Every species' merged geometry is a real, paintable shape (position +
    // baked vertex color), not a stub.
    for (const species of SPECIES_LIST) {
      const mesh = renderer.meshFor(species);
      expect(mesh).not.toBeNull();
      const position = mesh?.geometry.getAttribute('position');
      const color = mesh?.geometry.getAttribute('color');
      expect(position?.count ?? 0).toBeGreaterThan(0);
      expect(color?.count ?? 0).toBe(position?.count ?? -1);
    }
  });

  it('jitters within +/-0.46 of a tile, scales within the stand-maturity range, and leans within the small lean bound -- deterministic: two builds with the same seed produce identical matrices', () => {
    const size = 10;
    const trees = new Array(size * size).fill(200); // every tile: dense broadleaf forest
    const water = new Array(size * size).fill(0);
    const map = makeMap(size, trees, water);

    const sceneA = new THREE.Scene();
    const rendererA = new TreeRenderer(sceneA, flatHeightAt);
    rendererA.build(map, 777);
    const sceneB = new THREE.Scene();
    const rendererB = new TreeRenderer(sceneB, flatHeightAt);
    rendererB.build(map, 777);

    const meshA = rendererA.meshFor('broadleaf');
    const meshB = rendererB.meshFor('broadleaf');
    expect(meshA).not.toBeNull();
    expect(meshB).not.toBeNull();
    const count = meshA?.count ?? 0;
    // Cluster-noise modulation makes the per-tile total position-dependent,
    // so assert the documented formula
    // summed across the grid, with sane bounds as a defense-in-depth check.
    expect(count).toBe(expectedTotalTreeCount(map, 777));
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(size * size * MAX_TREES_PER_TILE_SCATTERED);

    const up = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const a = decomposeAt(meshA!, i);
      const b = decomposeAt(meshB!, i);

      // Same seed -> identical placement.
      expect(a.position.toArray()).toEqual(b.position.toArray());
      expect(a.quaternion.toArray()).toEqual(b.quaternion.toArray());
      expect(a.scale.toArray()).toEqual(b.scale.toArray());

      expect(a.scale.x).toBeGreaterThanOrEqual(SCALE_MIN);
      expect(a.scale.x).toBeLessThanOrEqual(SCALE_MAX);
      expect(a.position.x).toBeGreaterThanOrEqual(0);
      expect(a.position.x).toBeLessThanOrEqual(size * TILE_METERS);
      expect(a.position.z).toBeGreaterThanOrEqual(0);
      expect(a.position.z).toBeLessThanOrEqual(size * TILE_METERS);

      // Lean bound: applying the instance's rotation to the world-up vector
      // should never tilt further than LEAN_MAX_RADIANS off vertical (yaw
      // alone never moves the up vector, so this isolates the lean term).
      up.set(0, 1, 0).applyQuaternion(a.quaternion);
      const tiltAngle = Math.acos(Math.min(1, Math.max(-1, up.y)));
      expect(tiltAngle).toBeLessThanOrEqual(LEAN_MAX_RADIANS + 1e-6);
    }
  });

  it('a single dense tile can place up to 4 trees with widened (+/-0.46 tile) jitter and best-effort minimum same-tile separation (Natural scatter v2, seed=4)', () => {
    const map = makeMap(1, [255], [0]); // single tile, density 255, seed 4 -> treeCountForTile === 4 (verified)
    const scene = new THREE.Scene();
    const renderer = new TreeRenderer(scene, flatHeightAt);
    renderer.build(map, 4);

    const mesh = renderer.meshFor('broadleaf')!; // flat, no water, density >= 128 -> broadleaf
    expect(mesh.count).toBe(4);

    const tileCenter = 0.5 * TILE_METERS; // the map's only tile, (0,0)
    const oldV1Bound = 0.16 * TILE_METERS; // v1's effective jitter half-width, for contrast
    const newBound = JITTER_MAX_FRACTION * TILE_METERS;
    const minSeparationMeters = MIN_SAME_TILE_SEPARATION_FRACTION * TILE_METERS;

    const positions: THREE.Vector3[] = [];
    let sawBeyondOldBound = false;
    for (let i = 0; i < mesh.count; i++) {
      const { position } = decomposeAt(mesh, i);
      positions.push(position);
      const dx = position.x - tileCenter;
      const dz = position.z - tileCenter;
      // Widened jitter never bleeds past the tile (ownership/clearAt stays exact).
      expect(Math.abs(dx)).toBeLessThanOrEqual(newBound + 1e-6);
      expect(Math.abs(dz)).toBeLessThanOrEqual(newBound + 1e-6);
      if (Math.abs(dx) > oldV1Bound || Math.abs(dz) > oldV1Bound) sawBeyondOldBound = true;
    }
    // The widened jitter must actually be exercised -- this is the visual fix itself.
    expect(sawBeyondOldBound).toBe(true);

    // Best-effort minimum same-tile separation between every pair (see
    // sampleTileOffset's doc: not a hard packing guarantee, but real seeds
    // with only 4 trees and 6 resample attempts should clear it).
    let closePairs = 0;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (positions[i]!.distanceTo(positions[j]!) < minSeparationMeters) closePairs++;
      }
    }
    expect(closePairs).toBe(0);
  });

  it('a mature multi-tree stand can still draw one sapling-sized outlier among mature tile-mates (seed=29, tile (0,0), density 255)', () => {
    const map = makeMap(1, [255], [0]);
    const scene = new THREE.Scene();
    const renderer = new TreeRenderer(scene, flatHeightAt);
    renderer.build(map, 29);

    const mesh = renderer.meshFor('broadleaf')!;
    expect(mesh.count).toBe(3);

    const maturity = standMaturity(0, 0, 29);
    expect(maturity).toBeGreaterThan(0.8); // this seed's tile draws a mature stand
    const [nonOutlierMin] = scaleRangeForStand(maturity, false);

    const scales = [0, 1, 2].map((i) => decomposeAt(mesh, i).scale.x);
    const outliers = scales.filter((s) => s < nonOutlierMin);
    const matureSiblings = scales.filter((s) => s >= nonOutlierMin);

    expect(outliers.length).toBe(1); // exactly one sapling-sized outlier among this mature stand
    expect(matureSiblings.length).toBe(2);
    expect(outliers[0]).toBeGreaterThanOrEqual(YOUNG_SCALE_MIN);
    expect(outliers[0]).toBeLessThanOrEqual(YOUNG_SCALE_MAX);
  });

  it('per-instance color jitter is deterministic from the seed and stays within the documented bound', () => {
    const size = 6;
    const trees = new Array(size * size).fill(200);
    const water = new Array(size * size).fill(0);
    const map = makeMap(size, trees, water);

    const sceneA = new THREE.Scene();
    const rendererA = new TreeRenderer(sceneA, flatHeightAt);
    rendererA.build(map, 5);
    const sceneB = new THREE.Scene();
    const rendererB = new TreeRenderer(sceneB, flatHeightAt);
    rendererB.build(map, 5);

    const meshA = rendererA.meshFor('broadleaf')!;
    const meshB = rendererB.meshFor('broadleaf')!;
    const count = meshA.count;

    for (let i = 0; i < count; i++) {
      const cA = colorAt(meshA, i);
      const cB = colorAt(meshB, i);
      expect(cA.toArray()).toEqual(cB.toArray());

      expect(cA.r).toBeGreaterThanOrEqual(1 - HUE_JITTER_MAX - VALUE_JITTER_MAX - 1e-6);
      expect(cA.r).toBeLessThanOrEqual(1 + HUE_JITTER_MAX + VALUE_JITTER_MAX + 1e-6);
      expect(cA.g).toBeGreaterThanOrEqual(1 - VALUE_JITTER_MAX - 1e-6);
      expect(cA.g).toBeLessThanOrEqual(1 + VALUE_JITTER_MAX + 1e-6);
    }
  });

  it('produces different placement and color for a different seed', () => {
    const size = 2;
    const map = makeMap(size, [200, 0, 0, 0], [0, 0, 0, 0]);

    const sceneA = new THREE.Scene();
    new TreeRenderer(sceneA, flatHeightAt).build(map, 1);
    const sceneB = new THREE.Scene();
    new TreeRenderer(sceneB, flatHeightAt).build(map, 2);

    const meshA = instancedMeshesOf(sceneA).find((m) => m.count > 0);
    const meshB = instancedMeshesOf(sceneB).find((m) => m.count > 0);
    expect(meshA).toBeDefined();
    expect(meshB).toBeDefined();

    const mA = new THREE.Matrix4();
    const mB = new THREE.Matrix4();
    meshA?.getMatrixAt(0, mA);
    meshB?.getMatrixAt(0, mB);
    expect(mA.elements).not.toEqual(mB.elements);
  });

  it('roots each instance at heightAt (no extra per-part offset needed with a merged, single-mesh species kit)', () => {
    const map = makeMap(1, [200], [0]);
    const elevatedHeightAt = (): number => 50;
    const scene = new THREE.Scene();
    const renderer = new TreeRenderer(scene, elevatedHeightAt);
    renderer.build(map, 99);

    const mesh = instancedMeshesOf(scene).find((m) => m.count > 0);
    expect(mesh).toBeDefined();
    const { position } = decomposeAt(mesh!, 0);
    expect(position.y).toBeCloseTo(50, 6);
  });

  describe('setSeason', () => {
    it('starts neutral (no seasonal tint) on every species before setSeason is ever called', () => {
      const scene = new THREE.Scene();
      const renderer = new TreeRenderer(scene, flatHeightAt);
      renderer.build(makeMap(2, [200, 0, 0, 0], [0, 0, 0, 0]), 1);

      for (const species of SPECIES_LIST) {
        const material = renderer.materialFor(species);
        expect(material.color.toArray()).toEqual([1, 1, 1]);
      }
    });

    it('tints only broadleaf and shrub materials; pine and poplar stay green', () => {
      const scene = new THREE.Scene();
      const renderer = new TreeRenderer(scene, flatHeightAt);
      renderer.build(makeMap(2, [200, 0, 0, 0], [0, 0, 0, 0]), 1);

      renderer.setSeason(10); // autumn

      const [ar, ag, ab] = AUTUMN_TINT;
      expect(renderer.materialFor('broadleaf').color.toArray()).toEqual([ar, ag, ab]);
      expect(renderer.materialFor('shrub').color.toArray()).toEqual([ar, ag, ab]);
      expect(renderer.materialFor('pine').color.toArray()).toEqual([1, 1, 1]);
      expect(renderer.materialFor('poplar').color.toArray()).toEqual([1, 1, 1]);
    });

    it('updates again on a subsequent call', () => {
      const scene = new THREE.Scene();
      const renderer = new TreeRenderer(scene, flatHeightAt);
      renderer.build(makeMap(2, [200, 0, 0, 0], [0, 0, 0, 0]), 1);

      renderer.setSeason(4); // spring
      expect(renderer.materialFor('broadleaf').color.toArray()).toEqual([...SPRING_TINT]);

      renderer.setSeason(7); // summer
      expect(renderer.materialFor('broadleaf').color.toArray()).toEqual([...SUMMER_TINT]);
    });

    it('persists across a later build() call (materials are shared, not recreated per build)', () => {
      const scene = new THREE.Scene();
      const renderer = new TreeRenderer(scene, flatHeightAt);
      renderer.build(makeMap(2, [200, 0, 0, 0], [0, 0, 0, 0]), 1);
      renderer.setSeason(4); // spring

      renderer.build(makeMap(2, [0, 200, 0, 0], [0, 0, 0, 0]), 2); // different map entirely

      expect(renderer.materialFor('broadleaf').color.toArray()).toEqual([...SPRING_TINT]);
      expect(renderer.materialFor('shrub').color.toArray()).toEqual([...SPRING_TINT]);
      expect(renderer.materialFor('pine').color.toArray()).toEqual([1, 1, 1]);
      expect(renderer.materialFor('poplar').color.toArray()).toEqual([1, 1, 1]);
    });
  });

  describe('clearAt', () => {
    function buildTwoSpeciesMap(): { map: MapData } {
      const size = 4;
      const trees = new Array(size * size).fill(0);
      const water = new Array(size * size).fill(0);
      const height = new Array(size * size).fill(0);

      const pineIdx = 0 * size + 0; // (0,0)
      height[pineIdx] = 25;
      trees[pineIdx] = 200; // pine, base 3

      const broadleafIdx = 2 * size + 2; // (2,2)
      trees[broadleafIdx] = 150; // broadleaf, base 1

      return { map: makeMap(size, trees, water, height) };
    }

    it('zero-scales exactly the instances on the cleared tile, across the correct species mesh only', () => {
      const { map } = buildTwoSpeciesMap();
      const scene = new THREE.Scene();
      const renderer = new TreeRenderer(scene, flatHeightAt);
      renderer.build(map, 42);

      // Cluster-noise-modulated counts (treeCountForTile) for these exact
      // coordinates + seed=42 -- multi-instance-per-tile is exactly the case
      // this test needs, since widened jitter makes multi-tree
      // tiles the interesting case for tile-keyed clearAt bookkeeping.
      const pineMesh = renderer.meshFor('pine')!;
      const broadleafMesh = renderer.meshFor('broadleaf')!;
      expect(pineMesh.count).toBe(3);
      expect(broadleafMesh.count).toBe(1);

      const broadleafBefore = decomposeAt(broadleafMesh, 0);

      renderer.clearAt([{ x: 0, z: 0 }]); // the pine tile

      for (let i = 0; i < pineMesh.count; i++) {
        const m = new THREE.Matrix4();
        pineMesh.getMatrixAt(i, m);
        expect(isZeroScale(m)).toBe(true);
      }

      const broadleafAfter = decomposeAt(broadleafMesh, 0);
      expect(broadleafAfter.position.toArray()).toEqual(broadleafBefore.position.toArray());
      expect(broadleafAfter.scale.toArray()).toEqual(broadleafBefore.scale.toArray());
      expect(broadleafMesh.count).toBe(1); // hidden, not removed/shrunk
    });

    it('clearing a tile with no trees on it is a harmless no-op', () => {
      const { map } = buildTwoSpeciesMap();
      const scene = new THREE.Scene();
      const renderer = new TreeRenderer(scene, flatHeightAt);
      renderer.build(map, 5);
      expect(() => renderer.clearAt([{ x: 3, z: 3 }])).not.toThrow();
    });

    it('clearing an already-cleared tile a second time is also a harmless no-op', () => {
      const { map } = buildTwoSpeciesMap();
      const scene = new THREE.Scene();
      const renderer = new TreeRenderer(scene, flatHeightAt);
      renderer.build(map, 5);
      renderer.clearAt([{ x: 0, z: 0 }]);
      expect(() => renderer.clearAt([{ x: 0, z: 0 }])).not.toThrow();
    });
  });

  it('build() can be called again (e.g. a new map load) and fully replaces the previous instances across all species', () => {
    const size = 3;
    const treesA = new Array(size * size).fill(0);
    const heightA = new Array(size * size).fill(0);
    treesA[0] = 200; // (0,0)
    heightA[0] = 25; // pine

    const treesB = new Array(size * size).fill(0);
    treesB[size * size - 1] = 100; // last tile, flat, no water -> shrub

    const mapA = makeMap(size, treesA, new Array(size * size).fill(0), heightA);
    const mapB = makeMap(size, treesB, new Array(size * size).fill(0));

    const scene = new THREE.Scene();
    const renderer = new TreeRenderer(scene, flatHeightAt);

    renderer.build(mapA, 1);
    // Cluster-noise-modulated (treeCountForTile), not a flat count -- see expectedTotalTreeCount.
    expect(renderer.meshFor('pine')?.count).toBe(expectedTotalTreeCount(mapA, 1));
    expect(renderer.meshFor('shrub')?.count).toBe(0);
    expect(instancedMeshesOf(scene).length).toBe(4);

    renderer.build(mapB, 1);
    expect(renderer.meshFor('pine')?.count).toBe(0);
    expect(renderer.meshFor('shrub')?.count).toBe(expectedTotalTreeCount(mapB, 1));
    expect(instancedMeshesOf(scene).length).toBe(4); // old meshes removed, not accumulated
  });
});
