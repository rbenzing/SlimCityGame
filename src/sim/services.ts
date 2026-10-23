/**
 * Service coverage & passive scalar-field growth.
 *
 * Every tick: crime/fire risk grow passively across the grid, then each
 * Active service building projects coverage outward from every road tile
 * beside its footprint through the connected road network — BFS hop distance
 * (not euclidean), capped at a funding-scaled range — radiating 2 tiles
 * around every reached road tile. Coverage blends into the relevant scalar
 * field per service kind (education, one field per rung, and health:
 * max-blend; police/fire: subtract; park: the best of overlapping parks added
 * once to land value, plus a flat bonus at the source). A library writes no
 * field: it lengthens the range of every school it reaches.
 *
 * A facility also serves a number of PEOPLE. Each tile's supply is the sum,
 * over the facilities reaching it, of the capacity each dedicates to the
 * residents in its own reach, and every value that facility writes is scaled
 * by min(1, supply) — so an oversubscribed service degrades smoothly and one
 * with no capacity figure, or nobody to serve, never degrades at all.
 */

import type {
  BuildingCatalogEntry,
  BuildingInstance,
  FundingKey,
  GridState,
  OpenSpace,
  ServiceKind,
  ServiceLoad,
} from '../shared/types';
import { BuildingState, FieldId, ZoneType, fundingKeyOf, isStreetTier } from '../shared/types';
import {
  BODY_HEALTH_PENALTY_PER_MONTH,
  MAP_SIZE,
  MAP_TILES,
  TICKS_PER_MONTH,
  inBounds,
  tileIndex,
} from '../shared/constants';
import { occupiedResidents } from '../shared/occupancy';
import { cellTile, freeCellsOn, neighbours, roadCellsOf } from '../world/roadnet';

/** Radius (orthogonal steps) searched around a building's footprint for its nearest road tile. */
const NEAR_ROAD_RADIUS = 2;
/** Radius (orthogonal steps) that coverage radiates around each reached road tile. */
const COVERAGE_RADIATE_RANGE = 2;
const CRIME_GROWTH = 2;
const FIRE_GROWTH = 1;
const CRIME_GROWTH_LAND_VALUE_CEILING = 90;

/** The field each school kind writes; its own, so no rung stands in for another. */
const SCHOOL_FIELD: Readonly<Partial<Record<ServiceKind, FieldId>>> = {
  education: FieldId.Education,
  'middle-education': FieldId.MiddleEducation,
  'high-education': FieldId.HighEducation,
  'college-education': FieldId.CollegeEducation,
};

/**
 * Rounds (not truncates) before clamping to [0,255]. Coverage math routinely
 * produces values like 100*(1-55/100) === 44.999999999999996 due to binary
 * floating point; writing that straight into a Uint8Array would truncate to
 * 44 instead of the intended 45, so we round first.
 */
const clamp255 = (v: number): number => {
  const rounded = Math.round(v);
  return rounded < 0 ? 0 : rounded > 255 ? 255 : rounded;
};

/** Building-id -> footprint tile indices, derived from the grid's occupancy layer. */
export function footprintsByBuildingId(g: GridState): Map<number, number[]> {
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
 * Every tile carrying a street — on the grid or off it — within
 * NEAR_ROAD_RADIUS orthogonal steps of any tile in `footprint`, with the
 * fewest steps it takes from the footprint to reach it.
 */
function roadTilesNear(g: GridState, footprint: readonly number[]): Map<number, number> {
  const cells = roadCellsOf(g);
  const hasStreet = (tile: number): boolean =>
    isStreetTier(g.roadTier[tile]!) ||
    freeCellsOn(cells, tile).some((c) => isStreetTier(cells.tier[c]!));
  const near = new Map<number, number>();
  for (const idx of footprint) {
    const x = idx % MAP_SIZE;
    const z = Math.floor(idx / MAP_SIZE);
    for (let dz = -NEAR_ROAD_RADIUS; dz <= NEAR_ROAD_RADIUS; dz++) {
      const remaining = NEAR_ROAD_RADIUS - Math.abs(dz);
      for (let dx = -remaining; dx <= remaining; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (!inBounds(nx, nz)) continue;
        const ni = tileIndex(nx, nz);
        const dist = Math.abs(dx) + Math.abs(dz);
        const known = near.get(ni);
        if (known !== undefined && known <= dist) continue;
        if (known === undefined && !hasStreet(ni)) continue;
        near.set(ni, dist);
      }
    }
  }
  return near;
}

/**
 * Closest tile carrying a street — on the grid or off it — to any tile in
 * `footprint`, searched within NEAR_ROAD_RADIUS; ties broken by lowest tile index.
 */
export function nearestRoadTile(g: GridState, footprint: readonly number[]): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const [tile, dist] of roadTilesNear(g, footprint)) {
    if (dist < bestDist || (dist === bestDist && (best === null || tile < best))) {
      bestDist = dist;
      best = tile;
    }
  }
  return best;
}

/**
 * The road tiles a facility's coverage starts from: every street within
 * NEAR_ROAD_RADIUS of its footprint, in tile order. A park on four streets
 * serves from all four, not from one corner; a lot beside one street starts
 * where it always did.
 */
export function roadSeedsOf(g: GridState, footprint: readonly number[]): number[] {
  return [...roadTilesNear(g, footprint).keys()].sort((a, b) => a - b);
}

/**
 * BFS hop-distance from the streets on tile `start` across connected roads,
 * not expanding past maxDist. A road off the grid counts a hop for each tile
 * its centre line crosses.
 */
export function roadBfsDistances(
  g: GridState,
  start: number,
  maxDist: number,
): Map<number, number> {
  return roadBfsFrom(g, [start], maxDist);
}

/**
 * BFS hop-distance from the streets on every tile in `starts` at once, each
 * at distance 0, so a tile's distance is the fewest hops from any of them.
 */
export function roadBfsFrom(
  g: GridState,
  starts: readonly number[],
  maxDist: number,
): Map<number, number> {
  // Walked along the road network rather than tile to tile: it goes only where
  // roads join, so coverage runs over a road it crosses and never down into
  // it, and never jumps to a road that merely lies alongside.
  const cells = roadCellsOf(g);
  const seeds: number[] = [];
  for (const start of starts) {
    const streetsOnStart = freeCellsOn(cells, start).filter((c) => isStreetTier(cells.tier[c]!));
    if (isStreetTier(cells.tier[start]!) || streetsOnStart.length === 0) seeds.push(start);
    seeds.push(...streetsOnStart);
  }
  const dist = new Map<number, number>(seeds.map((s) => [s, 0]));
  const queue: number[] = [...dist.keys()];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head]!;
    head += 1;
    const d = dist.get(cur)!;
    if (d >= maxDist) continue;
    for (const next of neighbours(cells, cur)) {
      if (dist.has(next)) continue;
      if (!isStreetTier(cells.tier[next]!)) continue;
      dist.set(next, d + 1);
      queue.push(next);
    }
  }
  // Reported per tile, the nearer of a crossing tile's two roads.
  const byTile = new Map<number, number>();
  for (const [key, d] of dist) {
    const tile = cellTile(cells, key);
    const known = byTile.get(tile);
    if (known === undefined || d < known) byTile.set(tile, d);
  }
  return byTile;
}

/**
 * Per-tile coverage: max over reached road tiles within COVERAGE_RADIATE_RANGE of
 * strength*(1 - dist/range). `rangeAt` gives a road tile its own range where a
 * library has stretched it; absent, every tile falls off over `range`.
 */
export function radiateWeighted(
  reached: ReadonlyMap<number, number>,
  range: number,
  strength: number,
  rangeAt?: (roadIdx: number) => number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [roadIdx, d] of reached) {
    const value = strength * (1 - d / (rangeAt ? rangeAt(roadIdx) : range));
    if (value <= 0) continue;
    forTilesAround(roadIdx, (ni) => {
      const prev = out.get(ni) ?? 0;
      if (value > prev) out.set(ni, value);
    });
  }
  return out;
}

/** Visits every on-map tile within COVERAGE_RADIATE_RANGE orthogonal steps of `idx`, itself included: the shape coverage radiates in. */
function forTilesAround(idx: number, visit: (tile: number) => void): void {
  const x = idx % MAP_SIZE;
  const z = Math.floor(idx / MAP_SIZE);
  for (let dz = -COVERAGE_RADIATE_RANGE; dz <= COVERAGE_RADIATE_RANGE; dz++) {
    const remaining = COVERAGE_RADIATE_RANGE - Math.abs(dz);
    for (let dx = -remaining; dx <= remaining; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (!inBounds(nx, nz)) continue;
      visit(tileIndex(nx, nz));
    }
  }
}

/** Bodies that fell on one tile (a grid index) in one tick and have not been collected. */
export interface UncollectedBody {
  tile: number;
  count: number;
  sinceTick: number;
}

/**
 * The tiles a facility's vehicles reach: the road walk from the street beside
 * `footprint`, `range` hops at most, radiated two tiles, strongest (1) at the
 * street and fading to 0 at `range`. Null with no footprint, no street, or
 * nothing in reach.
 */
export function reachOfFootprint(
  g: GridState,
  footprint: readonly number[] | undefined,
  range: number,
): Map<number, number> | null {
  if (!footprint || footprint.length === 0) return null;
  const starts = roadSeedsOf(g, footprint);
  if (starts.length === 0) return null;
  const coverage = radiateWeighted(roadBfsFrom(g, starts, range), range, 1);
  return coverage.size === 0 ? null : coverage;
}

/** The road walk a facility's reach is built from; injectable so a tick's traversals can be counted. */
export type RoadBfs = (
  g: GridState,
  starts: readonly number[],
  maxDist: number,
) => Map<number, number>;

/**
 * Park tiles the city holds — the footprint of every Active building whose
 * entry is a park service — and those tiles per 1,000 residents. An empty
 * city reads 0, not NaN: nobody is short of parks until somebody lives there.
 */
export function openSpaceOf(
  buildings: readonly BuildingInstance[],
  catalog: ReadonlyMap<string, BuildingCatalogEntry>,
  population: number,
): OpenSpace {
  let tiles = 0;
  for (const b of buildings) {
    if (b.state !== BuildingState.Active) continue;
    const spec = catalog.get(b.catalogId);
    if (spec?.service?.kind !== 'park') continue;
    tiles += spec.footprint.w * spec.footprint.d;
  }
  return { tiles, perThousand: population > 0 ? (tiles / population) * 1000 : 0 };
}

/**
 * Residents per building id — Active residential buildings only, exactly the
 * rule EconomySystem uses for CityStats.population. A load measured against a
 * different population than the one on screen is a long hunt.
 */
function residentsByBuildingId(
  buildings: readonly BuildingInstance[],
  catalog: ReadonlyMap<string, BuildingCatalogEntry>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const b of buildings) {
    const spec = catalog.get(b.catalogId);
    if (!spec) continue;
    const residents = occupiedResidents(spec, b);
    if (residents > 0) out.set(b.id, residents);
  }
  return out;
}

/** One facility held between a kind's two phases: what it is, where it is, what it reached. */
interface GatheredFacility {
  spec: BuildingCatalogEntry;
  footprint: readonly number[];
  /** Null for a facility with no road, no range or no coverage — it still takes its park bonus. */
  coverage: Map<number, number> | null;
}

/**
 * People living on a facility's coverage map. Building ids go through a Set
 * first: a building spanning six reached tiles is one building, and counting
 * it per tile inflates every load figure by roughly a footprint's area.
 */
function reachPopulation(
  g: GridState,
  coverage: ReadonlyMap<number, number>,
  residentsById: ReadonlyMap<number, number>,
): number {
  const seen = new Set<number>();
  let people = 0;
  for (const tile of coverage.keys()) {
    const id = g.buildingId[tile]!;
    if (id === 0 || seen.has(id)) continue;
    seen.add(id);
    people += residentsById.get(id) ?? 0;
  }
  return people;
}

export class ServiceSim {
  private readonly catalog: Map<string, BuildingCatalogEntry>;
  private readonly bfs: RoadBfs;
  /**
   * Each capped facility's own load as of the last tick, by building id. The
   * gather phase has the two numbers already, so keeping them costs one map
   * entry per facility and spares the selection channel a second traversal.
   */
  private readonly loadByFacility = new Map<number, number>();
  /**
   * The range uplift each library leaves on the tiles it reaches this tick, in
   * percent, and the widest of them. Filled by the library pass, before any
   * school radiates.
   */
  private readonly uplift = new Map<number, number>();
  private maxUplift = 0;
  /**
   * The best park contribution reaching each tile this tick, by tile index,
   * and the tiles any park reached. One array for the whole map rather than a
   * map per tick: with ranges up to 58 the union of park-covered tiles can be
   * most of the city, and it is the largest transient the pass holds.
   */
  private readonly parkBlend = new Float32Array(MAP_TILES);
  private readonly parkTouched: number[] = [];

  constructor(catalog: BuildingCatalogEntry[], bfs: RoadBfs = roadBfsFrom) {
    this.catalog = new Map(catalog.map((c) => [c.id, c] as const));
    this.bfs = bfs;
  }

  /**
   * How hard one facility is being leaned on — its reach population over the
   * capacity it offers. Undefined for an uncapped facility, one nobody can
   * reach, and one that no longer exists: each has no load rather than a load
   * of zero.
   */
  facilityLoad(id: number): number | undefined {
    return this.loadByFacility.get(id);
  }

  /**
   * The load of every park that has one, in id order — the parks whose catalog
   * entry carries a capacity and that somebody can reach. An uncapped park, or
   * one nobody reaches, has no load and is left out rather than reported at zero.
   */
  parkLoads(buildings: readonly BuildingInstance[]): { id: number; load: number }[] {
    const loads: { id: number; load: number }[] = [];
    for (const b of buildings) {
      if (this.catalog.get(b.catalogId)?.service?.kind !== 'park') continue;
      const load = this.loadByFacility.get(b.id);
      if (load !== undefined) loads.push({ id: b.id, load });
    }
    return loads.sort((a, b) => a.id - b.id);
  }

  /**
   * Runs one kind at a time in two phases — gather every facility's reach and
   * the capacity it dedicates to each tile, then walk the same facilities again
   * in `id` order applying coverage scaled by min(1, supply) — and reports how
   * hard each kind is being leaned on.
   *
   * The second phase writes what the single pre-capacity pass wrote, facility
   * by facility, because clamp255 ROUNDS: summing two facilities' coverage and
   * rounding once is not the same byte as rounding each, and a city with no
   * capacity anywhere has to keep the field it had.
   */
  tick(
    g: GridState,
    buildings: BuildingInstance[],
    funding: Record<FundingKey, number>,
    bodies: readonly UncollectedBody[] = [],
    tickNo = 0,
  ): Record<ServiceKind, ServiceLoad> {
    this.growFields(g);
    this.loadByFacility.clear();
    this.uplift.clear();

    const footprints = footprintsByBuildingId(g);
    const residentsById = residentsByBuildingId(buildings, this.catalog);
    const byKind: Record<ServiceKind, BuildingInstance[]> = {
      police: [],
      fire: [],
      health: [],
      education: [],
      'middle-education': [],
      'high-education': [],
      'college-education': [],
      library: [],
      park: [],
    };
    const active = buildings
      .filter((b) => b.state === BuildingState.Active)
      .sort((a, b) => a.id - b.id);
    for (const b of active) {
      const spec = this.catalog.get(b.catalogId);
      if (spec?.service) byKind[spec.service.kind].push(b);
    }

    // Libraries first, whatever order the registry gives: every school reads the
    // uplift they leave, so one that radiated before them would not see it.
    const libraries = this.tickKind(
      g,
      'library',
      byKind.library,
      footprints,
      residentsById,
      funding.education,
    );
    this.maxUplift = 0;
    for (const value of this.uplift.values()) this.maxUplift = Math.max(this.maxUplift, value);

    const run = (kind: ServiceKind): ServiceLoad =>
      this.tickKind(g, kind, byKind[kind], footprints, residentsById, funding[fundingKeyOf(kind)]);
    const load: Record<ServiceKind, ServiceLoad> = {
      police: run('police'),
      fire: run('fire'),
      health: run('health'),
      education: run('education'),
      'middle-education': run('middle-education'),
      'high-education': run('high-education'),
      'college-education': run('college-education'),
      library: libraries,
      park: run('park'),
    };
    // Last: coverage max-blends the field, so a penalty written before it would
    // be erased by any clinic whose reach covered the tile.
    this.applyBodyPenalty(g, bodies, tickNo);
    return load;
  }

  /**
   * Each tile holding uncollected bodies loses `min(255, bodies × dial × months
   * lying)` of Health there and on the tiles round it, every body aged by its
   * own tick. The loss comes off whatever coverage has just written.
   */
  private applyBodyPenalty(g: GridState, bodies: readonly UncollectedBody[], tickNo: number): void {
    const owed = new Map<number, number>();
    for (const body of bodies) {
      const months = Math.max(0, tickNo - body.sinceTick) / TICKS_PER_MONTH;
      owed.set(
        body.tile,
        (owed.get(body.tile) ?? 0) + body.count * BODY_HEALTH_PENALTY_PER_MONTH * months,
      );
    }
    const health = g.fields[FieldId.Health]!;
    for (const [tile, loss] of owed) {
      const penalty = Math.min(255, loss);
      if (penalty <= 0) continue;
      forTilesAround(tile, (ni) => {
        health[ni] = clamp255(health[ni]! - penalty);
      });
    }
  }

  private tickKind(
    g: GridState,
    kind: ServiceKind,
    facilities: readonly BuildingInstance[],
    footprints: ReadonlyMap<number, number[]>,
    residentsById: ReadonlyMap<number, number>,
    funding: number,
  ): ServiceLoad {
    /** Capacity dedicated to each tile, summed over the facilities reaching it. */
    const supply = new Map<number, number>();
    const gathered: GatheredFacility[] = [];
    let cappedPopulation = 0;
    let cappedCapacity = 0;
    let cappedFacilities = 0;

    // --- gather: reach and supply, writing nothing ---------------------------
    for (const b of facilities) {
      const spec = this.catalog.get(b.catalogId);
      if (!spec?.service) continue;
      const footprint = footprints.get(b.id) ?? [];
      const entry: GatheredFacility = { spec, footprint, coverage: null };
      gathered.push(entry);

      const range = Math.floor(spec.service.range * funding);
      if (range <= 0 || footprint.length === 0) continue;
      const starts = roadSeedsOf(g, footprint);
      if (starts.length === 0) continue;

      // A library stretches a school's range where its own reach is: the walk is
      // cut at the widest range any library allows, and each road tile falls off
      // over the range it has locally. With no library both are the plain range.
      const school = SCHOOL_FIELD[kind] !== undefined;
      const reach = school ? Math.ceil(range * (1 + this.maxUplift / 100)) : range;
      const reached = this.bfs(g, starts, reach);
      const coverage = radiateWeighted(
        reached,
        range,
        spec.service.strength,
        school ? (tile) => range * (1 + (this.uplift.get(tile) ?? 0) / 100) : undefined,
      );
      if (coverage.size === 0) continue;
      entry.coverage = coverage;

      // Funding is money and money is staff, so it buys throughput as well as
      // reach. No capacity, or nobody in reach, divides to Infinity — and
      // min(1, Infinity) is the uncapped facility, with no branch to forget.
      const people = reachPopulation(g, coverage, residentsById);
      const capacity = spec.service.capacity;
      const available = capacity === undefined ? Infinity : capacity * funding;
      // Nobody in reach is uncapped whatever the capacity says, and saying so
      // here rather than letting the division answer is the difference between
      // Infinity and 0/0. NaN would survive min() and clamp to zero, which on a
      // max-blended field erases health another clinic had already supplied.
      const share = people > 0 ? available / people : Infinity;
      for (const tile of coverage.keys()) supply.set(tile, (supply.get(tile) ?? 0) + share);
      if (capacity !== undefined) {
        cappedFacilities += 1;
        cappedPopulation += people;
        cappedCapacity += available;
        this.loadByFacility.set(b.id, people / available);
      }
    }

    // --- resolve: the old per-facility pass, each value scaled by its supply --
    for (const { spec, footprint, coverage } of gathered) {
      if (kind === 'park') {
        const bonus = spec.landValueBonus ?? 0;
        if (bonus > 0 && footprint.length > 0) {
          const landValue = g.fields[FieldId.LandValue]!;
          for (const tile of footprint) {
            landValue[tile] = clamp255(landValue[tile]! + bonus);
          }
        }
      }
      if (!coverage) continue;
      // Scaling in place only rewrites keys the map already holds, which is
      // defined behaviour while iterating it, and spares a second map per
      // facility on the hottest pass in this file.
      for (const [tile, value] of coverage) {
        coverage.set(tile, value * Math.min(1, supply.get(tile) ?? Infinity));
      }
      if (kind === 'park') this.blendPark(coverage);
      else this.applyCoverage(g, kind, coverage);
    }
    if (kind === 'park') this.flushParks(g);

    // The worst any tile with people on it is served. A tile an uncapped
    // facility reaches has infinite supply, so it reads 0 and never wins.
    let worst = 0;
    for (const [tile, tileSupply] of supply) {
      const id = g.buildingId[tile]!;
      if (id === 0 || !residentsById.has(id)) continue;
      const tileLoad = 1 / tileSupply;
      if (tileLoad > worst) worst = tileLoad;
    }
    // A kind with no capped facility and one whose facilities reach nobody
    // both divide to zero; `capped` is how a reader tells them apart.
    return {
      load: cappedCapacity > 0 ? cappedPopulation / cappedCapacity : 0,
      worst,
      capped: cappedFacilities,
    };
  }

  private growFields(g: GridState): void {
    const crime = g.fields[FieldId.Crime]!;
    const fireRisk = g.fields[FieldId.FireRisk]!;
    const landValue = g.fields[FieldId.LandValue]!;
    for (let i = 0; i < MAP_TILES; i++) {
      if (g.zone[i]! !== ZoneType.None && landValue[i]! < CRIME_GROWTH_LAND_VALUE_CEILING) {
        crime[i] = clamp255(crime[i]! + CRIME_GROWTH);
      }
      if (g.buildingId[i]! !== 0) {
        fireRisk[i] = clamp255(fireRisk[i]! + FIRE_GROWTH);
      }
    }
  }

  private applyCoverage(
    g: GridState,
    kind: ServiceKind,
    coverage: ReadonlyMap<number, number>,
  ): void {
    const schoolField = SCHOOL_FIELD[kind];
    if (schoolField !== undefined) {
      const field = g.fields[schoolField]!;
      for (const [tile, value] of coverage) field[tile] = clamp255(Math.max(field[tile]!, value));
      return;
    }
    switch (kind) {
      case 'library': {
        // A library writes no field: its coverage, in percent, is the range uplift
        // the schools read, the strongest where two reach a tile.
        for (const [tile, value] of coverage) {
          this.uplift.set(tile, Math.max(this.uplift.get(tile) ?? 0, value));
        }
        break;
      }
      case 'health': {
        const field = g.fields[FieldId.Health]!;
        for (const [tile, value] of coverage) field[tile] = clamp255(Math.max(field[tile]!, value));
        break;
      }
      case 'police': {
        const field = g.fields[FieldId.Crime]!;
        for (const [tile, value] of coverage) field[tile] = clamp255(field[tile]! - value / 2);
        break;
      }
      case 'fire': {
        const field = g.fields[FieldId.FireRisk]!;
        for (const [tile, value] of coverage) field[tile] = clamp255(field[tile]! - value / 2);
        break;
      }
    }
  }

  /**
   * Holds the better of this park's contribution and any park's before it on
   * each tile. Two overlapping parks give the best of the two, never the sum:
   * overlap is waste and spacing is the play.
   */
  private blendPark(coverage: ReadonlyMap<number, number>): void {
    for (const [tile, value] of coverage) {
      const contribution = value / 4;
      const held = this.parkBlend[tile]!;
      if (contribution <= held) continue;
      if (held === 0) this.parkTouched.push(tile);
      this.parkBlend[tile] = contribution;
    }
  }

  /**
   * Adds the blended park contribution to land value once, and clears the
   * scratch for the next tick. Added rather than max-blended into the field:
   * land value carries the whole land-value model, and flooring it at a park's
   * value would drop a tile worth 200 to 20.
   */
  private flushParks(g: GridState): void {
    const field = g.fields[FieldId.LandValue]!;
    for (const tile of this.parkTouched) {
      field[tile] = clamp255(field[tile]! + this.parkBlend[tile]!);
      this.parkBlend[tile] = 0;
    }
    this.parkTouched.length = 0;
  }
}
