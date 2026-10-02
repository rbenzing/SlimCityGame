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
import { ROAD_CHECK_RADIUS, inBounds, tileIndex } from '../shared/constants';
import { BuildingState, FieldId, Problem, ZoneType, isStreetTier } from '../shared/types';
import { SoilGrade, isFarmable } from '../shared/soil';
import type {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  DemandLevels,
  FarmKind,
  GridState,
  GrowthWaiting,
  Sector,
  ZonedUnserved,
} from '../shared/types';
import { farmKindOf } from '../shared/buildingkind';
import { BuildingRegistry, footprintForRotation, lotTiles } from './buildings';
import type { JobsBySector } from './economy';
import {
  cityWaterUse,
  dirtRoadWithinReach,
  sewageOf,
  utilityCanDeliver,
  utilityUnits,
  type UtilityLine,
} from './network';
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
    // A farm's jobs are the basic jobs a small town lives by, like a mill's.
    case ZoneType.Industrial:
    case ZoneType.IndHeavy:
    case ZoneType.Agriculture:
      return 'ind';
    default:
      return null;
  }
}

/** The soil a farm kind needs under its land: crops the best, pasture anything farmable. */
const FARM_GRADE: Readonly<Record<FarmKind, SoilGrade>> = {
  crops: SoilGrade.Prime,
  orchard: SoilGrade.Fertile,
  pasture: SoilGrade.Marginal,
};

/** The kind of farm a lot's soil grows, or null where it grows none. */
export function farmKindFor(grade: SoilGrade): FarmKind | null {
  if (grade >= SoilGrade.Prime) return 'crops';
  if (grade >= SoilGrade.Fertile) return 'orchard';
  if (grade >= SoilGrade.Marginal) return 'pasture';
  return null;
}

/** How likely a farm is to start on a lot, by the lot's soil, in place of land value. */
const FARM_DESIRABILITY: Readonly<Record<SoilGrade, number>> = {
  [SoilGrade.Unfit]: 0,
  [SoilGrade.Marginal]: 0.6,
  [SoilGrade.Fertile]: 0.8,
  [SoilGrade.Prime]: 1,
};

/** The grade at least half the w×d lot at (x, z) reaches. */
export function lotGrade(g: GridState, x: number, z: number, w: number, d: number): SoilGrade {
  const counts = [0, 0, 0, 0];
  const tiles = lotTiles(x, z, w, d);
  for (const idx of tiles) {
    const grade = readTile(g.soil, idx);
    counts[grade] = (counts[grade] ?? 0) + 1;
  }
  let reached = 0;
  for (let grade = SoilGrade.Prime; grade > SoilGrade.Unfit; grade--) {
    reached += counts[grade] ?? 0;
    if (reached * 2 >= tiles.length) return grade as SoilGrade;
  }
  return SoilGrade.Unfit;
}

/**
 * Every tile of the w×d lot at (x, z) on the map and zoned `zone`: a building
 * stands only on land zoned for it, never spilling onto the ground beside.
 */
function isZonedLot(
  g: GridState,
  zone: ZoneType,
  x: number,
  z: number,
  w: number,
  d: number,
): boolean {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      if (!inBounds(x + dx, z + dz)) return false;
      if (readTile(g.zone, tileIndex(x + dx, z + dz)) !== zone) return false;
    }
  }
  return true;
}

/** Every tile of the lot on the map, zoned Agriculture and on soil a farm can work. */
function isFarmLot(g: GridState, x: number, z: number, w: number, d: number): boolean {
  if (!isZonedLot(g, ZoneType.Agriculture, x, z, w, d)) return false;
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      if (!isFarmable(readTile(g.soil, tileIndex(x + dx, z + dz)))) return false;
    }
  }
  return true;
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
  sewer: UtilityLine;
}

/** A grid with room for anything and nobody cut, for callers that run no utility pass. */
export const UNMETERED_SUPPLY: GrowthSupply = {
  power: { cut: new Set(), spare: Infinity },
  water: { cut: new Set(), spare: Infinity },
  sewer: { cut: new Set(), spare: Infinity },
};

/** What a pass still has to hand out, in utility units; it counts down as the pass builds. */
interface Spare {
  power: number;
  water: number;
  sewer: number;
}

/** An economy with room for any business, for callers that run no demand model. */
export const UNLIMITED_ROOM: JobsBySector = { com: Infinity, ind: Infinity };

/**
 * The business kinds among `candidates` whose jobs fit the sector's `room`,
 * plus the smallest of them whatever the room, so growth never stalls at a
 * gap smaller than any building. Residential kinds pass untouched.
 */
export function withinRoom(
  candidates: readonly BuildingCatalogEntry[],
  sector: Sector,
  room: JobsBySector,
): BuildingCatalogEntry[] {
  if (sector === 'res' || candidates.length === 0) return [...candidates];
  const smallest = Math.min(...candidates.map((e) => e.jobs ?? 0));
  const limit = Math.max(room[sector], smallest);
  return candidates.filter((e) => (e.jobs ?? 0) <= limit);
}

/** Something growth would build or level up but for the supply: the pass it last asked in, and what it wanted, in utility units. */
interface Waiting {
  pass: number;
  use: number;
  /** The ground a new building would take; none for a level-up, which stands where it is. */
  tiles: readonly number[];
}

/** The shortage bits for a building the utility pass cut. */
function shortageOf(supply: GrowthSupply, id: number): number {
  return (
    (supply.power.cut.has(id) ? Problem.PowerShortage : 0) |
    (supply.water.cut.has(id) ? Problem.WaterShortage : 0) |
    (supply.sewer.cut.has(id) ? Problem.SewerShortage : 0)
  );
}

function computeProblems(
  g: GridState,
  x: number,
  z: number,
  entry: BuildingCatalogEntry,
  demandForSector: number,
  w = 1,
  d = 1,
): number {
  const idx = tileIndex(x, z);
  const sector = entry.zone === undefined ? null : zoneSector(entry.zone);
  const reached =
    farmKindOf(entry) !== null
      ? dirtRoadWithinReach(g, x, z, w, d)
      : hasNearbyRoad(g, x, z, ROAD_CHECK_RADIUS);
  let problems = 0;
  if (!footprintServed(g.power, x, z, w, d)) problems |= Problem.NoPower;
  if (cityWaterUse(g, entry, x, z, w, d) > 0 && !footprintServed(g.watered, x, z, w, d)) {
    problems |= Problem.NoWater;
  }
  if (sewageOf(g, entry, x, z, w, d) > 0 && !footprintServed(g.sewered, x, z, w, d)) {
    problems |= Problem.NoSewer;
  }
  if (!reached) problems |= Problem.NoRoad;
  if (fieldAt(g, FieldId.Crime, idx) > HIGH_CRIME) problems |= Problem.HighCrime;
  if (sector === 'res' && fieldAt(g, FieldId.Pollution, idx) > HIGH_POLLUTION)
    problems |= Problem.HighPollution;
  if (demandForSector < LOW_DEMAND) problems |= Problem.LowDemand;
  return problems;
}

/**
 * For homes and shops, land value alone clears L2. Res L3 additionally needs
 * Education > 60 (a stand-in for "services present"); commercial L3 is land
 * value alone. Industry never asks: it grows on demand and room.
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

/**
 * The kinds a lot may grow: the zone's level-1 entries unlocked at
 * `milestoneLevel` whose footprint `fits` the lot, in catalog order.
 */
export function spawnCandidates(
  catalog: readonly BuildingCatalogEntry[],
  zone: ZoneType,
  milestoneLevel: number,
  fits: (entry: BuildingCatalogEntry) => boolean,
): BuildingCatalogEntry[] {
  return catalog.filter(
    (e) => e.zone === zone && e.level === 1 && e.unlockMilestone <= milestoneLevel && fits(e),
  );
}

/**
 * One of `candidates` by its `share` of the real stock: `roll` in [0, 1)
 * against their cumulative weights. A candidate with no share weighs 1.
 */
export function drawKind(
  candidates: readonly BuildingCatalogEntry[],
  roll: number,
): BuildingCatalogEntry {
  const total = candidates.reduce((sum, e) => sum + (e.share ?? 1), 0);
  let threshold = roll * total;
  for (const e of candidates) {
    threshold -= e.share ?? 1;
    if (threshold < 0) return e;
  }
  return candidates[candidates.length - 1]!;
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
  /** Each zone's first building that draws water at all: a farm pumps its own well. */
  private readonly waterEntries: ReadonlyMap<ZoneType, BuildingCatalogEntry>;
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
    sewer: new Map<number, Waiting>(),
  };

  constructor(
    catalog: BuildingCatalogEntry[],
    rng: Rng,
    canPlace: (g: GridState, x: number, z: number, w: number, d: number) => boolean,
  ) {
    this.catalog = catalog;
    this.catalogIndex = new Map(catalog.map((entry) => [entry.id, entry]));
    const waterEntries = new Map<ZoneType, BuildingCatalogEntry>();
    for (const e of catalog) {
      if (e.zone === undefined || e.level !== 1 || e.waterUse <= 0) continue;
      if (!waterEntries.has(e.zone)) waterEntries.set(e.zone, e);
    }
    this.waterEntries = waterEntries;
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
    room: JobsBySector = UNLIMITED_ROOM,
  ): BuildingDelta {
    const added: BuildingInstance[] = [];
    const removed: number[] = [];
    const updated: BuildingInstance[] = [];

    this.advanceConstruction(registry, updated);

    if (tickNo % GROWTH_INTERVAL === 0) {
      const pass = Math.floor(tickNo / GROWTH_INTERVAL);
      const spare: Spare = {
        power: supply.power.spare,
        water: supply.water.spare,
        sewer: supply.sewer.spare,
      };
      // The room, like the spare supply, is handed out once per pass.
      const roomLeft: JobsBySector = { ...room };
      this.forgetStaleWaits(pass);
      this.processProblemsAndAbandonment(g, registry, demand, supply, removed, updated);
      this.flagUnservedUtilities(g, registry, updated);
      this.runLevelUps(g, registry, demand, milestoneLevel, pass, spare, roomLeft, added, removed);
      this.runSpawnScan(g, registry, demand, milestoneLevel, pass, spare, roomLeft, added);
    }

    return { added, removed, updated };
  }

  /**
   * How many lots and buildings are waiting for power, for water and for a
   * drain: held back within the last sweep, still standing as they were, and
   * still wanting more than the grid has spare now.
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
      sewer: count(this.waiting.sewer, supply.sewer.spare),
    };
  }

  /**
   * Empty zoned tiles standing beside a road yet without power, or without
   * water or a drain where their zone's buildings draw it. A served road hands
   * its utility to every tile beside it, so a tile here is one its own road
   * fails: a gravel road carries no cable, a street the mains never reach
   * carries no water, and a street no drain reaches carries no sewer. A tile a
   * house would stand on a well on wants no water and no sewer. Ground zoned
   * too deep to touch the road is left out, since more supply would not grow
   * it either.
   */
  zonedUnserved(g: GridState): ZonedUnserved {
    const cells = g.roads ? roadCellsOf(g) : null;
    const isRoad = (x: number, z: number): boolean => {
      if (!inBounds(x, z)) return false;
      const idx = tileIndex(x, z);
      if (isStreetTier(readTile(g.roadTier, idx))) return true;
      return cells !== null && freeCellsOn(cells, idx).some((c) => isStreetTier(cells.tier[c]!));
    };
    const out: ZonedUnserved = { power: 0, water: 0, sewer: 0 };
    for (let z = 0; z < g.size; z++) {
      for (let x = 0; x < g.size; x++) {
        const idx = tileIndex(x, z);
        if (readTile(g.buildingId, idx) !== 0) continue;
        const zone = readTile(g.zone, idx) as ZoneType;
        if (zoneSector(zone) === null) continue;
        const lacksPower = !readTile(g.power, idx);
        const drinks = this.waterEntries.get(zone);
        const dry = drinks !== undefined && !readTile(g.watered, idx);
        const undrained = drinks !== undefined && !readTile(g.sewered, idx);
        if (!lacksPower && !dry && !undrained) continue;
        if (!isRoad(x - 1, z) && !isRoad(x + 1, z) && !isRoad(x, z - 1) && !isRoad(x, z + 1)) {
          continue;
        }
        // A tile a house would stand on a well on wants neither water nor a sewer.
        const onMains = drinks !== undefined && cityWaterUse(g, drinks, x, z, 1, 1) > 0;
        if (lacksPower) {
          out.power += 1;
          out.powerAt ??= { x, z };
        }
        if (dry && onMains) {
          out.water += 1;
          out.waterAt ??= { x, z };
        }
        if (undrained && onMains) {
          out.sewer += 1;
          out.sewerAt ??= { x, z };
        }
      }
    }
    return out;
  }

  /** Drops waits a sweep old, or from a later pass than this one (a load went back in time). */
  private forgetStaleWaits(pass: number): void {
    for (const held of [this.waiting.power, this.waiting.water, this.waiting.sewer]) {
      for (const [key, wait] of held) {
        if (pass - wait.pass >= SCAN_STRIDE || wait.pass > pass) held.delete(key);
      }
    }
  }

  private forgetWait(key: number): void {
    this.waiting.power.delete(key);
    this.waiting.water.delete(key);
    this.waiting.sewer.delete(key);
  }

  /**
   * Whether the pass has spare supply for `power`, `water` and `sewer` more
   * (utility units), recording `key` — standing on `tiles` — as waiting for
   * whichever it lacks.
   */
  private suppliedFor(
    key: number,
    tiles: readonly number[],
    pass: number,
    spare: Spare,
    power: number,
    water: number,
    sewer: number,
  ): boolean {
    const lacksPower = power > spare.power;
    const lacksWater = water > spare.water;
    const lacksSewer = sewer > spare.sewer;
    if (lacksPower) this.waiting.power.set(key, { pass, use: power, tiles });
    if (lacksWater) this.waiting.water.set(key, { pass, use: water, tiles });
    if (lacksSewer) this.waiting.sewer.set(key, { pass, use: sewer, tiles });
    return !lacksPower && !lacksWater && !lacksSewer;
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
        computeProblems(g, inst.x, inst.z, entry, demandForSector, footprint.w, footprint.d) |
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
      const delivers = utilityCanDeliver(g, entry.utility, lotTiles(inst.x, inst.z, w, d));
      const problems = delivers ? inst.problems & ~Problem.NoRoad : inst.problems | Problem.NoRoad;
      if (problems === inst.problems) continue;
      inst.problems = problems;
      updated.push(inst);
    }
  }

  private runLevelUps(
    g: GridState,
    registry: BuildingRegistry,
    demand: DemandLevels,
    milestoneLevel: number,
    pass: number,
    spare: Spare,
    room: JobsBySector,
    added: BuildingInstance[],
    removed: number[],
  ): void {
    for (const inst of registry.all()) {
      if (inst.state !== BuildingState.Active || inst.level >= 3) continue;
      const entry = this.catalogIndex.get(inst.catalogId);
      if (!entry || entry.zone === undefined) continue;
      this.tryLevelUp(
        g,
        registry,
        demand,
        milestoneLevel,
        pass,
        spare,
        room,
        inst,
        entry,
        added,
        removed,
      );
    }
  }

  private tryLevelUp(
    g: GridState,
    registry: BuildingRegistry,
    demand: DemandLevels,
    milestoneLevel: number,
    pass: number,
    spare: Spare,
    room: JobsBySector,
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
    const farm = farmKindOf(entry);
    // Industry grows on its order book: a works or a farm levels up while the
    // town wants more basic work, and land value, which pushes real industry
    // out of town, plays no part. Homes and shops still need the land value.
    if (sector === 'ind') {
      if (demand.ind <= 0) return false;
    } else if (!meetsLevelUpRequirement(g, inst.x, inst.z, sector, targetLevel)) {
      return false;
    }

    // A building keeps its kind for life: the next level of the same kind.
    const nextEntry = this.catalog.find(
      (e) => e.zone === zone && e.level === targetLevel && e.kind === entry.kind,
    );
    if (!nextEntry || nextEntry.unlockMilestone > milestoneLevel) return false;
    // A business grows only where the town has room for the jobs it adds.
    const jobsAdded = (nextEntry.jobs ?? 0) - (entry.jobs ?? 0);
    if (sector !== 'res' && farm === null && jobsAdded > room[sector]) return false;

    const { x, z, rotation } = inst;
    const oldFootprint = footprintForRotation(entry, rotation);
    const newFootprint = footprintForRotation(nextEntry, rotation);

    // Temporarily clear this building's own stamp so the (possibly larger)
    // new footprint can be checked on a clean grid, then commit or roll back.
    clearStamp(g, x, z, oldFootprint.w, oldFootprint.d, inst.id);
    const fits =
      this.canPlace(g, x, z, newFootprint.w, newFootprint.d) &&
      footprintFree(g, x, z, newFootprint.w, newFootprint.d) &&
      (farm === null
        ? isZonedLot(g, zone, x, z, newFootprint.w, newFootprint.d)
        : isFarmLot(g, x, z, newFootprint.w, newFootprint.d) &&
          lotGrade(g, x, z, newFootprint.w, newFootprint.d) >= FARM_GRADE[farm]);
    // A bigger building draws more, and nobody builds it on a grid that
    // cannot carry the difference.
    const power = utilityUnits(nextEntry.powerUse) - utilityUnits(entry.powerUse);
    const water =
      utilityUnits(cityWaterUse(g, nextEntry, x, z, newFootprint.w, newFootprint.d)) -
      utilityUnits(cityWaterUse(g, entry, x, z, oldFootprint.w, oldFootprint.d));
    const sewer =
      utilityUnits(sewageOf(g, nextEntry, x, z, newFootprint.w, newFootprint.d)) -
      utilityUnits(sewageOf(g, entry, x, z, oldFootprint.w, oldFootprint.d));
    if (
      !fits ||
      !this.suppliedFor(waitKey, [], pass, spare, power, water, sewer) ||
      (farm !== null && this.rng.next() >= demand.ind)
    ) {
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
    spare.sewer -= sewer;
    if (sector !== 'res') room[sector] -= jobsAdded;

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
    room: JobsBySector,
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
      if (zone === ZoneType.Agriculture) {
        this.trySpawnFarm(g, registry, demand, milestoneLevel, pass, spare, room, added, x, z);
        continue;
      }
      if (!hasNearbyRoad(g, x, z, ROAD_CHECK_RADIUS)) continue;

      // The lot picks its building: among the zone's kinds that fit here, on
      // land zoned for them and within the room the economy has for their
      // jobs, one is drawn by how common it is in the real stock.
      const fitting = spawnCandidates(this.catalog, zone, milestoneLevel, (e) => {
        const { w, d } = footprintForRotation(e, 0);
        return isZonedLot(g, zone, x, z, w, d) && this.canPlace(g, x, z, w, d);
      });
      const candidates = withinRoom(fitting, sector, room);
      if (candidates.length === 0) continue;
      const entry = drawKind(candidates, candidates.length > 1 ? this.rng.next() : 0);

      const { w, d } = footprintForRotation(entry, 0);
      // Service is judged over the whole lot, so it cannot depend on which
      // side of the building the street happens to sit (see footprintServed).
      // A lot a drain does not reach grows nothing: its sewage would have
      // nowhere to go.
      if (
        !footprintServed(g.power, x, z, w, d) ||
        (cityWaterUse(g, entry, x, z, w, d) > 0 && !footprintServed(g.watered, x, z, w, d)) ||
        (sewageOf(g, entry, x, z, w, d) > 0 && !footprintServed(g.sewered, x, z, w, d))
      ) {
        continue;
      }

      const demandForSector = demand[sector];
      if (demandForSector <= 0) continue;
      const desirability = desirabilityFor(g, x, z, sector);
      this.spawnIfSupplied(
        g,
        registry,
        entry,
        x,
        z,
        demandForSector * desirability,
        pass,
        spare,
        room,
        added,
      );
    }
  }

  /**
   * A farm on the lot at (x, z): every tile of it Agriculture land a farm can
   * work, a dirt road within reach and power on it — never city water, which
   * a farm does without. Its soil decides the kind and how likely it is.
   */
  private trySpawnFarm(
    g: GridState,
    registry: BuildingRegistry,
    demand: DemandLevels,
    milestoneLevel: number,
    pass: number,
    spare: Spare,
    room: JobsBySector,
    added: BuildingInstance[],
    x: number,
    z: number,
  ): void {
    if (demand.ind <= 0) return;
    const first = this.catalog.find(
      (e) =>
        e.zone === ZoneType.Agriculture && e.level === 1 && e.unlockMilestone <= milestoneLevel,
    );
    if (!first) return;
    const { w, d } = footprintForRotation(first, 0);
    if (!isFarmLot(g, x, z, w, d) || !this.canPlace(g, x, z, w, d)) return;
    if (!dirtRoadWithinReach(g, x, z, w, d)) return;
    if (!footprintServed(g.power, x, z, w, d)) return;

    const grade = lotGrade(g, x, z, w, d);
    const kind = farmKindFor(grade);
    const entry = this.catalog.find(
      (e) =>
        e.zone === ZoneType.Agriculture &&
        e.level === 1 &&
        e.kind === kind &&
        e.unlockMilestone <= milestoneLevel,
    );
    if (!entry) return;
    this.spawnIfSupplied(
      g,
      registry,
      entry,
      x,
      z,
      demand.ind * FARM_DESIRABILITY[grade],
      pass,
      spare,
      room,
      added,
    );
  }

  /** Starts `entry` at (x, z) with `probability`, if the grid can carry what it draws. */
  private spawnIfSupplied(
    g: GridState,
    registry: BuildingRegistry,
    entry: BuildingCatalogEntry,
    x: number,
    z: number,
    probability: number,
    pass: number,
    spare: Spare,
    room: JobsBySector,
    added: BuildingInstance[],
  ): void {
    if (probability <= 0) return;
    const { w, d } = footprintForRotation(entry, 0);
    // Nobody moves into a home the grid cannot light, water or drain.
    const power = utilityUnits(entry.powerUse);
    const water = utilityUnits(cityWaterUse(g, entry, x, z, w, d));
    const sewer = utilityUnits(sewageOf(g, entry, x, z, w, d));
    const lot = lotTiles(x, z, w, d);
    if (!this.suppliedFor(tileIndex(x, z), lot, pass, spare, power, water, sewer)) return;
    if (this.rng.next() >= probability) return;

    const placed = registry.place(g, entry, x, z, 0, BuildingState.Constructing);
    if (!placed) return;
    spare.power -= power;
    spare.water -= water;
    spare.sewer -= sewer;
    const sector = entry.zone === undefined ? null : zoneSector(entry.zone);
    if (sector && sector !== 'res') room[sector] -= entry.jobs ?? 0;
    this.constructing.set(placed.id, CONSTRUCTION_TICKS);
    added.push(placed);
  }
}
