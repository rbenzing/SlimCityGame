/**
 * Zoned-lot growth system: spawns, grows, and retires
 * buildings on res/com/ind zoned tiles. Pure simulation logic operating on
 * GridState + BuildingRegistry -- no three.js/DOM, no Math.random/Date.now.
 *
 * Cadence: `tick` is expected to be called once per sim tick (TICK_RATE,
 * see shared/constants). Construction countdowns advance every call; the
 * heavier scan/problems/level-up passes only run every GROWTH_INTERVAL
 * ticks, over a rotating stride-window of the grid so a full map is
 * covered over many passes rather than rescanned every time.
 */
import { inBounds, tileIndex } from '../shared/constants';
import { BuildingState, FieldId, Problem, RoadTier, ZoneType } from '../shared/types';
import type {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  DemandLevels,
  GridState,
  Sector,
} from '../shared/types';
import { BuildingRegistry, footprintForRotation } from './buildings';

/**
 * Deterministic RNG surface injected into the growth system.
 * Not part of shared/types.ts; declared locally (structurally identical to
 * src/core/rng.ts's Rng, which this module never imports directly).
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Next float in [a, b). */
  range(a: number, b: number): number;
  /** A new, independent, deterministic Rng stream. */
  fork(streamId: number): Rng;
}

const GROWTH_INTERVAL = 10;
const CONSTRUCTION_TICKS = 100;
const ROAD_CHECK_RADIUS = 3;
const ABANDON_BLOCKER_STREAK = 3;
const DESPAWN_ABANDONED_PASSES = 10;
/** Number of GROWTH_INTERVAL passes needed to sweep the whole map once. */
const SCAN_STRIDE = 32;
const LEVEL_2_LAND_VALUE = 140;
const LEVEL_3_LAND_VALUE = 190;
const RES_L3_EDUCATION = 60;
const HIGH_CRIME = 170;
const HIGH_POLLUTION = 170;
const LOW_DEMAND = -0.5;

function zoneSector(zone: ZoneType): Sector | null {
  switch (zone) {
    // The new city-builder zones all draw on residential demand.
    // ResMediumRow/ResMedium are pure residential; Mixed's building carries
    // both residents and jobs, but its *demand* pull is residential (com
    // demand already reads the jobs those buildings add, no separate case
    // needed here).
    case ZoneType.ResLow:
    case ZoneType.ResHigh:
    case ZoneType.ResMediumRow:
    case ZoneType.ResMedium:
    case ZoneType.Mixed:
      return 'res';
    case ZoneType.ComLow:
    case ZoneType.ComHigh:
      return 'com';
    case ZoneType.Industrial:
      return 'ind';
    default:
      return null;
  }
}

/** Safe read of a possibly-out-of-range typed array slot (noUncheckedIndexedAccess). */
function readTile(arr: Uint8Array | Uint32Array, idx: number): number {
  const v = arr[idx];
  return v === undefined ? 0 : v;
}

function fieldAt(g: GridState, field: FieldId, idx: number): number {
  const arr = g.fields[field];
  if (arr === undefined) return 0;
  return readTile(arr, idx);
}

/** Any road tile within Manhattan distance `radius` of (x, z)? */
function hasNearbyRoad(g: GridState, x: number, z: number, radius: number): boolean {
  for (let dz = -radius; dz <= radius; dz++) {
    const spread = radius - Math.abs(dz);
    for (let dx = -spread; dx <= spread; dx++) {
      const tx = x + dx;
      const tz = z + dz;
      if (!inBounds(tx, tz)) continue;
      if (readTile(g.roadTier, tileIndex(tx, tz)) !== RoadTier.None) return true;
    }
  }
  return false;
}

/** True only if every tile of the w*d footprint at (x, z) is in bounds and unstamped. */
function footprintFree(g: GridState, x: number, z: number, w: number, d: number): boolean {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const tz = z + dz;
      if (!inBounds(tx, tz)) return false;
      if (readTile(g.buildingId, tileIndex(tx, tz)) !== 0) return false;
    }
  }
  return true;
}

/** Clears footprint tiles currently stamped with `expectedId` (no-op elsewhere). */
function clearStamp(
  g: GridState,
  x: number,
  z: number,
  w: number,
  d: number,
  expectedId: number,
): void {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = tileIndex(x + dx, z + dz);
      if (readTile(g.buildingId, idx) === expectedId) g.buildingId[idx] = 0;
    }
  }
}

/** Unconditionally stamps footprint tiles with `id`. Used to roll back a failed level-up. */
function writeStamp(g: GridState, x: number, z: number, w: number, d: number, id: number): void {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      g.buildingId[tileIndex(x + dx, z + dz)] = id;
    }
  }
}

function computeProblems(
  g: GridState,
  x: number,
  z: number,
  sector: Sector | null,
  demandForSector: number,
): number {
  const idx = tileIndex(x, z);
  let problems = 0;
  if (!readTile(g.power, idx)) problems |= Problem.NoPower;
  if (!readTile(g.watered, idx)) problems |= Problem.NoWater;
  if (!hasNearbyRoad(g, x, z, ROAD_CHECK_RADIUS)) problems |= Problem.NoRoad;
  if (fieldAt(g, FieldId.Crime, idx) > HIGH_CRIME) problems |= Problem.HighCrime;
  if (sector === 'res' && fieldAt(g, FieldId.Pollution, idx) > HIGH_POLLUTION)
    problems |= Problem.HighPollution;
  if (demandForSector < LOW_DEMAND) problems |= Problem.LowDemand;
  return problems;
}

/**
 * Land value alone clears L2. Res L3 additionally needs Education > 60
 * (a stand-in for "services present"); other sectors' L3 is land value alone.
 */
function meetsLevelUpRequirement(
  g: GridState,
  x: number,
  z: number,
  sector: Sector,
  targetLevel: number,
): boolean {
  const idx = tileIndex(x, z);
  const landValue = fieldAt(g, FieldId.LandValue, idx);
  const threshold = targetLevel >= 3 ? LEVEL_3_LAND_VALUE : LEVEL_2_LAND_VALUE;
  if (landValue <= threshold) return false;
  if (sector === 'res' && targetLevel >= 3) {
    return fieldAt(g, FieldId.Education, idx) > RES_L3_EDUCATION;
  }
  return true;
}

/** 0..1: land value helps, pollution hurts (res most, com some, ind none). */
function desirabilityFor(g: GridState, x: number, z: number, sector: Sector): number {
  const idx = tileIndex(x, z);
  const landValue = fieldAt(g, FieldId.LandValue, idx);
  const pollution = fieldAt(g, FieldId.Pollution, idx);
  const pollutionWeight = sector === 'res' ? 0.5 : sector === 'com' ? 0.2 : 0;
  const raw = (landValue / 255) * 0.6 + 0.4 - (pollution / 255) * pollutionWeight;
  return Math.max(0, Math.min(1, raw));
}

export class GrowthSystem {
  private readonly catalog: BuildingCatalogEntry[];
  private readonly catalogIndex: Map<string, BuildingCatalogEntry>;
  private readonly rng: Rng;
  private readonly canPlace: (g: GridState, x: number, z: number, w: number, d: number) => boolean;

  /** Building id -> construction ticks remaining. */
  private readonly constructing = new Map<number, number>();
  /** Building id -> consecutive passes with a NoPower/NoWater/NoRoad blocker while Active. */
  private readonly blockerStreak = new Map<number, number>();
  /** Building id -> passes elapsed since becoming Abandoned. */
  private readonly abandonedPasses = new Map<number, number>();

  constructor(
    catalog: BuildingCatalogEntry[],
    rng: Rng,
    canPlace: (g: GridState, x: number, z: number, w: number, d: number) => boolean,
  ) {
    this.catalog = catalog;
    this.catalogIndex = new Map(catalog.map((entry) => [entry.id, entry]));
    this.rng = rng;
    this.canPlace = canPlace;
  }

  tick(
    g: GridState,
    registry: BuildingRegistry,
    demand: DemandLevels,
    milestoneLevel: number,
    tickNo: number,
  ): BuildingDelta {
    const added: BuildingInstance[] = [];
    const removed: number[] = [];
    const updated: BuildingInstance[] = [];

    this.advanceConstruction(registry, updated);

    if (tickNo % GROWTH_INTERVAL === 0) {
      this.processProblemsAndAbandonment(g, registry, demand, removed, updated);
      this.runLevelUps(g, registry, milestoneLevel, added, removed);
      this.runSpawnScan(g, registry, demand, milestoneLevel, tickNo, added);
    }

    return { added, removed, updated };
  }

  private advanceConstruction(registry: BuildingRegistry, updated: BuildingInstance[]): void {
    for (const [id, remaining] of Array.from(this.constructing.entries())) {
      const next = remaining - 1;
      if (next > 0) {
        this.constructing.set(id, next);
        continue;
      }
      this.constructing.delete(id);
      const inst = registry.get(id);
      if (inst && inst.state === BuildingState.Constructing) {
        inst.state = BuildingState.Active;
        updated.push(inst);
      }
    }
  }

  private processProblemsAndAbandonment(
    g: GridState,
    registry: BuildingRegistry,
    demand: DemandLevels,
    removed: number[],
    updated: BuildingInstance[],
  ): void {
    for (const inst of registry.all()) {
      if (inst.state === BuildingState.Constructing) continue;
      const entry = this.catalogIndex.get(inst.catalogId);
      if (!entry || entry.zone === undefined) continue; // only grown (zoned) buildings age

      const sector = zoneSector(entry.zone);
      const demandForSector = sector ? demand[sector] : 0;
      const newProblems = computeProblems(g, inst.x, inst.z, sector, demandForSector);
      const hasBlocker = (newProblems & (Problem.NoPower | Problem.NoWater | Problem.NoRoad)) !== 0;

      if (inst.state === BuildingState.Active) {
        if (hasBlocker) {
          const streak = (this.blockerStreak.get(inst.id) ?? 0) + 1;
          if (streak >= ABANDON_BLOCKER_STREAK) {
            this.blockerStreak.delete(inst.id);
            inst.problems = newProblems;
            inst.state = BuildingState.Abandoned;
            this.abandonedPasses.set(inst.id, 0);
            updated.push(inst);
            continue;
          }
          this.blockerStreak.set(inst.id, streak);
        } else if (this.blockerStreak.has(inst.id)) {
          this.blockerStreak.delete(inst.id);
        }
        if (inst.problems !== newProblems) {
          inst.problems = newProblems;
          updated.push(inst);
        }
      } else if (inst.state === BuildingState.Abandoned) {
        if (!hasBlocker) {
          inst.state = BuildingState.Active;
          inst.problems = newProblems;
          this.abandonedPasses.delete(inst.id);
          updated.push(inst);
          continue;
        }
        const passes = (this.abandonedPasses.get(inst.id) ?? 0) + 1;
        if (passes >= DESPAWN_ABANDONED_PASSES) {
          this.abandonedPasses.delete(inst.id);
          registry.remove(g, inst.id);
          removed.push(inst.id);
          continue;
        }
        this.abandonedPasses.set(inst.id, passes);
        if (inst.problems !== newProblems) {
          inst.problems = newProblems;
          updated.push(inst);
        }
      }
    }
  }

  private runLevelUps(
    g: GridState,
    registry: BuildingRegistry,
    milestoneLevel: number,
    added: BuildingInstance[],
    removed: number[],
  ): void {
    for (const inst of registry.all()) {
      if (inst.state !== BuildingState.Active || inst.level >= 3) continue;
      const entry = this.catalogIndex.get(inst.catalogId);
      if (!entry || entry.zone === undefined) continue;
      this.tryLevelUp(g, registry, milestoneLevel, inst, entry, added, removed);
    }
  }

  private tryLevelUp(
    g: GridState,
    registry: BuildingRegistry,
    milestoneLevel: number,
    inst: BuildingInstance,
    entry: BuildingCatalogEntry,
    added: BuildingInstance[],
    removed: number[],
  ): boolean {
    const zone = entry.zone;
    if (zone === undefined) return false;
    const sector = zoneSector(zone);
    if (!sector) return false;

    const targetLevel = inst.level + 1;
    if (!meetsLevelUpRequirement(g, inst.x, inst.z, sector, targetLevel)) return false;

    const nextEntry = this.catalog.find((e) => e.zone === zone && e.level === targetLevel);
    if (!nextEntry || nextEntry.unlockMilestone > milestoneLevel) return false;

    const { x, z, rotation } = inst;
    const oldFootprint = footprintForRotation(entry, rotation);
    const newFootprint = footprintForRotation(nextEntry, rotation);

    // Temporarily clear this building's own stamp so the (possibly larger)
    // new footprint can be checked on a clean grid, then commit or roll back.
    clearStamp(g, x, z, oldFootprint.w, oldFootprint.d, inst.id);
    const fits =
      this.canPlace(g, x, z, newFootprint.w, newFootprint.d) &&
      footprintFree(g, x, z, newFootprint.w, newFootprint.d);
    if (!fits) {
      writeStamp(g, x, z, oldFootprint.w, oldFootprint.d, inst.id);
      return false;
    }

    registry.remove(g, inst.id);
    const placed = registry.place(g, nextEntry, x, z, rotation, BuildingState.Constructing);
    if (!placed) {
      // Unreachable: footprintFree + canPlace were just confirmed true with
      // no intervening mutation. Restore rather than silently drop the tile.
      writeStamp(g, x, z, oldFootprint.w, oldFootprint.d, inst.id);
      return false;
    }

    this.constructing.set(placed.id, CONSTRUCTION_TICKS);
    this.blockerStreak.delete(inst.id);
    removed.push(inst.id);
    added.push(placed);
    return true;
  }

  private runSpawnScan(
    g: GridState,
    registry: BuildingRegistry,
    demand: DemandLevels,
    milestoneLevel: number,
    tickNo: number,
    added: BuildingInstance[],
  ): void {
    const size = g.size;
    const totalTiles = size * size;
    const passIndex = Math.floor(tickNo / GROWTH_INTERVAL) % SCAN_STRIDE;

    for (let flat = passIndex; flat < totalTiles; flat += SCAN_STRIDE) {
      if (readTile(g.buildingId, flat) !== 0) continue;
      const zone = readTile(g.zone, flat) as ZoneType;
      const sector = zoneSector(zone);
      if (!sector) continue;
      if (!readTile(g.power, flat) || !readTile(g.watered, flat)) continue;

      const x = flat % size;
      const z = Math.floor(flat / size);
      if (!hasNearbyRoad(g, x, z, ROAD_CHECK_RADIUS)) continue;

      const entry = this.catalog.find(
        (e) => e.zone === zone && e.level === 1 && e.unlockMilestone <= milestoneLevel,
      );
      if (!entry) continue;

      const { w, d } = footprintForRotation(entry, 0);
      if (!this.canPlace(g, x, z, w, d)) continue;

      const demandForSector = demand[sector];
      if (demandForSector <= 0) continue;
      const desirability = desirabilityFor(g, x, z, sector);
      const probability = demandForSector * desirability;
      if (probability <= 0 || this.rng.next() >= probability) continue;

      const placed = registry.place(g, entry, x, z, 0, BuildingState.Constructing);
      if (!placed) continue;
      this.constructing.set(placed.id, CONSTRUCTION_TICKS);
      added.push(placed);
    }
  }
}
