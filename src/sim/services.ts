/**
 * Service coverage & passive scalar-field growth.
 *
 * Every tick: crime/fire risk grow passively across the grid, then each
 * Active service building projects coverage outward from the nearest road
 * tile through the connected road network — BFS hop distance (not
 * euclidean), capped at a funding-scaled range — radiating 2 tiles around
 * every reached road tile. Coverage blends into the relevant scalar field
 * per service kind (education/health: max-blend; police/fire: subtract;
 * park: additive, plus a flat bonus at the source).
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
  GridState,
  ServiceKind,
  ServiceLoad,
} from '../shared/types';
import { BuildingState, FieldId, ZoneType, isStreetTier } from '../shared/types';
import { MAP_SIZE, MAP_TILES, inBounds, tileIndex } from '../shared/constants';

/** Radius (orthogonal steps) searched around a building's footprint for its nearest road tile. */
const NEAR_ROAD_RADIUS = 2;
/** Radius (orthogonal steps) that coverage radiates around each reached road tile. */
const COVERAGE_RADIATE_RANGE = 2;
const CRIME_GROWTH = 2;
const FIRE_GROWTH = 1;
const CRIME_GROWTH_LAND_VALUE_CEILING = 90;

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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

/** Closest road tile to any tile in `footprint`, searched within NEAR_ROAD_RADIUS; ties broken by lowest tile index. */
export function nearestRoadTile(g: GridState, footprint: readonly number[]): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
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
        if (!isStreetTier(g.roadTier[ni]!)) continue;
        const dist = Math.abs(dx) + Math.abs(dz);
        if (dist < bestDist || (dist === bestDist && (best === null || ni < best))) {
          bestDist = dist;
          best = ni;
        }
      }
    }
  }
  return best;
}

/** BFS hop-distance from `start` across connected road tiles, not expanding past maxDist. */
export function roadBfsDistances(
  g: GridState,
  start: number,
  maxDist: number,
): Map<number, number> {
  const dist = new Map<number, number>([[start, 0]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head]!;
    head += 1;
    const d = dist.get(cur)!;
    if (d >= maxDist) continue;
    const x = cur % MAP_SIZE;
    const z = Math.floor(cur / MAP_SIZE);
    for (const [ddx, ddz] of ORTHOGONAL) {
      const nx = x + ddx;
      const nz = z + ddz;
      if (!inBounds(nx, nz)) continue;
      const ni = tileIndex(nx, nz);
      if (dist.has(ni)) continue;
      if (!isStreetTier(g.roadTier[ni]!)) continue;
      dist.set(ni, d + 1);
      queue.push(ni);
    }
  }
  return dist;
}

/** Per-tile coverage: max over reached road tiles within COVERAGE_RADIATE_RANGE of strength*(1 - dist/range). */
export function radiateWeighted(
  reached: ReadonlyMap<number, number>,
  range: number,
  strength: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [roadIdx, d] of reached) {
    const value = strength * (1 - d / range);
    if (value <= 0) continue;
    const x = roadIdx % MAP_SIZE;
    const z = Math.floor(roadIdx / MAP_SIZE);
    for (let dz = -COVERAGE_RADIATE_RANGE; dz <= COVERAGE_RADIATE_RANGE; dz++) {
      const remaining = COVERAGE_RADIATE_RANGE - Math.abs(dz);
      for (let dx = -remaining; dx <= remaining; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (!inBounds(nx, nz)) continue;
        const ni = tileIndex(nx, nz);
        const prev = out.get(ni) ?? 0;
        if (value > prev) out.set(ni, value);
      }
    }
  }
  return out;
}

/** The road walk a facility's reach is built from; injectable so a tick's traversals can be counted. */
export type RoadBfs = (g: GridState, start: number, maxDist: number) => Map<number, number>;

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
    if (b.state !== BuildingState.Active) continue;
    const spec = catalog.get(b.catalogId);
    if (!spec || spec.category !== 'res') continue;
    const residents = spec.residents ?? 0;
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

  constructor(catalog: BuildingCatalogEntry[], bfs: RoadBfs = roadBfsDistances) {
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
    funding: Record<ServiceKind, number>,
  ): Record<ServiceKind, ServiceLoad> {
    this.growFields(g);
    this.loadByFacility.clear();

    const footprints = footprintsByBuildingId(g);
    const residentsById = residentsByBuildingId(buildings, this.catalog);
    const byKind: Record<ServiceKind, BuildingInstance[]> = {
      police: [],
      fire: [],
      health: [],
      education: [],
      park: [],
    };
    const active = buildings
      .filter((b) => b.state === BuildingState.Active)
      .sort((a, b) => a.id - b.id);
    for (const b of active) {
      const spec = this.catalog.get(b.catalogId);
      if (spec?.service) byKind[spec.service.kind].push(b);
    }

    return {
      police: this.tickKind(g, 'police', byKind.police, footprints, residentsById, funding.police),
      fire: this.tickKind(g, 'fire', byKind.fire, footprints, residentsById, funding.fire),
      health: this.tickKind(g, 'health', byKind.health, footprints, residentsById, funding.health),
      education: this.tickKind(
        g,
        'education',
        byKind.education,
        footprints,
        residentsById,
        funding.education,
      ),
      park: this.tickKind(g, 'park', byKind.park, footprints, residentsById, funding.park),
    };
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
      const start = nearestRoadTile(g, footprint);
      if (start === null) continue;

      const reached = this.bfs(g, start, range);
      const coverage = radiateWeighted(reached, range, spec.service.strength);
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
      this.applyCoverage(g, kind, coverage);
    }

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
    switch (kind) {
      case 'education': {
        const field = g.fields[FieldId.Education]!;
        for (const [tile, value] of coverage) field[tile] = clamp255(Math.max(field[tile]!, value));
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
      case 'park': {
        const field = g.fields[FieldId.LandValue]!;
        for (const [tile, value] of coverage) field[tile] = clamp255(field[tile]! + value / 4);
        break;
      }
    }
  }
}
