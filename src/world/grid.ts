/**
 * SlimCity world grid: the layered tile-grid data model plus
 * pure buildability/zoning/bulldoze logic. No three.js/DOM here — this is
 * the sim-worker-owned model, unit-testable without a GPU.
 */

import { MAP_SIZE, MAX_BUILD_SLOPE, ROAD_MAX_SLOPE } from '../shared/constants';
import {
  FIELD_COUNT,
  RoadTier,
  SAVE_VERSION,
  ZoneType,
  type GridState,
  type TilePoint,
} from '../shared/types';
import { isZonable } from './zonable';

// ---------------------------------------------------------------------------
// Indexing helpers. Deliberately NOT the fixed-MAP_SIZE helpers from
// shared/constants.ts: createGrid supports an arbitrary `size` (tests build
// small grids), so indexing must be parameterized by the grid's own size.
// ---------------------------------------------------------------------------

const indexOf = (size: number, x: number, z: number): number => z * size + x;

const inBoundsOf = (size: number, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < size && z < size;

/** Orthogonal neighbor offsets: +N, +E, +S, +W. */
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/** Allocates a fully zero-initialized GridState. Defaults to MAP_SIZE. */
export function createGrid(size?: number): GridState {
  const resolvedSize = size ?? MAP_SIZE;
  const n = resolvedSize * resolvedSize;

  const fields: Uint8Array[] = [];
  for (let f = 0; f < FIELD_COUNT; f++) {
    fields.push(new Uint8Array(n));
  }

  return {
    size: resolvedSize,
    height: new Float32Array(n),
    water: new Uint8Array(n),
    trees: new Uint8Array(n),
    zone: new Uint8Array(n),
    roadTier: new Uint8Array(n),
    roadMask: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    power: new Uint8Array(n),
    watered: new Uint8Array(n),
    fields,
    district: new Uint8Array(n),
    landfill: new Uint8Array(n),
  };
}

// ---------------------------------------------------------------------------
// Serialization — versioned little header (SAVE_VERSION + size) followed by
// every layer in GridState's declared order. Multi-byte fields (height,
// buildingId) are written/read through a DataView, which supports unaligned
// byte offsets — so the layout works for ANY grid size, not just ones whose
// tile count happens to be a multiple of 4.
// ---------------------------------------------------------------------------

const HEADER_BYTES = 8; // uint32 version + uint32 size
// SAVE_VERSION 3 layout: 4 (height) + 4 (buildingId) + 18 single-byte layers
// (7 flat: water/trees/zone/roadTier/roadMask/power/watered) + 9 fields + 1
// district + 1 landfill (both trailing).
const BYTES_PER_TILE = 26;
// v2 has the trailing district layer but not landfill (one byte-per-tile
// smaller); v1 predates both (two smaller). deserializeGrid accepts both and
// defaults the absent trailing layer(s) to 0.
const BYTES_PER_TILE_V2 = 25;
const BYTES_PER_TILE_V1 = 24;

function bufferBytesFor(size: number, bytesPerTile: number = BYTES_PER_TILE): number {
  return HEADER_BYTES + size * size * bytesPerTile;
}

export function serializeGrid(g: GridState): ArrayBuffer {
  const n = g.size * g.size;
  const buffer = new ArrayBuffer(bufferBytesFor(g.size));
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, SAVE_VERSION, true);
  view.setUint32(4, g.size, true);

  let offset = HEADER_BYTES;

  for (let i = 0; i < n; i++) {
    view.setFloat32(offset + i * 4, g.height[i]!, true);
  }
  offset += n * 4;

  bytes.set(g.water, offset);
  offset += n;
  bytes.set(g.trees, offset);
  offset += n;
  bytes.set(g.zone, offset);
  offset += n;
  bytes.set(g.roadTier, offset);
  offset += n;
  bytes.set(g.roadMask, offset);
  offset += n;

  for (let i = 0; i < n; i++) {
    view.setUint32(offset + i * 4, g.buildingId[i]!, true);
  }
  offset += n * 4;

  bytes.set(g.power, offset);
  offset += n;
  bytes.set(g.watered, offset);
  offset += n;

  for (let f = 0; f < FIELD_COUNT; f++) {
    bytes.set(g.fields[f]!, offset);
    offset += n;
  }

  // Trailing additive layers, in version order: district (v2), then landfill
  // (v3). Placed last so an older buffer is simply this buffer without its final
  // n bytes per absent layer (see deserializeGrid).
  bytes.set(g.district, offset);
  offset += n;
  bytes.set(g.landfill, offset);

  return buffer;
}

export function deserializeGrid(buf: ArrayBuffer): GridState {
  const view = new DataView(buf);
  const version = view.getUint32(0, true);
  // SAVE_VERSION 3 is current; v1 and v2 are accepted for migration — they are
  // identical except for the trailing district (v2+) and landfill (v3+) layers,
  // each defaulted to 0 here when absent.
  if (version !== SAVE_VERSION && version !== 2 && version !== 1) {
    throw new Error(
      `deserializeGrid: unsupported save version ${version} (expected ${SAVE_VERSION})`,
    );
  }
  const hasDistrict = version >= 2;
  const hasLandfill = version >= 3;

  const size = view.getUint32(4, true);
  const n = size * size;
  const bytesPerTile = hasLandfill
    ? BYTES_PER_TILE
    : hasDistrict
      ? BYTES_PER_TILE_V2
      : BYTES_PER_TILE_V1;
  const expectedBytes = bufferBytesFor(size, bytesPerTile);
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `deserializeGrid: buffer length ${buf.byteLength} does not match expected ${expectedBytes} for size ${size}`,
    );
  }

  const bytes = new Uint8Array(buf);
  let offset = HEADER_BYTES;

  const height = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    height[i] = view.getFloat32(offset + i * 4, true);
  }
  offset += n * 4;

  const water = bytes.slice(offset, offset + n);
  offset += n;
  const trees = bytes.slice(offset, offset + n);
  offset += n;
  const zone = bytes.slice(offset, offset + n);
  offset += n;
  const roadTier = bytes.slice(offset, offset + n);
  offset += n;
  const roadMask = bytes.slice(offset, offset + n);
  offset += n;

  const buildingId = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    buildingId[i] = view.getUint32(offset + i * 4, true);
  }
  offset += n * 4;

  const power = bytes.slice(offset, offset + n);
  offset += n;
  const watered = bytes.slice(offset, offset + n);
  offset += n;

  const fields: Uint8Array[] = [];
  for (let f = 0; f < FIELD_COUNT; f++) {
    fields.push(bytes.slice(offset, offset + n));
    offset += n;
  }

  // District layer (v2+). v1 buffers stop here — district defaults to 0.
  const district = hasDistrict ? bytes.slice(offset, offset + n) : new Uint8Array(n);
  if (hasDistrict) offset += n;
  // Landfill layer (v3+). v1/v2 buffers stop here — landfill defaults to 0.
  const landfill = hasLandfill ? bytes.slice(offset, offset + n) : new Uint8Array(n);

  return {
    size,
    height,
    water,
    trees,
    zone,
    roadTier,
    roadMask,
    buildingId,
    power,
    watered,
    fields,
    district,
    landfill,
  };
}

// ---------------------------------------------------------------------------
// Buildability
// ---------------------------------------------------------------------------

/**
 * Shared buildability core: in bounds, not water, and the slope to every
 * EXISTING orthogonal neighbor (edge/corner tiles simply have fewer of them)
 * is within `maxSlope`. Parameterized so isBuildable (buildings/zoning) and
 * isRoadBuildable (road-on-slope) can apply their own slope ceilings
 * while sharing the water + bounds + neighbor-walk logic.
 */
function buildableWithSlope(g: GridState, x: number, z: number, maxSlope: number): boolean {
  if (!inBoundsOf(g.size, x, z)) return false;

  const i = indexOf(g.size, x, z);
  if (g.water[i]) return false;

  const h = g.height[i]!;
  for (const [ox, oz] of NEIGHBOR_OFFSETS) {
    const nx = x + ox;
    const nz = z + oz;
    if (!inBoundsOf(g.size, nx, nz)) continue;
    const nh = g.height[indexOf(g.size, nx, nz)]!;
    if (Math.abs(h - nh) > maxSlope) return false;
  }
  return true;
}

/**
 * In bounds, not water, and the slope to every EXISTING orthogonal neighbor
 * (edge/corner tiles simply have fewer of them) is within MAX_BUILD_SLOPE.
 * Does not consider roads/buildings — see canPlaceFootprint for that.
 */
export function isBuildable(g: GridState, x: number, z: number): boolean {
  return buildableWithSlope(g, x, z, MAX_BUILD_SLOPE);
}

/**
 * Road-specific buildability (road-on-slope placement): same
 * water + bounds gate as isBuildable, but tolerates a steeper grade
 * (ROAD_MAX_SLOPE, > MAX_BUILD_SLOPE) because the caller's footprint
 * auto-flatten re-levels/banks the placed tiles right after. Buildings and
 * zoning are NOT affected — they keep calling isBuildable with MAX_BUILD_SLOPE.
 */
export function isRoadBuildable(g: GridState, x: number, z: number): boolean {
  return buildableWithSlope(g, x, z, ROAD_MAX_SLOPE);
}

/**
 * Every tile of the w x d footprint anchored at (x, z) must be buildable,
 * carry no road, and carry no building. Zone is irrelevant (any zone, or
 * none, is fine — placement doesn't require pre-zoning).
 */
export function canPlaceFootprint(
  g: GridState,
  x: number,
  z: number,
  w: number,
  d: number,
): boolean {
  if (w < 1 || d < 1) return false;

  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const tz = z + dz;
      if (!isBuildable(g, tx, tz)) return false;
      const i = indexOf(g.size, tx, tz); // in bounds: isBuildable already confirmed it
      if (g.roadTier[i] !== RoadTier.None) return false;
      if (g.buildingId[i] !== 0) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Zoning
// ---------------------------------------------------------------------------

/**
 * Paints `zone` onto every tile in `tiles` that is buildable, free of a
 * road, and (unless the request is a de-zone, i.e. zone === ZoneType.None)
 * free of a building AND within road frontage per isZonable
 * (world/zonable.ts) — a buildable, road-free tile with no
 * qualifying road frontage cannot be painted. A de-zone is exempt from the
 * frontage requirement: a zone can always be cleared, even from a tile that
 * is no longer (or was never) reachable from a road. Returns exactly the
 * tiles that were actually applied.
 */
export function setZones(g: GridState, tiles: TilePoint[], zone: ZoneType): TilePoint[] {
  const applied: TilePoint[] = [];

  for (const t of tiles) {
    const { x, z } = t;
    if (!isBuildable(g, x, z)) continue;

    const i = indexOf(g.size, x, z);
    if (g.roadTier[i] !== RoadTier.None) continue;
    if (g.buildingId[i] !== 0 && zone !== ZoneType.None) continue;
    if (zone !== ZoneType.None && !isZonable(g, x, z)) continue;

    g.zone[i] = zone;
    applied.push({ x, z });
  }

  return applied;
}

// ---------------------------------------------------------------------------
// Bulldoze
// ---------------------------------------------------------------------------

export interface ClearTilesResult {
  clearedRoads: TilePoint[];
  buildingIds: number[];
}

/**
 * Bulldozes `tiles`: always zeroes zone + trees on each in-bounds tile,
 * collects (and zeroes road/mask on) any tile that had a road, and collects
 * the unique set of building ids present. Because a building's footprint
 * can span tiles outside the requested set, every buildingId cell carrying
 * a collected id is zeroed across the WHOLE grid — the registry entry
 * itself is the caller's responsibility to remove.
 */
export function clearTiles(g: GridState, tiles: TilePoint[]): ClearTilesResult {
  const clearedRoads: TilePoint[] = [];
  const buildingIdSet = new Set<number>();

  for (const t of tiles) {
    const { x, z } = t;
    if (!inBoundsOf(g.size, x, z)) continue;

    const i = indexOf(g.size, x, z);

    g.zone[i] = ZoneType.None;
    g.trees[i] = 0;

    if (g.roadTier[i] !== RoadTier.None) {
      clearedRoads.push({ x, z });
      g.roadTier[i] = RoadTier.None;
      g.roadMask[i] = 0;
    }

    const bId = g.buildingId[i]!;
    if (bId !== 0) {
      buildingIdSet.add(bId);
    }
  }

  if (buildingIdSet.size > 0) {
    const n = g.size * g.size;
    for (let i = 0; i < n; i++) {
      const bId = g.buildingId[i]!;
      if (bId !== 0 && buildingIdSet.has(bId)) {
        g.buildingId[i] = 0;
      }
    }
  }

  return {
    clearedRoads,
    buildingIds: Array.from(buildingIdSet).sort((a, b) => a - b),
  };
}
