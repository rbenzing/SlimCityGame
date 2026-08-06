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
  START_FUNDS,
  SPEED_MULTIPLIERS,
  TICK_MS,
  TICK_RATE,
  SNAPSHOT_HZ,
  GARBAGE_PERIOD,
  GARBAGE_OFFSET,
  LANDFILL_PAINT_COST_PER_TILE,
  inBounds,
  tileIndex,
} from '../shared/constants';
import {
  SAVE_VERSION,
  BuildingState,
  FieldId,
  RoadTier,
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
  MainToWorker,
  MapData,
  RoadSpec,
  RoadTileDelta,
  ServiceKind,
  SimSnapshot,
  SimSpeed,
  TilePoint,
  WorkerToMain,
  ZonePatch,
} from '../shared/types';
import catalogData from '../data/catalog.json';
import roadsData from '../data/roads.json';
import { createRng } from '../core/rng';
import { FixedTimestep } from '../core/loop';
import type { CommandBatch } from '../core/commands';
import type { SelectionInfo } from '../shared/types';
import {
  canPlaceFootprint,
  clearTiles,
  createGrid,
  deserializeGrid,
  isRoadBuildable,
  serializeGrid,
  setZones,
} from '../world/grid';
import { RoadNetwork, applyRoad, removeRoad } from '../world/roads';
import {
  applyHeightPatch,
  computeTerraformPatch,
  readHeightPatch,
  type HeightPatch,
  type TerraformCommand,
  type TerraformSetCommand,
} from '../world/terraform';
import { FieldSim } from './fields';
import { BuildingRegistry, footprintForRotation } from './buildings';
import { computeDemand } from './demand';
import { GrowthSystem } from './growth';
import { ServiceSim, nearestRoadTile } from './services';
import { EconomySystem, buildingMonthlyTax } from './economy';
import { recomputeUtilities } from './network';
import { TrafficSystem } from './traffic';
import { TransitSystem, type PopulationJobsAccessor, type TransitTickResult } from './transit';
import { DispatchSystem, MAX_SERVICE_VEHICLES } from './dispatch';
import { PolicyStore, effectivePollution, trafficWeight } from './policy';
import { paintDistrict } from '../world/districts';
import { canLandfill, paintLandfill } from '../world/landfill';
import {
  GarbageSystem,
  type GarbageBuilding,
  type GarbageFacility,
  type TrashSector,
} from './garbage';
import {
  GarbageTruckSystem,
  MAX_GARBAGE_TRUCKS,
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

/** Ticks between snapshots: 20 ticks/s over 10 snapshots/s = 2. */
const SNAPSHOT_TICKS = Math.max(1, Math.round(TICK_RATE / SNAPSHOT_HZ));
/** Utility (power/water) recompute cadence. */
const UTILITY_PERIOD = 10;
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
const MAX_SERVICE_FUNDING = 1.5;

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
    milestoneLevel: 0,
    milestoneProgress: 0,
    loanBalance: 0,
    taxRates: { res: DEFAULT_TAX_RATE, com: DEFAULT_TAX_RATE, ind: DEFAULT_TAX_RATE },
    serviceFunding: { police: 1, fire: 1, health: 1, education: 1, park: 1 },
  };
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
 * residential fills residents + households (capacity = ceil(catalog
 * residents / 4); occupied only while Active — the sim's population model is
 * all-or-nothing per building); com/ind fill jobs (Active only); services &
 * utilities leave every field unset. Pure and exported for direct testing.
 */
export function selectionOccupancy(
  entry: BuildingCatalogEntry,
  state: BuildingState,
): SelectionInfo['occupancy'] {
  if (entry.category === 'res') {
    const capacity = Math.ceil((entry.residents ?? 0) / 4);
    const active = state === BuildingState.Active;
    return {
      residents: active ? (entry.residents ?? 0) : 0,
      households: { occupied: active ? capacity : 0, capacity },
    };
  }
  if (entry.category === 'com' || entry.category === 'ind') {
    return { jobs: state === BuildingState.Active ? (entry.jobs ?? 0) : 0 };
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
  private stats: CityStats = initialStats();
  private registry = new BuildingRegistry(CATALOG);
  private readonly fieldSim = new FieldSim();
  private readonly services = new ServiceSim(CATALOG);
  private readonly economy = new EconomySystem(CATALOG, ROAD_SPECS);
  private readonly network = new RoadNetwork();
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
  /** Worker-owned authoritative district registry — id/name/color. */
  private districtDefs: District[] = [];
  private readonly districtDefById = new Map<number, District>();
  private districtDirty: DirtyRect | null = null;
  private districtDefsChanged = false;
  /** Garbage: trash generation + landfill collection. Runtime state (not saved). */
  private readonly garbage = new GarbageSystem(MAP_SIZE);
  private readonly garbageTrucks = new GarbageTruckSystem();
  private landfillDirty: DirtyRect | null = null;
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

  // --- deltas accumulated between snapshots --------------------------------
  private readonly pendingRoadDeltas = new Map<number, RoadTileDelta>();
  private buildingsAdded: BuildingInstance[] = [];
  private buildingsUpdated: BuildingInstance[] = [];
  private buildingsRemoved: number[] = [];
  private zoneDirty: DirtyRect | null = null;
  /** Terrain edits accumulated since the last snapshot (terraform strokes, terraformSet restores, loadSave). */
  private pendingHeightPatches: HeightPatch[] = [];
  private prevPower = new Uint8Array(this.grid.power.length);
  private prevWatered = new Uint8Array(this.grid.watered.length);
  private powerDirty = false;
  private wateredDirty = false;
  private utilitiesDirty = false;

  constructor(post: WorkerPost) {
    this.post = post;
    this.timestep = new FixedTimestep(TICK_MS, () => this.tick());
    const rng = createRng(0);
    this.growth = new GrowthSystem(CATALOG, rng.fork(1), canPlaceFootprint);
    this.traffic = new TrafficSystem(rng.fork(2), this.network);
    this.transit = new TransitSystem(this.network);
    this.dispatch = new DispatchSystem(CATALOG, rng.fork(3));
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
    this.grid.height.set(map.height);
    this.grid.water.set(map.water);
    this.grid.trees.set(map.trees);

    const rng = createRng(seed);
    this.growth = new GrowthSystem(CATALOG, rng.fork(1), canPlaceFootprint);
    this.network.rebuild(this.grid);
    this.traffic = new TrafficSystem(rng.fork(2), this.network);
    // transit / dispatch / policy systems are stateful (lines / active incidents / policies)
    // and must reset per game session, mirroring how traffic is re-created.
    this.transit = new TransitSystem(this.network);
    this.dispatch = new DispatchSystem(CATALOG, rng.fork(3));
    this.policyStore = new PolicyStore();
    this.transitResult = { lines: [], ridership: [] };
    this.latestIncidents = [];
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
    this.post({ type: 'ready' });
    this.postSnapshot();
  }

  private load(data: ArrayBuffer): void {
    const payload = decodeSave(data);
    if (payload.header.version !== SAVE_VERSION) {
      throw new Error(`loadSave: unsupported save version ${payload.header.version}`);
    }
    const grid = deserializeGrid(payload.grid);
    if (grid.size !== MAP_SIZE) {
      throw new Error(`loadSave: grid size ${grid.size} != MAP_SIZE ${MAP_SIZE}`);
    }

    const previousIds = this.registry.all().map((b) => b.id);

    this.grid = grid;
    this.registry = BuildingRegistry.deserialize(CATALOG, payload.meta.registry);
    this.stats = cloneStats(payload.meta.stats);
    this.seed = payload.header.seed;
    this.mapName = payload.header.mapName;
    this.tickNo = payload.header.tick;
    this.pendingBatches = [];

    // Growth's construction countdowns aren't serialized; promote in-progress
    // lots to Active so nothing is left permanently under construction.
    for (const inst of this.registry.all()) {
      if (inst.state === BuildingState.Constructing) inst.state = BuildingState.Active;
    }

    this.network.rebuild(this.grid);
    this.resetDeltas();

    // Full resync for the render thread: everything re-added, all roads/zones
    // re-sent, power/water coverage re-sent.
    this.buildingsRemoved = previousIds;
    this.buildingsAdded = this.registry.all();
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const idx = tileIndex(x, z);
        const tier = (this.grid.roadTier[idx] ?? 0) as RoadTier;
        if (tier !== 0) {
          this.pendingRoadDeltas.set(idx, { x, z, tier, mask: this.grid.roadMask[idx] ?? 0 });
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
    this.transit = new TransitSystem(this.network);
    this.dispatch = new DispatchSystem(CATALOG, createRng(this.seed).fork(3));
    this.policyStore = new PolicyStore();
    this.transitResult = { lines: [], ridership: [] };
    this.latestIncidents = [];
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
    // Garbage is runtime-only: reset the trash/fill and republish the loaded
    // landfill area as full state so the render side rebuilds it.
    this.garbage.reset();
    this.garbageTrucks.reset();
    this.landfillDirty = { minX: 0, minZ: 0, maxX: MAP_SIZE - 1, maxZ: MAP_SIZE - 1 };
    this.garbageDirty = true;
    this.recomputeUtilitiesNow();
    this.powerDirty = true;
    this.wateredDirty = true;

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
    this.powerDirty = false;
    this.wateredDirty = false;
    this.utilitiesDirty = false;
    this.districtDirty = null;
    this.districtDefsChanged = false;
    this.landfillDirty = null;
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

    this.stats.demand = computeDemand({
      population: this.stats.population,
      jobs: this.stats.jobs,
      employed: this.stats.employed,
      taxRates: this.stats.taxRates,
      happiness: this.stats.happiness,
    });

    const growthDelta = this.growth.tick(
      g,
      this.registry,
      this.stats.demand,
      this.stats.milestoneLevel,
      t,
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
    }

    if (t % EMIT_PERIOD === EMIT_OFFSET) {
      for (const inst of this.registry.all()) {
        if (inst.state !== BuildingState.Active) continue;
        const entry = this.catalogById.get(inst.catalogId);
        if (entry?.pollution) {
          // greenEnergy policy: reduce pollution emission for buildings in
          // a district with the policy on (no policy -> unchanged emission).
          const districtId = this.grid.district[tileIndex(inst.x, inst.z)] ?? 0;
          const emitted = effectivePollution(
            entry.pollution,
            this.policyStore.getPolicies(districtId),
          );
          if (emitted > 0) this.fieldSim.emit(g, FieldId.Pollution, inst.x, inst.z, emitted);
        }
        // Landmarks: catalog noise rides the same cadence/source-tile
        // pattern as pollution, feeding the Noise diffusion pass.
        if (entry?.noise) {
          this.fieldSim.emit(g, FieldId.Noise, inst.x, inst.z, entry.noise);
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
      this.services.tick(g, this.registry.all(), this.stats.serviceFunding);
    }

    if (t % GARBAGE_PERIOD === GARBAGE_OFFSET) {
      const garbageBuildings: GarbageBuilding[] = [];
      const facilities: GarbageFacility[] = [];
      for (const inst of this.registry.all()) {
        if (inst.state !== BuildingState.Active) continue;
        const entry = this.catalogById.get(inst.catalogId);
        if (!entry) continue;
        // Incinerators are collection facilities, not trash sources.
        if (entry.garbage) {
          facilities.push({
            id: inst.id,
            collectionRange: entry.garbage.collectionRange,
            bufferCapacity: entry.garbage.bufferCapacity,
            burnRate: entry.garbage.burnRate,
          });
          continue;
        }
        const sector: TrashSector | null =
          entry.category === 'res'
            ? 'res'
            : entry.category === 'com'
              ? 'com'
              : entry.category === 'ind'
                ? 'ind'
                : null;
        if (sector === null) continue;
        garbageBuildings.push({ id: inst.id, sector, level: entry.level ?? 1 });
      }
      this.garbage.tick(g, garbageBuildings, facilities);
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
        const road = nearestRoadTile(this.grid, [tileIndex(inst.x, inst.z)]);
        if (road !== null) {
          garbageDepots.push({
            id: inst.id,
            sourceTile: { x: road % MAP_SIZE, z: Math.floor(road / MAP_SIZE) },
            budget: entry.garbage.trucks,
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
    });
    Object.assign(this.stats, econ.statsPatch);
    for (const note of econ.notifications) {
      this.post({ type: 'notify', note });
    }

    this.stats.tick = t;

    if (t % SNAPSHOT_TICKS === 0) {
      this.postSnapshot();
    }
  }

  private recomputeUtilitiesNow(): void {
    const totals = recomputeUtilities(this.grid, this.registry.all(), CATALOG);
    this.stats.powerSupply = totals.powerSupply;
    this.stats.powerDemand = totals.powerDemand;
    this.stats.waterSupply = totals.waterSupply;
    this.stats.waterDemand = totals.waterDemand;
    this.utilitiesDirty = false;

    const { power, watered } = this.grid;
    if (!bytesEqual(power, this.prevPower)) {
      this.prevPower.set(power);
      this.powerDirty = true;
    }
    if (!bytesEqual(watered, this.prevWatered)) {
      this.prevWatered.set(watered);
      this.wateredDirty = true;
    }
  }

  // -------------------------------------------------------------------------
  // Snapshots & responses
  // -------------------------------------------------------------------------

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
    snap.transit = {
      lines: this.transitResult.lines.map((l) => ({
        id: l.id,
        stops: l.stops.map((s) => ({ ...s })),
        color: l.color,
      })),
      ridership: [...this.transitResult.ridership],
    };
    // Active incidents (only when any are live — optional channel).
    if (this.latestIncidents.length > 0) {
      snap.incidents = this.latestIncidents.map((i) => ({ ...i }));
    }
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
        this.garbageDirty = false;
      }
      snap.garbage = garbage;
    }

    if (this.pendingRoadDeltas.size > 0) {
      snap.roads = Array.from(this.pendingRoadDeltas.values());
      this.pendingRoadDeltas.clear();
    }
    if (
      this.buildingsAdded.length > 0 ||
      this.buildingsUpdated.length > 0 ||
      this.buildingsRemoved.length > 0
    ) {
      snap.buildings = {
        added: this.buildingsAdded.map((b) => ({ ...b })),
        updated: this.buildingsUpdated.map((b) => ({ ...b })),
        removed: [...this.buildingsRemoved],
      };
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
    if (this.pendingHeightPatches.length > 0) {
      snap.heightPatches = this.pendingHeightPatches;
      this.pendingHeightPatches = [];
    }

    const transfer: Transferable[] = [vehicles.buffer];
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
    const info: SelectionInfo = {
      building: { ...inst },
      happiness: Math.round((happinessByte / 255) * 100),
      monthlyTax: buildingMonthlyTax(entry, inst.state, this.stats.taxRates, landValueByte),
      // The catalog upkeep charge; grown buildings (zone set) carry none.
      monthlyUpkeep: entry.zone !== undefined ? 0 : entry.upkeep,
      occupancy: selectionOccupancy(entry, inst.state),
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

  /** Full-grid uncollected-trash coverage (0..255 per tile) for the 'trash' lens. */
  private trashPatch(): ZonePatch {
    return { x: 0, z: 0, w: MAP_SIZE, h: MAP_SIZE, data: this.garbage.trash.slice() };
  }

  /** Per-incinerator buffer fill (0..1) + capacity, for the UI readout. */
  private incineratorSnapshot(): { id: number; fill: number; capacity: number }[] {
    const out: { id: number; fill: number; capacity: number }[] = [];
    for (const inst of this.registry.all()) {
      const entry = this.catalogById.get(inst.catalogId);
      if (!entry?.garbage) continue;
      const capacity = entry.garbage.bufferCapacity;
      const fill = capacity > 0 ? Math.min(1, this.garbage.incineratorStored(inst.id) / capacity) : 0;
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
      grid: serializeGrid(this.grid),
      meta: { registry: this.registry.serialize(), stats: cloneStats(this.stats) },
    });
    this.post({ type: 'save', data }, [data]);
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  private drainCommands(): void {
    const batches = this.pendingBatches;
    if (batches.length === 0) return;
    this.pendingBatches = [];

    for (const batch of batches) {
      let ok = true;
      let cost = 0;
      let reason: string | undefined;
      const inverse: Command[] = [];

      for (const command of batch.commands) {
        const result = this.applyCommand(command);
        if (result.ok) {
          cost += result.cost;
          // Undo replays inverses in reverse order of the originals.
          inverse.unshift(...result.inverse);
        } else {
          ok = false;
          reason = reason ?? result.reason;
        }
      }

      const ack: CommandAck = { seq: batch.seq, ok, cost, inverse };
      if (!ok && reason !== undefined) ack.reason = reason;
      this.post({ type: 'ack', ack });
    }
  }

  private applyCommand(command: Command): CommandResult {
    switch (command.kind) {
      case 'buildRoad':
        return this.cmdBuildRoad(command.tier, command.tiles);
      case 'bulldoze':
        return this.cmdBulldoze(command.tiles);
      case 'paintZone':
        return this.cmdPaintZone(command.zone, command.tiles);
      case 'placeBuilding':
        return this.cmdPlaceBuilding(command.catalogId, command.x, command.z, command.rotation);
      case 'setTaxRate': {
        const rate = Math.max(0, Math.min(MAX_TAX_RATE, command.rate));
        this.stats.taxRates = { ...this.stats.taxRates, [command.sector]: rate };
        return { ok: true, cost: 0, inverse: [] };
      }
      case 'setServiceFunding': {
        const funding = Math.max(0, Math.min(MAX_SERVICE_FUNDING, command.funding));
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
        const line = this.transit.createLine(command.line.stops, command.line.color);
        return { ok: true, cost: 0, inverse: [{ kind: 'deleteTransitLine', id: line.id }] };
      }
      case 'updateTransitLine': {
        const prev = this.transit.getLine(command.line.id);
        const updated = this.transit.updateLine(
          command.line.id,
          command.line.stops,
          command.line.color,
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
   * Landfill paint: gated to empty land (canLandfill). Painting charges
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
      for (const t of tiles) {
        if (!inBounds(t.x, t.z)) continue;
        if ((g.landfill[tileIndex(t.x, t.z)] ?? 0) === 0 && canLandfill(g, t.x, t.z)) newTiles += 1;
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
    const inverse: Command[] = [];
    if (turnedOn.length > 0) inverse.push({ kind: 'paintLandfill', tiles: turnedOn, on: false });
    if (turnedOff.length > 0) inverse.push({ kind: 'paintLandfill', tiles: turnedOff, on: true });

    this.landfillDirty = growRect(this.landfillDirty, applied);
    return { ok: true, cost, inverse };
  }

  private cmdBuildRoad(tier: RoadTier, tiles: TilePoint[]): CommandResult {
    const spec = this.roadSpecByTier.get(tier);
    if (!spec) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    if (!this.sandbox && spec.unlockMilestone > this.stats.milestoneLevel) {
      return { ok: false, cost: 0, inverse: [], reason: 'locked' };
    }

    const g = this.grid;
    const valid: TilePoint[] = [];
    const created: TilePoint[] = [];
    const upgradedByPrevTier = new Map<number, TilePoint[]>();
    let changedCount = 0;

    for (const t of tiles) {
      if (!inBounds(t.x, t.z)) continue;
      const idx = tileIndex(t.x, t.z);
      if ((g.buildingId[idx] ?? 0) !== 0) continue;
      const current = (g.roadTier[idx] ?? 0) as RoadTier;
      // Road-on-slope placement: a NEW road tile uses the road-specific
      // slope gate (ROAD_MAX_SLOPE, steeper than MAX_BUILD_SLOPE) since the
      // auto-flatten below re-levels/banks it right after. Upgrading
      // an existing road tile (current !== 0) skips the gate entirely — it's
      // already a road, already flattened once.
      if (current === 0 && !isRoadBuildable(g, t.x, t.z)) continue;
      valid.push(t);
      if (current < tier) {
        changedCount += 1;
        if (current === 0) {
          created.push(t);
        } else {
          const list = upgradedByPrevTier.get(current) ?? [];
          list.push(t);
          upgradedByPrevTier.set(current, list);
        }
      }
    }

    if (changedCount === 0) {
      return {
        ok: valid.length > 0,
        cost: 0,
        inverse: [],
        reason: valid.length > 0 ? undefined : 'invalid',
      };
    }

    const cost = changedCount * spec.costPerTile;
    if (!this.unlimitedMoney && this.stats.funds < cost)
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };

    const deltas = applyRoad(g, valid, tier);
    for (const d of deltas) this.pendingRoadDeltas.set(tileIndex(d.x, d.z), d);
    this.invalidateAround(valid);
    this.zoneDirty = growRect(this.zoneDirty, valid); // roads de-zone their tiles
    this.stats.funds -= cost;

    const inverse: Command[] = [];
    const rebuilt = [...created, ...Array.from(upgradedByPrevTier.values()).flat()];
    if (rebuilt.length > 0) inverse.push({ kind: 'bulldoze', tiles: rebuilt });
    for (const [prevTier, prevTiles] of upgradedByPrevTier) {
      inverse.push({ kind: 'buildRoad', tier: prevTier as RoadTier, tiles: prevTiles });
    }
    // Auto-flatten: the newly built/upgraded tiles + a 1-tile apron.
    this.flattenFootprint(rebuilt, true, inverse);
    return { ok: true, cost, inverse };
  }

  private cmdBulldoze(tiles: TilePoint[]): CommandResult {
    const g = this.grid;
    const inBoundsTiles = tiles.filter((t) => inBounds(t.x, t.z));
    if (inBoundsTiles.length === 0) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };

    // Capture pre-state for the inverse before anything mutates.
    const zonesByType = new Map<number, TilePoint[]>();
    const roadsByTier = new Map<number, TilePoint[]>();
    for (const t of inBoundsTiles) {
      const idx = tileIndex(t.x, t.z);
      const zone = g.zone[idx] ?? 0;
      if (zone !== ZoneType.None) {
        const list = zonesByType.get(zone) ?? [];
        list.push(t);
        zonesByType.set(zone, list);
      }
      const tier = g.roadTier[idx] ?? 0;
      if (tier !== 0) {
        const list = roadsByTier.get(tier) ?? [];
        list.push(t);
        roadsByTier.set(tier, list);
      }
    }

    let refund = 0;

    // Roads first, via removeRoad, so neighbor masks are recomputed properly.
    const roadDeltas = removeRoad(g, inBoundsTiles);
    for (const d of roadDeltas) this.pendingRoadDeltas.set(tileIndex(d.x, d.z), d);
    for (const [tier, roadTiles] of roadsByTier) {
      const spec = this.roadSpecByTier.get(tier);
      if (spec) refund += spec.costPerTile * roadTiles.length * BULLDOZE_REFUND_RATE;
    }

    // Then zones/trees/buildings via clearTiles + registry removal.
    const cleared = clearTiles(g, inBoundsTiles);
    const inverse: Command[] = [];
    for (const [tier, roadTiles] of roadsByTier) {
      inverse.push({ kind: 'buildRoad', tier: tier as RoadTier, tiles: roadTiles });
    }
    for (const [zone, zoneTiles] of zonesByType) {
      inverse.push({ kind: 'paintZone', zone: zone as ZoneType, tiles: zoneTiles });
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

    this.invalidateAround(inBoundsTiles);
    this.zoneDirty = growRect(this.zoneDirty, inBoundsTiles);
    this.utilitiesDirty = true;
    this.stats.funds += refund;
    return { ok: true, cost: -refund, inverse };
  }

  private cmdPaintZone(zone: ZoneType, tiles: TilePoint[]): CommandResult {
    const g = this.grid;
    const prevZones = new Map<number, number>(); // tile index -> pre-paint zone
    for (const t of tiles) {
      if (!inBounds(t.x, t.z)) continue;
      const idx = tileIndex(t.x, t.z);
      prevZones.set(idx, g.zone[idx] ?? 0);
    }

    const applied = setZones(g, tiles, zone);
    if (applied.length === 0) {
      return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
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
      inverse.push({ kind: 'paintZone', zone: prevZone as ZoneType, tiles: zoneTiles });
    }

    this.zoneDirty = growRect(this.zoneDirty, applied);
    return { ok: true, cost: 0, inverse };
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
    const inst = this.registry.place(this.grid, entry, x, z, rotation);
    if (!inst) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };

    this.stats.funds -= entry.cost;
    this.buildingsAdded.push(inst);
    this.utilitiesDirty = true;

    const footprint: TilePoint[] = [];
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) footprint.push({ x: x + dx, z: z + dz });
    }
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
  private cmdTerraform(command: TerraformCommand): CommandResult {
    const result = computeTerraformPatch(this.grid, command);
    if (!result) return { ok: false, cost: 0, inverse: [], reason: 'invalid' };
    if (!this.unlimitedMoney && this.stats.funds < result.cost)
      return { ok: false, cost: 0, inverse: [], reason: 'funds' };

    applyHeightPatch(this.grid, result.patch);
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
    applyHeightPatch(this.grid, forward);
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
   * `tiles` are the whole footprint (already verified buildable by the
   * caller). Returns null (no patch, nothing to do) when the covered set is
   * empty or every covered tile's height already equals the mean bit-for-bit.
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

    const rect = growRect(null, Array.from(covered.values()));
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
        if (covered.has(idx)) {
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

    // A tile provides road continuity if it is in R or already carries road.
    const isRoadSource = (x: number, z: number): boolean => {
      const idx = tileIndex(x, z);
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
    applyHeightPatch(this.grid, patch);
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
