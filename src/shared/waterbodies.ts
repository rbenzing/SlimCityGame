/**
 * Water bodies: the kind (ocean, lake, river), the wind fetch, the ocean swell
 * and a river's current, each worked out per tile from the water mask and the
 * terrain heights alone. Pure: nothing here is stored or random, so the same
 * mask always gives the same bodies and a terrain edit just rebuilds them.
 */

import { TILE_METERS } from './constants';

export const WaterKind = { None: 0, Ocean: 1, Lake: 2, River: 3 } as const;
export type WaterKindValue = (typeof WaterKind)[keyof typeof WaterKind];

/** Width of the widest circle a channel may hold; wider water is open. */
export const CHANNEL_MAX_WIDTH_M = 200;
/** Shortest channel that counts as a river. */
export const RIVER_MIN_LENGTH_M = 400;
/** Fetch of an ocean tile whose upwind ray leaves the map. */
export const OPEN_SEA_FETCH_M = 20000;
/** Radius of the blur that softens the edge of a headland's shelter. */
export const SWELL_SHADOW_BLUR_M = 200;
/** Surface speed of a river in mid-channel. */
export const RIVER_SURFACE_SPEED_MPS = 0.8;

const WIND_RAW = { x: 0.94, z: 0.34 };
const WIND_LEN = Math.hypot(WIND_RAW.x, WIND_RAW.z);
/** Unit vector the wind blows toward, in world x and z. */
export const WIND_TOWARD: Readonly<{ x: number; z: number }> = {
  x: WIND_RAW.x / WIND_LEN,
  z: WIND_RAW.z / WIND_LEN,
};

export interface WaterBodies {
  readonly size: number;
  readonly kind: Uint8Array;
  readonly fetchM: Float32Array;
  readonly swellX: Float32Array;
  readonly swellZ: Float32Array;
  readonly flowX: Float32Array;
  readonly flowZ: Float32Array;
}

export interface WaterSample {
  readonly fetchM: number;
  readonly swellX: number;
  readonly swellZ: number;
  readonly flowX: number;
  readonly flowZ: number;
}

const OPEN_RADIUS_TILES = CHANNEL_MAX_WIDTH_M / 2 / TILE_METERS;
const BLUR_RADIUS_TILES = Math.round(SWELL_SHADOW_BLUR_M / TILE_METERS);
const BANK_WINDOW_TILES = 8;
const HALF_WIDTH_WINDOW_TILES = 5;
const RAY_STEP_TILES = 0.5;
const RAY_COUNT_EACH_SIDE = 3;
const RAY_SPREAD_RAD = Math.PI / 4;

const NEIGHBOURS_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const NEIGHBOURS_8: ReadonlyArray<readonly [number, number]> = [
  ...NEIGHBOURS_4,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Offsets (dx, dz) whose squared length is at most `maxSq`. */
function discOffsets(maxSq: number, strict: boolean): Array<readonly [number, number]> {
  const r = Math.ceil(Math.sqrt(maxSq));
  const out: Array<readonly [number, number]> = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dz * dz;
      if (strict ? d < maxSq : d <= maxSq) out.push([dx, dz]);
    }
  }
  return out;
}

/** Labels the 4-connected runs of tiles where `inSet` is true; -1 elsewhere. */
function labelComponents(
  size: number,
  inSet: (i: number) => boolean,
): { label: Int32Array; members: number[][] } {
  const label = new Int32Array(size * size).fill(-1);
  const members: number[][] = [];
  for (let start = 0; start < size * size; start++) {
    if (label[start] !== -1 || !inSet(start)) continue;
    const id = members.length;
    const list: number[] = [start];
    label[start] = id;
    for (let head = 0; head < list.length; head++) {
      const i = list[head]!;
      const x = i % size;
      const z = (i - x) / size;
      for (const [dx, dz] of NEIGHBOURS_4) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        const n = nz * size + nx;
        if (label[n] === -1 && inSet(n)) {
          label[n] = id;
          list.push(n);
        }
      }
    }
    members.push(list);
  }
  return { label, members };
}

/**
 * Breadth-first steps from `sources` through `passable` tiles; -1 where
 * unreached. A caller that runs many searches passes one `dist` buffer, filled
 * with -1, and puts back every entry of `order` it used.
 */
function bfsDistance(
  size: number,
  sources: readonly number[],
  passable: (i: number) => boolean,
  neighbours: ReadonlyArray<readonly [number, number]>,
  dist: Int32Array = new Int32Array(size * size).fill(-1),
): { dist: Int32Array; order: number[] } {
  const order: number[] = [];
  for (const s of sources) {
    dist[s] = 0;
    order.push(s);
  }
  for (let head = 0; head < order.length; head++) {
    const i = order[head]!;
    const x = i % size;
    const z = (i - x) / size;
    for (const [dx, dz] of neighbours) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
      const n = nz * size + nx;
      if (dist[n] === -1 && passable(n)) {
        dist[n] = dist[i]! + 1;
        order.push(n);
      }
    }
  }
  return { dist, order };
}

const onEdge = (i: number, size: number): boolean => {
  const x = i % size;
  const z = (i - x) / size;
  return x === 0 || z === 0 || x === size - 1 || z === size - 1;
};

/** Marks every tile as ocean, lake, river or none by the shape of its water. */
function classify(water: Uint8Array, size: number): Uint8Array {
  const n = size * size;
  const isWater = (i: number): boolean => water[i] !== 0;
  const kind = new Uint8Array(n);

  // Open water: within the channel radius of a tile that has no land that close.
  const near = discOffsets(OPEN_RADIUS_TILES * OPEN_RADIUS_TILES, true);
  const reach = discOffsets(OPEN_RADIUS_TILES * OPEN_RADIUS_TILES, false);
  const open = new Uint8Array(n);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      if (!isWater(i)) continue;
      let core = true;
      for (const [dx, dz] of near) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        if (!isWater(nz * size + nx)) {
          core = false;
          break;
        }
      }
      if (!core) continue;
      for (const [dx, dz] of reach) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        const j = nz * size + nx;
        if (isWater(j)) open[j] = 1;
      }
    }
  }

  const openComps = labelComponents(size, (i) => open[i] === 1);
  for (const list of openComps.members) {
    const k = list.some((i) => onEdge(i, size)) ? WaterKind.Ocean : WaterKind.Lake;
    for (const i of list) kind[i] = k;
  }

  const channels = labelComponents(size, (i) => isWater(i) && open[i] === 0);
  const searchDist = new Int32Array(n).fill(-1);
  const minTiles = RIVER_MIN_LENGTH_M / TILE_METERS;
  channels.members.forEach((list, id) => {
    let touchesOcean = false;
    let touchesLake = false;
    let touchesEdge = false;
    for (const i of list) {
      if (onEdge(i, size)) touchesEdge = true;
      const x = i % size;
      const z = (i - x) / size;
      for (const [dx, dz] of NEIGHBOURS_4) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        const j = nz * size + nx;
        if (open[j] === 0) continue;
        if (kind[j] === WaterKind.Ocean) touchesOcean = true;
        else touchesLake = true;
      }
    }
    // A channel is as long as the straight distance between the ends of its
    // longest run (found by a double sweep): steps along a fat bay would
    // overcount by up to half again. One too small to span the minimum length
    // is not searched.
    let lengthM = 0;
    if (list.length >= minTiles) {
      const inside = (i: number): boolean => channels.label[i] === id;
      const first = bfsDistance(size, [list[0]!], inside, NEIGHBOURS_4, searchDist);
      const far = first.order[first.order.length - 1]!;
      for (const i of first.order) searchDist[i] = -1;
      const second = bfsDistance(size, [far], inside, NEIGHBOURS_4, searchDist);
      const end = second.order[second.order.length - 1]!;
      for (const i of second.order) searchDist[i] = -1;
      const span = Math.hypot(
        (far % size) - (end % size),
        Math.floor(far / size) - Math.floor(end / size),
      );
      lengthM = (span + 1) * TILE_METERS;
    }
    let k: WaterKindValue;
    if (lengthM >= RIVER_MIN_LENGTH_M && (touchesOcean || touchesLake || touchesEdge)) {
      k = WaterKind.River;
    } else if (touchesOcean) {
      k = WaterKind.Ocean;
    } else {
      k = WaterKind.Lake;
    }
    for (const i of list) kind[i] = k;
  });
  return kind;
}

/** Fills the current of every river: direction downhill to its outlet, fastest mid-channel. */
function fillCurrents(
  water: Uint8Array,
  size: number,
  kind: Uint8Array,
  heightAtTile: (tx: number, tz: number) => number,
  flowX: Float32Array,
  flowZ: Float32Array,
): void {
  const n = size * size;
  const rivers = labelComponents(size, (i) => kind[i] === WaterKind.River);
  const lakes = labelComponents(size, (i) => kind[i] === WaterKind.Lake);
  const oceanAt = (i: number): boolean => kind[i] === WaterKind.Ocean;

  // Distance across the channel to the nearest bank, in metres.
  const bank = new Float32Array(n);
  const bankWindow = discOffsets(BANK_WINDOW_TILES * BANK_WINDOW_TILES, false);
  for (const list of rivers.members) {
    for (const i of list) {
      const x = i % size;
      const z = (i - x) / size;
      let best = BANK_WINDOW_TILES * BANK_WINDOW_TILES;
      for (const [dx, dz] of bankWindow) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        if (water[nz * size + nx] === 0) best = Math.min(best, dx * dx + dz * dz);
      }
      bank[i] = (Math.sqrt(best) - 0.5) * TILE_METERS;
    }
  }

  const dirX = new Float32Array(n);
  const dirZ = new Float32Array(n);
  for (const list of rivers.members) {
    const inRiver = new Set(list);
    const touching = (i: number, test: (j: number) => boolean): boolean => {
      const x = i % size;
      const z = (i - x) / size;
      return NEIGHBOURS_4.some(([dx, dz]) => {
        const nx = x + dx;
        const nz = z + dz;
        return nx >= 0 && nz >= 0 && nx < size && nz < size && test(nz * size + nx);
      });
    };

    // The outlet: an ocean, else the largest lake touched, else the lower map edge.
    let isTarget: (j: number) => boolean = () => false;
    let outlet = list.filter((i) => touching(i, oceanAt));
    let leavesMap = false;
    if (outlet.length > 0) {
      isTarget = oceanAt;
    } else {
      let bestLake = -1;
      for (const i of list) {
        const x = i % size;
        const z = (i - x) / size;
        for (const [dx, dz] of NEIGHBOURS_4) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
          const id = lakes.label[nz * size + nx]!;
          if (id < 0) continue;
          if (
            bestLake < 0 ||
            lakes.members[id]!.length > lakes.members[bestLake]!.length ||
            (lakes.members[id]!.length === lakes.members[bestLake]!.length && id < bestLake)
          ) {
            bestLake = id;
          }
        }
      }
      if (bestLake >= 0) {
        const lakeId = bestLake;
        isTarget = (j) => lakes.label[j] === lakeId;
        outlet = list.filter((i) => touching(i, isTarget));
      } else {
        const edgeTiles = list.filter((i) => onEdge(i, size));
        const edgeSet = new Set(edgeTiles);
        const groups = labelComponents(size, (i) => edgeSet.has(i));
        let bestGroup: number[] = [];
        let bestMean = Infinity;
        for (const g of groups.members) {
          if (g.length === 0) continue;
          let sum = 0;
          let count = 0;
          for (const i of g) {
            const x = i % size;
            const z = (i - x) / size;
            for (const [dx, dz] of NEIGHBOURS_8) {
              const nx = x + dx;
              const nz = z + dz;
              if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
              if (water[nz * size + nx] !== 0) continue;
              sum += heightAtTile(nx, nz);
              count++;
            }
          }
          const mean = count > 0 ? sum / count : Infinity;
          const lowerIndex = bestGroup.length === 0 || Math.min(...g) < Math.min(...bestGroup);
          if (mean < bestMean || (mean === bestMean && lowerIndex)) {
            bestMean = mean;
            bestGroup = g;
          }
        }
        outlet = bestGroup;
        leavesMap = true;
      }
    }
    if (outlet.length === 0) continue;

    const { dist } = bfsDistance(size, outlet, (i) => inRiver.has(i), NEIGHBOURS_8);
    for (const i of list) {
      const x = i % size;
      const z = (i - x) / size;
      const d = dist[i]!;
      if (d < 0) continue;
      let vx = 0;
      let vz = 0;
      for (const [dx, dz] of NEIGHBOURS_8) {
        const nx = x + dx;
        const nz = z + dz;
        let nd: number;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) {
          nd = leavesMap && d === 0 ? -1 : -2;
        } else {
          const j = nz * size + nx;
          if (inRiver.has(j)) nd = dist[j]!;
          else if (d === 0 && isTarget(j)) nd = -1;
          else nd = -2;
        }
        if (nd === -2) continue;
        const pull = d - nd;
        if (pull <= 0) continue;
        const len = Math.hypot(dx, dz);
        vx += (dx / len) * pull;
        vz += (dz / len) * pull;
      }
      const len = Math.hypot(vx, vz);
      if (len > 0) {
        dirX[i] = vx / len;
        dirZ[i] = vz / len;
      }
    }

    // Smooth once over the 3x3 river tiles, then scale by the speed across the channel.
    for (const i of list) {
      const x = i % size;
      const z = (i - x) / size;
      let sx = dirX[i]!;
      let sz = dirZ[i]!;
      let halfWidth = bank[i]!;
      for (const [dx, dz] of NEIGHBOURS_8) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
        const j = nz * size + nx;
        if (!inRiver.has(j)) continue;
        sx += dirX[j]!;
        sz += dirZ[j]!;
      }
      for (let dz = -HALF_WIDTH_WINDOW_TILES; dz <= HALF_WIDTH_WINDOW_TILES; dz++) {
        for (let dx = -HALF_WIDTH_WINDOW_TILES; dx <= HALF_WIDTH_WINDOW_TILES; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
          const j = nz * size + nx;
          if (inRiver.has(j)) halfWidth = Math.max(halfWidth, bank[j]!);
        }
      }
      const len = Math.hypot(sx, sz);
      if (len === 0 || halfWidth <= 0) continue;
      const s = Math.min(1, Math.max(0, bank[i]! / halfWidth));
      const speed = RIVER_SURFACE_SPEED_MPS * (1 - (1 - s) * (1 - s));
      flowX[i] = (sx / len) * speed;
      flowZ[i] = (sz / len) * speed;
    }
  }
}

/** Wind fetch of every water tile, in metres of water upwind of it. */
function fillFetch(water: Uint8Array, size: number, kind: Uint8Array, fetchM: Float32Array): void {
  const upwind = Math.atan2(-WIND_TOWARD.z, -WIND_TOWARD.x);
  const rays: Array<{ dx: number; dz: number; weight: number }> = [];
  for (let k = -RAY_COUNT_EACH_SIDE; k <= RAY_COUNT_EACH_SIDE; k++) {
    const off = (k / RAY_COUNT_EACH_SIDE) * RAY_SPREAD_RAD;
    rays.push({
      dx: Math.cos(upwind + off) * RAY_STEP_TILES,
      dz: Math.sin(upwind + off) * RAY_STEP_TILES,
      weight: Math.cos(off),
    });
  }
  const totalWeight = rays.reduce((s, r) => s + r.weight, 0);
  const stepM = RAY_STEP_TILES * TILE_METERS;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      if (water[i] === 0) continue;
      let sum = 0;
      for (const ray of rays) {
        let px = x + 0.5;
        let pz = z + 0.5;
        let steps = 0;
        let length: number;
        for (;;) {
          px += ray.dx;
          pz += ray.dz;
          steps++;
          const tx = Math.floor(px);
          const tz = Math.floor(pz);
          if (tx < 0 || tz < 0 || tx >= size || tz >= size) {
            length = kind[i] === WaterKind.Ocean ? OPEN_SEA_FETCH_M : steps * stepM;
            break;
          }
          if (water[tz * size + tx] === 0) {
            length = steps * stepM;
            break;
          }
        }
        sum += length * ray.weight;
      }
      fetchM[i] = sum / totalWeight;
    }
  }
}

/** Swell of every ocean tile: travel direction times exposure, blurred over the water near it. */
function fillSwell(
  water: Uint8Array,
  size: number,
  kind: Uint8Array,
  swellX: Float32Array,
  swellZ: Float32Array,
): void {
  const n = size * size;
  // Each entry: the unit travel vector inland from one map edge.
  const edges: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const edgeTile = (e: number, i: number): boolean => {
    const x = i % size;
    const z = (i - x) / size;
    return [x === 0, x === size - 1, z === 0, z === size - 1][e]!;
  };
  // exposed[e][i] is 1 when every tile from i back to edge e is water.
  const exposed: Array<Uint8Array | undefined> = [];
  const exposure = (e: number): Uint8Array => {
    const cached = exposed[e];
    if (cached) return cached;
    const out = new Uint8Array(n);
    const [tx, tz] = edges[e]!;
    for (let line = 0; line < size; line++) {
      let open = true;
      for (let s = 0; s < size && open; s++) {
        const x = tx !== 0 ? (tx > 0 ? s : size - 1 - s) : line;
        const z = tz !== 0 ? (tz > 0 ? s : size - 1 - s) : line;
        const i = z * size + x;
        if (water[i] === 0) open = false;
        else out[i] = 1;
      }
    }
    exposed[e] = out;
    return out;
  };

  const vx = new Float64Array(n);
  const vz = new Float64Array(n);
  const oceans = labelComponents(size, (i) => kind[i] === WaterKind.Ocean);
  for (const list of oceans.members) {
    const counts = [0, 0, 0, 0];
    for (const i of list) {
      for (let e = 0; e < 4; e++) if (edgeTile(e, i)) counts[e]!++;
    }
    let edge = 0;
    for (let e = 1; e < 4; e++) if (counts[e]! > counts[edge]!) edge = e;
    if (counts[edge] === 0) continue;
    const exp = exposure(edge);
    const [tx, tz] = edges[edge]!;
    for (const i of list) {
      vx[i] = tx * exp[i]!;
      vz[i] = tz * exp[i]!;
    }
  }

  // Prefix sums of the vector and the water count for a box blur.
  const w = size + 1;
  const sumX = new Float64Array(w * w);
  const sumZ = new Float64Array(w * w);
  const sumW = new Float64Array(w * w);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      const p = (z + 1) * w + (x + 1);
      const up = z * w + (x + 1);
      const left = (z + 1) * w + x;
      const diag = z * w + x;
      sumX[p] = vx[i]! + sumX[up]! + sumX[left]! - sumX[diag]!;
      sumZ[p] = vz[i]! + sumZ[up]! + sumZ[left]! - sumZ[diag]!;
      sumW[p] = (water[i] !== 0 ? 1 : 0) + sumW[up]! + sumW[left]! - sumW[diag]!;
    }
  }
  const box = (a: Float64Array, x0: number, z0: number, x1: number, z1: number): number =>
    a[(z1 + 1) * w + (x1 + 1)]! - a[z0 * w + (x1 + 1)]! - a[(z1 + 1) * w + x0]! + a[z0 * w + x0]!;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      if (kind[i] !== WaterKind.Ocean) continue;
      const x0 = Math.max(0, x - BLUR_RADIUS_TILES);
      const x1 = Math.min(size - 1, x + BLUR_RADIUS_TILES);
      const z0 = Math.max(0, z - BLUR_RADIUS_TILES);
      const z1 = Math.min(size - 1, z + BLUR_RADIUS_TILES);
      const count = box(sumW, x0, z0, x1, z1);
      if (count === 0) continue;
      swellX[i] = box(sumX, x0, z0, x1, z1) / count;
      swellZ[i] = box(sumZ, x0, z0, x1, z1) / count;
    }
  }
}

/**
 * Works out each water tile's kind, wind fetch, swell and river current.
 * `water` is non-zero where a tile is water; `heightAtTile` gives terrain height.
 */
export function deriveWaterBodies(
  water: Uint8Array,
  size: number,
  heightAtTile: (tx: number, tz: number) => number,
): WaterBodies {
  const n = size * size;
  const kind = classify(water, size);
  const fetchM = new Float32Array(n);
  const swellX = new Float32Array(n);
  const swellZ = new Float32Array(n);
  const flowX = new Float32Array(n);
  const flowZ = new Float32Array(n);
  fillFetch(water, size, kind, fetchM);
  fillSwell(water, size, kind, swellX, swellZ);
  fillCurrents(water, size, kind, heightAtTile, flowX, flowZ);
  return { size, kind, fetchM, swellX, swellZ, flowX, flowZ };
}

/** Bilinear sample of the per-tile fields at world metres (x, z). */
export function sampleWater(bodies: WaterBodies, x: number, z: number): WaterSample {
  const { size } = bodies;
  const gx = Math.min(size - 1, Math.max(0, x / TILE_METERS - 0.5));
  const gz = Math.min(size - 1, Math.max(0, z / TILE_METERS - 0.5));
  const x0 = Math.min(size - 2, Math.floor(gx));
  const z0 = Math.min(size - 2, Math.floor(gz));
  const fx = gx - x0;
  const fz = gz - z0;
  const at = (a: Float32Array): number => {
    const i = z0 * size + x0;
    return (
      a[i]! * (1 - fx) * (1 - fz) +
      a[i + 1]! * fx * (1 - fz) +
      a[i + size]! * (1 - fx) * fz +
      a[i + size + 1]! * fx * fz
    );
  };
  return {
    fetchM: at(bodies.fetchM),
    swellX: at(bodies.swellX),
    swellZ: at(bodies.swellZ),
    flowX: at(bodies.flowX),
    flowZ: at(bodies.flowZ),
  };
}
