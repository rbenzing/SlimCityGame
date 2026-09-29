/**
 * Zoned-lot growth system: spawns, grows, and retires
 * buildings on res/com/ind zoned tiles. Pure simulation logic operating on
 * GridState + BuildingRegistry -- no three.js/DOM, no Math.random/Date.now.
 *
 * It also owns every building's `problems` bits, plopped generators included,
 * so one cadence and one pass decide what the advisor and the info panel are
 * told is wrong.
 *
 * Cadence: `tick` is expected to be called once per sim tick (TICK_RATE,
 * see shared/constants). Construction countdowns advance every call; the
 * heavier scan/problems/level-up passes only run every GROWTH_INTERVAL
 * ticks, over a rotating stride-window of the grid so a full map is
 * covered over many passes rather than rescanned every time.
 */
import { inBounds, tileIndex } from '../shared/constants';
import { BuildingState, FieldId, Problem, ZoneType, isStreetTier } from '../shared/types';
import type {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  DemandLevels,
  GridState,
  GrowthWaiting,
  Sector,
} from '../shared/types';
import { BuildingRegistry, footprintForRotation } from './buildings';
import { utilityCanDeliver, utilityUnits, type UtilityLine } from './network';
import { freeCellsOn, roadCellsOf } from '../world/roadnet';

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
  const cells = g.roads ? roadCellsOf(g) : null;
  for (let dz = -radius; dz <= radius; dz++) {
    const spread = radius - Math.abs(dz);
    for (let dx = -spread; dx <= spread; dx++) {
      const tx = x + dx;
      const tz = z + dz;
      if (!inBounds(tx, tz)) continue;
      const idx = tileIndex(tx, tz);
      if (isStreetTier(readTile(g.roadTier, idx))) return true;
      // A road off the grid serves its lots as well as one on it.
      if (cells && freeCellsOn(cells, idx).some((c) => isStreetTier(cells.tier[c]!))) return true;
    }
  }
  return false;
}

/** Every in-bounds tile index of the w*d footprint at (x, z). */
function footprintTiles(x: number, z: number, w: number, d: number): number[] {
  const tiles: number[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const tz = z + dz;
      if (!inBounds(tx, tz)) continue;
      tiles.push(tileIndex(tx, tz));
    }
  }
  return tiles;
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

/**
 * True when ANY tile of the w*d footprint at (x, z) is served by `layer`.
 *
 * Power and water only reach one tile beyond a road, while a footprint always
 * extends from its origin corner towards +x/+z. Testing the origin alone
 * therefore made service depend on which side the street was: a lot fronting
 * a road to its north or west was served, while the identical lot fronting a
 * road to its south or east never was — its only served row would push the
 * footprint into the road, and the row that fits was out of reach. A lot is
 * connected as soon as one of its tiles is.
 */
function footprintServed(layer: Uint8Array, x: number, z: number, w: number, d: number): boolean {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const tz = z + dz;
      if (!inBounds(tx, tz)) continue;
      if (readTile(layer, tileIndex(tx, tz))) return true;
    }
  }
  return false;
}

/** What the utility pass left for growth: whom each cut, and what each has spare. */
export interface GrowthSupply {
  power: UtilityLine;
  water: UtilityLine;
}

/** A grid with room for anything and nobody cut, for callers that run no utility pass. */
export const UNMETERED_SUPPLY: GrowthSupply = {
  power: { cut: new Set(), spare: Infinity },
  water: { cut: new Set(), spare: Infinity },
};

/** What a pass still has to hand out, in utility units; it counts down as the pass builds. */
interface Spare {
  power: number;
  water: number;
}

/** Something growth would build or level up but for the supply: the pass it last asked in, and what it wanted, in utility units. */
interface Waiting {
  pass: number;
  use: number;
  /** The ground a new building would take; none for a level-up, which stands where it is. */
  tiles: readonly number[];
}

/** Tile indices of a w×d footprint at (x, z), clipped to the map. */
function footprintTilesAt(x: number, z: number, w: number, d: number): number[] {
  const tiles: number[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      if (inBounds(x + dx, z + dz)) tiles.push(tileIndex(x + dx, z + dz));
    }
  }
  return tiles;
}

/** The shortage bits for a building the utility pass cut. */
function shortageOf(supply: GrowthSupply, id: number): number {
  return (
    (supply.power.cut.has(id) ? Problem.PowerShortage : 0) |
    (supply.water.cut.has(id) ? Problem.WaterShortage : 0)
  );
}

function computeProblems(
  g: GridState,
  x: number,
  z: number,
  sector: Sector | null,
  demandForSector: number,
  w = 1,
  d = 1,
): number {
  const idx = tileIndex(x, z);
  let problems = 0;
  if (!footprintServed(g.power, x, z, w, d)) problems |= Problem.NoPower;
  if (!footprintServed(g.watered, x, z, w, d)) problems |= Problem.NoWater;
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
  /**
   * Lots (by tile index) and buildings (by negated id) held back for want of
   * power or water. Each visit forgets the wait and the supply check records
   * it again, so a lot the scan comes back to once a sweep stays counted for
   * exactly as long as it keeps waiting.
   */
  private readonly waiting = {
    power: new Map<number, Waiting>(),
    water: new Map<number, Waiting>(),
  };

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
    supply: GrowthSupply = UNMETERED_SUPPLY,
  ): BuildingDelta {
    const added: BuildingInstance[] = [];
    const removed: number[] = [];
    const updated: BuildingInstance[] = [];

    this.advanceConstruction(registry, updated);

    if (tickNo % GROWTH_INTERVAL === 0) {
      const pass = Math.floor(tickNo / GROWTH_INTERVAL);
      const spare: Spare = { power: supply.power.spare, water: supply.water.spare };
      this.forgetStaleWaits(pass);
      this.processProblemsAndAbandonment(g, registry, demand, supply, removed, updated);
      this.flagUnservedUtilities(g, registry, updated);
      this.runLevelUps(g, registry, milestoneLevel, pass, spare, added, removed);
      this.runSpawnScan(g, registry, demand, milestoneLevel, pass, spare, added);
    }

    return { added, removed, updated };
  }

  /**
   * How many lots and buildings are waiting for power and for water: held
   * back within the last sweep, still standing as they were, and still
   * wanting more than the grid has spare now.
   */
  waitingFor(g: GridState, registry: BuildingRegistry, supply: GrowthSupply): GrowthWaiting {
    const stillThere = (key: number): boolean =>
      key < 0
        ? registry.get(-key)?.state === BuildingState.Active
        : readTile(g.buildingId, key) === 0 &&
          zoneSector(readTile(g.zone, key) as ZoneType) !== null;
    const count = (held: ReadonlyMap<number, Waiting>, spare: number): number => {
      // Candidate lots overlap — a 2×2 home could start on any of four tiles —
      // so a lot counts only where no lot before it has claimed the ground.
      const claimed = new Set<number>();
      let n = 0;
      for (const [key, wait] of [...held].sort((a, b) => a[0] - b[0])) {
        if (wait.use <= spare || !stillThere(key)) continue;
        if (wait.tiles.some((t) => claimed.has(t))) continue;
        for (const t of wait.tiles) claimed.add(t);
        n += 1;
      }
      return n;
    };
    return {
      power: count(this.waiting.power, supply.power.spare),
      water: count(this.waiting.water, supply.water.spare),
    };
  }

  /** Drops waits a sweep old, or from a later pass than this one (a load went back in time). */
  private forgetStaleWaits(pass: number): void {
    for (const held of [this.waiting.power, this.waiting.water]) {
      for (const [key, wait] of held) {
        if (pass - wait.pass >= SCAN_STRIDE || wait.pass > pass) held.delete(key);
      }
    }
  }

  private forgetWait(key: number): void {
    this.waiting.power.delete(key);
    this.waiting.water.delete(key);
  }

  /**
   * Whether the pass has spare supply for `power` and `water` more (utility
   * units), recording `key` — standing on `tiles` — as waiting for whichever
   * it lacks.
   */
  private suppliedFor(
    key: number,
    tiles: readonly number[],
    pass: number,
    spare: Spare,
    power: number,
    water: number,
  ): boolean {
    const lacksPower = power > spare.power;
    const lacksWater = water > spare.water;
    if (lacksPower) this.waiting.power.set(key, { pass, use: power, tiles });
    if (lacksWater) this.waiting.water.set(key, { pass, use: water, tiles });
    return !lacksPower && !lacksWater;
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
    supply: GrowthSupply,
    removed: number[],
    updated: BuildingInstance[],
  ): void {
    for (const inst of registry.all()) {
      if (inst.state === BuildingState.Constructing) continue;
      const entry = this.catalogIndex.get(inst.catalogId);
      if (!entry || entry.zone === undefined) continue; // only grown (zoned) buildings age

      const sector = zoneSector(entry.zone);
      const demandForSector = sector ? demand[sector] : 0;
      const footprint = footprintForRotation(entry, inst.rotation);
      const newProblems =
        computeProblems(g, inst.x, inst.z, sector, demandForSector, footprint.w, footprint.d) |
        shortageOf(supply, inst.id);
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

  /**
   * A generator counts towards the city's supply whether anything reaches it
   * or not, so one that cannot deliver has to say so: otherwise the totals
   * read healthy, no tile is served, and the city quietly stops growing with
   * nothing on screen to contradict the player. It is the delivery that is in
   * question, so a turbine a line reaches is connected and says nothing.
   *
   * Only the flag: a plopped generator never abandons, whatever the streak.
   */
  private flagUnservedUtilities(
    g: GridState,
    registry: BuildingRegistry,
    updated: BuildingInstance[],
  ): void {
    for (const inst of registry.all()) {
      if (inst.state !== BuildingState.Active) continue;
      const entry = this.catalogIndex.get(inst.catalogId);
      if (!entry?.utility) continue;

      const { w, d } = footprintForRotation(entry, inst.rotation);
      const delivers = utilityCanDeliver(g, entry.utility, footprintTiles(inst.x, inst.z, w, d));
      const problems = delivers ? inst.problems & ~Problem.NoRoad : inst.problems | Problem.NoRoad;
      if (problems === inst.problems) continue;
      inst.problems = problems;
      updated.push(inst);
    }
  }

  private runLevelUps(
    g: GridState,
    registry: BuildingRegistry,
    milestoneLevel: number,
    pass: number,
    spare: Spare,
    added: BuildingInstance[],
    removed: number[],
  ): void {
    for (const inst of registry.all()) {
      if (inst.state !== BuildingState.Active || inst.level >= 3) continue;
      const entry = this.catalogIndex.get(inst.catalogId);
      if (!entry || entry.zone === undefined) continue;
      this.tryLevelUp(g, registry, milestoneLevel, pass, spare, inst, entry, added, removed);
    }
  }

  private tryLevelUp(
    g: GridState,
    registry: BuildingRegistry,
    milestoneLevel: number,
    pass: number,
    spare: Spare,
    inst: BuildingInstance,
    entry: BuildingCatalogEntry,
    added: BuildingInstance[],
    removed: number[],
  ): boolean {
    const waitKey = -inst.id;
    this.forgetWait(waitKey);
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
    // A bigger building draws more, and nobody builds it on a grid that
    // cannot carry the difference.
    const power = utilityUnits(nextEntry.powerUse) - utilityUnits(entry.powerUse);
    const water = utilityUnits(nextEntry.waterUse) - utilityUnits(entry.waterUse);
    if (!fits || !this.suppliedFor(waitKey, [], pass, spare, power, water)) {
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
    spare.power -= power;
    spare.water -= water;

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
    pass: number,
    spare: Spare,
    added: BuildingInstance[],
  ): void {
    const size = g.size;
    const totalTiles = size * size;
    const passIndex = pass % SCAN_STRIDE;

    for (let flat = passIndex; flat < totalTiles; flat += SCAN_STRIDE) {
      this.forgetWait(flat);
      if (readTile(g.buildingId, flat) !== 0) continue;
      const zone = readTile(g.zone, flat) as ZoneType;
      const sector = zoneSector(zone);
      if (!sector) continue;

      const x = flat % size;
      const z = Math.floor(flat / size);
      if (!hasNearbyRoad(g, x, z, ROAD_CHECK_RADIUS)) continue;

      const entry = this.catalog.find(
        (e) => e.zone === zone && e.level === 1 && e.unlockMilestone <= milestoneLevel,
      );
      if (!entry) continue;

      const { w, d } = footprintForRotation(entry, 0);
      if (!this.canPlace(g, x, z, w, d)) continue;
      // Service is judged over the whole lot, so it cannot depend on which
      // side of the building the street happens to sit (see footprintServed).
      if (!footprintServed(g.power, x, z, w, d) || !footprintServed(g.watered, x, z, w, d)) {
        continue;
      }

      const demandForSector = demand[sector];
      if (demandForSector <= 0) continue;
      const desirability = desirabilityFor(g, x, z, sector);
      const probability = demandForSector * desirability;
      if (probability <= 0) continue;
      // Nobody moves into a home the grid cannot light or water.
      const power = utilityUnits(entry.powerUse);
      const water = utilityUnits(entry.waterUse);
      const lot = footprintTilesAt(x, z, w, d);
      if (!this.suppliedFor(flat, lot, pass, spare, power, water)) continue;
      if (this.rng.next() >= probability) continue;

      const placed = registry.place(g, entry, x, z, 0, BuildingState.Constructing);
      if (!placed) continue;
      spare.power -= power;
      spare.water -= water;
      this.constructing.set(placed.id, CONSTRUCTION_TICKS);
      added.push(placed);
    }
  }
}
