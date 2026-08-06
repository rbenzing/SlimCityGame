/**
 * Power & water utility propagation along the road graph.
 *
 * Power and water do not radiate from utility buildings as plain radius
 * coverage. Instead they propagate along the ROAD GRAPH: BFS
 * from any road tile orthogonally adjacent to a generator's footprint,
 * across connected road tiles, then every tile within 1 orthogonal step of
 * any supplied road/source tile is covered. Power conducts across every
 * road tile (including highways — street lighting). Water conducts across
 * every road tile EXCEPT ones on a spec with `carriesWater === false`
 * (highways by default): such a tile neither receives water itself nor
 * lets water propagate through it to tiles beyond.
 *
 * When total demand exceeds total supply, consumers (sorted by ascending
 * building id) beyond the supply budget are cut first — only their own
 * footprint tiles lose coverage.
 *
 * Power and water are computed identically (module the water-conduction
 * filter) but fully independently.
 */

import type { BuildingCatalogEntry, BuildingInstance, GridState, RoadSpec } from '../shared/types';
import { BuildingState, RoadTier, isStreetTier } from '../shared/types';
import { MAP_SIZE, inBounds, tileIndex } from '../shared/constants';
import roadsData from '../data/roads.json';

const ROAD_SPECS = (roadsData as { specs: RoadSpec[] }).specs;

/** RoadTier -> whether the tier's pipes carry water (default true; highways set false). */
const CARRIES_WATER_BY_TIER = new Map<number, boolean>(
  ROAD_SPECS.map((s) => [s.tier, s.carriesWater ?? true]),
);

function tierCarriesWater(tier: number): boolean {
  return CARRIES_WATER_BY_TIER.get(tier) ?? true;
}

/**
 * How far service radiates (in orthogonal steps) from a supplied road/source
 * tile onto non-road tiles (within 1 tile of a supplied road).
 */
const SERVICE_RADIUS = 1;

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface UtilityTotals {
  powerSupply: number;
  powerDemand: number;
  waterSupply: number;
  waterDemand: number;
}

/** Building-id -> footprint tile indices, derived from the grid's occupancy layer. */
function footprintsByBuildingId(g: GridState): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (let i = 0; i < g.buildingId.length; i++) {
    const id = g.buildingId[i]!;
    if (id === 0) continue;
    const existing = map.get(id);
    if (existing) existing.push(i);
    else map.set(id, [i]);
  }
  return map;
}

/**
 * Marks every source tile itself, plus every NON-ROAD tile within
 * SERVICE_RADIUS orthogonal steps of a source. Road tiles only ever become
 * covered by being reachable in the conducting BFS themselves (`sources`
 * already IS that reachable set for roads) — the 1-tile bleed exists so
 * off-road buildings/zones pick up service from an adjacent supplied road,
 * it must not let service leak sideways onto a non-conducting road tile
 * (e.g. a highway that blocks water) just because it happens to sit next to
 * a supplied one.
 */
function radiate(g: GridState, sources: Iterable<number>): Uint8Array {
  const out = new Uint8Array(MAP_SIZE * MAP_SIZE);
  for (const s of sources) {
    out[s] = 1;
    const sx = s % MAP_SIZE;
    const sz = Math.floor(s / MAP_SIZE);
    for (let dz = -SERVICE_RADIUS; dz <= SERVICE_RADIUS; dz++) {
      const remaining = SERVICE_RADIUS - Math.abs(dz);
      for (let dx = -remaining; dx <= remaining; dx++) {
        const x = sx + dx;
        const z = sz + dz;
        if (!inBounds(x, z)) continue;
        const ni = tileIndex(x, z);
        if (g.roadTier[ni]! !== RoadTier.None) continue;
        out[ni] = 1;
      }
    }
  }
  return out;
}

/** Road tiles orthogonally adjacent to any of `footprintTiles` (any tier — filtering by conduction happens in the BFS). */
function roadTilesAdjacentTo(g: GridState, footprintTiles: readonly number[]): number[] {
  const seeds = new Set<number>();
  for (const idx of footprintTiles) {
    const x = idx % MAP_SIZE;
    const z = Math.floor(idx / MAP_SIZE);
    for (const [ddx, ddz] of ORTHOGONAL) {
      const nx = x + ddx;
      const nz = z + ddz;
      if (!inBounds(nx, nz)) continue;
      const ni = tileIndex(nx, nz);
      if (g.roadTier[ni]! !== RoadTier.None) seeds.add(ni);
    }
  }
  return [...seeds];
}

/**
 * BFS across connected road tiles starting from `seeds`, only stepping onto
 * (and stopping at) tiles for which `conducts(tier)` is true. Non-conducting
 * tiles (e.g. highways for water) are excluded entirely — they neither
 * receive the utility nor act as a bridge to tiles beyond them.
 */
function reachableRoadTiles(
  g: GridState,
  seeds: readonly number[],
  conducts: (tier: number) => boolean,
): number[] {
  const visited = new Set<number>();
  const queue: number[] = [];
  for (const s of seeds) {
    if (!conducts(g.roadTier[s]!)) continue;
    visited.add(s);
    queue.push(s);
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head]!;
    head += 1;
    const x = cur % MAP_SIZE;
    const z = Math.floor(cur / MAP_SIZE);
    for (const [ddx, ddz] of ORTHOGONAL) {
      const nx = x + ddx;
      const nz = z + ddz;
      if (!inBounds(nx, nz)) continue;
      const ni = tileIndex(nx, nz);
      if (visited.has(ni)) continue;
      const tier = g.roadTier[ni]!;
      if (tier === RoadTier.None) continue;
      if (!conducts(tier)) continue;
      visited.add(ni);
      queue.push(ni);
    }
  }
  return [...visited];
}

/** Coverage grid (0/1) for a set of generator footprints: footprints + reachable (conducting) roads, radiated. */
function computeCoverage(
  g: GridState,
  footprintTiles: readonly number[],
  conducts: (tier: number) => boolean,
): Uint8Array {
  if (footprintTiles.length === 0) return new Uint8Array(MAP_SIZE * MAP_SIZE);
  const roadSeeds = roadTilesAdjacentTo(g, footprintTiles);
  const roads = reachableRoadTiles(g, roadSeeds, conducts);
  const sources = new Set<number>(footprintTiles);
  for (const r of roads) sources.add(r);
  return radiate(g, sources);
}

/** Every drivable street conducts power (highways included — street lighting); rail is not a street and conducts nothing. */
function conductsPower(tier: number): boolean {
  return isStreetTier(tier);
}

/** Only drivable streets whose spec carries water conduct it (highways excluded by default; rail is not a street). */
function conductsWater(tier: number): boolean {
  return isStreetTier(tier) && tierCarriesWater(tier);
}

/**
 * Clears bits on `target` for consumer footprints beyond the supply budget.
 * Consumers are sorted by ascending building id; each one's usage accumulates
 * against `supply` — once the running total exceeds it, that building (and,
 * by construction, every later one) loses coverage on its footprint tiles only.
 */
function applyBrownout(
  target: Uint8Array,
  buildings: readonly BuildingInstance[],
  catalogMap: ReadonlyMap<string, BuildingCatalogEntry>,
  footprints: ReadonlyMap<number, number[]>,
  supply: number,
  usageOf: (spec: BuildingCatalogEntry) => number,
): void {
  const consumers = buildings
    .filter((b) => b.state !== BuildingState.Abandoned)
    .slice()
    .sort((a, b) => a.id - b.id);

  let running = 0;
  for (const b of consumers) {
    const spec = catalogMap.get(b.catalogId);
    if (!spec) continue;
    running += usageOf(spec);
    if (running > supply) {
      const tiles = footprints.get(b.id);
      if (!tiles) continue;
      for (const t of tiles) target[t] = 0;
    }
  }
}

/**
 * Recomputes power/water supply, demand, and per-tile coverage (g.power,
 * g.watered) for the current instant. Pure function of the grid + building
 * registry; safe to call every tick or on-demand after edits.
 */
export function recomputeUtilities(
  g: GridState,
  buildings: BuildingInstance[],
  catalog: BuildingCatalogEntry[],
): UtilityTotals {
  const catalogMap = new Map(catalog.map((c) => [c.id, c] as const));
  const footprints = footprintsByBuildingId(g);

  let powerDemand = 0;
  let waterDemand = 0;
  for (const b of buildings) {
    if (b.state === BuildingState.Abandoned) continue;
    const spec = catalogMap.get(b.catalogId);
    if (!spec) continue;
    powerDemand += spec.powerUse;
    waterDemand += spec.waterUse;
  }

  let powerSupply = 0;
  let waterSupply = 0;
  const powerFootprints: number[] = [];
  const waterFootprints: number[] = [];
  for (const b of buildings) {
    if (b.state !== BuildingState.Active && b.state !== BuildingState.Constructing) continue;
    const spec = catalogMap.get(b.catalogId);
    if (!spec || !spec.utility) continue;
    const tiles = footprints.get(b.id);
    if (!tiles) continue;
    if (spec.utility.powerMW) {
      powerSupply += spec.utility.powerMW;
      powerFootprints.push(...tiles);
    }
    if (spec.utility.waterKL) {
      waterSupply += spec.utility.waterKL;
      waterFootprints.push(...tiles);
    }
  }

  const powerCoverage = computeCoverage(g, powerFootprints, conductsPower);
  const waterCoverage = computeCoverage(g, waterFootprints, conductsWater);

  g.power.set(powerCoverage);
  g.watered.set(waterCoverage);

  applyBrownout(g.power, buildings, catalogMap, footprints, powerSupply, (s) => s.powerUse);
  applyBrownout(g.watered, buildings, catalogMap, footprints, waterSupply, (s) => s.waterUse);

  return { powerSupply, powerDemand, waterSupply, waterDemand };
}
