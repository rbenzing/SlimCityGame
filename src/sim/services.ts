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
 */

import type {
  BuildingCatalogEntry,
  BuildingInstance,
  GridState,
  ServiceKind,
} from '../shared/types';
import { BuildingState, FieldId, RoadTier, ZoneType } from '../shared/types';
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

/** Closest road tile to any tile in `footprint`, searched within NEAR_ROAD_RADIUS; ties broken by lowest tile index. */
function nearestRoadTile(g: GridState, footprint: readonly number[]): number | null {
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
        if (g.roadTier[ni]! === RoadTier.None) continue;
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
function roadBfsDistances(g: GridState, start: number, maxDist: number): Map<number, number> {
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
      if (g.roadTier[ni]! === RoadTier.None) continue;
      dist.set(ni, d + 1);
      queue.push(ni);
    }
  }
  return dist;
}

/** Per-tile coverage: max over reached road tiles within COVERAGE_RADIATE_RANGE of strength*(1 - dist/range). */
function radiateWeighted(
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

export class ServiceSim {
  private readonly catalog: Map<string, BuildingCatalogEntry>;

  constructor(catalog: BuildingCatalogEntry[]) {
    this.catalog = new Map(catalog.map((c) => [c.id, c] as const));
  }

  tick(g: GridState, buildings: BuildingInstance[], funding: Record<ServiceKind, number>): void {
    this.growFields(g);

    const footprints = footprintsByBuildingId(g);
    const services = buildings
      .filter((b) => b.state === BuildingState.Active)
      .slice()
      .sort((a, b) => a.id - b.id);

    for (const b of services) {
      const spec = this.catalog.get(b.catalogId);
      if (!spec || !spec.service) continue;
      const footprint = footprints.get(b.id) ?? [];
      const kind = spec.service.kind;

      if (kind === 'park') {
        const bonus = spec.landValueBonus ?? 0;
        if (bonus > 0 && footprint.length > 0) {
          const landValue = g.fields[FieldId.LandValue]!;
          for (const tile of footprint) {
            landValue[tile] = clamp255(landValue[tile]! + bonus);
          }
        }
      }

      const range = Math.floor(spec.service.range * funding[kind]);
      if (range <= 0 || footprint.length === 0) continue;
      const start = nearestRoadTile(g, footprint);
      if (start === null) continue;

      const reached = roadBfsDistances(g, start, range);
      const coverage = radiateWeighted(reached, range, spec.service.strength);
      if (coverage.size === 0) continue;

      this.applyCoverage(g, kind, coverage);
    }
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
