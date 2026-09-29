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
 * When the buildings the network reaches ask for more than the supply, the
 * grid gives out from its far end: buildings line up by network steps from
 * the nearest generator, and the ones past the end of the supply lose
 * coverage on their own footprint tiles only.
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
  UtilitySpec,
} from '../shared/types';
import { BuildingState, RoadTier, isStreetTier } from '../shared/types';
import { MAP_SIZE, inBounds, tileIndex } from '../shared/constants';
import { roadStep } from '../world/roads';
import { cellTile, freeCellsOn, neighbours, roadCellsOf } from '../world/roadnet';
import type { RoadCells } from '../world/roadnet';
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

/**
 * Supply and use are summed in thousandths (kW, litres) so a grid that exactly
 * meets its load is never cut by a floating-point remainder.
 */
const UNITS_PER_WHOLE = 1000;

/** An amount of MW or kL in the whole thousandths the utility line counts in. */
export function utilityUnits(amount: number): number {
  return Math.round(amount * UNITS_PER_WHOLE);
}

/** How one utility's supply fell across the buildings the network reaches. */
export interface UtilityLine {
  /** Buildings the network reaches that the supply ran out before. */
  cut: ReadonlySet<number>;
  /** Supply left once every building in line is carried, in utility units; negative when the grid is short. */
  spare: number;
}

export interface UtilityTotals {
  powerSupply: number;
  powerDemand: number;
  waterSupply: number;
  waterDemand: number;
  power: UtilityLine;
  water: UtilityLine;
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
 * Reaches every source tile itself, plus every NON-ROAD tile within
 * SERVICE_RADIUS orthogonal steps of a source, one step further out per
 * tile. Road tiles only ever become covered by being reachable in the
 * conducting BFS themselves (`sources` already IS that reachable set for
 * roads) — the 1-tile bleed exists so off-road buildings/zones pick up
 * service from an adjacent supplied road, it must not let service leak
 * sideways onto a non-conducting road tile (e.g. a highway that blocks
 * water) just because it happens to sit next to a supplied one.
 *
 * Returns each tile's steps from the nearest generator, -1 where nothing
 * reaches.
 */
function radiate(g: GridState, sources: ReadonlyMap<number, number>): Int32Array {
  const out = new Int32Array(MAP_SIZE * MAP_SIZE).fill(-1);
  const reach = (tile: number, steps: number): void => {
    const held = out[tile]!;
    if (held < 0 || steps < held) out[tile] = steps;
  };
  for (const [s, steps] of sources) {
    reach(s, steps);
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
        reach(ni, steps + Math.abs(dx) + Math.abs(dz));
      }
    }
  }
  return out;
}

/** Whether a cell carries a utility: a road cell or a power-line tile, by its predicate. */
type Conducts = (cells: RoadCells, id: number) => boolean;

/** The tiles orthogonally next to `tile`. */
function besideTile(tile: number): number[] {
  const x = tile % MAP_SIZE;
  const z = Math.floor(tile / MAP_SIZE);
  const out: number[] = [];
  for (const [ddx, ddz] of ORTHOGONAL) {
    if (inBounds(x + ddx, z + ddz)) out.push(tileIndex(x + ddx, z + ddz));
  }
  return out;
}

/**
 * The network cells orthogonally beside any of `footprintTiles` that carry
 * the utility — a road on the grid or off it, or (for power) a line. This is
 * where the walk starts, and nothing beside the footprint means nowhere to go.
 */
function networkCellsAdjacentTo(
  cells: RoadCells,
  footprintTiles: readonly number[],
  conducts: Conducts,
): number[] {
  const seeds = new Set<number>();
  for (const idx of footprintTiles) {
    for (const ni of besideTile(idx)) {
      if (conducts(cells, ni)) seeds.add(ni);
      for (const c of freeCellsOn(cells, ni)) if (conducts(cells, c)) seeds.add(c);
    }
  }
  return [...seeds];
}

/**
 * BFS across connected conducting cells starting from `seeds`, only stepping
 * onto (and stopping at) cells `conducts` takes. Non-conducting roads (a
 * highway for water, a road for neither) are excluded entirely — they neither
 * receive the utility nor act as a bridge to anything beyond them.
 *
 * Power travels two ways: along the roads built to carry it, where it goes
 * only where the road network joins one road to the next — over a road it
 * crosses and never down into it, and never across to a road that merely lies
 * alongside — and along a power line, which is not a road and hands it on to
 * whatever stands next to it.
 *
 * Returns each reached tile with its steps along the network: a seed is 1,
 * each cell beyond one more.
 */
function reachableNetworkTiles(
  g: GridState,
  cells: RoadCells,
  seeds: readonly number[],
  conducts: Conducts,
): Map<number, number> {
  const steps = new Map<number, number>(seeds.map((s) => [s, 1]));
  const queue: number[] = [...seeds];
  const n = MAP_SIZE * MAP_SIZE;
  const keys = 2 * n;
  const isLine = (tile: number): boolean => g.roadTier[tile] === 0 && g.powerLine[tile] === 1;
  const onward = (cur: number): number[] => {
    if (cells.tier[cur] === 0) {
      // A power line: the roads and lines next to it, on the grid or off it.
      const out: number[] = [];
      for (const [ddx, ddz] of ORTHOGONAL) {
        const next = roadStep(g, cur, ddx, ddz);
        if (next !== null) out.push(next);
      }
      for (const tile of besideTile(cur)) out.push(...freeCellsOn(cells, tile));
      return out;
    }
    const out = neighbours(cells, cur);
    if (cur < keys) {
      for (const [ddx, ddz] of ORTHOGONAL) {
        const next = roadStep(g, cur, ddx, ddz);
        if (next !== null && next < n && isLine(next)) out.push(next);
      }
    } else {
      for (const tile of besideTile(cellTile(cells, cur))) if (isLine(tile)) out.push(tile);
    }
    return out;
  };
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head]!;
    head += 1;
    const further = steps.get(cur)! + 1;
    for (const next of onward(cur)) {
      if (steps.has(next) || !conducts(cells, next)) continue;
      steps.set(next, further);
      queue.push(next);
    }
  }
  // Coverage is per tile; an overpass supplies the tile it stands over, from
  // whichever level reaches it first.
  const byTile = new Map<number, number>();
  for (const [id, s] of steps) {
    const tile = cellTile(cells, id);
    const held = byTile.get(tile);
    if (held === undefined || s < held) byTile.set(tile, s);
  }
  return byTile;
}

/**
 * Steps from the nearest of a set of generator footprints for every tile the
 * utility reaches, -1 elsewhere: the footprints are step 0, the network beside
 * them step 1, and everything the network reaches radiated out from there.
 */
function computeReach(
  g: GridState,
  footprintTiles: readonly number[],
  conducts: Conducts,
): Int32Array {
  if (footprintTiles.length === 0) return new Int32Array(MAP_SIZE * MAP_SIZE).fill(-1);
  const cells = roadCellsOf(g);
  const seeds = networkCellsAdjacentTo(cells, footprintTiles, conducts);
  const sources = reachableNetworkTiles(g, cells, seeds, conducts);
  for (const tile of footprintTiles) sources.set(tile, 0);
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
function conductsPower(g: GridState, cells: RoadCells, id: number): boolean {
  if (id < g.size * g.size && g.powerLine[id] === 1) return true;
  const tier = cells.tier[id] ?? 0;
  return isStreetTier(tier) && tierIsSealed(tier as RoadTier);
}

/** Only drivable streets whose spec carries water conduct it (highways excluded by default; rail is not a street, and neither is a power line). */
function conductsWater(cells: RoadCells, id: number): boolean {
  const tier = cells.tier[id] ?? 0;
  return isStreetTier(tier) && tierCarriesWater(tier as RoadTier);
}

/**
 * Whether a generator's footprint touches a tile that conducts what it makes.
 *
 * This is the very adjacency `computeCoverage` seeds its walk from, asked of
 * the same conduction predicates, so a generator reads as connected exactly
 * when it has somewhere to deliver to. A second, looser idea of "connected"
 * here would disagree with the coverage it is supposed to describe.
 *
 * Everything produced has to have a way out: a plant making both is stranded
 * if either has none, and a power line is a way out for electricity alone.
 */
export function utilityCanDeliver(
  g: GridState,
  utility: UtilitySpec,
  footprintTiles: readonly number[],
): boolean {
  const cells = roadCellsOf(g);
  const power: Conducts = (c, i) => conductsPower(g, c, i);
  if (utility.powerMW && networkCellsAdjacentTo(cells, footprintTiles, power).length === 0) {
    return false;
  }
  if (
    utility.waterKL &&
    networkCellsAdjacentTo(cells, footprintTiles, conductsWater).length === 0
  ) {
    return false;
  }
  return true;
}

/**
 * Writes one utility's coverage into `target` and cuts the grid from its far
 * end. Every building the network reaches stands in one line — nearest
 * generator first, by the steps to its nearest footprint tile, ties by
 * ascending id — whatever its state: one under construction is about to draw
 * its share and an abandoned one would draw it again on coming back, so
 * abandoning never hands a building its own supply back. Each one's use
 * accumulates against `supply`; once the running total exceeds it, that
 * building and every later one lose coverage on their footprint tiles only.
 * A building the network does not reach draws nothing and is not in line.
 */
function cutFromTheFarEnd(
  target: Uint8Array,
  reach: Int32Array,
  buildings: readonly BuildingInstance[],
  catalogMap: ReadonlyMap<string, BuildingCatalogEntry>,
  footprints: ReadonlyMap<number, number[]>,
  supply: number,
  usageOf: (spec: BuildingCatalogEntry) => number,
): UtilityLine & { demand: number } {
  for (let i = 0; i < reach.length; i++) target[i] = reach[i]! >= 0 ? 1 : 0;

  const line: { id: number; steps: number; use: number; tiles: number[] }[] = [];
  for (const b of buildings) {
    const spec = catalogMap.get(b.catalogId);
    if (!spec) continue;
    const use = utilityUnits(usageOf(spec));
    if (use <= 0) continue;
    const tiles = footprints.get(b.id);
    if (!tiles) continue;
    let steps = -1;
    for (const t of tiles) {
      const s = reach[t]!;
      if (s >= 0 && (steps < 0 || s < steps)) steps = s;
    }
    if (steps < 0) continue;
    line.push({ id: b.id, steps, use, tiles });
  }
  line.sort((a, b) => a.steps - b.steps || a.id - b.id);

  const available = utilityUnits(supply);
  const cut = new Set<number>();
  let running = 0;
  for (const entry of line) {
    running += entry.use;
    if (running <= available) continue;
    cut.add(entry.id);
    for (const t of entry.tiles) target[t] = 0;
  }
  return { cut, spare: available - running, demand: running / UNITS_PER_WHOLE };
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

  const powerReach = computeReach(g, powerFootprints, (c, i) => conductsPower(g, c, i));
  const waterReach = computeReach(g, waterFootprints, conductsWater);

  const { demand: powerDemand, ...power } = cutFromTheFarEnd(
    g.power,
    powerReach,
    buildings,
    catalogMap,
    footprints,
    powerSupply,
    (s) => s.powerUse,
  );
  const { demand: waterDemand, ...water } = cutFromTheFarEnd(
    g.watered,
    waterReach,
    buildings,
    catalogMap,
    footprints,
    waterSupply,
    (s) => s.waterUse,
  );

  return { powerSupply, powerDemand, waterSupply, waterDemand, power, water };
}
