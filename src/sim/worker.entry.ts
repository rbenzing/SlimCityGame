/**
 * Sim worker entry point: owns the authoritative GridState and
 * every simulation system, drains player command batches once per tick, and
 * streams SimSnapshots back to the render thread at SNAPSHOT_HZ.
 *
 * The whole sim is wrapped in a testable factory (createWorkerSim) with an
 * injected `post` callback; the module-scope bootstrap at the bottom only
 * runs inside a real DedicatedWorkerGlobalScope, where a setInterval(TICK_MS)
 * pump drives the FixedTimestep with a constant elapsed time (never Date.now —
 * determinism rule; speed multipliers are handled by FixedTimestep itself).
 */
import {
  DEFAULT_TAX_RATE,
  MAP_SIZE,
  MAX_TAX_RATE,
  SERVICE_FUNDING_MAX,
  SERVICE_FUNDING_MIN,
  START_FUNDS,
  SPEED_MULTIPLIERS,
  TICK_MS,
  TICK_RATE,
  SNAPSHOT_HZ,
  GARBAGE_PERIOD,
  GARBAGE_OFFSET,
  LANDFILL_CAPACITY_PER_TILE,
  LANDFILL_MIN_AREA_TILES,
  LANDFILL_PAINT_COST_PER_TILE,
  POWER_LINE_COST_PER_TILE,
  WATER_PIPE_COST_PER_TILE,
  SEWAGE_POLLUTION_PER_KL,
  LANDFILL_TRUCKS_BASE,
  LANDFILL_TRUCKS_MAX,
  LANDFILL_TRUCKS_PER_TILES,
  BRIDGE_COST_PER_METER_TILE,
  TILE_METERS,
  inBounds,
  tileIndex,
} from '../shared/constants';
import { segmentLengthM } from '../shared/roadgeom';
import {
  deriveRoadFootprint,
  gridRunRefusal,
  joinSegmentsAt,
  laySegment,
  moveRoadEnd,
  nearestRoadPoint,
  planSegment,
  removeSegmentAt,
  SPLIT_MATCH_M,
  splitRefusal,
  splitSegment,
} from '../world/freeroads';
import {
  SAVE_VERSION,
  TRASH_UNIT_SAVE_VERSION,
  BuildingState,
  FieldId,
  Problem,
  flowsAlong,
  RoadFlow,
  RoadTier,
  isRailTier,
  isTramTier,
  isStreetTier,
  stepForFlow,
  ZoneType,
  MAX_VEHICLES,
  VEHICLE_STRIDE,
} from '../shared/types';
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  CityStats,
  Command,
  CommandAck,
  District,
  GraphEdge,
  GridState,
  Incident,
  JunctionControl,
  MainToWorker,
  MapData,
  RoadClassId,
  RoadProfile,
  RoadSpec,
  RoadTileDelta,
  RoundaboutJunction,
  ServiceKind,
  ServiceLoad,
  SimSnapshot,
  SimSpeed,
  TileArms,
  TilePoint,
  WorkerToMain,
  ZonePatch,
} from '../shared/types';
import catalogData from '../data/catalog.json';
import roadsData from '../data/roads.json';
import {
  adoptCustomProfiles,
  oneCarriagewayIds,
  FIRST_CUSTOM_PROFILE_ID,
  layRefusal,
  isPresetProfileId,
  joinRefusal,
  presetProfileForTier,
  roadPriceOf,
  tierForProfile,
  tierOutranks,
  type RoadPrice,
} from '../shared/roadprofile';
import { codeForControl, controlFromCode, takesControl } from '../shared/junction';
import { armsAt } from '../world/pathfind';
import {
  armAllowed,
  armIsRestricted,
  armSlot,
  laneAllowed,
  MAX_EDITABLE_LANES,
  withArmAllowed,
  withLaneAllowed,
} from '../shared/approach';

/** One junction as the render thread and the inspector read it. */
type JunctionSnapshot = NonNullable<SimSnapshot['junctions']>[number];

import { createRng } from '../core/rng';
import { FixedTimestep } from '../core/loop';
import type { CommandBatch } from '../core/commands';
import type { RoadNet, SelectionInfo } from '../shared/types';
import {
  canPlaceFootprint,
  ARMS_PER_TILE,
  hasAdjacentTier,
  hasAdjacentWater,
  clearTiles,
  createGrid,
  isBridgeBuildable,
  isRoadBuildable,
  setZones,
} from '../world/grid';
import {
  createRoadNetwork,
  encodeRoadNetwork,
  loadGrid,
  reconcileRoads,
  saveGrid,
  segmentGeom,
  syncRoadLayers,
} from '../world/roadnet';
import { noiseWallsOf } from '../world/noisewalls';
import {
  applyRoad,
  armsApartOn,
  computeOverMask,
  holdArmsApart,
  remaskAround,
  removeRoad,
  settleArms,
} from '../world/roads';
import { RoadNetwork, tramShape } from '../world/roadgraph';
import { gridRingReader, roundaboutGroundOf } from '../world/roundabouts';
import {
  blockTiles,
  compactRoundaboutAt,
  effectiveControlCode,
  roundaboutPlan,
  type RoundaboutBlock,
} from '../shared/roundabout';
import {
  clearOverRoad,
  liftToOverLayer,
  overRoadAt,
  overRoadChanges,
  setOverRoad,
  type OverRoad,
} from '../world/overpass';
import { atOneLevel, axisOfFlow, bitToward, crossingShape, overpassRise } from '../shared/overpass';
import {
  bulldozeReach,
  corridorPartnerTile,
  corridorSplitRefusal,
  rampMeetingRefusal,
} from '../shared/corridor';
import type { RoadLayerReader } from '../shared/corridor';
import { solveElevationProfile } from '../world/bridges';
import {
  applyHeightPatch,
  computeTerraformPatch,
  readHeightPatch,
  type HeightPatch,
  type TerraformCommand,
  type TerraformSetCommand,
} from '../world/terraform';
import { FieldSim } from './fields';
import { footprintForRotation } from '../shared/footprint';
import { BuildingRegistry, settleBuildingDelta } from './buildings';
import { computeDemand, jobRoom } from './demand';
import { GrowthSystem, type GrowthSupply } from './growth';
import { ServiceSim, nearestRoadTile } from './services';
import { EconomySystem, buildingMonthlyTax, type Occupancy } from './economy';
import { bordersUtilityNetwork, recomputeUtilities, sewageOf } from './network';
import { TrafficSystem } from './traffic';
import { TransitSystem, type PopulationJobsAccessor, type TransitTickResult } from './transit';
import { DispatchSystem, MAX_SERVICE_VEHICLES } from './dispatch';
import { PolicyStore, effectivePollution, trafficWeight } from './policy';
import { paintDistrict } from '../world/districts';
import {
  hasUndersizedArea,
  landfillAreas,
  landfillPlacementMask,
  landfillTruckDepots,
  paintLandfill,
  type LandfillArea,
} from '../world/landfill';
import { canStringLine, stringPowerLine } from '../world/powerline';
import { canLayPipe, layWaterPipe } from '../world/waterpipe';
import { regradeSoil, soilGrades } from '../shared/soil';
import {
  GarbageSystem,
  incineratorEmission,
  type GarbageBuilding,
  type GarbageDepot,
  type GarbageFacility,
  type GarbageMrf,
  type GarbageTransfer,
} from './garbage';
import {
  GarbageTruckSystem,
  MAX_GARBAGE_TRUCKS,
  truckKindFor,
  type TruckDepot,
  type TruckTarget,
} from './garbagetrucks';
import { encodeSave, decodeSave } from '../app/persist';

/** Packed-hex palette for auto-created district defs (id 1..255 cycle through these). */
const DISTRICT_PALETTE: readonly number[] = [
  0x4fc3f7, 0xffb74d, 0x81c784, 0xe57373, 0xba68c8, 0xfff176, 0x4db6ac, 0xf06292,
];

const CATALOG = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const ROAD_SPECS = (roadsData as { specs: RoadSpec[] }).specs;

/** The road tool's refusal when its path crosses a standing building. */
export const ROAD_THROUGH_BUILDING = 'A building stands in the way. Bulldoze it first.';

/** Every tile of a w×d footprint whose origin is (x, z), row by row. */
function footprintTiles(x: number, z: number, w: number, d: number): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) tiles.push({ x: x + dx, z: z + dz });
  }
  return tiles;
}
/** The zone brush's refusal when every tile under it already holds a building. */
export const ZONE_UNDER_BUILDINGS =
  'Buildings stand on every tile. A zone changes only empty land; bulldoze first.';

/** Ticks between snapshots: 20 ticks/s over 10 snapshots/s = 2. */
const SNAPSHOT_TICKS = Math.max(1, Math.round(TICK_RATE / SNAPSHOT_HZ));
/** Utility (power/water) recompute cadence. */
const UTILITY_PERIOD = 10;
/** Landfill units a tile held before the 0.25 kg trash unit; used to rescale older saves. */
const LEGACY_LANDFILL_CAPACITY_PER_TILE = 600;
/** Service coverage cadence (staggered). */
const SERVICE_PERIOD = 8;
const SERVICE_OFFSET = 6;
/** Building pollution/noise emission cadence (feeds the Pollution/Noise diffusion passes). */
const EMIT_PERIOD = 4;
const EMIT_OFFSET = 3;
/** Traffic-field bake cadence (just before Traffic's diffusion slot at %4==2). */
const TRAFFIC_FIELD_PERIOD = 4;
const TRAFFIC_FIELD_OFFSET = 1;
/** Fraction of the original price returned when bulldozing roads/buildings. */
const BULLDOZE_REFUND_RATE = 0.5;

// --- Road noise --------------------------------------------------------------
/** Assigned-traffic volume units per +1 Noise byte (before the tier multiplier). */
const ROAD_NOISE_VOLUME_DIVISOR = 4;
/**
 * Cap on the pre-multiplier base per emission, so even an absurd-volume
 * highway edge (noiseMult 3) emits at most 120/tile per EMIT slot — loud
 * enough to saturate the byte through accumulation, never through overflow.
 */
const ROAD_NOISE_BASE_CAP = 40;

/**
 * Per-tile Noise emission for a road edge: the tier's
 * base multiplier (`RoadSpec.noiseMult` — gravel 2×, standard 1×, highway 3×)
 * scaled by the edge's assigned traffic volume, so busy arterials read loud
 * on the noise lens while an idle road of any tier emits nothing. Volumes
 * live per graph EDGE (TrafficSystem assigns them via RoadNetwork.addVolume),
 * so every tile of the edge gets the same amount — the simple apportionment.
 * Pure and exported for direct testing.
 */
export function roadNoiseEmission(volume: number, noiseMult: number): number {
  if (volume <= 0) return 0;
  return Math.min(ROAD_NOISE_BASE_CAP, Math.ceil(volume / ROAD_NOISE_VOLUME_DIVISOR)) * noiseMult;
}

export type WorkerPost = (msg: WorkerToMain, transfer?: Transferable[]) => void;

export interface WorkerSim {
  handleMessage(msg: MainToWorker): void;
  /** Advances the fixed-timestep clock; the interval pump (or a test) calls this. */
  pump(elapsedMs: number): void;
}

interface CommandResult {
  ok: boolean;
  cost: number;
  inverse: Command[];
  reason?: string;
}

interface DirtyRect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

function initialStats(): CityStats {
  return {
    tick: 0,
    funds: START_FUNDS,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    population: 0,
    jobs: 0,
    employed: 0,
    demand: { res: 0, com: 0, ind: 0 },
    happiness: 50,
    powerSupply: 0,
    powerDemand: 0,
    waterSupply: 0,
    waterDemand: 0,
    sewerSupply: 0,
    sewerDemand: 0,
    waterFouled: 0,
    milestoneLevel: 0,
    milestoneProgress: 0,
    loanBalance: 0,
    taxRates: { res: DEFAULT_TAX_RATE, com: DEFAULT_TAX_RATE, ind: DEFAULT_TAX_RATE },
    serviceFunding: { police: 1, fire: 1, health: 1, education: 1, park: 1 },
  };
}

/**
 * Road tiles the network could not derive as they were. Always a bug in the
 * conversion, never a state to keep quietly, so it is said out loud.
 */
function reportRoadProblems(when: string, problems: readonly string[]): void {
  if (problems.length === 0) return;
  console.error(
    `road network (${when}): ${problems.length} tile(s) derived differently — ${problems.slice(0, 8).join('; ')}`,
  );
}

/** An undo's `apart`: the arms it puts back held apart, left out where none were. */
function heldApart(apart: readonly TileArms[] | undefined): { apart?: TileArms[] } {
  return apart && apart.length > 0 ? { apart: [...apart] } : {};
}

function cloneStats(stats: CityStats): CityStats {
  return {
    ...stats,
    demand: { ...stats.demand },
    taxRates: { ...stats.taxRates },
    serviceFunding: { ...stats.serviceFunding },
  };
}

function growRect(rect: DirtyRect | null, tiles: TilePoint[]): DirtyRect | null {
  let next = rect;
  for (const t of tiles) {
    if (!inBounds(t.x, t.z)) continue;
    if (next === null) {
      next = { minX: t.x, minZ: t.z, maxX: t.x, maxZ: t.z };
    } else {
      next.minX = Math.min(next.minX, t.x);
      next.minZ = Math.min(next.minZ, t.z);
      next.maxX = Math.max(next.maxX, t.x);
      next.maxZ = Math.max(next.maxZ, t.z);
    }
  }
  return next;
}

/** The four orthogonal steps — the neighbours a road tile can join. */
const NEIGHBOUR_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** 8-neighbor (Chebyshev distance 1) ring offsets — the "1-tile apron" around a road footprint. */
const APRON_NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function fullMapPatch(layer: Uint8Array): ZonePatch {
  return { x: 0, z: 0, w: MAP_SIZE, h: MAP_SIZE, data: layer.slice() };
}

/**
 * Category-dependent occupancy rows (SelectionInfo.occupancy):
 * residential fills residents + households (capacity = the catalog's homes;
 * occupied only while Active — the sim's population model is
 * all-or-nothing per building); com/ind fill jobs (Active only); services &
 * utilities leave every field unset. Pure and exported for direct testing.
 */
export function selectionOccupancy(
  entry: BuildingCatalogEntry,
  state: BuildingState,
): SelectionInfo['occupancy'] {
  if (entry.category === 'res') {
    const capacity = entry.units ?? 0;
    const active = state === BuildingState.Active;
    return {
      residents: active ? (entry.residents ?? 0) : 0,
      households: { occupied: active ? capacity : 0, capacity },
    };
  }
  if (entry.category === 'com' || entry.category === 'ind') {
    const active = state === BuildingState.Active;
    const jobs = active ? (entry.jobs ?? 0) : 0;
    // A farm is a workplace with its family living on it.
    return entry.residents ? { jobs, residents: active ? entry.residents : 0 } : { jobs };
  }
  return {};
}

class SimWorld implements WorkerSim {
  private readonly post: WorkerPost;
  private readonly roadSpecByTier = new Map<number, RoadSpec>(ROAD_SPECS.map((s) => [s.tier, s]));
  private readonly catalogById = new Map<string, BuildingCatalogEntry>(
    CATALOG.map((e) => [e.id, e]),
  );

  private readonly timestep: FixedTimestep;
  private speed: SimSpeed = 1;
  private tickNo = 0;

  private initialized = false;
  private seed = 0;
  private mapName = '';

  private grid: GridState = createGrid(MAP_SIZE);
  /** Where every road is stored; the grid's road layers are derived from it. */
  private get roads(): RoadNet {
    return (this.grid.roads ??= createRoadNetwork());
  }
  private stats: CityStats = initialStats();
  private registry = new BuildingRegistry(CATALOG);
  private readonly fieldSim = new FieldSim();
  private readonly services = new ServiceSim(CATALOG);
  private readonly economy = new EconomySystem(CATALOG, ROAD_SPECS);
  private readonly network = new RoadNetwork();
  /** The junctions as last sent, so an unchanged set travels no further. */
  private lastJunctions: JunctionSnapshot[] = [];
  /** The roundabouts as last sent, as one key. */
  private lastRoundabouts = '';
  /**
   * The train network — the same implementation over the rail tiles instead of
   * the drivable ones. Kept in step with the road one: every rebuild and
   * invalidation hits both, since a single grid edit can lay track or street.
   */
  private readonly railNetwork = new RoadNetwork(isRailTier);
  /**
   * The tram network — the tram tiles, and the street tiles a tramway crosses.
   * Unlike the rail one it overlaps the road network, because tram track is a
   * street: cars route over these tiles too, and only the tram is confined to
   * them.
   */
  private readonly tramNetwork = new RoadNetwork(isTramTier, tramShape);
  private growth: GrowthSystem;
  private traffic: TrafficSystem;
  // --- transit / dispatch / policies systems -------------------------------
  private transit: TransitSystem;
  private dispatch: DispatchSystem;
  private policyStore = new PolicyStore();
  /** Latest transit tick result, attached to each snapshot. */
  private transitResult: TransitTickResult = { lines: [], ridership: [] };
  /** Latest active-incident list from dispatch, attached to each snapshot. */
  private latestIncidents: Incident[] = [];
  /**
   * How hard each service kind is being leaned on, from the last service pass.
   * Null until one has run, since the services tick on their own period and a
   * snapshot before the first of them has nothing to report.
   */
  private serviceLoad: Record<ServiceKind, ServiceLoad> | null = null;
  /** Worker-owned authoritative district registry — id/name/color. */
  private districtDefs: District[] = [];
  private readonly districtDefById = new Map<number, District>();
  private districtDirty: DirtyRect | null = null;
  private districtDefsChanged = false;
  /** Garbage: trash generation + landfill collection. Runtime state (not saved). */
  private readonly garbage = new GarbageSystem(MAP_SIZE);
  private readonly garbageTrucks = new GarbageTruckSystem();
  private landfillDirty: DirtyRect | null = null;
  /** Where power line has been strung or pulled down since the last snapshot. */
  private powerLineDirty: DirtyRect | null = null;
  private waterPipeDirty: DirtyRect | null = null;
  /** Cached landfill areas (office/entrance + dump routes) — dropped when landfill paint or road edits change them. */
  private landfillAreasCache: LandfillArea[] | null = null;
  private garbageDirty = false;
  /** Sandbox mode: when true, milestone gates are bypassed for all build items. */
  private sandbox = false;
  /** Unlimited money (testing): when true, funds/cost gates are ignored. */
  private unlimitedMoney = false;

  /**
   * Statistical population+jobs accessor for transit ridership: sums the
   * residents+jobs of every Active building within `radius` tiles (euclidean)
   * of a stop. A single numeric callback so TransitSystem never imports the
   * registry/catalog shapes (firewall).
   */
  private readonly populationJobsAccessor: PopulationJobsAccessor = {
    nearbyPopulationJobs: (x: number, z: number, radiusTiles: number): number => {
      const r2 = radiusTiles * radiusTiles;
      let total = 0;
      for (const b of this.registry.all()) {
        if (b.state !== BuildingState.Active) continue;
        const dx = b.x - x;
        const dz = b.z - z;
        if (dx * dx + dz * dz > r2) continue;
        const entry = this.catalogById.get(b.catalogId);
        if (!entry) continue;
        total += (entry.residents ?? 0) + (entry.jobs ?? 0);
      }
      return total;
    },
  };

  private pendingBatches: CommandBatch[] = [];

  /** Building id the render thread is holding selected, or null. */
  private selectedId: number | null = null;

  // --- road composition: the save's table of player-composed profiles -------
  private customRoadProfiles = new Map<number, RoadProfile>();
  /** The full table goes out in the next snapshot when set. */
  private roadProfilesChanged = true;
  /** The network and its version as the render thread last received them. */
  private sentRoadNet: { net: RoadNet; version: number } | null = null;

  // --- deltas accumulated between snapshots --------------------------------
  private readonly pendingRoadDeltas = new Map<number, RoadTileDelta>();
  /** Set when a command changed a road tile, so the network takes it up. */
  private roadsEdited = false;
  private buildingsAdded: BuildingInstance[] = [];
  private buildingsUpdated: BuildingInstance[] = [];
  private buildingsRemoved: number[] = [];
  private zoneDirty: DirtyRect | null = null;
  /** Terrain edits accumulated since the last snapshot (terraform strokes, terraformSet restores, loadSave). */
  private pendingHeightPatches: HeightPatch[] = [];
  private prevPower = new Uint8Array(this.grid.power.length);
  private prevWatered = new Uint8Array(this.grid.watered.length);
  private prevSewered = new Uint8Array(this.grid.sewered.length);
  private prevWaterFoul = new Uint8Array(this.grid.waterFoul.length);
  private powerDirty = false;
  private wateredDirty = false;
  private seweredDirty = false;
  private waterFoulDirty = false;
  private utilitiesDirty = false;
  /** Each shore intake's yield fraction from the last utility pass, for the inspector. */
  private intakeYield: ReadonlyMap<number, number> = new Map();
  /** Jobs by sector, open and going up, as the last economy pass (or load) counted them, for demand. */
  private occupancy: Occupancy = {
    population: 0,
    jobs: { com: 0, ind: 0 },
    pipeline: { com: 0, ind: 0 },
  };
  /** Whom the last utility pass cut and what it left spare; nothing is spare before the first. */
  private supply: GrowthSupply = {
    power: { cut: new Set(), spare: 0 },
    water: { cut: new Set(), spare: 0 },
    sewer: { cut: new Set(), spare: 0 },
  };

  constructor(post: WorkerPost) {
    this.post = post;
    this.timestep = new FixedTimestep(TICK_MS, () => this.tick());
    const rng = createRng(0);
    this.growth = new GrowthSystem(CATALOG, rng.fork(1), canPlaceFootprint);
    this.traffic = new TrafficSystem(rng.fork(2), this.network);
    this.transit = new TransitSystem(this.network, this.railNetwork, this.tramNetwork);
    this.dispatch = new DispatchSystem(CATALOG, rng.fork(3));
    // The save's own table of composed cross-sections, so the graph can read
    // how a run's lanes divide between its two directions. Presets resolve
    // without it; only a player-composed profile needs the table.
    const resolveProfile = (id: number): RoadProfile | null =>
      this.customRoadProfiles.get(id) ?? null;
    this.network.setProfileResolver(resolveProfile);
    this.railNetwork.setProfileResolver(resolveProfile);
    this.tramNetwork.setProfileResolver(resolveProfile);
    // noHeavyTraffic policy: bump pathfind cost on a district's roads so
    // through-traffic routes around it. With no policy set the multiplier is
    // 1, so routing (and every existing traffic/network test) is unchanged.
    this.network.setEdgeCostHook((edge: GraphEdge) => {
      const tile = edge.tiles[Math.floor(edge.tiles.length / 2)] ?? edge.tiles[0];
      if (!tile) return 1;
      const districtId = this.grid.district[tileIndex(tile.x, tile.z)] ?? 0;
      return trafficWeight(1, this.policyStore.getPolicies(districtId));
    });
  }

  handleMessage(msg: MainToWorker): void {
    if (msg.type === 'init') {
      this.init(msg.seed, msg.map);
      return;
    }
    if (!this.initialized) return;
    switch (msg.type) {
      case 'commands':
        this.pendingBatches.push({ seq: msg.seq, commands: msg.commands });
        break;
      case 'setSpeed':
        this.speed = msg.speed;
        break;
      case 'requestField':
        this.postField(msg.field);
        break;
      case 'requestSave':
        this.postSave();
        break;
      case 'loadSave':
        this.load(msg.data);
        break;
      case 'select':
        this.selectedId = msg.buildingId;
        this.postSelection();
        break;
      case 'clearSelect':
        this.selectedId = null;
        break;
    }
  }

  pump(elapsedMs: number): void {
    if (!this.initialized) return;
    if (this.speed === 0) {
      this.pumpPaused();
      return;
    }
    // Map the player-facing speed button through the real-time pacing table
    // (calm 1× = 0.5, exponential ×4 steps) — the timestep itself is a pure
    // multiplier driver.
    this.timestep.advance(elapsedMs, SPEED_MULTIPLIERS[this.speed]);
  }

  /**
   * Build-while-paused: at speed 0 the fixed
   * timestep never runs, so `tick()` (and its `drainCommands()` call) never
   * fires — player edits queued while paused would sit in `pendingBatches`
   * forever. Command application is tick-independent and deterministic (no
   * RNG, no growth/fields/economy/traffic), so it's safe to drain it here
   * without advancing `tickNo` or running any sim system. Utilities are a
   * pure derivation (not a simulation step), so a dirty utilitiesDirty flag
   * is resolved here too, and a snapshot is posted immediately so the render
   * thread sees the result without waiting for the next tick's cadence.
   */
  private pumpPaused(): void {
    if (this.pendingBatches.length === 0) return;
    this.drainCommands();
    if (this.utilitiesDirty) {
      this.recomputeUtilitiesNow();
    }
    this.postSnapshot();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  private init(seed: number, map: MapData): void {
    if (map.size !== MAP_SIZE) {
      throw new Error(`worker init: map size ${map.size} != MAP_SIZE ${MAP_SIZE}`);
    }
    this.seed = seed;
    this.mapName = map.name;
    this.grid = createGrid(MAP_SIZE);
    this.grid.roads = createRoadNetwork();
    this.grid.oneCarriageway = oneCarriagewayIds(this.customRoadProfiles);
    this.grid.height.set(map.height);
    this.grid.water.set(map.water);
    this.grid.trees.set(map.trees);
    soilGrades(this.grid, seed, this.grid.soil);

    const rng = createRng(seed);
    this.growth = new GrowthSystem(CATALOG, rng.fork(1), canPlaceFootprint);
    this.network.rebuild(this.grid);
    this.railNetwork.rebuild(this.grid);
    this.tramNetwork.rebuild(this.grid);
    this.traffic = new TrafficSystem(rng.fork(2), this.network);
    // transit / dispatch / policy systems are stateful (lines / active incidents / policies)
    // and must reset per game session, mirroring how traffic is re-created.
    this.transit = new TransitSystem(this.network, this.railNetwork, this.tramNetwork);
    this.dispatch = new DispatchSystem(CATALOG, rng.fork(3));
    this.policyStore = new PolicyStore();
    this.transitResult = { lines: [], ridership: [] };
    this.latestIncidents = [];
    this.serviceLoad = null;
    this.districtDefs = [];
    this.districtDefById.clear();
    this.registry = new BuildingRegistry(CATALOG);
    this.stats = initialStats();
    this.tickNo = 0;
    this.speed = 1;
    this.selectedId = null;
    this.resetDeltas();
    // Prime the render mirror of the (all-zero on a fresh map) district layer.
    this.districtDirty = { minX: 0, minZ: 0, maxX: MAP_SIZE - 1, maxZ: MAP_SIZE - 1 };
    this.districtDefsChanged = true;
    this.initialized = true;

    this.recomputeUtilitiesNow();
    this.occupancy = this.economy.occupancy(this.registry.all());
    this.post({ type: 'ready' });
    this.postSnapshot();
  }

  private load(data: ArrayBuffer): void {
    const payload = decodeSave(data);
    // Older saves are migrated layer by layer in deserializeGrid; only a save
    // from a NEWER build is refused, since it may carry what this one cannot read.
    if (payload.header.version > SAVE_VERSION || payload.header.version < 1) {
      throw new Error(`loadSave: unsupported save version ${payload.header.version}`);
    }
    // The save's own profiles say which of its corridors a street opens, and
    // its masks are worked out from that as it loads.
    const saved = payload.meta.roadProfiles ?? [];
    const { grid, problems } = loadGrid(
      payload.grid,
      oneCarriagewayIds(saved.map((e) => [e.id, e.profile] as const)),
    );
    reportRoadProblems('load', problems);
    if (grid.size !== MAP_SIZE) {
      throw new Error(`loadSave: grid size ${grid.size} != MAP_SIZE ${MAP_SIZE}`);
    }

    const previousIds = this.registry.all().map((b) => b.id);

    this.grid = grid;
    this.roadsEdited = false;
    this.customRoadProfiles = adoptCustomProfiles(saved, this.grid.roadProfile);
    this.grid.oneCarriageway = oneCarriagewayIds(this.customRoadProfiles);
    // Adopting can renumber a very old save's profiles on its tiles, so the
    // network takes the tiles up again before anything reads it.
    reconcileRoads(this.roads, this.grid);
    this.deriveFootprint();
    this.roadProfilesChanged = true;
    this.registry = BuildingRegistry.deserialize(CATALOG, payload.meta.registry);
    this.registry.restampShrunkPloppables(this.grid, (tiles) =>
      bordersUtilityNetwork(this.grid, tiles),
    );
    this.stats = cloneStats(payload.meta.stats);
    this.seed = payload.header.seed;
    soilGrades(this.grid, this.seed, this.grid.soil);
    this.mapName = payload.header.mapName;
    this.tickNo = payload.header.tick;
    this.pendingBatches = [];

    // Growth's construction countdowns aren't serialized; promote in-progress
    // lots to Active so nothing is left permanently under construction.
    for (const inst of this.registry.all()) {
      if (inst.state === BuildingState.Constructing) inst.state = BuildingState.Active;
    }

    this.network.rebuild(this.grid);
    this.railNetwork.rebuild(this.grid);
    this.tramNetwork.rebuild(this.grid);
    this.resetDeltas();

    // Full resync for the render thread: everything re-added, all roads/zones
    // re-sent, power/water coverage re-sent.
    this.buildingsRemoved = previousIds;
    this.buildingsAdded = this.registry.all();
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const idx = tileIndex(x, z);
        if ((this.grid.roadTier[idx] ?? 0) !== 0) {
          this.pendingRoadDeltas.set(idx, this.roadDeltaOf(idx));
        }
      }
    }
    this.zoneDirty = { minX: 0, minZ: 0, maxX: MAP_SIZE - 1, maxZ: MAP_SIZE - 1 };
    // Full resync: the render thread's terrain mesh needs every
    // loaded height back too, exactly like roads/zones/power/watered above.
    this.pendingHeightPatches = [
      { x: 0, z: 0, w: MAP_SIZE, h: MAP_SIZE, heights: this.grid.height.slice() },
    ];
    // Districts full resync: the district tile layer round-trips through
    // grid serialize/deserialize, but the def registry + policies do not
    // (per-session state). Rebuild defs for whatever district ids the loaded
    // tile layer carries so the overlay tints and the UI lists them.
    this.transit = new TransitSystem(this.network, this.railNetwork, this.tramNetwork);
    // Lines come back with the city. A save written before they persisted has
    // none, which is what loading always used to leave behind anyway.
    this.transit.restore(payload.meta.transitLines ?? []);
    this.dispatch = new DispatchSystem(CATALOG, createRng(this.seed).fork(3));
    this.policyStore = new PolicyStore();
    this.transitResult = { lines: [], ridership: [] };
    this.latestIncidents = [];
    this.serviceLoad = null;
    this.districtDefs = [];
    this.districtDefById.clear();
    const seenDistricts = new Set<number>();
    for (const id of this.grid.district) {
      if (id !== 0 && !seenDistricts.has(id)) {
        seenDistricts.add(id);
        this.ensureDistrictDef(id);
      }
    }
    this.districtDirty = { minX: 0, minZ: 0, maxX: MAP_SIZE - 1, maxZ: MAP_SIZE - 1 };
    this.districtDefsChanged = true;
    // Garbage: the per-tile trash layer + cosmetic trucks are runtime-only
    // (rebuilt from the sim), but the landfill pile + incinerator buffers are
    // restored from the save meta so fill survives a reload. Republish the
    // loaded landfill area as full state so the render side rebuilds it.
    this.garbage.reset();
    // Saves before the 0.25 kg trash unit counted a landfill tile as 600 units;
    // rescale the pile so the fill fraction the player saw carries over.
    const savedGarbage = payload.meta.garbage;
    this.garbage.restoreState(
      savedGarbage && payload.header.version < TRASH_UNIT_SAVE_VERSION
        ? {
            ...savedGarbage,
            landfillStored:
              (savedGarbage.landfillStored * LANDFILL_CAPACITY_PER_TILE) /
              LEGACY_LANDFILL_CAPACITY_PER_TILE,
          }
        : savedGarbage,
    );
    this.garbageTrucks.reset();
    this.landfillAreasCache = null;
    this.landfillDirty = { minX: 0, minZ: 0, maxX: MAP_SIZE - 1, maxZ: MAP_SIZE - 1 };
    this.powerLineDirty = { minX: 0, minZ: 0, maxX: MAP_SIZE - 1, maxZ: MAP_SIZE - 1 };
    this.waterPipeDirty = { minX: 0, minZ: 0, maxX: MAP_SIZE - 1, maxZ: MAP_SIZE - 1 };
    this.garbageDirty = true;
    this.recomputeUtilitiesNow();
    this.occupancy = this.economy.occupancy(this.registry.all());
    this.powerDirty = true;
    this.wateredDirty = true;
    this.seweredDirty = true;
    this.waterFoulDirty = true;

    this.postSnapshot();
  }

  private resetDeltas(): void {
    this.pendingRoadDeltas.clear();
    this.buildingsAdded = [];
    this.buildingsUpdated = [];
    this.buildingsRemoved = [];
    this.zoneDirty = null;
    this.pendingHeightPatches = [];
    this.prevPower = new Uint8Array(this.grid.power.length);
    this.prevWatered = new Uint8Array(this.grid.watered.length);
    this.prevSewered = new Uint8Array(this.grid.sewered.length);
    this.prevWaterFoul = new Uint8Array(this.grid.waterFoul.length);
    this.powerDirty = false;
    this.wateredDirty = false;
    this.seweredDirty = false;
    this.waterFoulDirty = false;
    this.utilitiesDirty = false;
    this.districtDirty = null;
    this.districtDefsChanged = false;
    this.landfillDirty = null;
    this.powerLineDirty = null;
    this.waterPipeDirty = null;
    this.garbageDirty = false;
  }

  // -------------------------------------------------------------------------
  // Tick pipeline
  // -------------------------------------------------------------------------

  private tick(): void {
    this.tickNo += 1;
    const t = this.tickNo;
    const g = this.grid;

    this.drainCommands();

    if (this.utilitiesDirty || t % UTILITY_PERIOD === 0) {
      this.recomputeUtilitiesNow();
    }

    const demandInput = {
      population: this.stats.population,
      jobs: this.occupancy.jobs,
      pipeline: this.occupancy.pipeline,
      taxRates: this.stats.taxRates,
      happiness: this.stats.happiness,
    };
    this.stats.demand = computeDemand(demandInput);

    const growthDelta = this.growth.tick(
      g,
      this.registry,
      this.stats.demand,
      this.stats.milestoneLevel,
      t,
      this.supply,
      jobRoom(demandInput),
    );
    if (
      growthDelta.added.length > 0 ||
      growthDelta.removed.length > 0 ||
      growthDelta.updated.length > 0
    ) {
      this.buildingsAdded.push(...growthDelta.added);
      this.buildingsUpdated.push(...growthDelta.updated);
      this.buildingsRemoved.push(...growthDelta.removed);
      if (growthDelta.added.length > 0 || growthDelta.removed.length > 0) {
        this.utilitiesDirty = true;
      }
      // A grown building is placed as surely as a plopped one, and levels its
      // ground the same way; growth is not a command, so there is nothing to
      // undo. Without this a house grown on a hillside hung over its downhill
      // side, seated on the highest corner of a footprint nobody had levelled.
      for (const inst of growthDelta.added) {
        const entry = this.catalogById.get(inst.catalogId);
        if (!entry) continue;
        const { w, d } = footprintForRotation(entry, inst.rotation);
        this.flattenFootprint(footprintTiles(inst.x, inst.z, w, d), false, []);
      }
    }

    if (t % EMIT_PERIOD === EMIT_OFFSET) {
      for (const inst of this.registry.all()) {
        if (inst.state !== BuildingState.Active) continue;
        const entry = this.catalogById.get(inst.catalogId);
        if (entry?.pollution) {
          // greenEnergy policy: reduce pollution emission for buildings in
          // a district with the policy on (no policy -> unchanged emission).
          const districtId = this.grid.district[tileIndex(inst.x, inst.z)] ?? 0;
          // An incinerator's plume follows the trash it burned against its ceiling.
          const rated = entry.garbage
            ? incineratorEmission(
                entry.pollution,
                this.garbage.incineratorBurnedLast(inst.id),
                entry.garbage.burnRate,
              )
            : entry.pollution;
          const emitted = effectivePollution(rated, this.policyStore.getPolicies(districtId));
          if (emitted > 0) this.fieldSim.emit(g, FieldId.Pollution, inst.x, inst.z, emitted);
        }
        // Landmarks: catalog noise rides the same cadence/source-tile
        // pattern as pollution, feeding the Noise diffusion pass.
        if (entry?.noise) {
          this.fieldSim.emit(g, FieldId.Noise, inst.x, inst.z, entry.noise);
        }
        // A building nothing drains has cesspits and foul ditches: its raw
        // sewage fouls the ground around it in proportion, never less than a
        // unit, so an undrained street is never nothing on the lens.
        if (entry && (inst.problems & Problem.NoSewer) !== 0) {
          const { w, d } = footprintForRotation(entry, inst.rotation);
          const stink = Math.ceil(
            sewageOf(g, entry, inst.x, inst.z, w, d, this.stats.milestoneLevel) *
              SEWAGE_POLLUTION_PER_KL,
          );
          if (stink > 0) this.fieldSim.emit(g, FieldId.Pollution, inst.x, inst.z, stink);
        }
      }
      // Road noise, on the same EMIT cadence: every road tile
      // emits its tier base (RoadSpec.noiseMult) scaled by the edge's
      // assigned traffic volume. Zero-volume edges — the overwhelming
      // majority on any map — are skipped outright, so the pass stays cheap.
      for (const edge of this.network.getEdges()) {
        if (edge.volume <= 0) continue;
        const amount = roadNoiseEmission(
          edge.volume,
          this.roadSpecByTier.get(edge.tier)?.noiseMult ?? 1,
        );
        if (amount <= 0) continue;
        for (const tile of edge.tiles) {
          this.fieldSim.emit(g, FieldId.Noise, tile.x, tile.z, amount);
        }
      }
    }

    if (t % SERVICE_PERIOD === SERVICE_OFFSET) {
      this.serviceLoad = this.services.tick(g, this.registry.all(), this.stats.serviceFunding);
    }

    if (t % GARBAGE_PERIOD === GARBAGE_OFFSET) {
      const garbageBuildings: GarbageBuilding[] = [];
      const facilities: GarbageFacility[] = [];
      const depots: GarbageDepot[] = [];
      const mrfs: GarbageMrf[] = [];
      const transfers: GarbageTransfer[] = [];
      for (const inst of this.registry.all()) {
        if (inst.state !== BuildingState.Active) continue;
        const entry = this.catalogById.get(inst.catalogId);
        if (!entry) continue;
        // Kerbside depots, recovery facilities, transfer stations and incinerators are facilities, not trash sources.
        if (entry.garbage?.servesHomes !== undefined) {
          depots.push({
            id: inst.id,
            collectionRange: entry.garbage.collectionRange,
            servesHomes: entry.garbage.servesHomes,
          });
          continue;
        }
        if (entry.garbage?.sortRate !== undefined) {
          mrfs.push({
            id: inst.id,
            collectionRange: entry.garbage.collectionRange,
            sortRate: entry.garbage.sortRate,
            residueCapacity: entry.garbage.bufferCapacity,
          });
          continue;
        }
        if (entry.garbage?.transferRate !== undefined) {
          transfers.push({
            id: inst.id,
            collectionRange: entry.garbage.collectionRange,
            transferRate: entry.garbage.transferRate,
            floorCapacity: entry.garbage.bufferCapacity,
          });
          continue;
        }
        if (entry.garbage) {
          facilities.push({
            id: inst.id,
            collectionRange: entry.garbage.collectionRange,
            bufferCapacity: entry.garbage.bufferCapacity,
            burnRate: entry.garbage.burnRate,
          });
          continue;
        }
        if (entry.category !== 'res' && entry.category !== 'com' && entry.category !== 'ind')
          continue;
        garbageBuildings.push({
          id: inst.id,
          residents: entry.residents ?? 0,
          jobs: entry.jobs ?? 0,
          homes: entry.units ?? 0,
          category: entry.category,
        });
      }
      this.garbage.tick(
        g,
        garbageBuildings,
        Math.floor(t / GARBAGE_PERIOD),
        facilities,
        depots,
        mrfs,
        transfers,
      );
      this.garbageDirty = true;
    }

    const origins: TilePoint[] = [];
    const destinations: TilePoint[] = [];
    // Cosmetic garbage trucks: depots = active garbage facilities (source at
    // their nearest road tile); targets = active R/C/I buildings they visit.
    const garbageTargets: TruckTarget[] = [];
    const garbageDepots: TruckDepot[] = [];
    for (const inst of this.registry.all()) {
      if (inst.state !== BuildingState.Active) continue;
      const entry = this.catalogById.get(inst.catalogId);
      if (!entry) continue;
      if (entry.garbage) {
        // Any tile of the lot may be the one beside the street: a depot turned
        // to face a road has its origin corner a lot-depth away from it.
        const lot = footprintForRotation(entry, inst.rotation);
        const road = nearestRoadTile(
          this.grid,
          footprintTiles(inst.x, inst.z, lot.w, lot.d).map((p) => tileIndex(p.x, p.z)),
        );
        if (road !== null) {
          garbageDepots.push({
            id: inst.id,
            sourceTile: { x: road % MAP_SIZE, z: Math.floor(road / MAP_SIZE) },
            budget: entry.garbage.trucks,
            kind: truckKindFor(entry.garbage),
          });
        }
        continue;
      }
      if (entry.category === 'res') origins.push({ x: inst.x, z: inst.z });
      else if (entry.category === 'com' || entry.category === 'ind') {
        destinations.push({ x: inst.x, z: inst.z });
      } else continue;
      garbageTargets.push({ id: inst.id, tile: { x: inst.x, z: inst.z } });
    }
    // Landfill areas field their own trucks from the office's street tile and
    // drive in to dump on the grounds; a full landfill stops sending them.
    if (!this.garbage.isLandfillFull(g)) {
      const depots = landfillTruckDepots(
        this.landfillAreasFor(g),
        LANDFILL_MIN_AREA_TILES,
        LANDFILL_TRUCKS_BASE,
        LANDFILL_TRUCKS_PER_TILES,
        LANDFILL_TRUCKS_MAX,
      );
      for (const d of depots) {
        // Negative ids keep landfill depots clear of building instance ids.
        garbageDepots.push({
          id: -(d.index + 1),
          sourceTile: d.sourceTile,
          budget: d.budget,
          dumpPath: d.dumpPath,
        });
      }
    }

    this.traffic.tick({ origins, destinations, tickNo: t, population: this.stats.population });

    // Bus transit: recompute every line's route + statistical ridership
    // and apply its modest congestion relief to the road graph (same cadence
    // as traffic so cosmetic buses animate smoothly). Service dispatch:
    // spawn/route/resolve incidents from the coverage-gap fields.
    this.transitResult = this.transit.tick(this.populationJobsAccessor);
    this.latestIncidents = this.dispatch.tick({
      grid: g,
      buildings: this.registry.all(),
      network: this.network,
    });
    this.garbageTrucks.tick({
      network: this.network,
      depots: garbageDepots,
      targets: garbageTargets,
    });

    if (t % TRAFFIC_FIELD_PERIOD === TRAFFIC_FIELD_OFFSET) {
      this.fieldSim.applyTraffic(g, this.network.getEdges());
    }

    this.refreshNoiseWalls();
    this.fieldSim.tick(g, t);

    const econ = this.economy.tick({
      g,
      buildings: this.registry.all(),
      stats: this.stats,
      tickNo: t,
      // lowTax/highTax policy: per-building district tax multiplier
      // (1 when the building's district has no tax policy — income unchanged).
      taxMultiplier: (x: number, z: number): number =>
        this.policyStore.taxMultiplierFor(this.grid.district[tileIndex(x, z)] ?? 0),
      profileOf: (id: number) => this.profileForId(id),
      takeRecoveredUnits: () => this.garbage.takeRecoveredThisMonth(),
    });
    Object.assign(this.stats, econ.statsPatch);
    this.occupancy = econ.occupancy;
    for (const note of econ.notifications) {
      this.post({ type: 'notify', note });
    }

    this.stats.tick = t;

    if (t % SNAPSHOT_TICKS === 0) {
      this.postSnapshot();
    }
  }

  private recomputeUtilitiesNow(): void {
    const totals = recomputeUtilities(
      this.grid,
      this.registry.all(),
      CATALOG,
      this.stats.milestoneLevel,
    );
    this.stats.powerSupply = totals.powerSupply;
    this.stats.powerDemand = totals.powerDemand;
    this.stats.waterSupply = totals.waterSupply;
    this.stats.waterDemand = totals.waterDemand;
    this.stats.sewerSupply = totals.sewerSupply;
    this.stats.sewerDemand = totals.sewerDemand;
    this.stats.waterFouled = totals.waterFouled;
    this.intakeYield = totals.intakeYield;
    this.supply = { power: totals.power, water: totals.water, sewer: totals.sewer };
    this.utilitiesDirty = false;

    const { power, watered, sewered, waterFoul } = this.grid;
    if (!bytesEqual(waterFoul, this.prevWaterFoul)) {
      this.prevWaterFoul.set(waterFoul);
      this.waterFoulDirty = true;
    }
    if (!bytesEqual(power, this.prevPower)) {
      this.prevPower.set(power);
      this.powerDirty = true;
    }
    if (!bytesEqual(watered, this.prevWatered)) {
      this.prevWatered.set(watered);
      this.wateredDirty = true;
    }
    if (!bytesEqual(sewered, this.prevSewered)) {
      this.prevSewered.set(sewered);
      this.seweredDirty = true;
    }
  }

  // -------------------------------------------------------------------------
  // Snapshots & responses
  // -------------------------------------------------------------------------

  /**
   * Every street junction — three arms or more — and who gives way there, or
   * null when the set has not moved since the last snapshot, which is nearly
   * always: a control only changes when a road is laid, the player sets one,
   * or the traffic through it shifts a whole rung.
   */
  /**
   * The four arms' packed lane sets at a tile, in the cardinals' own order, or
   * undefined where nobody has touched a lane — which is nearly every junction
   * in the city, and not worth four zeros apiece in every snapshot.
   */
  private laneTurnsAt(x: number, z: number): number[] | undefined {
    const base = tileIndex(x, z) * ARMS_PER_TILE;
    const arms = Array.from(
      { length: ARMS_PER_TILE },
      (_, arm) => this.grid.junctionLaneTurns[base + arm] ?? 0,
    );
    return arms.some((v) => v !== 0) ? arms : undefined;
  }

  private controlledJunctions(): JunctionSnapshot[] | null {
    const out: JunctionSnapshot[] = [];
    const rings = gridRingReader(this.grid);
    for (const node of this.network.getNodes()) {
      if (node.edges.length < 3) continue; // a dead end or a bend gives way to nobody
      const lanes = this.laneTurnsAt(node.x, node.z);
      out.push({
        x: node.x,
        z: node.z,
        control: node.control ?? 'none',
        warranted: node.warranted ?? 'none',
        turns: node.turns ?? 0,
        ...(lanes ? { laneTurns: lanes } : {}),
        auto: effectiveControlCode(node.x, node.z, rings) === 0,
      });
    }
    const unchanged =
      out.length === this.lastJunctions.length &&
      out.every((j, i) => {
        const was = this.lastJunctions[i]!;
        return (
          was.x === j.x &&
          was.z === j.z &&
          was.control === j.control &&
          was.warranted === j.warranted &&
          was.turns === j.turns &&
          (was.laneTurns ?? []).every((v, k) => v === (j.laneTurns ?? [])[k]) &&
          (was.laneTurns ?? []).length === (j.laneTurns ?? []).length &&
          was.auto === j.auto
        );
      });
    if (unchanged) return null;
    this.lastJunctions = out;
    return out.map((j) => ({ ...j }));
  }

  /** Every compact roundabout, or null when the set has not moved since the last snapshot. */
  private changedRoundabouts(): TilePoint[] | null {
    const now = this.network.getRoundabouts().map((r) => ({ x: r.x, z: r.z }));
    const key = now.map((r) => `${r.x},${r.z}`).join(';');
    if (key === this.lastRoundabouts) return null;
    this.lastRoundabouts = key;
    return now;
  }

  private postSnapshot(): void {
    this.stats.happiness = this.averageHappiness();
    const vehicles = this.traffic.vehicleBuffer.slice();
    // Service vehicles ride the SAME shared buffer: overlay dispatch's own
    // MAX_SERVICE_VEHICLES slots onto the TAIL of the 1024-slot pool (traffic's
    // density cap keeps civilian cars well under the remaining slots).
    vehicles.set(
      this.dispatch.vehicleBuffer,
      (MAX_VEHICLES - MAX_SERVICE_VEHICLES) * VEHICLE_STRIDE,
    );
    // Cosmetic garbage trucks ride the same buffer, in the slice just before
    // the service-vehicle tail (traffic fills low slots first, leaving room).
    vehicles.set(
      this.garbageTrucks.vehicleBuffer,
      (MAX_VEHICLES - MAX_SERVICE_VEHICLES - MAX_GARBAGE_TRUCKS) * VEHICLE_STRIDE,
    );
    const snap: SimSnapshot = {
      stats: cloneStats(this.stats),
      vehicles,
    };

    // Transit line list + ridership (always present so the render thread
    // can add/remove bus-stop posts, the route ribbon, and cosmetic buses).
    // The lines are the ones standing now, so a line drawn while paused shows
    // at once; ridership is the sim's, and waits for the next tick.
    const riders = new Map(
      this.transitResult.lines.map((l, i) => [l.id, this.transitResult.ridership[i] ?? 0]),
    );
    const lines = this.transit.getLines();
    snap.transit = {
      lines: lines.map((l) => ({
        id: l.id,
        stops: l.stops.map((s) => ({ ...s })),
        color: l.color,
        // Without this the render thread sees every line as a bus line, and a
        // rail line draws bus shelters at its stations and buses on its track.
        mode: l.mode,
      })),
      ridership: lines.map((l) => riders.get(l.id) ?? 0),
    };
    // Active incidents (only when any are live — optional channel).
    if (this.latestIncidents.length > 0) {
      snap.incidents = this.latestIncidents.map((i) => ({ ...i }));
    }
    // How hard each service is being leaned on, as the last service pass found
    // it — the services tick on their own period, so this rides every snapshot
    // rather than only the ones that happen to land on it.
    if (this.serviceLoad) snap.serviceLoad = { ...this.serviceLoad };
    snap.growthWaiting = this.growth.waitingFor(this.grid, this.registry, this.supply);
    snap.zonedUnserved = this.growth.zonedUnserved(this.grid, this.stats.milestoneLevel);
    // District patches + defs (mirrors the zones patch convention).
    if (this.districtDirty || this.districtDefsChanged) {
      snap.districts = {
        patches: this.districtDirty ? [this.districtPatchFor(this.districtDirty)] : [],
        defs: this.districtDefsChanged ? this.districtDefs.map((d) => ({ ...d })) : [],
      };
      this.districtDirty = null;
      this.districtDefsChanged = false;
    }

    // Garbage: landfill membership patch (on paint) + trash coverage + area fill.
    if (this.landfillDirty || this.garbageDirty) {
      const garbage: NonNullable<SimSnapshot['garbage']> = {};
      if (this.landfillDirty) {
        garbage.landfill = [this.landfillPatchFor(this.landfillDirty)];
        this.landfillDirty = null;
      }
      if (this.garbageDirty) {
        garbage.trash = [this.trashPatch()];
        garbage.landfillFill = this.garbage.landfillFillFraction(this.grid);
        garbage.incinerators = this.incineratorSnapshot();
        garbage.depots = this.garbage.depotSnapshot();
        garbage.mrfs = this.garbage.mrfSnapshot();
        garbage.transfers = this.garbage.transferSnapshot();
        this.garbageDirty = false;
      }
      snap.garbage = garbage;
    }

    // Power lines: the region that changed, so the renderer restands only what
    // it has to.
    if (this.powerLineDirty) {
      snap.powerLines = [this.powerLinePatchFor(this.powerLineDirty)];
      this.powerLineDirty = null;
    }
    if (this.waterPipeDirty) {
      snap.waterPipes = [this.layerPatchFor(this.grid.waterPipe, this.waterPipeDirty)];
      this.waterPipeDirty = null;
    }

    // The profile table travels with (and is applied before) the road deltas
    // that refer into it.
    if (this.roadProfilesChanged) {
      snap.roadProfiles = this.roadProfileTable();
      this.roadProfilesChanged = false;
    }
    const net = this.roads;
    if (this.sentRoadNet?.net !== net || this.sentRoadNet.version !== net.version) {
      snap.roadNet = encodeRoadNetwork(net);
      this.sentRoadNet = { net, version: net.version };
    }
    if (this.pendingRoadDeltas.size > 0) {
      snap.roads = Array.from(this.pendingRoadDeltas.values(), (d) =>
        this.withOverRoad(this.withArmsApart(d)),
      );
      this.pendingRoadDeltas.clear();
    }
    if (
      this.buildingsAdded.length > 0 ||
      this.buildingsUpdated.length > 0 ||
      this.buildingsRemoved.length > 0
    ) {
      snap.buildings = settleBuildingDelta(
        this.buildingsAdded,
        this.buildingsUpdated,
        this.buildingsRemoved,
        (id) => this.registry.get(id),
      );
      this.buildingsAdded = [];
      this.buildingsUpdated = [];
      this.buildingsRemoved = [];
    }
    if (this.zoneDirty) {
      snap.zones = [this.zonePatchFor(this.zoneDirty)];
      this.zoneDirty = null;
    }
    if (this.powerDirty) {
      snap.power = [fullMapPatch(this.grid.power)];
      this.powerDirty = false;
    }
    if (this.wateredDirty) {
      snap.watered = [fullMapPatch(this.grid.watered)];
      this.wateredDirty = false;
    }
    if (this.seweredDirty) {
      snap.sewered = [fullMapPatch(this.grid.sewered)];
      this.seweredDirty = false;
    }
    if (this.waterFoulDirty) {
      snap.waterFoul = [fullMapPatch(this.grid.waterFoul)];
      this.waterFoulDirty = false;
    }
    if (this.pendingHeightPatches.length > 0) {
      snap.heightPatches = this.pendingHeightPatches;
      this.pendingHeightPatches = [];
    }
    const junctions = this.controlledJunctions();
    if (junctions) snap.junctions = junctions;
    const roundabouts = this.changedRoundabouts();
    if (roundabouts) snap.roundabouts = roundabouts;

    const transfer: Transferable[] = [vehicles.buffer];
    if (snap.roadNet) transfer.push(snap.roadNet.buffer);
    if (snap.heightPatches) {
      for (const patch of snap.heightPatches) transfer.push(patch.heights.buffer);
    }
    this.post({ type: 'snapshot', snap }, transfer);

    // Recompute + push the held selection on each snapshot:
    // occupancy/tax/happiness change as the sim runs, and a demolition of the
    // selected building must end the stream with an info: null.
    if (this.selectedId !== null) this.postSelection();
  }

  /**
   * Computes and posts the SelectionInfo for the held selection. A missing
   * building (demolished, or an unknown id) posts info: null once and drops
   * the selection so the stream ends.
   */
  private postSelection(): void {
    const id = this.selectedId;
    if (id === null) return;
    const inst = this.registry.get(id);
    const entry = inst ? this.catalogById.get(inst.catalogId) : undefined;
    if (!inst || !entry) {
      this.selectedId = null;
      this.post({ type: 'selection', info: null });
      return;
    }

    const idx = tileIndex(inst.x, inst.z);
    const happinessByte = this.grid.fields[FieldId.Happiness]?.[idx] ?? 0;
    const landValueByte = this.grid.fields[FieldId.LandValue]?.[idx] ?? 0;
    // A capped facility's own load, worked out by the service pass this tick.
    const facilityLoad = this.services.facilityLoad(inst.id);
    // A shore intake's yield, as the last utility pass read the water beside it.
    const intakeYield = this.intakeYield.get(inst.id);
    const info: SelectionInfo = {
      building: { ...inst },
      happiness: Math.round((happinessByte / 255) * 100),
      monthlyTax: buildingMonthlyTax(entry, inst.state, this.stats.taxRates, landValueByte),
      // The catalog upkeep charge; grown buildings (zone set) carry none.
      monthlyUpkeep: entry.zone !== undefined ? 0 : entry.upkeep,
      occupancy: selectionOccupancy(entry, inst.state),
      ...(facilityLoad !== undefined ? { serviceLoad: facilityLoad } : {}),
      ...(intakeYield !== undefined ? { intakeYield } : {}),
    };
    this.post({ type: 'selection', info });
  }

  private zonePatchFor(rect: DirtyRect): ZonePatch {
    const w = rect.maxX - rect.minX + 1;
    const h = rect.maxZ - rect.minZ + 1;
    const data = new Uint8Array(w * h);
    for (let dz = 0; dz < h; dz++) {
      for (let dx = 0; dx < w; dx++) {
        data[dz * w + dx] = this.grid.zone[tileIndex(rect.minX + dx, rect.minZ + dz)] ?? 0;
      }
    }
    return { x: rect.minX, z: rect.minZ, w, h, data };
  }

  /** Districts patch: same shape/loop as zonePatchFor, reading grid.district. */
  private districtPatchFor(rect: DirtyRect): ZonePatch {
    const w = rect.maxX - rect.minX + 1;
    const h = rect.maxZ - rect.minZ + 1;
    const data = new Uint8Array(w * h);
    for (let dz = 0; dz < h; dz++) {
      for (let dx = 0; dx < w; dx++) {
        data[dz * w + dx] = this.grid.district[tileIndex(rect.minX + dx, rect.minZ + dz)] ?? 0;
      }
    }
    return { x: rect.minX, z: rect.minZ, w, h, data };
  }

  /** Landfill membership patch: same shape/loop as districtPatchFor, reading grid.landfill. */
  private landfillPatchFor(rect: DirtyRect): ZonePatch {
    const w = rect.maxX - rect.minX + 1;
    const h = rect.maxZ - rect.minZ + 1;
    const data = new Uint8Array(w * h);
    for (let dz = 0; dz < h; dz++) {
      for (let dx = 0; dx < w; dx++) {
        data[dz * w + dx] = this.grid.landfill[tileIndex(rect.minX + dx, rect.minZ + dz)] ?? 0;
      }
    }
    return { x: rect.minX, z: rect.minZ, w, h, data };
  }

  /** Power-line membership patch: same shape/loop as landfillPatchFor, reading grid.powerLine. */
  private powerLinePatchFor(rect: DirtyRect): ZonePatch {
    return this.layerPatchFor(this.grid.powerLine, rect);
  }

  /** A per-tile byte layer's membership over `rect`, the shape every painted layer travels in. */
  private layerPatchFor(layer: Uint8Array, rect: DirtyRect): ZonePatch {
    const w = rect.maxX - rect.minX + 1;
    const h = rect.maxZ - rect.minZ + 1;
    const data = new Uint8Array(w * h);
    for (let dz = 0; dz < h; dz++) {
      for (let dx = 0; dx < w; dx++) {
        data[dz * w + dx] = layer[tileIndex(rect.minX + dx, rect.minZ + dz)] ?? 0;
      }
    }
    return { x: rect.minX, z: rect.minZ, w, h, data };
  }

  /** Full-grid uncollected-trash coverage (0..255 per tile) for the 'trash' lens. */
  private trashPatch(): ZonePatch {
    return { x: 0, z: 0, w: MAP_SIZE, h: MAP_SIZE, data: this.garbage.trash.slice() };
  }

  /** Per-incinerator buffer fill (0..1) + capacity, for the UI readout. */
  private incineratorSnapshot(): { id: number; fill: number; capacity: number }[] {
    const out: { id: number; fill: number; capacity: number }[] = [];
    for (const inst of this.registry.all()) {
      const entry = this.catalogById.get(inst.catalogId);
      if (
        !entry?.garbage ||
        entry.garbage.servesHomes !== undefined ||
        entry.garbage.sortRate !== undefined ||
        entry.garbage.transferRate !== undefined
      ) {
        continue;
      }
      const capacity = entry.garbage.bufferCapacity;
      const fill =
        capacity > 0 ? Math.min(1, this.garbage.incineratorStored(inst.id) / capacity) : 0;
      out.push({ id: inst.id, fill, capacity });
    }
    return out;
  }

  /**
   * Ensures a District def exists for `id` (1..255), auto-creating one
   * with a default name + palette color the first time a district id is
   * painted (the UI picks ids client-side; the worker owns the authoritative
   * def registry and echoes it in snap.districts.defs).
   */
  private ensureDistrictDef(id: number): void {
    if (id === 0 || this.districtDefById.has(id)) return;
    const def: District = {
      id,
      name: `District ${id}`,
      color: DISTRICT_PALETTE[(id - 1) % DISTRICT_PALETTE.length]!,
    };
    this.districtDefById.set(id, def);
    this.districtDefs.push(def);
    this.districtDefsChanged = true;
  }

  private averageHappiness(): number {
    const happiness = this.grid.fields[FieldId.Happiness];
    if (!happiness) return 50;
    let sum = 0;
    let count = 0;
    const ids = this.grid.buildingId;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] !== 0) {
        sum += happiness[i] ?? 0;
        count += 1;
      }
    }
    if (count === 0) return 50;
    return Math.round((sum / count / 255) * 100);
  }

  private postField(field: FieldId): void {
    const data = this.grid.fields[field];
    if (!data) return;
    this.post({ type: 'field', field, data: data.slice() });
  }

  private postSave(): void {
    const data = encodeSave({
      header: {
        version: SAVE_VERSION,
        seed: this.seed,
        tick: this.tickNo,
        mapName: this.mapName,
        savedAt: 0, // stamped by the main thread (persist.storeSave) — no Date.now in the worker
        population: this.stats.population,
        funds: this.stats.funds,
      },
      grid: saveGrid(this.grid, this.roads),
      meta: {
        registry: this.registry.serialize(),
        stats: cloneStats(this.stats),
        garbage: this.garbage.serializeState(),
        transitLines: this.transit.getLines().map((l) => ({ ...l, stops: [...l.stops] })),
        roadProfiles: this.roadProfileTable(),
      },
    });
    this.post({ type: 'save', data }, [data]);
  }

  // -------------------------------------------------------------------------
  // Road composition
  // -------------------------------------------------------------------------

  private roadProfileTable(): { id: number; profile: RoadProfile }[] {
    return Array.from(this.customRoadProfiles, ([id, profile]) => ({
      id,
      profile: { ...profile, pieces: profile.pieces.map((p) => ({ ...p })) },
    }));
  }

  /**
   * The tier a profile id stands nearest to — its own for a preset, the derived
   * one for a composed profile — or null for an id nothing has defined.
   */
  private tierForProfileId(id: number): RoadTier | null {
    if (isPresetProfileId(id)) return id as RoadTier;
    const custom = this.customRoadProfiles.get(id);
    return custom ? tierForProfile(custom) : null;
  }

  /**
   * Why a road of `profileId` may not go down on `laying` (each tile with the
   * flow it will carry), or null: one of those tiles would touch a road its
   * class may never meet — a street against a motorway, a dirt track against a
   * ramp — or a ramp would meet a motorway head-on or against its traffic. The
   * road tool asks the same questions before it sends the drag; asking them
   * here too means no command, from whatever source, lays one.
   */
  private joinRefusalAround(
    laying: ReadonlyMap<number, number>,
    profileId: number,
    passingOver: ReadonlyMap<number, OverRoad>,
    passingUnder: readonly TilePoint[] = [],
  ): string | null {
    const mine = this.profileForId(profileId);
    if (!mine) return null;
    const g = this.grid;
    // A tile this drag passes over carries this drag's own road on top; the
    // road beneath it is one the drag never meets.
    const crossingAt = (x: number, z: number): OverRoad | undefined =>
      inBounds(x, z) ? passingOver.get(tileIndex(x, z)) : undefined;
    // Nor does a drag passing under a raised road meet that road's tiles
    // either side of the crossing: they are up in the air, running on.
    const overhead = new Set<number>();
    for (const t of passingUnder) {
      const alongX = axisOfFlow(g.roadFlow[tileIndex(t.x, t.z)] ?? RoadFlow.None) === 'x';
      const [dx, dz] = alongX ? [1, 0] : [0, 1];
      for (const s of [1, -1]) {
        if (inBounds(t.x + s * dx, t.z + s * dz))
          overhead.add(tileIndex(t.x + s * dx, t.z + s * dz));
      }
    }
    const classNear = (x: number, z: number): RoadClassId | null =>
      crossingAt(x, z)
        ? mine.class
        : overhead.has(inBounds(x, z) ? tileIndex(x, z) : -1)
          ? null
          : this.roadClassAt(x, z);
    const flowNear = (x: number, z: number): number =>
      crossingAt(x, z)?.flow ?? (inBounds(x, z) ? (g.roadFlow[tileIndex(x, z)] ?? 0) : 0);
    const tiles: TilePoint[] = [];
    for (const idx of laying.keys()) {
      const x = idx % g.size;
      const z = (idx - x) / g.size;
      tiles.push({ x, z });
      for (const [dx, dz] of NEIGHBOUR_STEPS) {
        const nx = x + dx;
        const nz = z + dz;
        if (!inBounds(nx, nz) || laying.has(tileIndex(nx, nz))) continue;
        const other = classNear(nx, nz);
        if (!other) continue;
        const why = joinRefusal(mine.class, other);
        if (why) return why;
      }
    }
    return rampMeetingRefusal(tiles, [...laying.values()], mine.class, classNear, flowNear);
  }

  /** Whether a tile holds a road at ground layer within one grade step of `level`. */
  private roadAtLevel(x: number, z: number, level: number): boolean {
    if (!inBounds(x, z)) return false;
    const n = tileIndex(x, z);
    if ((this.grid.roadTier[n] ?? 0) === RoadTier.None) return false;
    return atOneLevel(this.grid.roadElevation[n] ?? 0, level);
  }

  /**
   * Lays each road in `crossings` on the over layer of its tile, and returns
   * the commands that put back what was there: nothing, for a new crossing, or
   * the over road it replaced.
   */
  private applyCrossings(crossings: ReadonlyMap<number, OverRoad>): Command[] {
    const g = this.grid;
    const created: TilePoint[] = [];
    const replaced = new Map<
      number,
      { tier: RoadTier; tiles: TilePoint[]; elevations: number[]; flows: number[] }
    >();
    for (const [idx, road] of crossings) {
      const x = idx % g.size;
      const t = { x, z: (idx - x) / g.size };
      const prior = overRoadAt(g, idx);
      if (prior) {
        const group = replaced.get(prior.profile) ?? {
          tier: prior.tier,
          tiles: [],
          elevations: [],
          flows: [],
        };
        group.tiles.push(t);
        group.elevations.push(prior.elevation);
        group.flows.push(prior.flow);
        replaced.set(prior.profile, group);
      } else {
        created.push(t);
      }
      setOverRoad(g, idx, road);
    }
    this.overLayerChanged(crossings.keys());
    const inverse: Command[] = [];
    if (created.length > 0) inverse.push({ kind: 'bulldoze', tiles: created, layer: 'over' });
    for (const [profile, group] of replaced) {
      inverse.push({ kind: 'buildRoad', ...group, profile, layer: 'over' });
    }
    return inverse;
  }

  /** A road delta carrying the road passing over its tile as the grid holds it now. */
  /** Queues a road tile for the render thread and marks the network stale. */
  private recordRoadDelta(d: RoadTileDelta): void {
    this.pendingRoadDeltas.set(tileIndex(d.x, d.z), d);
    this.roadsEdited = true;
  }

  /**
   * After a command changed road tiles: the network takes up what it laid,
   * and the road layers are derived from the network again. They come out as
   * the command left them; where they would not, that is reported.
   */
  private syncRoads(): void {
    if (!this.roadsEdited) return;
    this.roadsEdited = false;
    reconcileRoads(this.roads, this.grid);
    reportRoadProblems('command', syncRoadLayers(this.grid, this.roads));
    this.deriveFootprint();
    // Deriving the layers again drops what is held apart between a road and
    // one no longer beside it, which no delta of the command's carried.
    const apart = this.grid.roadSeparate;
    for (let i = 0; i < apart.length; i++) {
      if (apart[i] !== this.reportedApart[i] && !this.pendingRoadDeltas.has(i)) {
        this.pendingRoadDeltas.set(i, this.roadDeltaOf(i));
      }
    }
  }

  /** The arms held apart on each tile as the render thread was last told them. */
  private readonly reportedApart = new Uint8Array(MAP_SIZE * MAP_SIZE);

  /** A road delta carrying the arms of its tile held apart as the grid holds them now. */
  private withArmsApart(d: RoadTileDelta): RoadTileDelta {
    const idx = tileIndex(d.x, d.z);
    const apart = this.grid.roadSeparate[idx] ?? 0;
    this.reportedApart[idx] = apart;
    return apart === 0 ? d : { ...d, apart };
  }

  /** The road on tile `idx` as the grid holds it now, as the render thread is told it. */
  private roadDeltaOf(idx: number): RoadTileDelta {
    const g = this.grid;
    const tier = (g.roadTier[idx] ?? 0) as RoadTier;
    return {
      x: idx % MAP_SIZE,
      z: Math.floor(idx / MAP_SIZE),
      tier,
      mask: g.roadMask[idx] ?? 0,
      elevation: g.roadElevation[idx] ?? 0,
      profile: tier === RoadTier.None ? 0 : g.roadProfile[idx] || tier,
      flow: g.roadFlow[idx] ?? RoadFlow.None,
    };
  }

  /** The tiles the roads off the grid cover, from the network. */
  private deriveFootprint(): void {
    deriveRoadFootprint(this.grid, this.roads, (id) => this.profileForId(id));
  }

  private withOverRoad(d: RoadTileDelta): RoadTileDelta {
    const idx = tileIndex(d.x, d.z);
    const road = overRoadAt(this.grid, idx);
    if (!road) return d;
    return { ...d, over: { ...road, mask: computeOverMask(this.grid, d.x, d.z) } };
  }

  /**
   * After a road passing over tiles is laid or lifted: who the tiles around
   * those crossings join has changed, so their masks, the graphs built from
   * them and the utility spread are all out of date.
   */
  private overLayerChanged(idxs: Iterable<number>): void {
    const list = [...idxs];
    if (list.length === 0) return;
    const g = this.grid;
    // The crossing tile itself always goes out, even where its own road's mask
    // is unchanged: the road passing over it is what changed.
    for (const idx of list) {
      if ((g.roadTier[idx] ?? 0) === RoadTier.None) continue;
      this.recordRoadDelta(this.roadDeltaOf(idx));
    }
    for (const d of remaskAround(g, list)) this.recordRoadDelta(d);
    this.invalidateAround(
      list.map((idx) => ({ x: idx % MAP_SIZE, z: Math.floor(idx / MAP_SIZE) })),
    );
    this.utilitiesDirty = true;
  }

  /**
   * An undo putting back roads that passed over crossings: each tile goes on
   * the over layer exactly as given, above the road that is still below it.
   */
  private layOverRoads(
    tier: RoadTier,
    profileId: number,
    tiles: readonly TilePoint[],
    elevations: readonly number[] | undefined,
    flows: readonly number[] | undefined,
    costPerTile: number,
  ): CommandResult {
    const g = this.grid;
    const crossings = new Map<number, OverRoad>();
    let cost = 0;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i]!;
      if (!inBounds(t.x, t.z)) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
      const idx = tileIndex(t.x, t.z);
      if ((g.roadTier[idx] ?? 0) === RoadTier.None) {
        return { ok: false, cost: 0, inverse: [], reason: 'An overpass needs a road below it' };
      }
      const elevation = elevations?.[i] ?? 0;
      crossings.set(idx, { tier, profile: profileId, flow: flows?.[i] ?? 0, elevation });
      cost += costPerTile + elevation * BRIDGE_COST_PER_METER_TILE;
    }
    if (crossings.size === 0) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    if (!this.unlimitedMoney && this.stats.funds < cost) {
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };
    }
    const inverse = this.applyCrossings(crossings);
    this.stats.funds -= cost;
    return { ok: true, cost, inverse };
  }

  /**
   * Takes away the roads passing over `tiles`, leaving the roads below, and
   * returns what undoes it and what it refunds.
   */
  private removeOverRoads(tiles: readonly TilePoint[]): { inverse: Command[]; refund: number } {
    const g = this.grid;
    const byProfile = new Map<
      number,
      { tier: RoadTier; tiles: TilePoint[]; elevations: number[]; flows: number[] }
    >();
    let refund = 0;
    for (const t of tiles) {
      const idx = tileIndex(t.x, t.z);
      const road = overRoadAt(g, idx);
      if (!road) continue;
      const group = byProfile.get(road.profile) ?? {
        tier: road.tier,
        tiles: [],
        elevations: [],
        flows: [],
      };
      group.tiles.push(t);
      group.elevations.push(road.elevation);
      group.flows.push(road.flow);
      byProfile.set(road.profile, group);
      clearOverRoad(g, idx);
      const spec = this.roadSpecByTier.get(road.tier);
      if (spec) refund += spec.costPerTile * BULLDOZE_REFUND_RATE;
    }
    this.overLayerChanged(tiles.map((t) => tileIndex(t.x, t.z)));
    const inverse: Command[] = [];
    for (const [profile, group] of byProfile) {
      inverse.push({ kind: 'buildRoad', ...group, profile, layer: 'over' });
    }
    return { inverse, refund };
  }

  /** The class of the road on a tile, or null where there is none. */
  private roadClassAt(x: number, z: number): RoadClassId | null {
    if (!inBounds(x, z)) return null;
    const n = tileIndex(x, z);
    const tier = this.grid.roadTier[n] ?? 0;
    if (tier === RoadTier.None) return null;
    return this.profileForId(this.grid.roadProfile[n] || tier)?.class ?? null;
  }

  /**
   * Hands the noise field the walls it has to cross, derived again whenever
   * the road network or the profile table has moved since they were last. A
   * profile is never redefined under its id, so the table only grows.
   */
  private refreshNoiseWalls(): void {
    const net = this.roads;
    const from = this.noiseWallsFrom;
    if (
      from?.net === net &&
      from.version === net.version &&
      from.profiles === this.customRoadProfiles &&
      from.count === this.customRoadProfiles.size
    ) {
      return;
    }
    this.noiseWallsFrom = {
      net,
      version: net.version,
      profiles: this.customRoadProfiles,
      count: this.customRoadProfiles.size,
    };
    this.fieldSim.setNoiseWalls(noiseWallsOf(this.grid, (id) => this.profileForId(id)));
  }

  /** What the noise walls were last derived from. */
  private noiseWallsFrom: {
    net: RoadNet;
    version: number;
    profiles: ReadonlyMap<number, RoadProfile>;
    count: number;
  } | null = null;

  /** The profile an id stands for: the preset itself, or the composition defined under it. */
  private profileForId(id: number): RoadProfile | null {
    if (isPresetProfileId(id)) {
      try {
        return presetProfileForTier(id as RoadTier);
      } catch {
        return null;
      }
    }
    return this.customRoadProfiles.get(id) ?? null;
  }

  /**
   * What a road of this profile costs and needs. A PRESET is priced as itself,
   * whatever it carries — the three transit roads that used to stand alone
   * still cost what they always did, so a save built before is worth what it
   * was. A composed road is priced as its size plus its reserved lanes.
   */
  private roadPriceForProfileId(id: number, sizeSpec: RoadSpec): RoadPrice {
    if (isPresetProfileId(id)) {
      const spec = this.roadSpecByTier.get(id) ?? sizeSpec;
      return {
        costPerTile: spec.costPerTile,
        upkeepPerTile: spec.upkeepPerTile,
        unlockMilestone: spec.unlockMilestone,
      };
    }
    const profile = this.profileForId(id);
    return profile
      ? roadPriceOf(sizeSpec, profile)
      : {
          costPerTile: sizeSpec.costPerTile,
          upkeepPerTile: sizeSpec.upkeepPerTile,
          unlockMilestone: sizeSpec.unlockMilestone,
        };
  }

  private cmdDefineRoadProfile(id: number, profile: RoadProfile): CommandResult {
    const rejected = { ok: false, cost: 0, inverse: [], reason: 'invalid' as const };
    if (!Number.isInteger(id) || id < FIRST_CUSTOM_PROFILE_ID || id > 0xffff) return rejected;
    // A corridor's profile is wider than a tile on purpose — its two halves
    // are what land on tiles — so the gate is what may be LAID, not what fits
    // one tile.
    if (layRefusal(profile) !== null) return rejected;
    const existing = this.customRoadProfiles.get(id);
    if (existing) {
      // Idempotent for the same definition; a different one under a taken id
      // would silently re-shape every road already laid with it.
      const same = JSON.stringify(existing) === JSON.stringify(profile);
      return same ? { ok: true, cost: 0, inverse: [] } : rejected;
    }
    this.customRoadProfiles.set(id, {
      ...profile,
      pieces: profile.pieces.map((p) => ({ ...p })),
    });
    // No tile carries the new id yet, so no mask has to be worked out again.
    this.grid.oneCarriageway = oneCarriagewayIds(this.customRoadProfiles);
    this.roadProfilesChanged = true;
    return { ok: true, cost: 0, inverse: [] };
  }

  /**
   * Sets who gives way at a junction, or hands it back to the warrant with a
   * null. Only a junction of the street network can be set — a mid-run tile,
   * a dead end or a bend has nobody to give way to — and setting a junction to
   * what it already carries is a no-op rather than an undo step.
   */
  private cmdSetJunctionControl(
    x: number,
    z: number,
    control: JunctionControl | null,
  ): CommandResult {
    const rejected = { ok: false, cost: 0, inverse: [], reason: 'invalid' as const };
    if (!inBounds(x, z)) return rejected;
    // A roundabout is one junction on four tiles, taken out whole or not at all.
    if (this.ringAt(x, z)) return rejected;
    // Three arms or more. A dead end is a graph node too, but it has nothing
    // to give way to, and neither has a bend or a tile in the middle of a run.
    const node = this.network.getNodes().find((n) => n.x === x && n.z === z);
    if (!node || node.edges.length < 3) return rejected;
    // Nobody is ever held on a motorway: a junction the warrant leaves bare for
    // that reason cannot be signalled or signed by hand instead. Handing it
    // back to the warrant, or to none, is still allowed — neither is a control.
    if (control !== null && control !== 'none') {
      const edges = this.network.getEdges();
      const classes = armsAt(node, (id) => edges[id]).map((arm) => arm.approach.classId);
      if (!takesControl(classes)) return rejected;
    }

    const i = tileIndex(x, z);
    const was = this.grid.junctionControl[i] ?? 0;
    const code = codeForControl(control);
    if (code === was) return { ok: true, cost: 0, inverse: [] };

    this.grid.junctionControl[i] = code;
    // The control is what the path cost and the signs read, so the graph has
    // to work them out again before anything asks.
    this.network.invalidateRegion(x, z, x, z);
    return {
      ok: true,
      cost: 0,
      inverse: [{ kind: 'setJunctionControl', x, z, control: controlFromCode(was) }],
    };
  }

  /**
   * Restricts what one arm of a junction may do, or hands it back to what its
   * lanes offer with a null. An arm cannot be left with nothing — a driver who
   * arrives has to be able to leave — and only an arm that actually carries a
   * road can be restricted.
   */
  /**
   * What ONE LANE of an arm may do, or a null to hand it back to the set its
   * approach derives.
   *
   * The same guards the arm takes, since a lane is a refinement of it and not
   * a way round it: a real junction, a real arm, and never a lane left with
   * nothing. The arm's own restriction still wins wherever the two disagree,
   * which is applied where the sets are read rather than stored here.
   */
  private cmdSetJunctionLaneTurns(
    x: number,
    z: number,
    arm: RoadFlow,
    lane: number,
    allowed: number | null,
  ): CommandResult {
    const rejected = { ok: false, cost: 0, inverse: [], reason: 'invalid' as const };
    if (!inBounds(x, z)) return rejected;
    // A roundabout's every entry does one thing: turn onto the ring.
    if (this.ringAt(x, z)) return rejected;
    if (!Number.isInteger(lane) || lane < 0 || lane >= MAX_EDITABLE_LANES) return rejected;
    const node = this.network.getNodes().find((n) => n.x === x && n.z === z);
    if (!node || node.edges.length < 3) return rejected;
    const step = stepForFlow(arm);
    if (step.dx === 0 && step.dz === 0) return rejected;
    if (!inBounds(x + step.dx, z + step.dz)) return rejected;
    if (!isStreetTier(this.grid.roadTier[tileIndex(x + step.dx, z + step.dz)] ?? 0))
      return rejected;
    if (allowed !== null && (allowed & 0xf) === 0) return rejected;

    const slot = armSlot(arm);
    if (slot === null) return rejected;
    const at = tileIndex(x, z) * ARMS_PER_TILE + slot;
    const was = this.grid.junctionLaneTurns[at] ?? 0;
    const next = withLaneAllowed(was, lane, allowed);
    if (next === was) return { ok: true, cost: 0, inverse: [] };

    this.grid.junctionLaneTurns[at] = next;
    // Read by the router and painted on the approach, so the graph has to work
    // the junction out again before anything asks.
    this.network.invalidateRegion(x, z, x, z);
    return {
      ok: true,
      cost: 0,
      inverse: [
        {
          kind: 'setJunctionLaneTurns',
          x,
          z,
          arm,
          lane,
          allowed: laneAllowed(was, lane),
        },
      ],
    };
  }

  private cmdSetJunctionTurns(
    x: number,
    z: number,
    arm: RoadFlow,
    allowed: number | null,
  ): CommandResult {
    const rejected = { ok: false, cost: 0, inverse: [], reason: 'invalid' as const };
    if (!inBounds(x, z)) return rejected;
    // A roundabout's every entry does one thing: turn onto the ring.
    if (this.ringAt(x, z)) return rejected;
    const node = this.network.getNodes().find((n) => n.x === x && n.z === z);
    if (!node || node.edges.length < 3) return rejected;
    const step = stepForFlow(arm);
    if (step.dx === 0 && step.dz === 0) return rejected;
    if (!inBounds(x + step.dx, z + step.dz)) return rejected;
    if (!isStreetTier(this.grid.roadTier[tileIndex(x + step.dx, z + step.dz)] ?? 0))
      return rejected;
    if (allowed !== null && (allowed & 0xf) === 0) return rejected;

    const i = tileIndex(x, z);
    const was = this.grid.junctionTurns[i] ?? 0;
    const next = withArmAllowed(was, arm, allowed);
    if (next === was) return { ok: true, cost: 0, inverse: [] };

    this.grid.junctionTurns[i] = next;
    // Restrictions are read by the router and painted on the approach, so the
    // graph has to work them out again before anything asks.
    this.network.invalidateRegion(x, z, x, z);
    return {
      ok: true,
      cost: 0,
      inverse: [
        {
          kind: 'setJunctionTurns',
          x,
          z,
          arm,
          allowed: armIsRestricted(was, arm) ? armAllowed(was, arm) : null,
        },
      ],
    };
  }

  /** The compact roundabout (x, z) is a corner of, or null. */
  private ringAt(x: number, z: number): RoundaboutBlock | null {
    return compactRoundaboutAt(x, z, gridRingReader(this.grid));
  }

  /** The grid as a roundabout's site reads it. */
  private roundaboutGround(): ReturnType<typeof roundaboutGroundOf> {
    const g = this.grid;
    return roundaboutGroundOf(
      g,
      (x, z) => g.junctionControl[tileIndex(x, z)] ?? 0,
      (id) => this.profileForId(id),
    );
  }

  /** What the player has said about the junction at a tile. */
  private junctionStateAt(t: TilePoint): RoundaboutJunction {
    const i = tileIndex(t.x, t.z);
    return {
      control: controlFromCode(this.grid.junctionControl[i] ?? 0),
      turns: this.grid.junctionTurns[i] ?? 0,
      laneTurns: Array.from(
        { length: ARMS_PER_TILE },
        (_, arm) => this.grid.junctionLaneTurns[i * ARMS_PER_TILE + arm] ?? 0,
      ),
    };
  }

  private writeJunctionState(t: TilePoint, state: RoundaboutJunction): void {
    const i = tileIndex(t.x, t.z);
    this.grid.junctionControl[i] = codeForControl(state.control);
    this.grid.junctionTurns[i] = state.turns;
    for (let arm = 0; arm < ARMS_PER_TILE; arm++) {
      this.grid.junctionLaneTurns[i * ARMS_PER_TILE + arm] = state.laneTurns[arm] ?? 0;
    }
  }

  /**
   * Makes the block whose north-west tile is (x, z) a compact roundabout: the
   * roundabout control on all four tiles, and no turn or lane restriction left
   * on any of them, since one set on the crossing before could ban the one
   * turn onto the ring. Refused, with the reason, unless every tile is laid
   * and the block is a roundabout's site.
   */
  private cmdBuildRoundabout(x: number, z: number): CommandResult {
    const block = { x, z };
    const plan = roundaboutPlan(block, this.roundaboutGround());
    if (plan.refusal !== null || plan.toLay.length > 0) {
      return { ok: false, cost: 0, inverse: [], reason: plan.refusal ?? 'invalid' };
    }
    const tiles = blockTiles(block);
    const before = tiles.map((t) => this.junctionStateAt(t));
    for (const t of tiles) {
      this.writeJunctionState(t, { control: 'roundabout', turns: 0, laneTurns: [0, 0, 0, 0] });
    }
    this.network.invalidateRegion(x, z, x + 1, z + 1);
    return { ok: true, cost: 0, inverse: [{ kind: 'removeRoundabout', x, z, junctions: before }] };
  }

  /**
   * Takes out the compact roundabout whose north-west tile is (x, z), leaving
   * its four tiles with `junctions`, one each in the block's order, or with
   * nothing the player has said about them. Refused unless a compact
   * roundabout stands there.
   */
  private cmdRemoveRoundabout(
    x: number,
    z: number,
    junctions: readonly RoundaboutJunction[] | undefined,
  ): CommandResult {
    const rejected = { ok: false, cost: 0, inverse: [], reason: 'invalid' as const };
    const ring = this.ringAt(x, z);
    if (!ring || ring.x !== x || ring.z !== z) return rejected;
    if (junctions && junctions.length !== 4) return rejected;
    blockTiles(ring).forEach((t, i) =>
      this.writeJunctionState(
        t,
        junctions?.[i] ?? { control: null, turns: 0, laneTurns: [0, 0, 0, 0] },
      ),
    );
    this.network.invalidateRegion(x, z, x + 1, z + 1);
    return { ok: true, cost: 0, inverse: [{ kind: 'buildRoundabout', x, z }] };
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  private drainCommands(): void {
    const batches = this.pendingBatches;
    if (batches.length === 0) return;
    this.pendingBatches = [];

    for (const batch of batches) {
      // A batch is one edit to the player, so it lands whole or not at all.
      const fundsBefore = this.stats.funds;
      let cost = 0;
      let refusal: CommandResult | null = null;
      const inverse: Command[] = [];

      for (const command of batch.commands) {
        const result = this.applyCommand(command);
        // Before the next command, which may read what this one laid.
        this.syncRoads();
        if (!result.ok) {
          refusal = result;
          break;
        }
        cost += result.cost;
        // Undo replays inverses in reverse order of the originals.
        inverse.unshift(...result.inverse);
      }

      if (refusal) {
        // What landed before the refusal comes back off, newest first. An
        // inverse is not priced like its original — a road's is a bulldoze,
        // which refunds half — so the funds go back as they stood.
        for (const command of inverse) {
          const undone = this.applyCommand(command);
          this.syncRoads();
          if (!undone.ok) {
            console.error(
              `batch ${batch.seq}: an inverse was refused taking back a refused batch (${command.kind}, ${undone.reason ?? 'no reason'})`,
            );
          }
        }
        this.stats.funds = fundsBefore;
        const ack: CommandAck = { seq: batch.seq, ok: false, cost: 0, inverse: [] };
        if (refusal.reason !== undefined) ack.reason = refusal.reason;
        this.post({ type: 'ack', ack });
        continue;
      }

      this.post({ type: 'ack', ack: { seq: batch.seq, ok: true, cost, inverse } });
    }
  }

  private applyCommand(command: Command): CommandResult {
    switch (command.kind) {
      case 'buildRoad':
        return this.cmdBuildRoad(
          command.tier,
          command.tiles,
          command.elevation,
          command.elevations,
          command.profile,
          command.replace,
          command.flows,
          command.layer,
          { join: command.join, apart: command.apart },
        );
      case 'defineRoadProfile':
        return this.cmdDefineRoadProfile(command.id, command.profile);
      case 'setJunctionControl':
        return this.cmdSetJunctionControl(command.x, command.z, command.control);
      case 'setJunctionTurns':
        return this.cmdSetJunctionTurns(command.x, command.z, command.arm, command.allowed);
      case 'setJunctionLaneTurns':
        return this.cmdSetJunctionLaneTurns(
          command.x,
          command.z,
          command.arm,
          command.lane,
          command.allowed,
        );
      case 'buildRoundabout':
        return this.cmdBuildRoundabout(command.x, command.z);
      case 'removeRoundabout':
        return this.cmdRemoveRoundabout(command.x, command.z, command.junctions);
      case 'bulldoze':
        return this.cmdBulldoze(command.tiles, command.layer);
      case 'buildSegment':
        return this.cmdBuildSegment(command);
      case 'removeSegment':
        return this.cmdRemoveSegment(command.a, command.b, command.control ?? null);
      case 'splitSegment':
        return this.cmdSplitSegment(command.at);
      case 'joinSegments':
        return this.cmdJoinSegments(command.at, command.control ?? null);
      case 'moveSegmentEnd':
        return this.cmdMoveSegmentEnd(command.from, command.to);
      case 'paintZone':
        return this.cmdPaintZone(command.zone, command.tiles, command.restore === true);
      case 'placeBuilding':
        return this.cmdPlaceBuilding(command.catalogId, command.x, command.z, command.rotation);
      case 'setTaxRate': {
        const rate = Math.max(0, Math.min(MAX_TAX_RATE, command.rate));
        this.stats.taxRates = { ...this.stats.taxRates, [command.sector]: rate };
        return { ok: true, cost: 0, inverse: [] };
      }
      case 'setServiceFunding': {
        const funding = Math.max(
          SERVICE_FUNDING_MIN,
          Math.min(SERVICE_FUNDING_MAX, command.funding),
        );
        this.stats.serviceFunding = {
          ...this.stats.serviceFunding,
          [command.service]: funding,
        } as Record<ServiceKind, number>;
        return { ok: true, cost: 0, inverse: [] };
      }
      case 'takeLoan':
        Object.assign(this.stats, this.economy.applyLoan(this.stats, command.amount));
        return { ok: true, cost: 0, inverse: [] };
      case 'repayLoan':
        Object.assign(this.stats, this.economy.applyRepay(this.stats, command.amount));
        return { ok: true, cost: 0, inverse: [] };
      case 'terraform':
        return this.cmdTerraform(command);
      case 'terraformSet':
        return this.cmdTerraformSet(command);
      case 'createTransitLine': {
        const line = this.transit.createLine(
          command.line.stops,
          command.line.color,
          command.line.mode,
        );
        return { ok: true, cost: 0, inverse: [{ kind: 'deleteTransitLine', id: line.id }] };
      }
      case 'updateTransitLine': {
        const prev = this.transit.getLine(command.line.id);
        const updated = this.transit.updateLine(
          command.line.id,
          command.line.stops,
          command.line.color,
          command.line.mode,
        );
        if (!updated) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
        return {
          ok: true,
          cost: 0,
          inverse: prev ? [{ kind: 'updateTransitLine', line: prev }] : [],
        };
      }
      case 'deleteTransitLine': {
        const existed = this.transit.getLine(command.id);
        const removed = this.transit.deleteLine(command.id);
        if (!removed) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
        return {
          ok: true,
          cost: 0,
          inverse: existed ? [{ kind: 'createTransitLine', line: existed }] : [],
        };
      }
      case 'paintDistrict':
        return this.cmdPaintDistrict(command.districtId, command.tiles);
      case 'paintLandfill':
        return this.cmdPaintLandfill(command.tiles, command.on);
      case 'stringPowerLine':
        return this.cmdStringPowerLine(command.tiles, command.on);
      case 'layWaterPipe':
        return this.cmdLayWaterPipe(command.tiles, command.on);
      case 'setDistrictPolicy': {
        this.policyStore.setPolicy(command.districtId, command.policy, command.on);
        return {
          ok: true,
          cost: 0,
          inverse: [
            {
              kind: 'setDistrictPolicy',
              districtId: command.districtId,
              policy: command.policy,
              on: !command.on,
            },
          ],
        };
      }
      case 'setSandbox':
        this.sandbox = command.on;
        return { ok: true, cost: 0, inverse: [] };
      case 'setUnlimitedMoney':
        this.unlimitedMoney = command.on;
        return { ok: true, cost: 0, inverse: [] };
    }
  }

  /**
   * District paint: mirrors cmdPaintZone exactly — snapshot each tile's
   * previous district id, stamp the new id via world/districts.paintDistrict,
   * emit one inverse paintDistrict per previous-id group, and grow the
   * district dirty rect for the next snapshot. Districts carry no cost.
   */
  private cmdPaintDistrict(districtId: number, tiles: TilePoint[]): CommandResult {
    const g = this.grid;
    const prev = new Map<number, number>();
    for (const t of tiles) {
      if (!inBounds(t.x, t.z)) continue;
      prev.set(tileIndex(t.x, t.z), g.district[tileIndex(t.x, t.z)] ?? 0);
    }

    const applied = paintDistrict(g, districtId, tiles);
    if (applied.length === 0) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    if (districtId !== 0) this.ensureDistrictDef(districtId);

    const byPrev = new Map<number, TilePoint[]>();
    for (const t of applied) {
      const p = prev.get(tileIndex(t.x, t.z)) ?? 0;
      if (p === districtId) continue;
      const list = byPrev.get(p) ?? [];
      list.push(t);
      byPrev.set(p, list);
    }
    const inverse: Command[] = [];
    for (const [p, ts] of byPrev) inverse.push({ kind: 'paintDistrict', districtId: p, tiles: ts });

    this.districtDirty = growRect(this.districtDirty, applied);
    return { ok: true, cost: 0, inverse };
  }

  /**
   * Landfill paint: gated to the zonable road-frontage grid, exactly like the
   * zone brushes (landfillPlacementMask). Painting charges
   * LANDFILL_PAINT_COST_PER_TILE per newly-added tile and is funds-gated like a
   * ploppable; erasing is free. Inverse restores each changed tile's previous
   * membership (mirrors cmdPaintDistrict's per-tile inverse).
   */
  private cmdPaintLandfill(tiles: TilePoint[], on: boolean): CommandResult {
    const g = this.grid;
    const prev = new Map<number, number>();
    for (const t of tiles) {
      if (!inBounds(t.x, t.z)) continue;
      prev.set(tileIndex(t.x, t.z), g.landfill[tileIndex(t.x, t.z)] ?? 0);
    }

    let newTiles = 0;
    if (on) {
      const mask = landfillPlacementMask(g);
      for (const t of tiles) {
        if (!inBounds(t.x, t.z)) continue;
        if ((g.landfill[tileIndex(t.x, t.z)] ?? 0) === 0 && mask[tileIndex(t.x, t.z)] === 1) {
          newTiles += 1;
        }
      }
    }
    const cost = on ? newTiles * LANDFILL_PAINT_COST_PER_TILE : 0;
    if (on && !this.sandbox && !this.unlimitedMoney && cost > this.stats.funds) {
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };
    }

    const applied = paintLandfill(g, tiles, on);
    if (applied.length === 0) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };

    const turnedOn: TilePoint[] = [];
    const turnedOff: TilePoint[] = [];
    for (const t of applied) {
      const was = prev.get(tileIndex(t.x, t.z)) ?? 0;
      const now = g.landfill[tileIndex(t.x, t.z)] ?? 0;
      if (was === now) continue;
      if (now === 1) turnedOn.push(t);
      else turnedOff.push(t);
    }

    // An area must be big enough to field its gatehouse office and a truck
    // dump run — reject a batch that leaves a new-but-undersized fragment
    // (expanding an existing area past the minimum is fine).
    if (on && hasUndersizedArea(g.size, g.landfill, turnedOn, LANDFILL_MIN_AREA_TILES)) {
      for (const t of turnedOn) g.landfill[tileIndex(t.x, t.z)] = 0;
      return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    }

    const inverse: Command[] = [];
    if (turnedOn.length > 0) inverse.push({ kind: 'paintLandfill', tiles: turnedOn, on: false });
    if (turnedOff.length > 0) inverse.push({ kind: 'paintLandfill', tiles: turnedOff, on: true });

    this.landfillDirty = growRect(this.landfillDirty, applied);
    this.landfillAreasCache = null;
    return { ok: true, cost, inverse };
  }

  /**
   * Strings or pulls down a run of power line. Only tiles that actually change
   * are charged for and put back by the undo, so dragging back over a run you
   * have already strung costs nothing.
   */
  private cmdStringPowerLine(tiles: TilePoint[], on: boolean): CommandResult {
    const g = this.grid;
    // Cost is quoted for the tiles that would change, which is what the tool
    // has already shown the player on the cursor.
    let wouldChange = 0;
    for (const t of tiles) {
      if (!inBounds(t.x, t.z)) continue;
      const now = (g.powerLine[tileIndex(t.x, t.z)] ?? 0) === 1;
      if (now !== on && (!on || canStringLine(g, t.x, t.z))) wouldChange += 1;
    }
    const cost = on ? wouldChange * POWER_LINE_COST_PER_TILE : 0;
    if (on && !this.sandbox && !this.unlimitedMoney && cost > this.stats.funds) {
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };
    }

    const changed = stringPowerLine(g, tiles, on);
    if (changed.length === 0) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };

    this.powerLineDirty = growRect(this.powerLineDirty, changed);
    // Supply travels along the line, so the coverage it changes has to be
    // worked out again rather than waiting for the utility cadence.
    this.utilitiesDirty = true;
    return {
      ok: true,
      cost,
      inverse: [{ kind: 'stringPowerLine', tiles: changed, on: !on }],
    };
  }

  /**
   * Lays or pulls up a run of water pipe: the power line's command for the
   * mains, charged and undone per tile that changes.
   */
  private cmdLayWaterPipe(tiles: TilePoint[], on: boolean): CommandResult {
    const g = this.grid;
    let wouldChange = 0;
    for (const t of tiles) {
      if (!inBounds(t.x, t.z)) continue;
      const now = (g.waterPipe[tileIndex(t.x, t.z)] ?? 0) === 1;
      if (now !== on && (!on || canLayPipe(g, t.x, t.z))) wouldChange += 1;
    }
    const cost = on ? wouldChange * WATER_PIPE_COST_PER_TILE : 0;
    if (on && !this.sandbox && !this.unlimitedMoney && cost > this.stats.funds) {
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };
    }

    const changed = layWaterPipe(g, tiles, on);
    if (changed.length === 0) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };

    this.waterPipeDirty = growRect(this.waterPipeDirty, changed);
    this.utilitiesDirty = true;
    return {
      ok: true,
      cost,
      inverse: [{ kind: 'layWaterPipe', tiles: changed, on: !on }],
    };
  }

  /** Landfill areas (office/entrance + dump route per 4-connected patch), cached between edits. */
  private landfillAreasFor(g: GridState): LandfillArea[] {
    if (this.landfillAreasCache === null) {
      this.landfillAreasCache = landfillAreas(MAP_SIZE, g.landfill, (x, z) =>
        inBounds(x, z) ? isStreetTier((g.roadTier[tileIndex(x, z)] ?? 0) as RoadTier) : false,
      );
    }
    return this.landfillAreasCache;
  }

  private cmdBuildRoad(
    requestedTier: RoadTier,
    tiles: TilePoint[],
    elevation = 0,
    exact?: number[],
    requestedProfile?: number,
    replace = false,
    exactFlows?: number[],
    layer?: 'over',
    arms: { join?: boolean; apart?: TileArms[] } = {},
  ): CommandResult {
    // The profile is the road's identity; the tier is its nearest preset and
    // is derived from it, so a composed profile cannot be laid under a tier it
    // is not. A preset's id is its tier.
    const profileId = requestedProfile ?? requestedTier;
    const tier = this.tierForProfileId(profileId);
    if (tier === null) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    const spec = this.roadSpecByTier.get(tier);
    if (!spec) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    // A road is priced as its SIZE plus whatever reserved lanes it carries, so
    // a street given a bus lane costs that street's price and a little more —
    // not the price of some other road that also happens to have one.
    const price = this.roadPriceForProfileId(profileId, spec);
    if (!this.sandbox && price.unlockMilestone > this.stats.milestoneLevel) {
      return { ok: false, cost: 0, inverse: [], reason: 'locked' };
    }
    if (layer === 'over') {
      return this.layOverRoads(tier, profileId, tiles, exact, exactFlows, price.costPerTile);
    }
    const refused = (reason: string): CommandResult => ({
      ok: false,
      cost: 0,
      inverse: [],
      reason,
    });

    const g = this.grid;
    // A road off the grid holds the tiles it covers; a grid road reaches one
    // only at a tile centre where the two meet.
    const intoFree = gridRunRefusal(g, this.roads, tiles);
    if (intoFree !== null) return refused(intoFree);
    const valid: TilePoint[] = [];
    const validElevations: number[] = [];
    const validFlows: number[] = [];
    const created: TilePoint[] = [];
    // Replaced roads, keyed by the profile they carried, so undo puts back the
    // road that was there and not merely one of the same tier.
    const upgradedByPrevProfile = new Map<
      number,
      { tier: RoadTier; tiles: TilePoint[]; apart?: TileArms[] }
    >();
    // Deck heights as they stood before this command, so undo can put them back
    // exactly rather than re-solving against a grid that may have moved on.
    const priorElevationByTile = new Map<number, number>();
    // Directions as they stood before this command, for the same reason.
    const priorFlowByTile = new Map<number, number>();
    // Tiles this command only re-profiles keep their road; grouped by the
    // profile they keep, so the inverse re-lays exactly that road at the old
    // deck height.
    const reprofiledByProfile = new Map<
      number,
      {
        tier: RoadTier;
        tiles: TilePoint[];
        elevations: number[];
        flows: number[];
        apart?: TileArms[];
      }
    >();
    // A road runs the way it was drawn: each tile points at the next one along
    // the drag, and the tile the drag ended on keeps the heading it arrived
    // with. An undo supplies the directions that were there instead.
    const dragFlows = flowsAlong(tiles);
    // Every tile this command puts its road on, with the flow it will carry,
    // for the join checks below.
    const laying = new Map<number, number>();
    // Tiles this drag passes OVER, each with the road it will lay there. They
    // stay out of `valid`: the road at ground level is not touched.
    const crossings = new Map<number, OverRoad>();
    // Tiles this drag passes UNDER: the raised road already there moves up
    // onto the over layer and the drag is laid on the ground layer beneath.
    const passingUnder: TilePoint[] = [];
    // Tiles already holding a road that this drag replaces or turns round,
    // with the flow each will carry, so no corridor half loses its partner.
    const rewritten: TilePoint[] = [];
    const rewrittenFlows: number[] = [];
    let changedCount = 0;
    let bridgeCost = 0;

    // Deck heights come first: the profile is solved over the WHOLE drag, in
    // drag order, because a tile's height depends on its neighbors' — and an
    // elevated tile is then judged by isBridgeBuildable rather than the ground
    // rules, which is what lets a span cross water at all.
    const profile = exact
      ? ({ ok: true, elevations: exact, cost: 0 } as const)
      : solveElevationProfile(g, tiles, elevation);
    if (!profile.ok) return { ok: false, cost: 0, inverse: [], reason: profile.reason };

    // A road never goes through a building, and it never quietly goes round
    // one either: laid with the building's tiles left out, it stands as two
    // pieces that join nothing, carry nothing, and read as one road.
    for (const t of tiles) {
      if (inBounds(t.x, t.z) && (g.buildingId[tileIndex(t.x, t.z)] ?? 0) !== 0) {
        return refused(ROAD_THROUGH_BUILDING);
      }
    }

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i]!;
      if (!inBounds(t.x, t.z)) continue;
      const idx = tileIndex(t.x, t.z);
      const current = (g.roadTier[idx] ?? 0) as RoadTier;
      const deck = profile.elevations[i] ?? 0;
      // Road-on-slope placement: a NEW road tile uses the road-specific
      // slope gate (ROAD_MAX_SLOPE, steeper than MAX_BUILD_SLOPE) since the
      // auto-flatten below re-levels/banks it right after. Upgrading
      // an existing road tile (current !== 0) skips the gate entirely — it's
      // already a road, already flattened once. An elevated tile answers to
      // neither: its deck rests on piers, clear of the ground.
      const buildable = deck > 0 ? isBridgeBuildable(g, t.x, t.z) : isRoadBuildable(g, t.x, t.z);
      if (current === 0 && !buildable) continue;
      const flow = exactFlows?.[i] ?? dragFlows[i] ?? RoadFlow.None;
      // A tile that already holds a road, crossed by a deck at another height:
      // an overpass if the deck clears it and crosses cleanly, refused if not.
      // A deck at the road's own height meets it, the way roads always have.
      if (current !== 0) {
        const below = g.roadElevation[idx] ?? 0;
        // A road below counts only where the road on this tile is joined to
        // it: a second carriageway alongside is its own road, not a junction.
        const joined = g.roadMask[idx] ?? 0;
        const shape = crossingShape(
          tiles,
          i,
          (x, z) => this.roadAtLevel(x, z, below) && (joined & bitToward(x - t.x, z - t.z)) !== 0,
        );
        if (shape !== 'along' && deck < below) {
          const needed = overpassRise(current, tier);
          if (below - deck < needed) {
            return refused(`The road above has to clear this one by ${needed.toFixed(1)} m`);
          }
          const straightAcross = 'A road passes under another straight across, at right angles';
          if (shape === 'skew') return refused(straightAcross);
          // Straight across, so the drag carries on either side of this tile,
          // and the road above has to run the other way.
          const aboveAxis = tiles[i - 1]!.z === t.z ? 'z' : 'x';
          if (axisOfFlow(g.roadFlow[idx] ?? RoadFlow.None) !== aboveAxis) {
            return refused(straightAcross);
          }
          if (overRoadAt(g, idx)) return refused('A tile holds two roads at most');
          if (deck === 0 && !isRoadBuildable(g, t.x, t.z)) {
            return refused('The ground under that road is too steep for another');
          }
          passingUnder.push(t);
          valid.push(t);
          validElevations.push(deck);
          validFlows.push(flow);
          laying.set(idx, flow);
          changedCount += 1;
          continue;
        }
        if (shape !== 'along' && deck > below) {
          const needed = overpassRise(tier, current);
          if (deck - below < needed) {
            return refused(`An overpass has to clear the road below by ${needed.toFixed(1)} m`);
          }
          if (shape === 'skew') {
            return refused('An overpass crosses straight over a road, at right angles');
          }
          const road: OverRoad = { tier, profile: profileId, flow, elevation: deck };
          if (overRoadChanges(overRoadAt(g, idx), road, replace)) {
            crossings.set(idx, road);
            changedCount += 1;
            bridgeCost += deck * BRIDGE_COST_PER_METER_TILE;
          }
          continue;
        }
      }
      const above = overRoadAt(g, idx);
      if (above && above.elevation - deck < overpassRise(above.tier, tier)) {
        return refused('That would run into the overpass above');
      }
      valid.push(t);
      validElevations.push(deck);
      validFlows.push(flow);
      const priorDeck = g.roadElevation[idx] ?? 0;
      const priorFlow = g.roadFlow[idx] ?? RoadFlow.None;
      const prevProfile = g.roadProfile[idx] || current;
      // A road is replaced by one ABOVE it in the hierarchy, or by a different
      // composition of the same road; the same road again only ever re-profiles
      // its deck. Replace mode lands whatever the drag draws, lesser included.
      const outranks = tierOutranks(tier, current);
      const replaces = replace
        ? current !== tier || prevProfile !== profileId
        : outranks || (current === tier && current !== 0 && prevProfile !== profileId);
      if (deck !== priorDeck) bridgeCost += deck * BRIDGE_COST_PER_METER_TILE;
      // A tile whose road is unchanged but whose deck moved, or which now runs
      // the other way, still changed — count it so a pure re-drag is not
      // mistaken for a no-op, and remember what to put back.
      if (!replaces && current !== 0 && (deck !== priorDeck || flow !== priorFlow)) {
        changedCount += 1;
        const group = reprofiledByProfile.get(prevProfile) ?? {
          tier: current,
          tiles: [],
          elevations: [],
          flows: [],
        };
        group.tiles.push(t);
        group.elevations.push(priorDeck);
        group.flows.push(priorFlow);
        reprofiledByProfile.set(prevProfile, group);
      }
      if (current !== 0 && (replaces || (prevProfile === profileId && flow !== priorFlow))) {
        rewritten.push(t);
        rewrittenFlows.push(flow);
      }
      if (replaces) {
        changedCount += 1;
        laying.set(idx, flow);
        priorElevationByTile.set(idx, priorDeck);
        priorFlowByTile.set(idx, priorFlow);
        if (current === 0) {
          created.push(t);
        } else {
          const group = upgradedByPrevProfile.get(prevProfile) ?? { tier: current, tiles: [] };
          group.tiles.push(t);
          upgradedByPrevProfile.set(prevProfile, group);
        }
      }
    }

    const groundAt =
      (layer: Uint8Array | Uint16Array) =>
      (x: number, z: number): number =>
        inBounds(x, z) ? (layer[tileIndex(x, z)] ?? 0) : 0;
    const split = corridorSplitRefusal(rewritten, rewrittenFlows, (x, z) =>
      corridorPartnerTile(x, z, groundAt(g.roadFlow), groundAt(g.roadProfile)),
    );
    if (split) return refused(split);

    const joinRefused = this.joinRefusalAround(laying, profileId, crossings, passingUnder);
    if (joinRefused) return { ok: false, cost: 0, inverse: [], reason: joinRefused };

    if (changedCount === 0) {
      return {
        ok: valid.length > 0,
        cost: 0,
        inverse: [],
        reason: valid.length > 0 ? undefined : 'invalid',
      };
    }

    const cost = changedCount * price.costPerTile + bridgeCost;
    if (!this.unlimitedMoney && this.stats.funds < cost)
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };

    // What this command lays decides the arms of those tiles, and what was
    // held apart there before is what its undo puts back.
    // A raised road the drag passes under is put back on the ground layer by
    // undo, exactly as it stands now.
    const passedUnder = new Map<
      number,
      {
        tier: RoadTier;
        tiles: TilePoint[];
        elevations: number[];
        flows: number[];
        apart?: TileArms[];
      }
    >();
    for (const t of passingUnder) {
      const idx = tileIndex(t.x, t.z);
      const tierAbove = (g.roadTier[idx] ?? 0) as RoadTier;
      const profileAbove = g.roadProfile[idx] || tierAbove;
      const group = passedUnder.get(profileAbove) ?? {
        tier: tierAbove,
        tiles: [],
        elevations: [],
        flows: [],
      };
      group.tiles.push(t);
      group.elevations.push(g.roadElevation[idx] ?? 0);
      group.flows.push(g.roadFlow[idx] ?? RoadFlow.None);
      passedUnder.set(profileAbove, group);
    }
    for (const group of [
      ...upgradedByPrevProfile.values(),
      ...reprofiledByProfile.values(),
      ...passedUnder.values(),
    ]) {
      group.apart = armsApartOn(g, group.tiles);
    }
    const laid = [
      ...laying.keys(),
      ...[...reprofiledByProfile.values()].flatMap((group) =>
        group.tiles.map((t) => tileIndex(t.x, t.z)),
      ),
    ];
    if (arms.apart) {
      holdArmsApart(g, laid, arms.apart);
    } else {
      const drag = new Set([...valid.map((t) => tileIndex(t.x, t.z)), ...crossings.keys()]);
      settleArms(g, laid, drag, arms.join ?? true);
    }

    // The roads passing over go down first, so the masks the ground road
    // recomputes already know which way each crossing tile's roads run.
    const inverse: Command[] = this.applyCrossings(crossings);
    // The raised roads this drag passes under go up onto the over layer, as
    // they stand, before the drag is laid in the ground layer they leave.
    for (const t of passingUnder) liftToOverLayer(g, tileIndex(t.x, t.z));
    const deltas = applyRoad(g, valid, tier, validElevations, profileId, replace, validFlows);
    for (const d of deltas) this.recordRoadDelta(d);
    this.overLayerChanged(passingUnder.map((t) => tileIndex(t.x, t.z)));
    this.landfillAreasCache = null; // street layout feeds the landfill entrances
    this.invalidateAround(valid);
    this.zoneDirty = growRect(this.zoneDirty, valid); // roads de-zone their tiles
    this.stats.funds -= cost;
    const rebuilt = [
      ...created,
      ...Array.from(upgradedByPrevProfile.values(), (group) => group.tiles).flat(),
    ];
    // Where the drag passed under a raised road, that road is on top now, and
    // a bulldoze takes the road on top first: it goes before the drag does.
    if (passingUnder.length > 0) {
      inverse.push({ kind: 'bulldoze', tiles: passingUnder, layer: 'over' });
    }
    if (rebuilt.length + passingUnder.length > 0) {
      inverse.push({ kind: 'bulldoze', tiles: [...rebuilt, ...passingUnder] });
    }
    for (const [prevProfile, group] of upgradedByPrevProfile) {
      inverse.push({
        kind: 'buildRoad',
        tier: group.tier,
        tiles: group.tiles,
        elevations: group.tiles.map((t) => priorElevationByTile.get(tileIndex(t.x, t.z)) ?? 0),
        flows: group.tiles.map((t) => priorFlowByTile.get(tileIndex(t.x, t.z)) ?? RoadFlow.None),
        profile: prevProfile,
        ...heldApart(group.apart),
      });
    }
    for (const [profileAbove, group] of passedUnder) {
      inverse.push({
        kind: 'buildRoad',
        tier: group.tier,
        tiles: group.tiles,
        elevations: group.elevations,
        flows: group.flows,
        profile: profileAbove,
        ...heldApart(group.apart),
      });
    }
    // Tiles this command only re-profiled keep their road on undo; restoring
    // their old deck and what they were joined to is the entire reversal.
    for (const [prevProfile, group] of reprofiledByProfile) {
      inverse.push({
        kind: 'buildRoad',
        tier: group.tier,
        tiles: group.tiles,
        elevations: group.elevations,
        flows: group.flows,
        profile: prevProfile,
        ...heldApart(group.apart),
      });
    }
    // Auto-flatten: the newly built/upgraded tiles + a 1-tile apron. Elevated
    // tiles are exempt — the deck spans the ground, it does not sit on it, and
    // levelling a riverbed under a bridge would drain the river.
    const grounded = rebuilt.filter((t) => (g.roadElevation[tileIndex(t.x, t.z)] ?? 0) === 0);
    this.flattenFootprint(grounded, true, inverse);
    return { ok: true, cost, inverse };
  }

  /**
   * Lays one road off the grid. Every rule is `planSegment`'s; this prices it,
   * lays it and hands back the command that takes exactly it away.
   */
  private cmdBuildSegment(command: Extract<Command, { kind: 'buildSegment' }>): CommandResult {
    const profileId = command.profile ?? command.tier;
    const tier = this.tierForProfileId(profileId);
    const spec = tier === null ? undefined : this.roadSpecByTier.get(tier);
    if (tier === null || !spec) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    const price = this.roadPriceForProfileId(profileId, spec);
    if (!this.sandbox && price.unlockMilestone > this.stats.milestoneLevel) {
      return { ok: false, cost: 0, inverse: [], reason: 'locked' };
    }
    const req = {
      tier,
      profileId,
      a: command.a,
      b: command.b,
      control: command.control ?? null,
      flow: command.flow ?? 0,
    };
    const lookup = (id: number): RoadProfile | null => this.profileForId(id);
    const plan = planSegment(this.grid, this.roads, req, lookup);
    if (!plan.ok) return { ok: false, cost: 0, inverse: [], reason: plan.reason };
    const cost = Math.round((plan.lengthM / TILE_METERS) * price.costPerTile);
    if (!this.unlimitedMoney && this.stats.funds < cost) {
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };
    }
    laySegment(this.grid, this.roads, plan, req);
    this.stats.funds -= cost;
    this.roadsEdited = true;
    const inverse: Command = { kind: 'removeSegment', a: command.a, b: command.b };
    if (command.control) inverse.control = command.control;
    return { ok: true, cost, inverse: [inverse] };
  }

  /** Cuts a road off the grid in two at a point on it; free, and undone by joining. */
  private cmdSplitSegment(at: { x: number; z: number }): CommandResult {
    const rp = nearestRoadPoint(this.roads, at, SPLIT_MATCH_M);
    if (!rp) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    const refusal = splitRefusal(this.roads, { ...rp, at });
    if (refusal) return { ok: false, cost: 0, inverse: [], reason: refusal };
    const control = segmentGeom(this.roads, rp.seg).control;
    splitSegment(this.roads, { ...rp, at });
    this.roadsEdited = true;
    const inverse: Command = { kind: 'joinSegments', at };
    if (control) inverse.control = control;
    return { ok: true, cost: 0, inverse: [inverse] };
  }

  /** Joins two roads off the grid back into one; free, and undone by splitting. */
  private cmdJoinSegments(
    at: { x: number; z: number },
    control: { x: number; z: number } | null,
  ): CommandResult {
    if (!joinSegmentsAt(this.roads, at, control)) {
      return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    }
    this.roadsEdited = true;
    return { ok: true, cost: 0, inverse: [{ kind: 'splitSegment', at }] };
  }

  /** Moves the end of a road off the grid a short way, as `moveRoadEnd` plans it; free, and undone by moving it back. */
  private cmdMoveSegmentEnd(
    from: { x: number; z: number },
    to: { x: number; z: number },
  ): CommandResult {
    const moved = moveRoadEnd(this.grid, this.roads, { from, to }, (id) => this.profileForId(id));
    if (!moved.ok) return { ok: false, cost: 0, inverse: [], reason: moved.reason };
    this.roadsEdited = true;
    return { ok: true, cost: 0, inverse: [{ kind: 'moveSegmentEnd', from: to, to: from }] };
  }

  /** Takes away one road off the grid, refunding what bulldozing a road refunds. */
  private cmdRemoveSegment(
    a: { x: number; z: number },
    b: { x: number; z: number },
    control: { x: number; z: number } | null,
  ): CommandResult {
    const lengthM = segmentLengthM({ a, b, control });
    const removed = removeSegmentAt(this.roads, a, b, control);
    if (!removed) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    const spec = this.roadSpecByTier.get(removed.tier);
    const perTile = spec ? this.roadPriceForProfileId(removed.profileId, spec).costPerTile : 0;
    const refund = Math.round((lengthM / TILE_METERS) * perTile * BULLDOZE_REFUND_RATE);
    this.stats.funds += refund;
    this.roadsEdited = true;
    const inverse: Command = {
      kind: 'buildSegment',
      tier: removed.tier,
      profile: removed.profileId,
      a,
      b,
      flow: removed.flow,
    };
    if (control) inverse.control = control;
    return { ok: true, cost: -refund, inverse: [inverse] };
  }

  private cmdBulldoze(tiles: TilePoint[], layer?: 'over'): CommandResult {
    const g = this.grid;
    const reachable = tiles.filter((t) => inBounds(t.x, t.z));
    // The road on top goes first: on a crossing tile a bulldoze takes the road
    // passing over and leaves the one beneath, which a second pass removes.
    const layerOf = (flow: ArrayLike<number>, profile: ArrayLike<number>): RoadLayerReader => ({
      flowAt: (x, z) => (inBounds(x, z) ? (flow[tileIndex(x, z)] ?? 0) : 0),
      profileIdAt: (x, z) => (inBounds(x, z) ? (profile[tileIndex(x, z)] ?? 0) : 0),
    });
    const reach = bulldozeReach(
      reachable,
      layerOf(g.overFlow, g.overProfile),
      layerOf(g.roadFlow, g.roadProfile),
      layer === 'over',
    );
    if (reach.refusal) return { ok: false, cost: 0, inverse: [], reason: reach.refusal };
    const crossing = reach.over;
    const lifted = this.removeOverRoads(crossing);
    // Only the tiles asked for are cleared of what stands beside the road; a
    // corridor partner brought in loses its road and nothing else.
    const asked = new Set(reachable.map((t) => tileIndex(t.x, t.z)));
    const inBoundsTiles = reach.ground;
    const clearedTiles = inBoundsTiles.filter((t) => asked.has(tileIndex(t.x, t.z)));
    if (inBoundsTiles.length === 0) {
      if (crossing.length === 0) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
      this.stats.funds += lifted.refund;
      return { ok: true, cost: -lifted.refund, inverse: lifted.inverse };
    }

    // A roundabout is one junction on four tiles, so taking any of its tiles
    // takes it out whole; undo lays the road back and then the roundabout.
    const rings = new Map<number, RoundaboutBlock>();
    for (const t of inBoundsTiles) {
      const ring = this.ringAt(t.x, t.z);
      if (ring) rings.set(tileIndex(ring.x, ring.z), ring);
    }
    for (const ring of rings.values()) {
      for (const t of blockTiles(ring)) {
        this.writeJunctionState(t, { control: null, turns: 0, laneTurns: [0, 0, 0, 0] });
      }
    }

    // Capture pre-state for the inverse before anything mutates.
    const zonesByType = new Map<number, TilePoint[]>();
    // Keyed by profile id, so undo puts back the road that was there — a
    // composed street, not merely a road of the same tier.
    const roadsByProfile = new Map<
      number,
      {
        tier: RoadTier;
        tiles: TilePoint[];
        flows: number[];
        elevations: number[];
        apart?: TileArms[];
      }
    >();
    // A junction the player set keeps its setting through an undo: the road
    // comes back, so what they decided about it comes back with it.
    const setJunctions: { x: number; z: number; control: JunctionControl | null }[] = [];
    for (const t of inBoundsTiles) {
      const idx = tileIndex(t.x, t.z);
      const control = controlFromCode(g.junctionControl[idx] ?? 0);
      if (control !== null) setJunctions.push({ x: t.x, z: t.z, control });
      const zone = g.zone[idx] ?? 0;
      if (zone !== ZoneType.None) {
        const list = zonesByType.get(zone) ?? [];
        list.push(t);
        zonesByType.set(zone, list);
      }
      const tier = (g.roadTier[idx] ?? 0) as RoadTier;
      if (tier !== 0) {
        const profileId = g.roadProfile[idx] || tier;
        const group = roadsByProfile.get(profileId) ?? {
          tier,
          tiles: [],
          flows: [],
          elevations: [],
        };
        group.tiles.push(t);
        group.flows.push(g.roadFlow[idx] ?? RoadFlow.None);
        group.elevations.push(g.roadElevation[idx] ?? 0);
        roadsByProfile.set(profileId, group);
      }
    }

    let refund = 0;

    // What was held apart goes back with the road.
    for (const group of roadsByProfile.values()) group.apart = armsApartOn(g, group.tiles);

    // Roads first, via removeRoad, so neighbor masks are recomputed properly.
    const roadDeltas = removeRoad(g, inBoundsTiles);
    this.landfillAreasCache = null; // street layout feeds the landfill entrances
    for (const d of roadDeltas) this.recordRoadDelta(d);
    for (const { tier, tiles: roadTiles } of roadsByProfile.values()) {
      const spec = this.roadSpecByTier.get(tier);
      if (spec) refund += spec.costPerTile * roadTiles.length * BULLDOZE_REFUND_RATE;
    }

    // Then zones/trees/buildings via clearTiles + registry removal.
    const cleared = clearTiles(g, clearedTiles);
    const inverse: Command[] = [];
    for (const [
      profileId,
      { tier, tiles: roadTiles, flows, elevations, apart },
    ] of roadsByProfile) {
      inverse.push({
        kind: 'buildRoad',
        tier,
        tiles: roadTiles,
        elevations,
        flows,
        profile: profileId,
        ...heldApart(apart),
      });
    }
    // After the roads, so the tile is a junction again by the time this lands.
    for (const ring of rings.values())
      inverse.push({ kind: 'buildRoundabout', x: ring.x, z: ring.z });
    for (const j of setJunctions) inverse.push({ kind: 'setJunctionControl', ...j });
    for (const [zone, zoneTiles] of zonesByType) {
      inverse.push({ kind: 'paintZone', zone: zone as ZoneType, tiles: zoneTiles, restore: true });
    }
    for (const id of cleared.buildingIds) {
      const inst = this.registry.remove(g, id);
      if (!inst) continue;
      this.buildingsRemoved.push(id);
      const entry = this.catalogById.get(inst.catalogId);
      if (entry) refund += entry.cost * BULLDOZE_REFUND_RATE;
      inverse.push({
        kind: 'placeBuilding',
        catalogId: inst.catalogId,
        x: inst.x,
        z: inst.z,
        rotation: inst.rotation,
      });
    }

    // Power line last: the bulldozer takes down the wire over the tiles it
    // clears, and the undo strings back exactly the run that was there.
    const pulledDown = stringPowerLine(g, clearedTiles, false);
    if (pulledDown.length > 0) {
      refund += pulledDown.length * POWER_LINE_COST_PER_TILE * BULLDOZE_REFUND_RATE;
      this.powerLineDirty = growRect(this.powerLineDirty, pulledDown);
      inverse.push({ kind: 'stringPowerLine', tiles: pulledDown, on: true });
    }
    // And the pipe under them, the same way.
    const pulledUp = layWaterPipe(g, clearedTiles, false);
    if (pulledUp.length > 0) {
      refund += pulledUp.length * WATER_PIPE_COST_PER_TILE * BULLDOZE_REFUND_RATE;
      this.waterPipeDirty = growRect(this.waterPipeDirty, pulledUp);
      inverse.push({ kind: 'layWaterPipe', tiles: pulledUp, on: true });
    }

    inverse.push(...lifted.inverse);
    refund += lifted.refund;

    this.invalidateAround(inBoundsTiles);
    this.zoneDirty = growRect(this.zoneDirty, inBoundsTiles);
    this.utilitiesDirty = true;
    this.stats.funds += refund;
    return { ok: true, cost: -refund, inverse };
  }

  private cmdPaintZone(zone: ZoneType, tiles: TilePoint[], restore = false): CommandResult {
    const g = this.grid;
    const prevZones = new Map<number, number>(); // tile index -> pre-paint zone
    for (const t of tiles) {
      if (!inBounds(t.x, t.z)) continue;
      const idx = tileIndex(t.x, t.z);
      prevZones.set(idx, g.zone[idx] ?? 0);
    }

    const applied = setZones(g, tiles, zone, restore);
    if (applied.length === 0) {
      // A zone changes only empty land: a building keeps the zone it grew on
      // for life. A repaint over a built-up block changes nothing, and says so
      // rather than reading as a stroke that missed.
      const built =
        zone !== ZoneType.None &&
        tiles.some((t) => inBounds(t.x, t.z) && (g.buildingId[tileIndex(t.x, t.z)] ?? 0) !== 0);
      return { ok: false, cost: 0, inverse: [], reason: built ? ZONE_UNDER_BUILDINGS : 'invalid' };
    }

    const byPrevZone = new Map<number, TilePoint[]>();
    for (const t of applied) {
      const prev = prevZones.get(tileIndex(t.x, t.z)) ?? 0;
      if (prev === zone) continue;
      const list = byPrevZone.get(prev) ?? [];
      list.push(t);
      byPrevZone.set(prev, list);
    }
    const inverse: Command[] = [];
    for (const [prevZone, zoneTiles] of byPrevZone) {
      inverse.push({
        kind: 'paintZone',
        zone: prevZone as ZoneType,
        tiles: zoneTiles,
        restore: true,
      });
    }

    this.zoneDirty = growRect(this.zoneDirty, applied);
    return { ok: true, cost: 0, inverse };
  }

  /**
   * Whether a w×d footprint at (x, z) comes within `entry.spacing` clear tiles
   * of another standing building of the same entry, in any direction.
   */
  private crowdsItsKind(
    entry: BuildingCatalogEntry,
    x: number,
    z: number,
    w: number,
    d: number,
  ): boolean {
    const gap = entry.spacing ?? 0;
    for (const other of this.registry.all()) {
      if (other.catalogId !== entry.id) continue;
      const theirs = footprintForRotation(entry, other.rotation);
      const dx = Math.max(other.x - (x + w), x - (other.x + theirs.w));
      const dz = Math.max(other.z - (z + d), z - (other.z + theirs.d));
      // dx and dz are the clear tiles between the two footprints on each axis,
      // negative where they overlap on that axis.
      if (Math.max(dx, dz) < gap) return true;
    }
    return false;
  }

  private cmdPlaceBuilding(
    catalogId: string,
    x: number,
    z: number,
    rotation: 0 | 1 | 2 | 3,
  ): CommandResult {
    const entry = this.catalogById.get(catalogId);
    if (!entry) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    if (!this.sandbox && entry.unlockMilestone > this.stats.milestoneLevel) {
      return { ok: false, cost: 0, inverse: [], reason: 'locked' };
    }
    if (!this.unlimitedMoney && this.stats.funds < entry.cost)
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };

    const { w, d } = footprintForRotation(entry, rotation);
    if (!canPlaceFootprint(this.grid, x, z, w, d)) {
      return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    }
    // A station has to touch the track it serves; everything else goes anywhere
    // buildable, exactly as before.
    if (entry.requiresAdjacent === 'rail' && !hasAdjacentTier(this.grid, x, z, w, d, isRailTier)) {
      return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    }
    // An intake or an outfall stands on a shore: its footprint on land, the
    // water it draws from or empties into orthogonally beside it.
    if (entry.requiresAdjacent === 'water' && !hasAdjacentWater(this.grid, x, z, w, d)) {
      return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    }
    // A turbine keeps its rotor out of its neighbour's: nothing of the same
    // entry within its spacing, in any direction.
    if (entry.spacing !== undefined && this.crowdsItsKind(entry, x, z, w, d)) {
      return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    }
    const inst = this.registry.place(this.grid, entry, x, z, rotation);
    if (!inst) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };

    this.stats.funds -= entry.cost;
    this.buildingsAdded.push(inst);
    this.utilitiesDirty = true;

    const footprint = footprintTiles(x, z, w, d);
    this.invalidateAround(footprint);
    const inverse: Command[] = [{ kind: 'bulldoze', tiles: footprint }];
    // Auto-flatten: the whole footprint, no apron.
    this.flattenFootprint(footprint, false, inverse);
    return { ok: true, cost: entry.cost, inverse };
  }

  /**
   * Landscaping brush: computes the kernel patch, funds-gates it like
   * every other edit, commits it, and queues it for the next snapshot's
   * heightPatches. The ack inverse is a terraformSet restore of the PREVIOUS
   * heights, so undo is exact to the float.
   */
  /** Writes new heights, and the soil they reshape with them. */
  private applyHeights(patch: HeightPatch): void {
    applyHeightPatch(this.grid, patch);
    regradeSoil(this.grid, this.seed, patch.x, patch.z, patch.w, patch.h);
  }

  private cmdTerraform(command: TerraformCommand): CommandResult {
    const result = computeTerraformPatch(this.grid, command);
    if (!result) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    if (!this.unlimitedMoney && this.stats.funds < result.cost)
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };

    this.applyHeights(result.patch);
    this.stats.funds -= result.cost;
    this.pendingHeightPatches.push(result.patch);

    const inverse: Command = {
      kind: 'terraformSet',
      x: result.inverse.x,
      z: result.inverse.z,
      w: result.inverse.w,
      h: result.inverse.h,
      heights: result.inverse.heights,
    };
    return { ok: true, cost: result.cost, inverse: [inverse] };
  }

  /**
   * Undo/redo path: applies the given heights directly (no kernel, no
   * cost) and acks with the exact counter-patch — the heights this call is
   * about to overwrite, captured before the write — so redoing/undoing again
   * stays exact.
   */
  private cmdTerraformSet(command: TerraformSetCommand): CommandResult {
    const before = readHeightPatch(this.grid, command.x, command.z, command.w, command.h);
    const forward: HeightPatch = {
      x: command.x,
      z: command.z,
      w: command.w,
      h: command.h,
      heights: command.heights,
    };
    this.applyHeights(forward);
    this.pendingHeightPatches.push(forward);

    const inverse: Command = {
      kind: 'terraformSet',
      x: before.x,
      z: before.z,
      w: before.w,
      h: before.h,
      heights: before.heights,
    };
    return { ok: true, cost: 0, inverse: [inverse] };
  }

  /**
   * Building auto-flatten: the residual terrain "diamond" poking through a
   * building footprint on sloped ground is killed by leveling the footprint
   * to a single height — the mean of the covered tiles' current heights —
   * same HeightPatch shape as terraform, so the terrain mesh + zonegrid
   * conform flat under the building.
   *
   * A tile's height is the terrain vertex at its north-west corner, so the
   * footprint's own tiles only reach the vertices along its north and west
   * edges; the ones along its south and east edges belong to the tiles one
   * past it. Those are levelled too where open ground owns them, so the
   * whole surface under the footprint is one plane; a vertex a road, another
   * building or water owns keeps its height, since moving it would tilt a
   * road, unseat a neighbour or move a shoreline.
   *
   * `tiles` are the whole footprint (already verified buildable by the
   * caller). Returns null (no patch, nothing to do) when the covered set is
   * empty or every levelled tile's height already equals the mean bit-for-bit.
   */
  private computeFlattenPatch(tiles: TilePoint[]): HeightPatch | null {
    const g = this.grid;
    const covered = new Map<number, TilePoint>();
    for (const t of tiles) {
      if (!inBounds(t.x, t.z)) continue;
      covered.set(tileIndex(t.x, t.z), t);
    }
    if (covered.size === 0) return null;

    let sum = 0;
    for (const idx of covered.keys()) sum += g.height[idx]!;
    const mean = sum / covered.size;

    const footprint = growRect(null, Array.from(covered.values()));
    if (!footprint) return null;
    const levelled = new Set<number>(covered.keys());
    const ownedByOpenGround = (x: number, z: number): boolean => {
      if (!inBounds(x, z)) return false;
      const i = tileIndex(x, z);
      return (
        !covered.has(i) &&
        g.roadTier[i] === RoadTier.None &&
        g.overTier[i] === RoadTier.None &&
        g.roadFootprint[i] === 0 &&
        g.buildingId[i] === 0 &&
        g.water[i] === 0
      );
    };
    for (let z = footprint.minZ; z <= footprint.maxZ + 1; z++) {
      if (ownedByOpenGround(footprint.maxX + 1, z)) levelled.add(tileIndex(footprint.maxX + 1, z));
    }
    for (let x = footprint.minX; x <= footprint.maxX; x++) {
      if (ownedByOpenGround(x, footprint.maxZ + 1)) levelled.add(tileIndex(x, footprint.maxZ + 1));
    }

    const rect = growRect(
      null,
      Array.from(levelled, (i) => ({ x: i % MAP_SIZE, z: Math.floor(i / MAP_SIZE) })),
    )!;
    const w = rect.maxX - rect.minX + 1;
    const h = rect.maxZ - rect.minZ + 1;
    const heights = new Float32Array(w * h);
    let changed = false;
    for (let row = 0; row < h; row++) {
      const z = rect.minZ + row;
      for (let col = 0; col < w; col++) {
        const x = rect.minX + col;
        const idx = tileIndex(x, z);
        const local = row * w + col;
        if (levelled.has(idx)) {
          heights[local] = mean;
          if (mean !== g.height[idx]!) changed = true;
        } else {
          heights[local] = g.height[idx]!;
        }
      }
    }
    if (!changed) return null;

    return { x: rect.minX, z: rect.minZ, w, h, heights };
  }

  /**
   * Road auto-grade: instead of flattening a run to one plateau (which makes
   * intersecting runs on a slope meet at different heights and lets grass poke
   * through the lower road), each road tile is box-smoothed toward the road
   * network around it so a climbing run stays a smooth ramp and a run touching
   * existing road blends toward it at the junction. The shoulder apron is only
   * ever pulled DOWN to at most the road it borders — never raised above it,
   * which was the poke-through bug.
   *
   * All new heights are computed from the CURRENT grid heights in one pass
   * (no value written this pass is ever read back), so the result is
   * order-independent and deterministic. Same HeightPatch shape as
   * computeFlattenPatch. Returns null when nothing actually changes.
   */
  private computeRoadGradePatch(roadTiles: TilePoint[]): HeightPatch | null {
    const g = this.grid;

    // R: the in-bounds road tiles just built/upgraded by this command.
    const rSet = new Map<number, TilePoint>();
    for (const t of roadTiles) {
      if (!inBounds(t.x, t.z)) continue;
      rSet.set(tileIndex(t.x, t.z), t);
    }
    if (rSet.size === 0) return null;

    // A tile provides road continuity if it is in R or already carries road —
    // but a tile up on a deck does not. Its ground is a riverbed or a valley
    // floor that no road ever touches, and averaging a bank into it would drag
    // the shoreline down into the water the bridge was built to cross.
    const isRoadSource = (x: number, z: number): boolean => {
      const idx = tileIndex(x, z);
      if ((g.roadElevation[idx] ?? 0) > 0) return false;
      return rSet.has(idx) || g.roadTier[idx] !== RoadTier.None;
    };

    // Box-smooth each road tile toward its road-source neighbors.
    const newHeight = new Map<number, number>();
    for (const [idx, t] of rSet) {
      let sum = g.height[idx]!;
      let count = 1;
      for (const [ox, oz] of APRON_NEIGHBOR_OFFSETS) {
        const nx = t.x + ox;
        const nz = t.z + oz;
        if (!inBounds(nx, nz)) continue;
        if (!isRoadSource(nx, nz)) continue;
        sum += g.height[tileIndex(nx, nz)]!;
        count += 1;
      }
      newHeight.set(idx, sum / count);
    }

    // Apron ring: grass tiles bordering R (never water/road/building). Each is
    // pulled down to at most the highest road height it borders, never raised.
    const apron = new Map<number, TilePoint>();
    for (const t of rSet.values()) {
      for (const [ox, oz] of APRON_NEIGHBOR_OFFSETS) {
        const nx = t.x + ox;
        const nz = t.z + oz;
        if (!inBounds(nx, nz)) continue;
        const idx = tileIndex(nx, nz);
        if (rSet.has(idx)) continue;
        if (g.water[idx] !== 0) continue;
        if (g.roadTier[idx] !== RoadTier.None) continue;
        if (g.buildingId[idx] !== 0) continue;
        apron.set(idx, { x: nx, z: nz });
      }
    }
    for (const [idx, a] of apron) {
      let m = -Infinity;
      for (const [ox, oz] of APRON_NEIGHBOR_OFFSETS) {
        const nx = a.x + ox;
        const nz = a.z + oz;
        if (!inBounds(nx, nz)) continue;
        const nIdx = tileIndex(nx, nz);
        if (!rSet.has(nIdx)) continue;
        m = Math.max(m, newHeight.get(nIdx)!);
      }
      if (m === -Infinity) continue; // borders no R tile — leave unchanged
      newHeight.set(idx, Math.min(g.height[idx]!, m));
    }

    // Bounding rect over R ∪ apron; unmodified tiles keep their current height.
    const modified: TilePoint[] = [...rSet.values(), ...apron.values()];
    const rect = growRect(null, modified);
    if (!rect) return null;
    const w = rect.maxX - rect.minX + 1;
    const h = rect.maxZ - rect.minZ + 1;
    const heights = new Float32Array(w * h);
    let changed = false;
    for (let row = 0; row < h; row++) {
      const z = rect.minZ + row;
      for (let col = 0; col < w; col++) {
        const x = rect.minX + col;
        const idx = tileIndex(x, z);
        const local = row * w + col;
        const nh = newHeight.get(idx);
        if (nh !== undefined) {
          heights[local] = nh;
          if (nh !== g.height[idx]!) changed = true;
        } else {
          heights[local] = g.height[idx]!;
        }
      }
    }
    if (!changed) return null;

    return { x: rect.minX, z: rect.minZ, w, h, heights };
  }

  /**
   * Commits the auto-flatten patch (if any) for a just-built
   * footprint: mutates the grid via the same `applyHeightPatch` path as
   * terraform (re-deriving water/trees), queues it for the next
   * snapshot's heightPatches, and appends the exact pre-flatten
   * `terraformSet` restore to `inverse` — composed with the caller's own
   * bulldoze/rebuild inverse — so undo replays the structure removal AND the
   * terrain restore. No-op when `computeFlattenPatch` finds nothing to do.
   */
  private flattenFootprint(tiles: TilePoint[], apron: boolean, inverse: Command[]): void {
    const patch = apron ? this.computeRoadGradePatch(tiles) : this.computeFlattenPatch(tiles);
    if (!patch) return;

    const prev = readHeightPatch(this.grid, patch.x, patch.z, patch.w, patch.h);
    this.applyHeights(patch);
    this.pendingHeightPatches.push(patch);

    inverse.push({
      kind: 'terraformSet',
      x: prev.x,
      z: prev.z,
      w: prev.w,
      h: prev.h,
      heights: prev.heights,
    });
  }

  private invalidateAround(tiles: TilePoint[]): void {
    const rect = growRect(null, tiles);
    if (!rect) return;
    this.network.invalidateRegion(rect.minX - 1, rect.minZ - 1, rect.maxX + 1, rect.maxZ + 1);
    this.railNetwork.invalidateRegion(rect.minX - 1, rect.minZ - 1, rect.maxX + 1, rect.maxZ + 1);
    this.tramNetwork.invalidateRegion(rect.minX - 1, rect.minZ - 1, rect.maxX + 1, rect.maxZ + 1);
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function createWorkerSim(post: WorkerPost): WorkerSim {
  return new SimWorld(post);
}

// ---------------------------------------------------------------------------
// Worker bootstrap — only inside a real dedicated worker scope (never during
// unit tests or an accidental main-thread import).
// ---------------------------------------------------------------------------

interface WorkerScopeLike {
  postMessage(msg: WorkerToMain, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<MainToWorker>) => void) | null;
}

if (typeof WorkerGlobalScope !== 'undefined' && typeof postMessage === 'function') {
  const scope = globalThis as unknown as WorkerScopeLike;
  const sim = createWorkerSim((msg, transfer) => {
    if (transfer) scope.postMessage(msg, transfer);
    else scope.postMessage(msg);
  });
  scope.onmessage = (ev) => sim.handleMessage(ev.data);
  setInterval(() => sim.pump(TICK_MS), TICK_MS);
}
