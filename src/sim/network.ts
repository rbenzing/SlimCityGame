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
 * a spec with `carriesWater === false` (a dirt road and the motorway network),
 * and along a water pipe, which is the power line's counterpart. A tile that
 * does not conduct neither receives the utility itself nor lets it propagate
 * through to tiles beyond.
 *
 * Sewage is the third utility and runs the other way: a drain takes what the
 * buildings its network reaches make, over the same mains and pipes water
 * travels, since a street's main is also its sewer.
 *
 * When the buildings the network reaches ask for more than the supply, the
 * grid gives out from its far end: buildings line up by network steps from
 * the nearest generator, and the ones past the end of the supply lose
 * coverage on their own footprint tiles only.
 *
 * Power, water and sewer are computed identically (modulo each one's
 * conduction filter) but fully independently.
 */

import type {
  BuildingCatalogEntry,
  BuildingInstance,
  GridState,
  RoadClassSpec,
  RoadSpec,
  UtilitySpec,
} from '../shared/types';
import { BuildingState, RoadTier, ZoneType, isStreetTier } from '../shared/types';
import {
  MAP_SIZE,
  ROAD_CHECK_RADIUS,
  SEWAGE_RETURN_FRACTION,
  SEWER_MILESTONE,
  WATER_FOUL_PER_KL,
  WATER_FOUL_REACH_TILES,
  inBounds,
  tileIndex,
} from '../shared/constants';
import { averageOutputMW } from '../shared/power';
import { footprintForRotation } from '../shared/footprint';
import { lotTiles } from './buildings';
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
 * Supply and use are summed in whole millionths (W, mL) so a grid that exactly
 * meets its load is never cut by a floating-point remainder, and a house's
 * 1.4 kW is not rounded to 1 kW.
 */
const UNITS_PER_WHOLE = 1_000_000;

/** An amount of MW or kL in the whole millionths the utility line counts in. */
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
  /** What the water sources yield, the intakes scaled by the fouling beside them. */
  waterSupply: number;
  waterDemand: number;
  /** The water the intakes would make but for that fouling. */
  waterFouled: number;
  sewerSupply: number;
  sewerDemand: number;
  power: UtilityLine;
  water: UtilityLine;
  sewer: UtilityLine;
  /** Each shore intake's yield as a fraction of its rating, by building id. */
  intakeYield: ReadonlyMap<number, number>;
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

/** Whether a cell carries a utility: a road cell or a line tile, by its predicate. */
type Conducts = (cells: RoadCells, id: number) => boolean;

/** Whether a bare tile — no road on it — carries the utility's own line: a power line, a pipe. */
type IsLine = (tile: number) => boolean;

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
 * A utility travels two ways: along the roads built to carry it, where it goes
 * only where the road network joins one road to the next — over a road it
 * crosses and never down into it, and never across to a road that merely lies
 * alongside — and along its own line (a power line, a water pipe), which is
 * not a road and hands it on to whatever stands next to it.
 *
 * Returns each reached tile with its steps along the network: a seed is 1,
 * each cell beyond one more.
 */
function reachableNetworkTiles(
  g: GridState,
  cells: RoadCells,
  seeds: readonly number[],
  conducts: Conducts,
  isLine: IsLine,
): Map<number, number> {
  const steps = new Map<number, number>(seeds.map((s) => [s, 1]));
  const queue: number[] = [...seeds];
  const n = MAP_SIZE * MAP_SIZE;
  const keys = 2 * n;
  const onward = (cur: number): number[] => {
    if (cells.tier[cur] === 0) {
      // A line: the roads and lines next to it, on the grid or off it.
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
  isLine: IsLine,
): Int32Array {
  if (footprintTiles.length === 0) return new Int32Array(MAP_SIZE * MAP_SIZE).fill(-1);
  const cells = roadCellsOf(g);
  const seeds = networkCellsAdjacentTo(cells, footprintTiles, conducts);
  const sources = reachableNetworkTiles(g, cells, seeds, conducts, isLine);
  for (const tile of footprintTiles) sources.set(tile, 0);
  return radiate(g, sources);
}

/** A bare tile carrying a power line. */
const isPowerLine =
  (g: GridState): IsLine =>
  (tile) =>
    g.roadTier[tile] === 0 && g.powerLine[tile] === 1;

/** A bare tile carrying a water pipe. */
const isWaterPipe =
  (g: GridState): IsLine =>
  (tile) =>
    g.roadTier[tile] === 0 && g.waterPipe[tile] === 1;

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

/**
 * Water, and the sewage that comes back, travel along a drivable street whose
 * spec carries water (no dirt road or motorway; rail is not a street) and
 * along a water pipe, which carries both and nothing else.
 */
function conductsWater(g: GridState, cells: RoadCells, id: number): boolean {
  if (id < g.size * g.size && g.waterPipe[id] === 1) return true;
  const tier = cells.tier[id] ?? 0;
  return isStreetTier(tier) && tierCarriesWater(tier as RoadTier);
}

/**
 * A main orthogonally beside any of `tiles` — a road that carries water, on
 * the grid or off it, or a pipe: the very adjacency the network hands water to
 * a lot across.
 */
function mainBeside(g: GridState, tiles: readonly number[]): boolean {
  const cells = g.roads ? roadCellsOf(g) : null;
  for (const idx of tiles) {
    for (const ni of besideTile(idx)) {
      if (g.waterPipe[ni] === 1) return true;
      const tier = g.roadTier[ni]!;
      if (isStreetTier(tier) && tierCarriesWater(tier as RoadTier)) return true;
      if (cells && freeCellsOn(cells, ni).some((c) => conductsWater(g, cells, c))) return true;
    }
  }
  return false;
}

/** A dirt road, on the grid or off it, within ROAD_CHECK_RADIUS of any tile of the w×d lot at (x, z). */
export function dirtRoadWithinReach(
  g: GridState,
  x: number,
  z: number,
  w: number,
  d: number,
): boolean {
  const cells = g.roads ? roadCellsOf(g) : null;
  const r = ROAD_CHECK_RADIUS;
  for (let tz = z - r; tz < z + d + r; tz++) {
    for (let tx = x - r; tx < x + w + r; tx++) {
      if (!inBounds(tx, tz)) continue;
      const out = Math.max(x - tx, 0, tx - (x + w - 1)) + Math.max(z - tz, 0, tz - (z + d - 1));
      if (out > r) continue;
      const idx = tileIndex(tx, tz);
      if (g.roadTier[idx] === RoadTier.Gravel) return true;
      if (cells && freeCellsOn(cells, idx).some((c) => cells.tier[c] === RoadTier.Gravel)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * What a w×d building at (x, z) draws from the city's water, in kL. A
 * low-density house that a dirt road serves and no main runs beside is on a
 * private well and draws nothing, as a farm does. Only the roads decide, never
 * the supply, so a shortage never moves a house onto a well.
 */
export function cityWaterUse(
  g: GridState,
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  w: number,
  d: number,
): number {
  if (entry.waterUse <= 0 || entry.zone !== ZoneType.ResLow) return entry.waterUse;
  if (mainBeside(g, lotTiles(x, z, w, d))) return entry.waterUse;
  return dirtRoadWithinReach(g, x, z, w, d) ? 0 : entry.waterUse;
}

/**
 * The sewage a w×d building at (x, z) sends to the city's drains, in kL a
 * day: the return-to-sewer share of the city water it draws. A house on a
 * well is on a septic tank and sends none; a farm sends none; and until the
 * city reaches SEWER_MILESTONE the whole town is on septic tanks and sends
 * none, so a small town grows on power and water alone.
 */
export function sewageOf(
  g: GridState,
  entry: BuildingCatalogEntry,
  x: number,
  z: number,
  w: number,
  d: number,
  milestoneLevel: number,
): number {
  if (milestoneLevel < SEWER_MILESTONE) return 0;
  return cityWaterUse(g, entry, x, z, w, d) * SEWAGE_RETURN_FRACTION;
}

/** The water tiles orthogonally beside a footprint: what a shore building draws from or empties into. */
export function waterBeside(g: GridState, footprintTiles: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const tile of footprintTiles) {
    for (const n of besideTile(tile)) {
      if (g.water[n] === 1 && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/**
 * How fouled a discharge leaves the water beside it, 0..255: its sewage a
 * day at WATER_FOUL_PER_KL, saturating. Pure.
 */
export function foulingOf(dischargeKL: number): number {
  return Math.min(255, Math.round(Math.max(0, dischargeKL) * WATER_FOUL_PER_KL));
}

/**
 * How fouled the water is `hops` tiles along the water from a discharge of
 * `emit`: fading in a straight line to nothing at the reach. Pure.
 */
export function foulingAt(emit: number, hops: number): number {
  if (hops >= WATER_FOUL_REACH_TILES) return 0;
  return Math.round(emit * (1 - hops / WATER_FOUL_REACH_TILES));
}

/**
 * Rebuilds g.waterFoul from the discharges: each emitter (a water tile, its
 * fouling) spreads over the connected water, four-connected, every tile
 * taking the worst of what reaches it, and nothing crossing land. One walk
 * per emitter, bounded by the reach; a city has a handful of drains.
 */
export function spreadFouling(g: GridState, emitters: ReadonlyMap<number, number>): void {
  g.waterFoul.fill(0);
  if (emitters.size === 0) return;
  const n = g.size * g.size;
  const hopsTo = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const touched: number[] = [];
  for (const [source, emit] of emitters) {
    if (emit <= 0 || g.water[source] !== 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = source;
    hopsTo[source] = 0;
    touched.push(source);
    while (head < tail) {
      const tile = queue[head++]!;
      const hops = hopsTo[tile]!;
      const value = foulingAt(emit, hops);
      if (value > g.waterFoul[tile]!) g.waterFoul[tile] = value;
      if (hops + 1 >= WATER_FOUL_REACH_TILES) continue;
      for (const next of besideTile(tile)) {
        if (g.water[next] !== 1 || hopsTo[next]! >= 0) continue;
        hopsTo[next] = hops + 1;
        touched.push(next);
        queue[tail++] = next;
      }
    }
    for (const t of touched) hopsTo[t] = -1;
    touched.length = 0;
  }
}

/**
 * A shore intake's yield as a fraction of its rating: the worst fouling on
 * the water beside its footprint, taken off. A borehole, with no water
 * beside it, yields everything. Pure.
 */
export function intakeYieldOf(g: GridState, footprintTiles: readonly number[]): number {
  let worst = 0;
  for (const tile of waterBeside(g, footprintTiles)) {
    const foul = g.waterFoul[tile]!;
    if (foul > worst) worst = foul;
  }
  return 1 - worst / 255;
}

/**
 * Whether a generator's footprint touches a tile that conducts what it makes
 * (or, for a drain, what it takes).
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
  const water: Conducts = (c, i) => conductsWater(g, c, i);
  if (utility.powerMW && networkCellsAdjacentTo(cells, footprintTiles, power).length === 0) {
    return false;
  }
  if (
    (utility.waterKL || utility.sewerKL) &&
    networkCellsAdjacentTo(cells, footprintTiles, water).length === 0
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
  usageOf: (spec: BuildingCatalogEntry, building: BuildingInstance) => number,
): UtilityLine & { demand: number } {
  for (let i = 0; i < reach.length; i++) target[i] = reach[i]! >= 0 ? 1 : 0;

  const line: { id: number; steps: number; use: number; tiles: number[] }[] = [];
  for (const b of buildings) {
    const spec = catalogMap.get(b.catalogId);
    if (!spec) continue;
    const use = utilityUnits(usageOf(spec, b));
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
 * Recomputes power, water and sewer supply, demand, and per-tile coverage
 * (g.power, g.watered, g.sewered) for the current instant. Pure function of
 * the grid + building registry; safe to call every tick or on-demand after
 * edits. `milestoneLevel` decides whether the town is off septic tanks yet;
 * a caller running no economy gets a sewered city.
 */
export function recomputeUtilities(
  g: GridState,
  buildings: BuildingInstance[],
  catalog: BuildingCatalogEntry[],
  milestoneLevel: number = SEWER_MILESTONE,
): UtilityTotals {
  const catalogMap = new Map(catalog.map((c) => [c.id, c] as const));
  const footprints = footprintsByBuildingId(g);

  let powerSupply = 0;
  let sewerSupply = 0;
  const powerFootprints: number[] = [];
  const waterFootprints: number[] = [];
  const sewerFootprints: number[] = [];
  const sources: { b: BuildingInstance; spec: UtilitySpec; tiles: number[] }[] = [];
  const drains: { spec: UtilitySpec; tiles: number[] }[] = [];
  for (const b of buildings) {
    if (b.state !== BuildingState.Active && b.state !== BuildingState.Constructing) continue;
    const spec = catalogMap.get(b.catalogId);
    if (!spec || !spec.utility) continue;
    const tiles = footprints.get(b.id);
    if (!tiles) continue;
    if (spec.utility.powerMW) {
      powerSupply += averageOutputMW(spec.utility);
      powerFootprints.push(...tiles);
    }
    if (spec.utility.waterKL) {
      sources.push({ b, spec: spec.utility, tiles });
      waterFootprints.push(...tiles);
    }
    if (spec.utility.sewerKL) {
      sewerSupply += spec.utility.sewerKL;
      sewerFootprints.push(...tiles);
      drains.push({ spec: spec.utility, tiles });
    }
  }

  const water: Conducts = (c, i) => conductsWater(g, c, i);
  const powerReach = computeReach(
    g,
    powerFootprints,
    (c, i) => conductsPower(g, c, i),
    isPowerLine(g),
  );
  const { demand: powerDemand, ...powerLine } = cutFromTheFarEnd(
    g.power,
    powerReach,
    buildings,
    catalogMap,
    footprints,
    powerSupply,
    (s) => s.powerUse,
  );

  // The sewer runs back along the mains and pipes the water came down, and
  // it is cut first: what the drains take is what they empty into the water,
  // and the water the intakes then yield depends on it.
  const sewerReach = computeReach(g, sewerFootprints, water, isWaterPipe(g));
  const { demand: sewerDemand, ...sewerLine } = cutFromTheFarEnd(
    g.sewered,
    sewerReach,
    buildings,
    catalogMap,
    footprints,
    sewerSupply,
    (s, b) => {
      const { w, d } = footprintForRotation(s, b.rotation);
      return sewageOf(g, s, b.x, b.z, w, d, milestoneLevel);
    },
  );

  // Each drain the network reaches empties its share of the sewage actually
  // drained, less what a works keeps back, into the water beside it; a drain
  // taking nothing fouls nothing, and a stranded one takes nothing.
  const drained = Math.min(sewerDemand, sewerSupply);
  const delivering = drains.filter((drain) => utilityCanDeliver(g, drain.spec, drain.tiles));
  const deliveringKL = delivering.reduce((sum, drain) => sum + drain.spec.sewerKL!, 0);
  const emitters = new Map<number, number>();
  for (const drain of delivering) {
    const share = deliveringKL > 0 ? (drained * drain.spec.sewerKL!) / deliveringKL : 0;
    const emit = foulingOf(share * (drain.spec.effluent ?? 1));
    if (emit <= 0) continue;
    for (const tile of waterBeside(g, drain.tiles)) {
      if (emit > (emitters.get(tile) ?? 0)) emitters.set(tile, emit);
    }
  }
  spreadFouling(g, emitters);

  // A shore intake yields its rating less the fouling beside it; a borehole
  // reads no water and yields everything.
  let waterSupply = 0;
  let waterFouled = 0;
  const intakeYield = new Map<number, number>();
  for (const source of sources) {
    const rated = source.spec.waterKL!;
    const catalogEntry = catalogMap.get(source.b.catalogId);
    if (catalogEntry?.requiresAdjacent === 'water') {
      const fraction = intakeYieldOf(g, source.tiles);
      intakeYield.set(source.b.id, fraction);
      waterSupply += rated * fraction;
      waterFouled += rated * (1 - fraction);
    } else {
      waterSupply += rated;
    }
  }

  const waterReach = computeReach(g, waterFootprints, water, isWaterPipe(g));
  const { demand: waterDemand, ...waterLine } = cutFromTheFarEnd(
    g.watered,
    waterReach,
    buildings,
    catalogMap,
    footprints,
    waterSupply,
    (s, b) => {
      const { w, d } = footprintForRotation(s, b.rotation);
      return cityWaterUse(g, s, b.x, b.z, w, d);
    },
  );

  return {
    powerSupply,
    powerDemand,
    waterSupply,
    waterDemand,
    waterFouled,
    sewerSupply,
    sewerDemand,
    power: powerLine,
    water: waterLine,
    sewer: sewerLine,
    intakeYield,
  };
}
