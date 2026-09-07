/**
 * Power & water utility propagation along the road graph.
 *
 * Power and water do not radiate from utility buildings as plain radius
 * coverage. Instead they propagate along the ROAD GRAPH: BFS
 * from any road tile orthogonally adjacent to a generator's footprint,
 * across connected road tiles, then every tile within 1 orthogonal step of
 * any supplied road/source tile is covered. Power conducts across every
 * SEALED road tile (highways included — street lighting) and along a power
 * line, which is not a road at all; an unsealed road has no cable in it and
 * so conducts nothing. Water conducts across every road tile EXCEPT ones on
 * a spec with `carriesWater === false` (highways by default). A tile that
 * does not conduct neither receives the utility itself nor lets it propagate
 * through to tiles beyond.
 *
 * When total demand exceeds total supply, consumers (sorted by ascending
 * building id) beyond the supply budget are cut first — only their own
 * footprint tiles lose coverage.
 *
 * Power and water are computed identically (module the water-conduction
 * filter) but fully independently.
 */

import type {
  BuildingCatalogEntry,
  BuildingInstance,
  GridState,
  RoadClassSpec,
  RoadSpec,
} from '../shared/types';
import { BuildingState, RoadTier, isStreetTier } from '../shared/types';
import { MAP_SIZE, inBounds, tileIndex } from '../shared/constants';
import roadsData from '../data/roads.json';

const ROAD_DATA = roadsData as { specs: RoadSpec[]; classes: RoadClassSpec[] };
const ROAD_SPECS = ROAD_DATA.specs;
const SURFACE_BY_CLASS = new Map(ROAD_DATA.classes.map((c) => [c.id, c.surface]));

/** RoadTier -> whether the tier's pipes carry water (default true; highways set false). */
const CARRIES_WATER_BY_TIER = new Map<number, boolean>(
  ROAD_SPECS.map((s) => [s.tier, s.carriesWater ?? true]),
);

/**
 * RoadTier -> whether the road is sealed. A cable is laid in a made-up road
 * and not in a dirt track, so this is what decides whether a road conducts
 * electricity at all. Derived from the class's own surface rather than a flag
 * beside it, so the two can never disagree about what a road is made of.
 */
const IS_SEALED_BY_TIER = new Map<number, boolean>(
  ROAD_SPECS.map((s) => {
    const surface = s.profile ? SURFACE_BY_CLASS.get(s.profile.class) : undefined;
    // A preset with no cross-section names no class, so nothing says it is
    // unmade; it keeps the cable every road had before this rule existed.
    return [s.tier, surface === undefined || surface === 'paved'];
  }),
);

function tierCarriesWater(tier: number): boolean {
  return CARRIES_WATER_BY_TIER.get(tier) ?? true;
}

/** Whether the tier's road is made up; an unknown tier is assumed sealed. */
export function tierIsSealed(tier: number): boolean {
  return IS_SEALED_BY_TIER.get(tier) ?? true;
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

/**
 * Tiles orthogonally adjacent to any of `footprintTiles` that carry the
 * utility's network at all — a road, or (for power) a line. Whether such a
 * tile actually conducts is the BFS's business; this only finds the candidates.
 */
function networkTilesAdjacentTo(
  footprintTiles: readonly number[],
  carriesNetwork: (index: number) => boolean,
): number[] {
  const seeds = new Set<number>();
  for (const idx of footprintTiles) {
    const x = idx % MAP_SIZE;
    const z = Math.floor(idx / MAP_SIZE);
    for (const [ddx, ddz] of ORTHOGONAL) {
      const nx = x + ddx;
      const nz = z + ddz;
      if (!inBounds(nx, nz)) continue;
      const ni = tileIndex(nx, nz);
      if (carriesNetwork(ni)) seeds.add(ni);
    }
  }
  return [...seeds];
}

/**
 * BFS across connected conducting tiles starting from `seeds`, only stepping
 * onto (and stopping at) tiles for which `conducts(index)` is true.
 * Non-conducting tiles (a highway for water, a road for neither) are excluded
 * entirely — they neither receive the utility nor act as a bridge to tiles
 * beyond them.
 *
 * The predicate is per TILE rather than per tier because power travels two
 * ways: along the roads built to carry it, and along a power line, which is
 * not a road and has no tier at all.
 */
function reachableNetworkTiles(
  seeds: readonly number[],
  conducts: (index: number) => boolean,
): number[] {
  const visited = new Set<number>();
  const queue: number[] = [];
  for (const s of seeds) {
    if (!conducts(s)) continue;
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
      if (!conducts(ni)) continue;
      visited.add(ni);
      queue.push(ni);
    }
  }
  return [...visited];
}

/** Coverage grid (0/1) for a set of generator footprints: footprints + everything the network reaches, radiated. */
function computeCoverage(
  g: GridState,
  footprintTiles: readonly number[],
  conducts: (index: number) => boolean,
): Uint8Array {
  if (footprintTiles.length === 0) return new Uint8Array(MAP_SIZE * MAP_SIZE);
  const seeds = networkTilesAdjacentTo(footprintTiles, conducts);
  const reached = reachableNetworkTiles(seeds, conducts);
  const sources = new Set<number>(footprintTiles);
  for (const r of reached) sources.add(r);
  return radiate(g, sources);
}

/**
 * Electricity travels along a SEALED street — a made-up road has a cable in
 * it, a dirt track has not — and along a power line, which is not a street
 * and carries nothing else. Motorways conduct (they light themselves); rail
 * is not a street and conducts nothing.
 *
 * A road that does not conduct is not merely unpowered: it is no bridge
 * either, so a lot reached only down a dirt lane needs a line run to it.
 */
function conductsPower(g: GridState, index: number): boolean {
  if (g.powerLine[index] === 1) return true;
  const tier = g.roadTier[index]!;
  return isStreetTier(tier) && tierIsSealed(tier);
}

/** Only drivable streets whose spec carries water conduct it (highways excluded by default; rail is not a street, and neither is a power line). */
function conductsWater(g: GridState, index: number): boolean {
  const tier = g.roadTier[index]!;
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

  const powerCoverage = computeCoverage(g, powerFootprints, (i) => conductsPower(g, i));
  const waterCoverage = computeCoverage(g, waterFootprints, (i) => conductsWater(g, i));

  g.power.set(powerCoverage);
  g.watered.set(waterCoverage);

  applyBrownout(g.power, buildings, catalogMap, footprints, powerSupply, (s) => s.powerUse);
  applyBrownout(g.watered, buildings, catalogMap, footprints, waterSupply, (s) => s.waterUse);

  return { powerSupply, powerDemand, waterSupply, waterDemand };
}
