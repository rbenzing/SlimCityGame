/**
 * SlimCity world grid: the layered tile-grid data model plus
 * pure buildability/zoning/bulldoze logic. No three.js/DOM here — this is
 * the sim-worker-owned model, unit-testable without a GPU.
 */

import { MAP_SIZE, MAX_BUILD_SLOPE, ROAD_MAX_SLOPE } from '../shared/constants';
import {
  FIELD_COUNT,
  RoadFlow,
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
    roadElevation: new Float32Array(n),
    roadProfile: new Uint16Array(n),
    roadFlow: new Uint8Array(n),
    junctionControl: new Uint8Array(n),
    junctionTurns: new Uint16Array(n),
    junctionLaneTurns: new Uint16Array(n * ARMS_PER_TILE),
    powerLine: new Uint8Array(n),
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
// SAVE_VERSION 8 layout: 4 (height) + 4 (buildingId) + 4 (roadElevation) + 2
// (roadProfile) + 20 single-byte layers (7 flat: water/trees/zone/roadTier/
// roadMask/power/watered) + 9 fields + 1 district + 1 landfill + 1 roadFlow +
// 1 junctionControl.
const BYTES_PER_TILE = 45;
/** Arms a junction has, and so entries the per-lane layer keeps per tile. */
export const ARMS_PER_TILE = 4;
// v9 is this layout without the trailing powerLine layer, which loads empty so
// an older city has no lines anywhere and is supplied purely along its roads;
// v7 is this layout without the trailing junctionControl layer, which loads
// unset so every junction takes the control its warrant works out; v6 drops
// roadFlow too; v5 drops the roadProfile layer, deriving it from roadTier on
// load; v4 is v5 with roadElevation still one byte per tile;
// each version before that drops one trailing layer — v3 district + landfill
// but no elevation, v2 district only, v1 none of them. deserializeGrid accepts
// all of them, widening v4's byte and defaulting every absent trailing layer.
// v10 is this layout without the trailing junctionLaneTurns layer, which loads
// zero so every lane takes the set its approach derives for it.
const BYTES_PER_TILE_V10 = 37;
const BYTES_PER_TILE_V9 = 36;
const BYTES_PER_TILE_V8 = 34;
const BYTES_PER_TILE_V7 = 33;
const BYTES_PER_TILE_V6 = 32;
const BYTES_PER_TILE_V5 = 30;
const BYTES_PER_TILE_V4 = 27;
const BYTES_PER_TILE_V3 = 26;
const BYTES_PER_TILE_V2 = 25;
const BYTES_PER_TILE_V1 = 24;

/**
 * How wide a tile is in each save version, indexed by version number.
 *
 * Exported because the migration tests synthesize an older buffer by trimming
 * the current one, and the amount to trim is exactly the difference between
 * two entries here. Written down a second time in the tests, it goes stale the
 * next time a layer is added — and a stale figure there does not fail loudly,
 * it silently stops testing the migration it names.
 */
export const BYTES_PER_TILE_BY_VERSION: readonly number[] = [
  0,
  BYTES_PER_TILE_V1,
  BYTES_PER_TILE_V2,
  BYTES_PER_TILE_V3,
  BYTES_PER_TILE_V4,
  BYTES_PER_TILE_V5,
  BYTES_PER_TILE_V6,
  BYTES_PER_TILE_V7,
  BYTES_PER_TILE_V8,
  BYTES_PER_TILE_V9,
  BYTES_PER_TILE_V10,
  BYTES_PER_TILE,
];

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

  // Trailing additive layers, in version order: district (v2), landfill (v3),
  // then roadElevation (v4, widened to a float in v5). Placed last so an older
  // buffer is simply this buffer without its final bytes per absent layer (see
  // deserializeGrid).
  bytes.set(g.district, offset);
  offset += n;
  bytes.set(g.landfill, offset);
  offset += n;
  for (let i = 0; i < n; i++) {
    view.setFloat32(offset + i * 4, g.roadElevation[i]!, true);
  }
  offset += n * 4;
  // roadProfile (v6): two bytes per tile, so a save can hold thousands of
  // composed profiles rather than a byte's worth.
  for (let i = 0; i < n; i++) {
    view.setUint16(offset + i * 2, g.roadProfile[i]!, true);
  }
  offset += n * 2;
  // roadFlow (v7): one byte per tile — which way each road runs.
  bytes.set(g.roadFlow, offset);
  offset += n;
  // junctionControl (v8): one byte per tile — the player's override, 0 where
  // they have left the junction on the control its warrant works out.
  bytes.set(g.junctionControl, offset);
  offset += n;
  // junctionTurns (v9): two bytes per tile — the turns each arm of a junction
  // allows, a nibble apiece, zero where nothing is restricted.
  for (let i = 0; i < n; i++) {
    view.setUint16(offset + i * 2, g.junctionTurns[i]!, true);
  }
  offset += n * 2;
  // powerLine (v10): one byte per tile — whether a power line stands here.
  bytes.set(g.powerLine, offset);
  offset += n;
  // junctionLaneTurns (v11): eight bytes per tile — four arms of four lanes, a
  // nibble each, zero where the lane takes its derived default.
  for (let i = 0; i < n * ARMS_PER_TILE; i++) {
    view.setUint16(offset + i * 2, g.junctionLaneTurns[i]!, true);
  }

  return buffer;
}

export function deserializeGrid(buf: ArrayBuffer): GridState {
  const view = new DataView(buf);
  const version = view.getUint32(0, true);
  // SAVE_VERSION 7 is current; v1..v6 are accepted for migration — they are
  // identical except for the trailing district (v2+), landfill (v3+),
  // roadElevation (v4+) and roadProfile (v6) layers, each defaulted here when
  // absent (a missing profile layer is derived from the tier, since every road
  // before profiles existed was a preset), and for v4 storing elevation as one
  // byte per tile rather than a float.
  if (version < 1 || version > SAVE_VERSION) {
    throw new Error(
      `deserializeGrid: unsupported save version ${version} (expected ${SAVE_VERSION})`,
    );
  }
  const hasDistrict = version >= 2;
  const hasLandfill = version >= 3;
  const hasRoadElevation = version >= 4;
  const elevationIsByte = version === 4;
  const hasRoadProfile = version >= 6;
  const hasRoadFlow = version >= 7;
  const hasJunctionControl = version >= 8;
  const hasJunctionTurns = version >= 9;
  const hasPowerLine = version >= 10;
  const hasJunctionLaneTurns = version >= 11;

  const size = view.getUint32(4, true);
  const n = size * size;
  const bytesPerTile = BYTES_PER_TILE_BY_VERSION[version] ?? BYTES_PER_TILE;
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
  if (hasLandfill) offset += n;
  // Elevation layer (v4+). Older buffers stop here — every road loads at
  // grade. A v4 buffer stored it as whole metres per tile; widening the byte
  // keeps the bridge, at the height it was saved at.
  const roadElevation = new Float32Array(n);
  if (elevationIsByte) {
    for (let i = 0; i < n; i++) roadElevation[i] = bytes[offset + i] ?? 0;
    offset += n;
  } else if (hasRoadElevation) {
    for (let i = 0; i < n; i++) roadElevation[i] = view.getFloat32(offset + i * 4, true);
    offset += n * 4;
  }
  // Profile layer (v6+). An older buffer's roads were all presets, whose
  // profile id is their tier.
  const roadProfile = new Uint16Array(n);
  if (hasRoadProfile) {
    for (let i = 0; i < n; i++) roadProfile[i] = view.getUint16(offset + i * 2, true);
    offset += n * 2;
  } else {
    for (let i = 0; i < n; i++) roadProfile[i] = roadTier[i] ?? 0;
  }
  // Flow layer (v7+). An older buffer's roads never recorded which way they
  // were drawn, so they load unset and every reader falls back to the geometry
  // it read before there was a stored direction.
  const roadFlow = hasRoadFlow ? bytes.slice(offset, offset + n) : new Uint8Array(n);
  if (hasRoadFlow) offset += n;
  // Junction control layer (v8+). An older buffer never overrode a junction,
  // so every one of them loads on the control its warrant works out.
  const junctionControl = hasJunctionControl ? bytes.slice(offset, offset + n) : new Uint8Array(n);
  if (hasJunctionControl) offset += n;
  // Junction turn layer (v9+). An older buffer restricted nothing, so every
  // arm allows what its lanes offer.
  const junctionTurns = new Uint16Array(n);
  if (hasJunctionTurns) {
    for (let i = 0; i < n; i++) junctionTurns[i] = view.getUint16(offset + i * 2, true);
    offset += n * 2;
  }
  // Power-line layer (v10+). An older buffer has none, so the city loads
  // supplied purely along the roads it already had.
  const powerLine = hasPowerLine ? bytes.slice(offset, offset + n) : new Uint8Array(n);
  if (hasPowerLine) offset += n;
  // Per-lane turn layer (v11+). An older buffer restricted no lane, so every
  // one of them loads on the set its approach derives.
  const junctionLaneTurns = new Uint16Array(n * ARMS_PER_TILE);
  if (hasJunctionLaneTurns) {
    for (let i = 0; i < n * ARMS_PER_TILE; i++) {
      junctionLaneTurns[i] = view.getUint16(offset + i * 2, true);
    }
  }

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
    roadElevation,
    roadProfile,
    roadFlow,
    junctionControl,
    junctionTurns,
    junctionLaneTurns,
    powerLine,
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
 * Buildability for a tile that will carry an ELEVATED deck. A deck rests on
 * piers, so neither ground rule applies: water is exactly what a bridge is for,
 * and the deck stays level no matter what the terrain does beneath it. Only
 * bounds survive — the caller still checks that no building occupies the tile.
 */
export function isBridgeBuildable(g: GridState, x: number, z: number): boolean {
  return inBoundsOf(g.size, x, z);
}

/** Deck height in metres above terrain at a tile, 0 where the road is at grade. */
export function elevationAt(g: GridState, x: number, z: number): number {
  if (!inBoundsOf(g.size, x, z)) return 0;
  return g.roadElevation[indexOf(g.size, x, z)] ?? 0;
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

/**
 * True when any tile orthogonally touching the w x d footprint at (x, z)
 * carries a tier `inNetwork` accepts — the ring around the footprint, not the
 * footprint itself, since the building sits on its own tiles and the track runs
 * beside them.
 *
 * This is a PLACEMENT gate, unlike the road access that governs whether a lot
 * develops: a station off the track is not a station.
 */
export function hasAdjacentTier(
  g: GridState,
  x: number,
  z: number,
  w: number,
  d: number,
  inNetwork: (tier: RoadTier) => boolean,
): boolean {
  for (let dz = -1; dz <= d; dz++) {
    for (let dx = -1; dx <= w; dx++) {
      const insideX = dx >= 0 && dx < w;
      const insideZ = dz >= 0 && dz < d;
      if (insideX && insideZ) continue; // the footprint itself
      if ((dx === -1 || dx === w) && (dz === -1 || dz === d)) continue; // corners touch nothing
      const tx = x + dx;
      const tz = z + dz;
      if (!inBoundsOf(g.size, tx, tz)) continue;
      if (inNetwork((g.roadTier[indexOf(g.size, tx, tz)] ?? RoadTier.None) as RoadTier))
        return true;
    }
  }
  return false;
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
      g.roadProfile[i] = 0;
      g.roadFlow[i] = RoadFlow.None;
      g.junctionControl[i] = 0;
      g.junctionTurns[i] = 0;
      for (let arm = 0; arm < ARMS_PER_TILE; arm++) g.junctionLaneTurns[i * ARMS_PER_TILE + arm] = 0;
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
