/**
 * SlimCity shared contracts.
 *
 * This file is the API boundary between all modules.
 * Module agents code AGAINST these types and must not edit this file.
 * Enum-like values are stored in typed-array layers — values are stable,
 * never reorder them.
 */

// ---------------------------------------------------------------------------
// Tiles & zones
// ---------------------------------------------------------------------------

export interface TilePoint {
  x: number;
  z: number;
}

export const ZoneType = {
  None: 0,
  ResLow: 1,
  ResHigh: 2,
  ComLow: 3,
  ComHigh: 4,
  Industrial: 5,
  // Zoning types expansion — additive, save-safe. Values 1–5 above are
  // serialized into GridState.zone bytes, saves, and ZonePatch — they MUST NOT
  // be reordered. New city-builder zones append with new numbers:
  //   ResMediumRow (6) — Medium Density Row Housing (narrow attached rows)
  //   ResMedium    (7) — Medium Density Housing (small apartment blocks)
  //   Mixed        (8) — Mixed Housing (commercial ground floor + apartments)
  ResMediumRow: 6,
  ResMedium: 7,
  Mixed: 8,
} as const;
export type ZoneType = (typeof ZoneType)[keyof typeof ZoneType];

export const RoadTier = {
  None: 0,
  TwoLane: 1,
  Avenue: 2,
  Highway: 3,
  // Roads catalog expansion — additive, existing tiers keep their numbers
  // (they are persisted in GridState.roadTier bytes and saves).
  Gravel: 4,
  Alley: 5,
  OneWay: 6,
  FourLane: 7,
} as const;
export type RoadTier = (typeof RoadTier)[keyof typeof RoadTier];

/**
 * Scalar fields (classic diffusing scalar layers). Each is a Uint8Array of
 * MAP_SIZE² tiles, 0..255. Indexed by FieldId into GridState.fields.
 */
export const FieldId = {
  LandValue: 0,
  Pollution: 1,
  Noise: 2,
  Traffic: 3,
  Crime: 4,
  FireRisk: 5,
  Education: 6,
  Health: 7,
  Happiness: 8,
} as const;
export type FieldId = (typeof FieldId)[keyof typeof FieldId];
export const FIELD_COUNT = 9;

/**
 * The complete mutable world state. Lives in the sim worker; the render
 * thread keeps a read-only mirror updated from snapshots/patches.
 * Implemented in src/world/grid.ts (createGrid, serializeGrid, deserializeGrid,
 * plus tile accessors and buildability checks).
 */
export interface GridState {
  readonly size: number; // tiles per side
  height: Float32Array; // meters above sea level (negative = below)
  water: Uint8Array; // 1 = water tile (unbuildable)
  trees: Uint8Array; // 0..255 tree density (cosmetic + clearable)
  zone: Uint8Array; // ZoneType
  roadTier: Uint8Array; // RoadTier
  roadMask: Uint8Array; // 4-bit neighbor bitmask: +N=1 +E=2 +S=4 +W=8
  buildingId: Uint32Array; // 0 = none, else building instance id occupying tile
  power: Uint8Array; // 1 = powered
  watered: Uint8Array; // 1 = water service reaches tile
  fields: Uint8Array[]; // FIELD_COUNT arrays, indexed by FieldId
  /**
   * Districts & policies — per-tile district id (0 = unassigned,
   * 1..255 = District.id). Worker-owned so per-district policies are applied
   * server-side (never a render-only mask). ADDITIVE layer: serialized LAST in
   * the grid save (SAVE_VERSION 2). See src/world/grid.ts serialize/deserialize
   * and the SAVE_VERSION migration note there — v1 saves load with this layer
   * defaulted to all-zero (no districts), so old saves remain loadable.
   */
  district: Uint8Array; // District id per tile
}

// ---------------------------------------------------------------------------
// Map packs (AI-generated raster maps) & procedural fallback
// ---------------------------------------------------------------------------

export interface MapData {
  name: string;
  size: number; // tiles per side, MAP_SIZE
  height: Float32Array; // sampled to tile grid, meters
  water: Uint8Array; // derived: height < seaLevel
  trees: Uint8Array; // 0..255 density
  seaLevel: number; // meters (heights are absolute; water derived already)
  spawn: TilePoint; // initial camera target
}

// ---------------------------------------------------------------------------
// Player commands (UI/tools -> worker). The ONLY way the world mutates.
// ---------------------------------------------------------------------------

export type Sector = 'res' | 'com' | 'ind';
export type ServiceKind = 'police' | 'fire' | 'health' | 'education' | 'park';

export type Command =
  | { kind: 'buildRoad'; tier: RoadTier; tiles: TilePoint[] } // contiguous path
  | { kind: 'bulldoze'; tiles: TilePoint[] } // clears road/building/zone/trees
  | { kind: 'paintZone'; zone: ZoneType; tiles: TilePoint[] }
  | { kind: 'placeBuilding'; catalogId: string; x: number; z: number; rotation: 0 | 1 | 2 | 3 }
  | { kind: 'setTaxRate'; sector: Sector; rate: number } // 0..0.3
  | { kind: 'setServiceFunding'; service: ServiceKind; funding: number } // 0..1.5
  | { kind: 'takeLoan'; amount: number }
  | { kind: 'repayLoan'; amount: number }
  // landscaping: one brush stroke — smoothstep falloff kernel over the
  // disc; tiles carrying roads or buildings are excluded from the kernel.
  // targetHeight is 'level' mode's flatten height, sampled at drag start.
  | {
      kind: 'terraform';
      mode: 'raise' | 'lower' | 'level' | 'smooth';
      center: TilePoint;
      radius: number; // tiles, TERRAFORM_BRUSH_MIN..TERRAFORM_BRUSH_MAX
      strength: number; // TERRAFORM_STRENGTH_MIN..TERRAFORM_STRENGTH_MAX
      targetHeight?: number; // meters, 'level' mode only
    }
  // float-exact height restore — the ack inverse of 'terraform', so
  // undo/redo is exact to the float. `heights` is row-major w*h: local
  // (col, row) sits at index row * w + col, i.e. world tile (x+col, z+row).
  | { kind: 'terraformSet'; x: number; z: number; w: number; h: number; heights: Float32Array }
  // ---- Bus transit: the worker owns the authoritative line list ----
  // Create a new line (worker assigns the id if `line.id` is 0/omitted-ish; the
  // ack/snapshot echoes the real id). `line.stops` are ordered TilePoints on/adjacent
  // to roads; the sim routes stop→stop over the road graph.
  | { kind: 'createTransitLine'; line: TransitLine }
  // Replace an existing line's stops/color (matched by line.id).
  | { kind: 'updateTransitLine'; line: TransitLine }
  // Remove the line with this id.
  | { kind: 'deleteTransitLine'; id: number }
  // ---- Districts & policies ----
  // Paint `districtId` (0 = erase back to unassigned) onto GridState.district for `tiles`.
  | { kind: 'paintDistrict'; districtId: number; tiles: TilePoint[] }
  // Toggle a policy for a district on/off; the sim applies its economy/traffic effect.
  | { kind: 'setDistrictPolicy'; districtId: number; policy: Policy; on: boolean }
  // Sandbox mode: when on, every build item is placeable regardless of milestone.
  | { kind: 'setSandbox'; on: boolean };

/**
 * Worker acknowledges each command batch: actual cost charged, and the
 * inverse commands that undo the edit (used by the tools undo stack).
 * Non-edit commands (taxes, funding, loans) return inverse: [].
 */
export interface CommandAck {
  seq: number;
  ok: boolean;
  cost: number; // negative = refund
  inverse: Command[];
  reason?: string; // when ok === false: 'funds' | 'invalid' | 'locked' | ...
}

// ---------------------------------------------------------------------------
// Simulation snapshot (worker -> render/UI), sent at SNAPSHOT_HZ.
// Deltas only; full state arrives once after init/load as patches.
// ---------------------------------------------------------------------------

export interface DemandLevels {
  res: number; // -1..1
  com: number;
  ind: number;
}

export interface CityStats {
  tick: number;
  funds: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  population: number;
  jobs: number;
  employed: number;
  demand: DemandLevels;
  happiness: number; // 0..100 city average
  powerSupply: number; // MW
  powerDemand: number;
  waterSupply: number; // kL
  waterDemand: number;
  milestoneLevel: number; // index into MILESTONES
  milestoneProgress: number; // 0..1 toward next
  loanBalance: number;
  taxRates: Record<Sector, number>;
  serviceFunding: Record<ServiceKind, number>;
}

export const BuildingState = {
  Constructing: 0,
  Active: 1,
  Abandoned: 2,
} as const;
export type BuildingState = (typeof BuildingState)[keyof typeof BuildingState];

/** Problem bit-flags on a building instance. */
export const Problem = {
  NoPower: 1,
  NoWater: 2,
  NoRoad: 4,
  HighCrime: 8,
  HighPollution: 16,
  LowDemand: 32,
} as const;

export interface BuildingInstance {
  id: number; // stable, never reused within a session
  catalogId: string;
  x: number; // origin tile (min-x/min-z corner of footprint)
  z: number;
  rotation: 0 | 1 | 2 | 3;
  level: number; // 1..3 for grown buildings, 1 for ploppables
  state: BuildingState;
  problems: number; // Problem bit-flags
}

export interface BuildingDelta {
  added: BuildingInstance[];
  removed: number[]; // ids
  updated: BuildingInstance[]; // state/level/problems changes
}

export interface RoadTileDelta {
  x: number;
  z: number;
  tier: RoadTier;
  mask: number; // neighbor bitmask, see GridState.roadMask
}

export interface ZonePatch {
  x: number;
  z: number;
  w: number;
  h: number;
  data: Uint8Array; // w*h ZoneType values, row-major
}

/**
 * Cosmetic vehicle buffer: fixed slot pool, stride VEHICLE_STRIDE.
 * Layout per slot: [x, z, headingRad, speed, kind]. Inactive slot: x = INACTIVE_VEHICLE_X.
 * Slots are stable across snapshots so the render thread can interpolate.
 */
export const VEHICLE_STRIDE = 5;
export const MAX_VEHICLES = 1024;
export const INACTIVE_VEHICLE_X = -1e9;
/**
 * Cosmetic vehicle liveries carried in slot field [4]. Values 0..2 are stable
 * (persisted in nothing, but read by the render vehicle kit — never reorder).
 * Service dispatch adds Fire/Police/Ambulance: service vehicles ride the SAME
 * vehicle buffer (SimSnapshot.vehicles) as cars/trucks/buses — no parallel
 * buffer — distinguished only by these kind values, so the render
 * VehicleRenderer picks the correct livery. Documented here so the sim + render
 * sides agree.
 */
export const VehicleKind = {
  Car: 0,
  Truck: 1,
  Bus: 2,
  Fire: 3,
  Police: 4,
  Ambulance: 5,
} as const;
export type VehicleKind = (typeof VehicleKind)[keyof typeof VehicleKind];

export interface SimSnapshot {
  stats: CityStats;
  roads?: RoadTileDelta[];
  buildings?: BuildingDelta;
  zones?: ZonePatch[];
  vehicles?: Float32Array; // MAX_VEHICLES * VEHICLE_STRIDE
  power?: ZonePatch[]; // powered-coverage patches (data: 0/1)
  watered?: ZonePatch[];
  /**
   * terrain updates (worker -> render): regions whose heights changed —
   * emitted after terraform strokes, after terraformSet restores (undo/redo),
   * and after loadSave. `heights` is row-major w*h (the same layout as the
   * terraformSet command); consumed by TerrainRenderer.markDirty.
   */
  heightPatches?: { x: number; z: number; w: number; h: number; heights: Float32Array }[];
  /**
   * Bus transit: the worker's authoritative line list plus a
   * per-line statistical ridership figure. `ridership[i]` corresponds to
   * `lines[i]`. Cosmetic buses ride the existing `vehicles` buffer
   * (VehicleKind.Bus); this channel drives the transit overlay + line list.
   */
  transit?: { lines: TransitLine[]; ridership: number[] };
  /**
   * Service dispatch: currently-active incidents (cosmetic —
   * coverage/economy unchanged). Service vehicles responding to them ride the
   * existing `vehicles` buffer via VehicleKind.Fire/Police/Ambulance.
   */
  incidents?: Incident[];
  /**
   * Districts & policies. Mirrors how zones patch: `patches` are
   * ZonePatch-shaped regions whose `data` bytes are per-tile district ids
   * (0 = unassigned), row-major, exactly like SimSnapshot.zones. `defs` is the
   * worker's authoritative district list (id/name/color) so the render overlay
   * can tint + label and the UI can list districts. Full state arrives once
   * after init/load; subsequent snapshots send only changed patches.
   */
  districts?: { patches: ZonePatch[]; defs: District[] };
}

export interface CityNotification {
  id: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  tick: number;
}

// ---------------------------------------------------------------------------
// Worker protocol
// ---------------------------------------------------------------------------

export type SimSpeed = 0 | 1 | 2 | 4;

export type MainToWorker =
  | { type: 'init'; seed: number; map: MapData }
  | { type: 'commands'; seq: number; commands: Command[] }
  | { type: 'setSpeed'; speed: SimSpeed }
  | { type: 'requestField'; field: FieldId }
  | { type: 'requestSave' }
  | { type: 'loadSave'; data: ArrayBuffer }
  | { type: 'select'; buildingId: number }
  | { type: 'clearSelect' };

export type WorkerToMain =
  | { type: 'ready' }
  | { type: 'ack'; ack: CommandAck }
  | { type: 'snapshot'; snap: SimSnapshot }
  | { type: 'field'; field: FieldId; data: Uint8Array }
  | { type: 'save'; data: ArrayBuffer }
  | { type: 'notify'; note: CityNotification }
  | { type: 'selection'; info: SelectionInfo | null };

// ---------------------------------------------------------------------------
// Building catalog & road specs (data-driven, src/data/*.json)
// ---------------------------------------------------------------------------

export interface ServiceSpec {
  kind: ServiceKind;
  strength: number; // 0..255 effect written into its field at the source
  range: number; // road-network BFS distance in tiles
}

export interface UtilitySpec {
  powerMW?: number; // produced
  waterKL?: number; // produced
}

// 'transit' is additive — the bus-stop ploppable's category and the Transit
// dock category. Existing members unchanged.
export type BuildingCategory = 'res' | 'com' | 'ind' | 'service' | 'utility' | 'park' | 'transit';

export interface BuildingCatalogEntry {
  id: string;
  name: string;
  category: BuildingCategory;
  /** Set for zone-grown buildings; undefined for ploppables. */
  zone?: ZoneType;
  level?: number; // 1..3, for grown buildings
  footprint: { w: number; d: number }; // tiles
  height: number; // meters, for the box mesh
  color: number; // hex, flat color until stage-2 facade atlases
  residents?: number;
  jobs?: number;
  powerUse: number; // MW
  waterUse: number; // kL
  pollution?: number; // 0..255 emitted at source into Pollution field
  noise?: number; // 0..255 emitted at source into Noise field, same pattern as pollution
  landValueBonus?: number; // 0..255 emitted into LandValue field
  service?: ServiceSpec;
  utility?: UtilitySpec;
  cost: number; // 0 for grown buildings
  upkeep: number; // per month
  unlockMilestone: number; // MILESTONES index required
}

export interface RoadSpec {
  tier: RoadTier;
  name: string;
  costPerTile: number;
  upkeepPerTile: number;
  speed: number; // m/s along edges
  capacity: number; // vehicles/day before congestion
  unlockMilestone: number;
  // -- additive road fields (all optional; omission = default) --
  /** Noise-field emission multiplier by tier: gravel 2×, highway 3×. Default 1. */
  noiseMult?: number;
  /** Directed edges — traffic and pathfinding follow the drag direction only. Default false (bidirectional). */
  oneWay?: boolean;
  /** road-carried utilities: carries water/sewage pipes along the road graph. Default true — highways set false (power/street lighting only). */
  carriesWater?: boolean;
  /** Pavement surface for render/audio treatment: unpaved gravel gets no paint or curbs. Default 'paved'. */
  surface?: 'paved' | 'gravel';
}

// ---------------------------------------------------------------------------
// Road network graph (built from the grid)
// Implemented in src/world/roads.ts
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: number;
  x: number;
  z: number;
  edges: number[]; // edge ids
}

export interface GraphEdge {
  id: number;
  a: number; // node id
  b: number;
  tier: RoadTier;
  tiles: TilePoint[]; // the road tiles this edge covers, in order a->b
  length: number; // tiles
  volume: number; // vehicles assigned this cycle (traffic writes, decays)
}

export interface PathResult {
  nodes: number[];
  edges: number[];
  /** World-space tile centers along the whole path, for vehicle animation. */
  points: TilePoint[];
  cost: number;
}

/**
 * The road network's public surface. Implemented by src/world/roads.ts;
 * consumed (as an injected dependency, never a direct import) by traffic
 * and any other system that routes over roads.
 */
export interface RoadNetworkApi {
  rebuild(grid: GridState): void;
  /** Mark a tile region dirty; implementation may rebuild lazily. */
  invalidateRegion(minX: number, minZ: number, maxX: number, maxZ: number): void;
  nearestNode(x: number, z: number): number | null;
  /**
   * `edgeCostMultiplier` (optional) scales each edge's cost on top of the
   * network's own district/congestion cost — e.g. a small per-trip jitter so
   * many trips over a grid spread across its equal-cost parallel routes
   * instead of all collapsing onto one. Omitted -> no change.
   */
  findPath(
    from: TilePoint,
    to: TilePoint,
    edgeCostMultiplier?: (edge: GraphEdge) => number,
  ): PathResult | null;
  addVolume(edgeIds: number[], amount: number): void;
  decayVolumes(factor: number): void;
  getEdges(): readonly GraphEdge[];
  getNodes(): readonly GraphNode[];
}

// ---------------------------------------------------------------------------
// Tools & camera (render-thread side)
// ---------------------------------------------------------------------------

export type ToolId =
  | 'select'
  | 'bulldoze'
  | 'road.two'
  | 'road.avenue'
  | 'road.highway'
  // Roads catalog expansion: one tool per new tier.
  | 'road.gravel'
  | 'road.alley'
  | 'road.oneway'
  | 'road.four'
  | 'zone.resLow'
  | 'zone.resHigh'
  | 'zone.comLow'
  | 'zone.comHigh'
  | 'zone.industrial'
  | 'zone.dezone'
  // Zoning types expansion: the three appended zone tools.
  | 'zone.resMediumRow'
  | 'zone.resMedium'
  | 'zone.mixed'
  // landscaping: the four real terraform brushes.
  // Slope is a stretch goal, deliberately not a ToolId yet.
  | 'terraform.raise'
  | 'terraform.lower'
  | 'terraform.level'
  | 'terraform.smooth'
  // Bus transit: click stops in sequence, commit the line
  // (emits createTransitLine). Additive.
  | 'transit.line'
  // Districts: brush-paint the selected district id onto tiles
  // (emits paintDistrict). Additive.
  | 'district.paint'
  | `plop.${string}`; // ploppable by catalog id, e.g. 'plop.police-station'

export interface CameraState {
  targetX: number;
  targetZ: number;
  distance: number; // meters from target
  yaw: number; // radians
  pitch: number; // radians, clamped
}

/** A committed, undoable player edit (tools layer). */
export interface ReversibleEdit {
  label: string;
  forward: Command[];
  inverse: Command[];
  cost: number;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Version 2 carries the additive GridState.district layer: the grid save has
 * one trailing Uint8Array (MAP_SIZE² bytes, per-tile district id). Migration:
 * src/world/grid.ts deserializeGrid still accepts v1 buffers
 * (which lack the district layer) and loads them with district defaulted to
 * all-zero; serializeGrid always writes v2. No other layer's byte layout or
 * order changed, so every v1..v2 field round-trips unchanged.
 */
export const SAVE_VERSION = 2;

export interface SaveHeader {
  version: number;
  seed: number;
  tick: number;
  mapName: string;
  savedAt: number; // epoch ms, stamped by the main thread
}

// ---------------------------------------------------------------------------
// Selection protocol, tool options, cursor chips, infoview lenses.
// Additive contracts only.
// ---------------------------------------------------------------------------

/**
 * Building-selection payload for the info panel. The worker
 * computes it in response to MainToWorker 'select' and pushes it as
 * WorkerToMain 'selection'; while a selection is held it re-pushes whenever
 * the values change. 'clearSelect' (or the building's demolition — the worker
 * then sends info: null) ends the stream.
 */
export interface SelectionInfo {
  building: BuildingInstance;
  /** 0..100 — Happiness field sampled at the building's origin tile. */
  happiness: number;
  /**
   * ¢/month this building contributes: occupants × tax rate × land-value
   * factor — the same formula the economy uses. 0 for ploppables.
   */
  monthlyTax: number;
  /** ¢/month — the catalog upkeep charge. 0 for grown buildings. */
  monthlyUpkeep: number;
  /**
   * Category-dependent occupancy rows: residential fills
   * residents + households (capacity = ceil(catalog residents / 4)); com/ind
   * fill jobs; services & utilities leave all fields unset.
   */
  occupancy: {
    residents?: number;
    households?: { occupied: number; capacity: number };
    jobs?: number;
  };
}

/**
 * Live tool-behavior flags, set from the tool-options panel via
 * the UI store and consumed by ToolManager. Rule zero: only flags that flip
 * real behavior belong here.
 */
export interface ToolFlags {
  /** `90° lock` snapping chip — restrict the road L-path to a single leg. */
  angleLock: boolean;
  /** `Straight` tool mode — direct single-axis segment instead of L-path. */
  straightMode: boolean;
}

/**
 * Payload for the DOM cursor chip stack: tools publish one per
 * pointer move while previewing; the DOM layer renders it offset 24px right
 * of the cursor.
 */
export interface CursorChip {
  /** Live cost of the previewed edit, ¢. */
  cost: number;
  /** Road tools only: path tiles × TILE_METERS. */
  lengthMeters?: number;
  /**
   * Orange line beneath the cost when the preview is invalid, e.g.
   * "Overlapping items" | "Insufficient funds" | "Locked".
   */
  invalidReason?: string;
}

/**
 * Infoview lens union: every scalar field plus the worker's power/watered
 * coverage channels (SimSnapshot.power/.watered). The UI store's overlay slot
 * is `LensId | null`.
 *
 * 'transit' (bus ridership overlay) and 'districts' (district tint overlay) are
 * additive — existing members unchanged.
 */
export type LensId = FieldId | 'power' | 'watered' | 'transit' | 'districts';

// ---------------------------------------------------------------------------
// Landscaping & water. Additive contracts only.
// ---------------------------------------------------------------------------

/**
 * Terrain-brush parameters, set from the tool-options panel ("Brush radius" /
 * "Strength" rows) via the UI store and consumed by the
 * terraform tools. radius is in tiles, TERRAFORM_BRUSH_MIN..TERRAFORM_BRUSH_MAX;
 * strength is TERRAFORM_STRENGTH_MIN..TERRAFORM_STRENGTH_MAX.
 */
export interface BrushSettings {
  radius: number;
  strength: number;
}

// ---------------------------------------------------------------------------
// Epic systems (transit / dispatch / districts / stats). Additive contracts
// only. The sim/render/ui modules code against these; they live here so the
// epics build in parallel without touching this file. Referenced above by
// Command and SimSnapshot (TS resolves type references regardless of order).
// ---------------------------------------------------------------------------

/**
 * Bus transit — a player-built bus line over the existing road
 * graph. `stops` is the ordered stop list (TilePoints on/adjacent to roads);
 * the sim routes stop→stop with the road pathfinder. `color` is a packed hex
 * RGB (same convention as BuildingCatalogEntry.color / District.color) used for
 * the route ribbon + line list. `id` is worker-assigned and stable per session.
 */
export interface TransitLine {
  id: number;
  stops: TilePoint[];
  color: number; // packed hex RGB
}

/**
 * Service dispatch — a transient incident a service vehicle drives
 * to. Cosmetic: it consumes the existing crime/fire/pollution fields as spawn
 * inputs but does not alter coverage/economy. `x`/`z` are tile coordinates;
 * `severity` is 0..1 (drives marker size / service time). The responding
 * vehicle rides the shared vehicle buffer via VehicleKind.Fire/Police/Ambulance.
 */
export interface Incident {
  kind: 'fire' | 'crime' | 'medical';
  x: number;
  z: number;
  severity: number; // 0..1
}

/**
 * Districts & policies — a named region the player paints onto
 * GridState.district (per-tile id). `id` is 1..255 (0 is reserved for
 * "unassigned" in the tile layer); `color` is packed hex RGB for the overlay
 * tint + boundary lines. Per-district policies are applied by the sim.
 */
export interface District {
  id: number; // 1..255 (0 = unassigned in GridState.district)
  name: string;
  color: number; // packed hex RGB
}

/**
 * Policy set. Each policy toggles a small, explicit sim effect for
 * tiles in the district it is enabled on:
 *   lowTax          — tax multiplier < 1 feeding the economy for the district
 *   highTax         — tax multiplier > 1 feeding the economy for the district
 *   noHeavyTraffic  — a pathfind cost bump on the district's roads (routes trucks around)
 *   greenEnergy     — a pollution reduction on the district's tiles
 * Additive string-union; extend by appending new members.
 */
export type Policy = 'lowTax' | 'highTax' | 'noHeavyTraffic' | 'greenEnergy';
