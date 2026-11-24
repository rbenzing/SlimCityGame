import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SAND_BAND_METERS } from '../shared/constants';
import { MapGenerator } from '../shared/types';
import type { MapData } from '../shared/types';
import { WaterKind, deriveWaterBodies } from '../shared/waterbodies';
import { generateMap, generateProceduralMap, terrainBuildable } from './maps';

/** What generator 1 gave for these seeds before generator 2 existed. */
const FROZEN: ReadonlyArray<readonly [seed: number, hash: string, spawn: string]> = [
  [7, 'ef698b72b2a34338', '128,128'],
  [1234, '7e0d685bf220b3a4', '128,128'],
  [4000000000, 'a6c90675b0d23a42', '128,128'],
];

function terrainHash(m: MapData): string {
  const h = createHash('sha256');
  for (const a of [m.height, m.water, m.trees]) {
    h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  return h.digest('hex').slice(0, 16);
}

describe('generator 1 is frozen', () => {
  it.each(FROZEN)(
    'seed %i gives the same height, water, trees and spawn as ever',
    (seed, hash, spawn) => {
      const m = generateProceduralMap(seed, 'Frozen');
      expect(terrainHash(m)).toBe(hash);
      expect(`${m.spawn.x},${m.spawn.z}`).toBe(spawn);
    },
  );

  it('is what the first id gives', () => {
    const byId = generateMap(MapGenerator.Hills, 7, 'A');
    expect(terrainHash(byId)).toBe(FROZEN[0]![1]);
  });
});

describe('generateMap', () => {
  it('refuses a generator id it does not have', () => {
    expect(() => generateMap(0, 1, 'x')).toThrow(/unknown map generator 0/);
    expect(() => generateMap(3, 1, 'x')).toThrow(/unknown map generator 3/);
  });

  it('gives the coast the same terrain for a seed every time, and another for another seed', () => {
    const a = generateMap(MapGenerator.Coast, 99, 'A');
    const b = generateMap(MapGenerator.Coast, 99, 'B');
    const c = generateMap(MapGenerator.Coast, 100, 'C');
    expect(terrainHash(a)).toBe(terrainHash(b));
    expect(terrainHash(a)).not.toBe(terrainHash(c));
    expect(terrainHash(a)).not.toBe(terrainHash(generateMap(MapGenerator.Hills, 99, 'A')));
  });

  it('keeps the hills of generator 1 where the sea and the river do not reach', () => {
    const hills = generateProceduralMap(99, 'H');
    const coast = generateMap(MapGenerator.Coast, 99, 'C');
    let same = 0;
    for (let i = 0; i < hills.height.length; i++) if (hills.height[i] === coast.height[i]) same++;
    expect(same / hills.height.length).toBeGreaterThan(0.3);
  });
});

/** Tiles buildable and joined to the spawn without crossing water or a steep tile. */
function roomAtSpawn(m: MapData): number {
  const size = m.size;
  const ok = (x: number, z: number): boolean => terrainBuildable(size, m.height, m.water, x, z);
  if (!ok(m.spawn.x, m.spawn.z)) return 0;
  const seen = new Uint8Array(size * size);
  const queue = [m.spawn.z * size + m.spawn.x];
  seen[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % size;
    const z = (i - x) / size;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (!ok(nx, nz) || seen[nz * size + nx]) continue;
      seen[nz * size + nx] = 1;
      queue.push(nz * size + nx);
    }
  }
  return queue.length;
}

/** Mean river tiles in a straight run across it: along rows or columns, whichever cuts it the shorter way. */
function riverWidthTiles(kind: Uint8Array, size: number): number {
  const meanRun = (at: (line: number, step: number) => number): number => {
    let tiles = 0;
    let runs = 0;
    for (let line = 0; line < size; line++) {
      let inRun = false;
      for (let step = 0; step < size; step++) {
        const river = kind[at(line, step)] === WaterKind.River;
        if (river) tiles++;
        if (river && !inRun) runs++;
        inRun = river;
      }
    }
    return runs === 0 ? 0 : tiles / runs;
  };
  return Math.min(
    meanRun((line, step) => line * size + step),
    meanRun((line, step) => step * size + line),
  );
}

const SEEDS = Array.from({ length: 200 }, (_, k) => 1000 + k * 7919);
const SHARDS = 4;
const RIVER_WIDTH_TILES = { min: 3, max: 8 };

describe('what every coast map is promised, over 200 seeds', () => {
  it.each(Array.from({ length: SHARDS }, (_, s) => s))(
    'holds an ocean, a river, a lake, a dry start and room for a town (seeds shard %i)',
    (shard) => {
      const failures: string[] = [];
      for (const seed of SEEDS.filter((_, k) => k % SHARDS === shard)) {
        const m = generateMap(MapGenerator.Coast, seed, 'Coast');
        const bodies = deriveWaterBodies(m.water, m.size, (x, z) => m.height[z * m.size + x]!);
        const kinds = new Set<number>(bodies.kind);
        if (!kinds.has(WaterKind.Ocean)) failures.push(`${seed}: no ocean`);
        if (!kinds.has(WaterKind.River)) failures.push(`${seed}: no river`);
        if (!kinds.has(WaterKind.Lake)) failures.push(`${seed}: no lake`);
        const width = riverWidthTiles(bodies.kind, m.size);
        if (width < RIVER_WIDTH_TILES.min || width > RIVER_WIDTH_TILES.max) {
          failures.push(`${seed}: river ${width.toFixed(1)} tiles wide`);
        }
        const underWater = m.water.some((w, i) => w !== 0 && m.trees[i] !== 0);
        if (underWater) failures.push(`${seed}: trees under water`);
        if (!terrainBuildable(m.size, m.height, m.water, m.spawn.x, m.spawn.z)) {
          failures.push(`${seed}: wet or steep start`);
        }
        const room = roomAtSpawn(m);
        if (room < 10000) failures.push(`${seed}: only ${room} tiles of room`);
      }
      expect(failures).toEqual([]);
    },
    120_000,
  );
});

describe('the shapes the sea and the river leave', () => {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  it('puts no cliff on the sea shore and none on a river bank', () => {
    const bad: string[] = [];
    for (const seed of SEEDS.slice(0, 12)) {
      const m = generateMap(MapGenerator.Coast, seed, 'Coast');
      const n = m.size;
      const bodies = deriveWaterBodies(m.water, n, (x, z) => m.height[z * n + x]!);
      for (let i = 0; i < n * n; i++) {
        const kind = bodies.kind[i];
        if (kind !== WaterKind.Ocean && kind !== WaterKind.River) continue;
        const x = i % n;
        const z = (i - x) / n;
        for (const [dx, dz] of dirs) {
          const j = (z + dz) * n + x + dx;
          if (x + dx < 0 || z + dz < 0 || x + dx >= n || z + dz >= n || m.water[j]) continue;
          if (!terrainBuildable(n, m.height, m.water, x + dx, z + dz)) {
            bad.push(
              `${seed}: a bank of ${kind === WaterKind.Ocean ? 'the sea' : 'the river'} at ${x + dx},${z + dz}`,
            );
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(bad).toHaveLength(0);
  });

  /** Straight-line distance in tiles from each tile to the nearest tile `inSet` marks (chamfer, within 4%). */
  function distanceTo(n: number, inSet: (i: number) => boolean): Float32Array {
    const d = new Float32Array(n * n).fill(1e9);
    for (let i = 0; i < n * n; i++) if (inSet(i)) d[i] = 0;
    const relax = (x: number, z: number, dx: number, dz: number, w: number): void => {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) return;
      const i = z * n + x;
      d[i] = Math.min(d[i]!, d[nz * n + nx]! + w);
    };
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        relax(x, z, -1, 0, 1);
        relax(x, z, 0, -1, 1);
        relax(x, z, -1, -1, Math.SQRT2);
        relax(x, z, 1, -1, Math.SQRT2);
      }
    for (let z = n - 1; z >= 0; z--)
      for (let x = n - 1; x >= 0; x--) {
        relax(x, z, 1, 0, 1);
        relax(x, z, 0, 1, 1);
        relax(x, z, 1, 1, Math.SQRT2);
        relax(x, z, -1, 1, Math.SQRT2);
      }
    return d;
  }

  /** The tiles of the biggest ocean on the map: the coast's sea, not a pool of the hills that touches an edge. */
  function largestOcean(kind: Uint8Array, n: number): Set<number> {
    const seen = new Set<number>();
    let best: number[] = [];
    for (let start = 0; start < n * n; start++) {
      if (kind[start] !== WaterKind.Ocean || seen.has(start)) continue;
      const list = [start];
      seen.add(start);
      for (let h = 0; h < list.length; h++) {
        const x = list[h]! % n;
        const z = (list[h]! - x) / n;
        for (const [dx, dz] of dirs) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
          const j = nz * n + nx;
          if (kind[j] === WaterKind.Ocean && !seen.has(j)) {
            seen.add(j);
            list.push(j);
          }
        }
      }
      if (list.length > best.length) best = list;
    }
    return new Set(best);
  }

  it('lifts the banks and the beach out of the sand band: bare sand is a strip, not a plain', () => {
    const low: string[] = [];
    for (const seed of SEEDS.slice(0, 8)) {
      const m = generateMap(MapGenerator.Coast, seed, 'Coast');
      const n = m.size;
      const bodies = deriveWaterBodies(m.water, n, (x, z) => m.height[z * n + x]!);
      const fromRiver = distanceTo(n, (i) => m.height[i] === -2); // the channel the coast carves
      const sea = largestOcean(bodies.kind, n);
      const fromSea = distanceTo(n, (i) => sea.has(i));
      const hills = generateProceduralMap(seed, 'Hills');
      // The hills' own pools, not the river's channel (2 m down): ground beside one follows the pool, not the bank.
      const fromPool = distanceTo(n, (i) => hills.height[i]! < 0 && m.height[i] !== -2);
      for (let i = 0; i < n * n; i++) {
        const edge = Math.min(i % n, Math.floor(i / n), n - 1 - (i % n), n - 1 - Math.floor(i / n));
        if (m.water[i] || edge < 4) continue; // a lake on the map edge shapes its own shore
        // Past 3 tiles of the river (its bank is 2 tiles of climb), on its floodplain; past 5 of the
        // sea, up to the 12 where the hills begin to show through the plain.
        const floodplain =
          fromPool[i]! >= 7 && fromRiver[i]! >= 3 && fromRiver[i]! <= 4.5 && fromSea[i]! > 5;
        const plain = fromPool[i]! > 7 && fromRiver[i]! > 5 && fromSea[i]! > 5 && fromSea[i]! <= 12;
        if ((floodplain || plain) && m.height[i]! < SAND_BAND_METERS)
          low.push(`${seed}: ${i % n},${Math.floor(i / n)} at ${m.height[i]!.toFixed(2)} m`);
      }
    }
    expect(low.slice(0, 5)).toEqual([]);
  });

  it('lowers land for the river only near it: a bend never drags its valley across the land beside it', () => {
    const bad: string[] = [];
    for (const seed of SEEDS.slice(0, 6)) {
      const hills = generateProceduralMap(seed, 'Hills');
      const m = generateMap(MapGenerator.Coast, seed, 'Coast');
      const n = m.size;
      const bodies = deriveWaterBodies(m.water, n, (x, z) => m.height[z * n + x]!);
      const fromRiver = distanceTo(n, (i) => bodies.kind[i] === WaterKind.River);
      const fromSea = distanceTo(n, (i) => bodies.kind[i] === WaterKind.Ocean);
      for (let i = 0; i < n * n; i++) {
        // Past the beach plain, only the valley lowers a hill, and it never reaches far over level ground.
        if (fromSea[i]! < 45 || m.height[i]! >= hills.height[i]! - 0.01 || m.water[i]) continue;
        const allowed = m.height[i]! - SAND_BAND_METERS + 8;
        if (fromRiver[i]! > allowed) bad.push(`${seed}: tile ${i % n},${Math.floor(i / n)}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
