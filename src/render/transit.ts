/**
 * Transit rendering: instanced
 * bus-stop SHELTERS at every line's stops, a colored route ribbon per line,
 * and cosmetic vehicles animated along that ribbon, as many as the sim says
 * the line's depots field (`served`), spaced evenly round the route so the
 * gap between them on screen is the headway the panel reports, and moving at
 * the commercial speed the headway arithmetic uses. Reuses render/vehicles.ts's
 * shared bus geometry builder + the "drive on the right" lane offset so cosmetic
 * transit buses read exactly like the regular traffic vehicle kit. A line's mode
 * picks the vehicle out of MODE_VEHICLE and nothing else about this module
 * changes: a train and a tram are the same animated slots at a different size
 * and spacing, several cars to a set.
 *
 * Contract note: `SimSnapshot.transit` (shared/types.ts) carries each line's
 * ordered `stops` + a per-line ridership figure -- it does NOT carry the
 * worker's computed road-hugging route (that's sim-internal, computed via
 * the injected RoadNetworkApi in src/sim/transit.ts). This render module
 * therefore draws the ribbon/bus path as the straight polyline THROUGH the
 * stops, in order -- the best available approximation of "the line's road
 * path" from the current wire contract, and visually correct in the common
 * case (stops are placed on/adjacent to roads, so consecutive stops are
 * usually a short hop apart). If a future contract revision adds a
 * per-line world-space path to the snapshot, `apply()` is the only place
 * that would need updating.
 *
 * Line-stop shelter: the shelter busshelter.ts builds (the one a bus stop
 * stands too, laid by busstops.ts), and a stop sign on its own pole just beyond one
 * end. The stop's own position/data (`TilePoint`) is untouched; only the
 * visual model at that position grows. Since the transit snapshot carries no
 * road-tangent data, the shelter's long axis instead follows the LINE's own
 * local direction of travel through that stop (heading to the next stop, or
 * from the previous one for a line's last stop, or 0 for a lone-stop line --
 * the same "best available approximation" spirit as the ribbon/bus path
 * above), and it sits laterally offset from the stop's exact tile point, to
 * a side alternated deterministically by hash(tile) -- reading as "beside
 * the route" rather than dead-center on top of the existing stop position,
 * its open front toward the stop. A stop standing on a tile that holds a bus
 * stop draws nothing here: the bus stop's own furniture is the stop's.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VehiclePartMaterial, buildVehicleGeometry, laneOffset } from './vehicles';
import {
  TRAIN_CAR_SIZE,
  TRAM_CAR_SIZE,
  TRAM_FLOOR_M,
  buildTrainEndCarGeometry,
  buildTrainMidCarGeometry,
  buildTramLeadSectionGeometry,
  buildTramTailSectionGeometry,
} from './railcars';
import { RAILWAY_RAIL_Y_OFFSET, TRAM_RAIL_Y_OFFSET } from './roadsmesh';
import { BUS_SHELTER, buildBusShelterGeometry } from './busshelter';
import catalogData from '../data/catalog.json';
import {
  VehicleKind,
  type BuildingCatalogEntry,
  type TilePoint,
  type TransitLine,
  type TransitMode,
} from '../shared/types';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import { COMMERCIAL_SPEED_MPS, inServiceSpan } from '../shared/transitfleet';
import type { GuidewayPoint, GuidewaySeatSampler } from './guideway';

/** Matches SimSnapshot.transit's shape (shared/types.ts) without importing the whole SimSnapshot type. */
export interface TransitSnapshot {
  lines: TransitLine[];
  ridership: number[];
  /** Vehicles each line runs, index-aligned with `lines`; absent (an older worker) draws none. */
  served?: number[];
  /**
   * The line each routed line's vehicles and ribbon follow, by line id; a line
   * with no entry has no route and runs nothing. Absent (an older worker) lays
   * every line along its stops.
   */
  routes?: Record<number, readonly WorldPoint[]>;
}

// ---------------------------------------------------------------------------
// Bus-stop shelter
// ---------------------------------------------------------------------------

/** The stop SIGN rides its own slim pole just beyond one end of the shelter. */
const STOP_POST_HEIGHT = 3.0;
const STOP_POST_RADIUS = 0.1;
/** The stop's sign board: its width, height and thickness. The raised station hangs the same board. */
export const STOP_SIGN_SIZE: readonly [number, number, number] = [0.6, 0.5, 0.06];
const STOP_SIGN_Y_OFFSET = STOP_POST_HEIGHT * 0.42;

/** The shelter's length along its local "long" axis (the line's local direction of travel). */
const SHELTER_WIDTH = BUS_SHELTER.w;
/** How far the shelter sits from the stop's own tile point, off to one side of the route (its lateral offset). */
const SHELTER_LATERAL_OFFSET_METERS = TILE_METERS * 0.3;

/** The sign pole sits just beyond one end of the shelter, along its long axis. */
const SIGN_POLE_GAP_METERS = 0.5;

// ---------------------------------------------------------------------------
// Deterministic hashing (never Math.random/Date.now) -- same recipe kept
// locally by every render/*.ts file (buildings.ts, facade.ts, massing.ts,
// props.ts, pedestrians.ts).
// ---------------------------------------------------------------------------

function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Wide fixed stride so (x,z) tile pairs never collide, matching lamps.ts's tileKey idiom. */
function stopTileKey(x: number, z: number): number {
  return x * 100_000 + z;
}

/** Deterministic left/right side pick for a stop's shelter lateral offset (hash of its own tile coords). */
export function shelterSide(x: number, z: number): 1 | -1 {
  return hash1(stopTileKey(x, z) * 7 + 3) < 0.5 ? 1 : -1;
}

// ---------------------------------------------------------------------------
// Route ribbon
// ---------------------------------------------------------------------------

/** Ribbon sits just above the road paint layer (roadsmesh.ts's MARK_Y_OFFSET = 0.16). */
const RIBBON_Y_OFFSET = 0.2;
const RIBBON_WIDTH_METERS = TILE_METERS * 0.3;

// ---------------------------------------------------------------------------
// Cosmetic buses
// ---------------------------------------------------------------------------

/**
 * Bus body dimensions -- mirrors render/vehicles.ts's private `sizeForKind`
 * Bus case ([2.5, 3.0, 10.0]) so a transit bus reads identically to a
 * regular traffic-spawned one; duplicated here because that function isn't
 * exported (only buildVehicleGeometry/laneOffset are shared surface).
 */
const BUS_SIZE: readonly [number, number, number] = [2.5, 3.0, 10.0];

// --- Trains -------------------------------------------------------------------

export { TRAIN_CAR_SIZE, TRAM_CAR_SIZE };
export const TRAIN_CARS_PER_SET = 3;
/** Nose-to-nose spacing down the polyline: a car plus a coupling gap. */
export const TRAIN_CAR_PITCH = TRAIN_CAR_SIZE[2] + 1.2;

// --- Trams --------------------------------------------------------------------

/** Two cars, articulated — they sit closer together than a train's are coupled. */
export const TRAM_CARS_PER_SET = 2;
export const TRAM_CAR_PITCH = TRAM_CAR_SIZE[2] + 0.4;

/**
 * One car of a set: its geometry (built at real size, standing on its origin,
 * nose to +Z) and whether the set turns it about, so a cab stands at each end.
 * The lines and the yards' stabled sets build their cars from these alone.
 */
export interface SetCar {
  readonly geometry: () => THREE.BufferGeometry;
  readonly flip: boolean;
}

/** A train: an end car, a middle car, the end car turned about. */
export const TRAIN_SET: readonly SetCar[] = [
  { geometry: buildTrainEndCarGeometry, flip: false },
  { geometry: buildTrainMidCarGeometry, flip: false },
  { geometry: buildTrainEndCarGeometry, flip: true },
];

/** A tram: the lead section with the pantograph, the tail turned about. */
export const TRAM_SET: readonly SetCar[] = [
  { geometry: buildTramLeadSectionGeometry, flip: false },
  { geometry: buildTramTailSectionGeometry, flip: true },
];

/**
 * Everything that differs between a bus, a train and a tram on screen. A mode is
 * data here, not a branch: a bus is a single box that keeps right, a train is
 * three cars down the middle of its own track, a tram is two that hold their
 * lane because they are sharing a street. Each moves at the commercial speed
 * its headway is worked out from, so a bus never outruns the cars beside it.
 */
interface ModeVehicle {
  readonly size: readonly [number, number, number];
  readonly carsPerSet: number;
  /** The cars of a set in order, lead first; null for a bus, which is one scaled box of the bus kit. */
  readonly set: readonly SetCar[] | null;
  /** Nose-to-nose spacing between cars of one set; unused for a single-car mode. */
  readonly pitch: number;
  readonly speed: number;
  readonly keepsRight: boolean;
  /** Rides the elevated guideway where its line runs over one. */
  readonly ridesGuideway: boolean;
  /** How far the rail head stands over the ground the wheels roll on. */
  readonly railHeadY: number;
}

const MODE_VEHICLE: Record<TransitMode, ModeVehicle> = {
  bus: {
    size: BUS_SIZE,
    carsPerSet: 1,
    set: null,
    pitch: 0,
    speed: COMMERCIAL_SPEED_MPS.bus,
    keepsRight: true,
    ridesGuideway: false,
    railHeadY: 0,
  },
  rail: {
    size: TRAIN_CAR_SIZE,
    carsPerSet: TRAIN_CARS_PER_SET,
    set: TRAIN_SET,
    pitch: TRAIN_CAR_PITCH,
    speed: COMMERCIAL_SPEED_MPS.rail,
    keepsRight: false,
    ridesGuideway: false,
    railHeadY: RAILWAY_RAIL_Y_OFFSET,
  },
  tram: {
    size: TRAM_CAR_SIZE,
    carsPerSet: TRAM_CARS_PER_SET,
    set: TRAM_SET,
    pitch: TRAM_CAR_PITCH,
    speed: COMMERCIAL_SPEED_MPS.tram,
    keepsRight: true,
    ridesGuideway: true,
    railHeadY: TRAM_RAIL_Y_OFFSET,
  },
};

/**
 * How high the drawn tram car's floor stands above its own bottom (the foot of
 * its wheels): the low floor, over its wheels. On the guideway the car is set
 * by its floor, so the body hangs down either side of the beam it straddles.
 */
export const TRAM_FLOOR_ABOVE_ORIGIN_M = TRAM_FLOOR_M;

/** Fixed-capacity pool sizing: the largest fleet one depot holds, on every line, every car drawn. */
const MAX_TRANSIT_LINES = 32;
const LARGEST_DEPOT_FLEET = Math.max(
  1,
  ...(catalogData as { buildings: BuildingCatalogEntry[] }).buildings.map(
    (e) => e.depot?.fleet ?? 0,
  ),
);
const MOST_CARS_PER_SET = Math.max(...Object.values(MODE_VEHICLE).map((v) => v.carsPerSet));
export const MAX_TRANSIT_VEHICLE_SLOTS =
  MAX_TRANSIT_LINES * LARGEST_DEPOT_FLEET * MOST_CARS_PER_SET;

/** A line with no mode is a bus line, matching sim/transit.ts's modeOf. */
function modeOf(line: TransitLine): TransitMode {
  return line.mode ?? 'bus';
}

export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

/** Converts a line's ordered tile stops into world-space (x, z) points. */
export function toWorldPoints(stops: readonly TilePoint[]): WorldPoint[] {
  return stops.map((s) => ({ x: tileToWorld(s.x), z: tileToWorld(s.z) }));
}

/**
 * Deterministic local "direction of travel" heading (radians, Y-axis yaw for
 * a +Z-nosed convention -- same atan2(dx,dz) recipe as sampleAlongPolyline)
 * for the stop at `index` within a line's own world-space stop points: the
 * direction toward the NEXT stop, or -- for a line's last stop -- the
 * direction FROM the previous one (so the last stop keeps the line's
 * incoming heading rather than snapping to 0). A lone-stop line has no
 * direction at all and falls back to 0.
 */
export function computeStopHeading(points: readonly WorldPoint[], index: number): number {
  if (points.length <= 1) return 0;
  if (index < points.length - 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    return Math.atan2(b.x - a.x, b.z - a.z);
  }
  const a = points[index - 1]!;
  const b = points[index]!;
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export interface ShelterLayout {
  /** The two ends of the shelter's long axis, where its corner posts stand. */
  postA: WorldPoint;
  postB: WorldPoint;
  roofCenter: WorldPoint;
  benchCenter: WorldPoint;
  /** The stop sign's own pole, just beyond one end of the shelter. */
  signPole: WorldPoint;
  /** Y yaw that lays the shelter's long axis along the heading with its open front toward the stop. */
  yaw: number;
}

/**
 * Full shelter part layout (world x/z, ground-plane only) for a stop sitting
 * at `anchor` (its own unchanged tile position), given the line's local
 * heading through that stop and a deterministic left/right `side` pick
 * (shelterSide). Pure -- no THREE/DOM dependency, mirroring props.ts's/
 * massing.ts's "positions are a pure function" convention.
 */
export function computeShelterLayout(
  anchor: WorldPoint,
  heading: number,
  side: 1 | -1,
): ShelterLayout {
  const alongX = Math.sin(heading);
  const alongZ = Math.cos(heading);
  const perpX = Math.cos(heading) * side;
  const perpZ = -Math.sin(heading) * side;

  const centerX = anchor.x + perpX * SHELTER_LATERAL_OFFSET_METERS;
  const centerZ = anchor.z + perpZ * SHELTER_LATERAL_OFFSET_METERS;
  const halfWidth = SHELTER_WIDTH / 2;

  return {
    postA: { x: centerX + alongX * halfWidth, z: centerZ + alongZ * halfWidth },
    postB: { x: centerX - alongX * halfWidth, z: centerZ - alongZ * halfWidth },
    roofCenter: { x: centerX, z: centerZ },
    benchCenter: { x: centerX, z: centerZ },
    signPole: {
      x: centerX + alongX * (halfWidth + SIGN_POLE_GAP_METERS),
      z: centerZ + alongZ * (halfWidth + SIGN_POLE_GAP_METERS),
    },
    // A yaw of `heading` points the shelter's local +Z down the route; a
    // quarter turn against `side` lays its long axis along the route with its
    // open front facing back across the offset, toward the stop.
    yaw: heading - (side * Math.PI) / 2,
  };
}

/** Total Euclidean length of a polyline. */
export function polylineLength(points: readonly WorldPoint[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

export interface PolylineSample {
  x: number;
  z: number;
  /** Y-axis yaw for a +Z-nosed mesh, matching src/sim/traffic.ts's heading convention. */
  heading: number;
}

/**
 * Samples a point at `distance` meters along `points` (clamped to
 * [0, polylineLength(points)]). Returns the first point (heading toward the
 * second, or 0 for a degenerate single-point/empty polyline) at distance 0
 * and beyond either end.
 */
export function sampleAlongPolyline(
  points: readonly WorldPoint[],
  distance: number,
): PolylineSample {
  if (points.length === 0) return { x: 0, z: 0, heading: 0 };
  if (points.length === 1) {
    const only = points[0]!;
    return { x: only.x, z: only.z, heading: 0 };
  }

  const total = polylineLength(points);
  const clamped = Math.min(Math.max(distance, 0), total);

  let travelled = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const heading = Math.atan2(dx, dz);

    if (segLen <= 0) continue;
    if (clamped <= travelled + segLen || i === points.length - 2) {
      const t = segLen > 0 ? Math.min(1, Math.max(0, (clamped - travelled) / segLen)) : 0;
      return { x: a.x + dx * t, z: a.z + dz * t, heading };
    }
    travelled += segLen;
  }

  const last = points[points.length - 1]!;
  return { x: last.x, z: last.z, heading: 0 };
}

/**
 * One animated transit vehicle slot: a bus, or a single car of a train or tram.
 * A train is not a bigger box — it is several cars following each other down the
 * same polyline at a fixed spacing, which is the whole silhouette.
 */
interface ActiveVehicle {
  readonly points: readonly WorldPoint[];
  readonly totalLength: number;
  /**
   * Metres travelled by this car's SET, looping modulo totalLength — shared by
   * every car of the set rather than tracked per car. Wrapping each car's own
   * distance would tear a set apart every lap: the lead restarts at 0 while its
   * trailing cars are still at the far end of an open route, which puts the two
   * halves of one tram at opposite ends of the city.
   */
  progress: number;
  /** How far behind the set's lead this car sits, in metres. */
  readonly trail: number;
  readonly size: readonly [number, number, number];
  readonly speed: number;
  /** Buses keep right; a train sits on the track it runs on. */
  readonly keepsRight: boolean;
  readonly ridesGuideway: boolean;
  /** The car of the set this slot draws; null for a bus. */
  readonly car: SetCar | null;
  /** Turned half about its heading, so the set's far cab faces away from the near one. */
  readonly flip: boolean;
  /** The instance scale: the bus kit's unit box scales to the bus, a rail car is drawn at its own size. */
  readonly drawScale: readonly [number, number, number];
  /** Rail head over the ground the wheels stand on. */
  readonly railHeadY: number;
  /** The mesh this slot is drawn by (an index into the renderer's car meshes) and its instance there. */
  mesh: number;
  index: number;
}

const _matrix = new THREE.Matrix4();
/** A half turn about the up axis: a car that faces the other way. */
const _flipQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();
/** Scratch quaternions for the sign's heading-aligned yaw and the shelter's (reused per-instance, never retained). */
const _headingQuat = new THREE.Quaternion();
const _shelterQuat = new THREE.Quaternion();
const _unitScale = new THREE.Vector3(1, 1, 1);
/** Per-instance scale: a bus and a train car are different sizes in one mesh. */
const _vehicleScale = new THREE.Vector3(...BUS_SIZE);
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
/** Yaw down the line, then the guideway's grade, for a car on the beam. */
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
/** Scratch seats on the guideway: the car's own, and a point ahead and behind it for its grade. */
const _seat: GuidewayPoint = { x: 0, y: 0, z: 0 };
const _seatAhead: GuidewayPoint = { x: 0, y: 0, z: 0 };
const _seatBehind: GuidewayPoint = { x: 0, y: 0, z: 0 };
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

function hexToRGB(hex: number): readonly [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

function flatPlaneGeometry(w: number, d: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function railCarMaterial(): VehiclePartMaterial {
  const material = new VehiclePartMaterial();
  material.vertexColors = true;
  return material;
}

export class TransitRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;

  // -- Shelter: the shared shelter, structural fixed colours baked as vertex
  // colours (not route-tinted). ---------------------------------------------
  private readonly shelterGeometry = buildBusShelterGeometry();
  private readonly shelterMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  // -- Stop sign on its own pole (route-tinted, vertex colors) -- the direct
  // descendant of the pre-shelter bare post + sign. --------------------------
  private readonly signPoleGeometry = new THREE.CylinderGeometry(
    STOP_POST_RADIUS,
    STOP_POST_RADIUS * 1.3,
    STOP_POST_HEIGHT,
    6,
  );
  private readonly signGeometry = new THREE.BoxGeometry(...STOP_SIGN_SIZE);
  private readonly signPoleMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly signMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  // buildVehicleGeometry's baked per-vertex colors (body/cabin/wheel/light) render
  // via `vertexColors: true`; the per-instance line-color tint below rides three.js's
  // built-in instanceColor multiply, which -- unlike render/vehicles.ts's custom
  // region-masked NodeMaterial -- applies across the WHOLE bus, not just the body
  // region. A deliberate simplification: a transit bus reads as fully "liveried" in
  // its line's color, which is a reasonable (arguably desirable) look for a labeled
  // transit route.
  private readonly busGeometry = buildVehicleGeometry(VehicleKind.Bus);
  private readonly busMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  // A train or tram car is tinted through the vehicle kit's region mask: the
  // line's colour reaches the body alone, never the glass, bogies, bellows or roof gear.
  private readonly railMaterial = railCarMaterial();

  private shelterMesh: THREE.InstancedMesh | null = null;
  private signPoleMesh: THREE.InstancedMesh | null = null;
  private signMesh: THREE.InstancedMesh | null = null;
  private ribbonMesh: THREE.Mesh | null = null;
  /** One instanced mesh per distinct car geometry in play: the bus box, a train's end and middle car, a tram's two sections. */
  private carMeshes: THREE.InstancedMesh[] = [];
  /** The geometries built for the rail cars; the bus's is the renderer's own. */
  private carGeometries: THREE.BufferGeometry[] = [];

  private buses: ActiveVehicle[] = [];
  private busColors: number[] = [];
  /** Whether the ribbon is drawn: the Transit lens or a transit tool turns it on. */
  private ribbonVisible = false;
  /** The clock hour the lines are drawn at; they run only inside the service span. */
  private dayHour = 12;
  private stopTotal = 0;
  private lineTotal = 0;
  private busTotal = 0;
  /** Where a tram sits on the elevated guideway; null where there is none to ride. */
  private guideway: GuidewaySeatSampler | null = null;

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
  }

  /** The guideway a tram rides wherever its line runs over one; null for none. */
  setGuideway(sampler: GuidewaySeatSampler | null): void {
    this.guideway = sampler;
  }

  /**
   * Full rebuild from the worker's transit snapshot (lines change relatively
   * rarely). `hasStopBuilding` says whether a bus stop holds a tile: a
   * line's stop there draws no shelter and no sign of its own, since the bus
   * stop's furniture is the stop's. `isStation` says a raised tram station
   * stands over a tile, which draws no kerb shelter under it either.
   */
  apply(
    snapshot: TransitSnapshot,
    hasStopBuilding: (x: number, z: number) => boolean = () => false,
    isStation: (x: number, z: number) => boolean = () => false,
  ): void {
    this.disposeMeshes();

    this.lineTotal = snapshot.lines.length;
    this.buildShelters(snapshot.lines, hasStopBuilding, isStation);
    this.buildRibbon(snapshot.lines, snapshot.routes);
    this.buildBuses(snapshot.lines, snapshot.served ?? [], snapshot.routes);

    if (this.ribbonMesh) this.ribbonMesh.visible = this.ribbonVisible;
  }

  /**
   * The clock hour, [0, 24). Outside the service span a line's vehicles are in
   * the depot, so its loop is hidden and stands still; its ribbon and shelters stay.
   */
  setDayHour(hour: number): void {
    this.dayHour = hour;
  }

  /** True while the lines' vehicles are drawn running: the clock is inside the service span. */
  isRunning(): boolean {
    return inServiceSpan(this.dayHour);
  }

  /** Advances every cosmetic bus along its line's polyline by `deltaSeconds` worth of travel. */
  update(deltaSeconds: number): void {
    if (this.carMeshes.length === 0) return;
    const running = this.isRunning();

    for (let slot = 0; slot < this.buses.length; slot += 1) {
      const bus = this.buses[slot];
      if (!bus) continue;
      if (!running) {
        this.carMeshes[bus.mesh]!.setMatrixAt(bus.index, HIDDEN_MATRIX);
        continue;
      }

      if (bus.totalLength > 0) {
        bus.progress = (bus.progress + bus.speed * deltaSeconds) % bus.totalLength;
        if (bus.progress < 0) bus.progress += bus.totalLength;
      }

      // Clamped, not wrapped: a trailing car whose lead has just looped waits at
      // the start of the route for the set to stretch back out, rather than
      // reappearing at the far end of it.
      const sample = sampleAlongPolyline(bus.points, Math.max(0, bus.progress - bus.trail));
      const guideway = bus.ridesGuideway ? this.guideway : null;
      const seat = guideway ? guideway(sample.x, sample.z, sample.heading, _seat) : null;
      if (guideway && seat) {
        // On the guideway the car rides the beam on its right, its floor at the
        // seat, and follows the ramp's grade; it never sinks below the road
        // where the ramp meets the street.
        const groundY = this.heightAt(seat.x, seat.z);
        const reach = bus.size[2] / 2;
        const ahead = guideway(
          seat.x + Math.sin(sample.heading) * reach,
          seat.z + Math.cos(sample.heading) * reach,
          sample.heading,
          _seatAhead,
        );
        const behind = guideway(
          seat.x - Math.sin(sample.heading) * reach,
          seat.z - Math.cos(sample.heading) * reach,
          sample.heading,
          _seatBehind,
        );
        const pitch = ahead && behind ? Math.atan2(ahead.y - behind.y, 2 * reach) : 0;
        const bottom = Math.max(groundY, seat.y - TRAM_FLOOR_ABOVE_ORIGIN_M);
        _position.set(seat.x, bottom + bus.size[1] / 2, seat.z);
        _euler.set(-pitch, sample.heading, 0);
        _quaternion.setFromEuler(_euler);
      } else {
        // A bus keeps right on a two-way street; a train has the track to itself.
        const offset = bus.keepsRight ? laneOffset(sample.heading) : { dx: 0, dz: 0 };
        const renderX = sample.x + offset.dx;
        const renderZ = sample.z + offset.dz;
        const groundY = this.heightAt(renderX, renderZ);
        _position.set(renderX, groundY + bus.railHeadY + bus.size[1] / 2, renderZ);
        _quaternion.setFromAxisAngle(_yAxis, sample.heading);
      }
      if (bus.flip) _quaternion.multiply(_flipQuat);
      _vehicleScale.set(bus.drawScale[0], bus.drawScale[1], bus.drawScale[2]);
      _matrix.compose(_position, _quaternion, _vehicleScale);
      const mesh = this.carMeshes[bus.mesh]!;
      mesh.setMatrixAt(bus.index, _matrix);

      const [r, g, b] = hexToRGB(this.busColors[slot] ?? 0xffffff);
      _color.setRGB(r, g, b);
      mesh.setColorAt(bus.index, _color);
    }

    for (const mesh of this.carMeshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** The instance transform of vehicle `slot` (a bus, or one car of a set in lead-first order), for a test reading where it stands. */
  getCarMatrix(slot: number, out: THREE.Matrix4): void {
    const car = this.buses[slot];
    if (car) this.carMeshes[car.mesh]?.getMatrixAt(car.index, out);
  }

  /** Where every drawn vehicle stands on the ground, world metres, for a dev read-back. */
  carPositions(): { x: number; z: number }[] {
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3();
    return this.buses.map((_, slot) => {
      this.getCarMatrix(slot, matrix);
      at.setFromMatrixPosition(matrix);
      return { x: at.x, z: at.z };
    });
  }

  /** The geometry vehicle `slot` is drawn with, for a test reading what the set shows. */
  getCarGeometry(slot: number): THREE.BufferGeometry | null {
    const car = this.buses[slot];
    return car ? (this.carMeshes[car.mesh]?.geometry ?? null) : null;
  }

  /** Shows or hides the lines' ribbon without disposing it; vehicles and stop furniture are always drawn. */
  setRibbonVisible(visible: boolean): void {
    this.ribbonVisible = visible;
    if (this.ribbonMesh) this.ribbonMesh.visible = visible;
  }

  stopCount(): number {
    return this.stopTotal;
  }

  lineCount(): number {
    return this.lineTotal;
  }

  busCount(): number {
    return this.busTotal;
  }

  /** Instance count of the shelter layer: one per stop drawn, once built. */
  shelterInstanceCount(): number {
    return this.shelterMesh?.count ?? 0;
  }

  /** The shelter's instance transform at `slot`, for a test reading where a stop's shelter stands. */
  getShelterMatrix(slot: number, out: THREE.Matrix4): void {
    this.shelterMesh?.getMatrixAt(slot, out);
  }

  signPoleInstanceCount(): number {
    return this.signPoleMesh?.count ?? 0;
  }

  signInstanceCount(): number {
    return this.signMesh?.count ?? 0;
  }

  dispose(): void {
    this.disposeMeshes();
  }

  // -- internals -------------------------------------------------------------

  private buildShelters(
    lines: readonly TransitLine[],
    hasStopBuilding: (x: number, z: number) => boolean,
    isStation: (x: number, z: number) => boolean,
  ): void {
    const placements: { x: number; z: number; color: number; heading: number }[] = [];
    for (const line of lines) {
      // A rail stop is a station: a ploppable building the player placed, which
      // already stands there. Dropping a bus shelter on top of it would be a
      // second, smaller shelter inside the first. A stop on a tile holding a
      // bus stop is the same case at the bus's scale, and a tram stop under
      // a raised station is served from the platforms above.
      if (modeOf(line) === 'rail') continue;
      const worldPoints = toWorldPoints(line.stops);
      for (let i = 0; i < line.stops.length; i += 1) {
        const stop = line.stops[i]!;
        if (hasStopBuilding(stop.x, stop.z) || isStation(stop.x, stop.z)) continue;
        const heading = computeStopHeading(worldPoints, i);
        placements.push({ x: stop.x, z: stop.z, color: line.color, heading });
      }
    }

    this.stopTotal = placements.length;
    if (placements.length === 0) return;

    const shelterMesh = new THREE.InstancedMesh(
      this.shelterGeometry,
      this.shelterMaterial,
      placements.length,
    );
    const signPoleMesh = new THREE.InstancedMesh(
      this.signPoleGeometry,
      this.signPoleMaterial,
      placements.length,
    );
    const signMesh = new THREE.InstancedMesh(
      this.signGeometry,
      this.signMaterial,
      placements.length,
    );
    shelterMesh.count = placements.length;
    signPoleMesh.count = placements.length;
    signMesh.count = placements.length;

    for (let i = 0; i < placements.length; i += 1) {
      const p = placements[i]!;
      const worldX = tileToWorld(p.x);
      const worldZ = tileToWorld(p.z);
      const side = shelterSide(p.x, p.z);
      const layout = computeShelterLayout({ x: worldX, z: worldZ }, p.heading, side);
      const [r, g, b] = hexToRGB(p.color);
      _color.setRGB(r, g, b);
      _headingQuat.setFromAxisAngle(_yAxis, p.heading);

      const groundYShelter = this.heightAt(layout.roofCenter.x, layout.roofCenter.z);
      _position.set(layout.roofCenter.x, groundYShelter, layout.roofCenter.z);
      _shelterQuat.setFromAxisAngle(_yAxis, layout.yaw);
      _matrix.compose(_position, _shelterQuat, _unitScale);
      shelterMesh.setMatrixAt(i, _matrix);

      const groundYSignPole = this.heightAt(layout.signPole.x, layout.signPole.z);
      _position.set(layout.signPole.x, groundYSignPole + STOP_POST_HEIGHT / 2, layout.signPole.z);
      _matrix.compose(_position, _identityQuat, _unitScale);
      signPoleMesh.setMatrixAt(i, _matrix);
      signPoleMesh.setColorAt(i, _color);

      _position.set(layout.signPole.x, groundYSignPole + STOP_SIGN_Y_OFFSET, layout.signPole.z);
      _matrix.compose(_position, _headingQuat, _unitScale);
      signMesh.setMatrixAt(i, _matrix);
      signMesh.setColorAt(i, _color);
    }

    shelterMesh.instanceMatrix.needsUpdate = true;
    signPoleMesh.instanceMatrix.needsUpdate = true;
    signMesh.instanceMatrix.needsUpdate = true;
    if (signPoleMesh.instanceColor) signPoleMesh.instanceColor.needsUpdate = true;
    if (signMesh.instanceColor) signMesh.instanceColor.needsUpdate = true;

    // Shelter parts read as grounded: cast + receive shadows.
    shelterMesh.castShadow = true;
    shelterMesh.receiveShadow = true;
    signPoleMesh.castShadow = true;
    signPoleMesh.receiveShadow = true;
    signMesh.castShadow = true;
    signMesh.receiveShadow = true;

    this.shelterMesh = shelterMesh;
    this.signPoleMesh = signPoleMesh;
    this.signMesh = signMesh;
    this.scene.add(shelterMesh, signPoleMesh, signMesh);
  }

  private buildRibbon(lines: readonly TransitLine[], routes: TransitSnapshot['routes']): void {
    const segmentGeometries: THREE.BufferGeometry[] = [];

    for (const line of lines) {
      // A line with no route still shows what the player drew, stop to stop.
      const worldPoints = routes?.[line.id] ?? toWorldPoints(line.stops);
      for (let i = 0; i < worldPoints.length - 1; i += 1) {
        const a = worldPoints[i]!;
        const b = worldPoints[i + 1]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const segLen = Math.hypot(dx, dz);
        if (segLen <= 0) continue;

        const midX = (a.x + b.x) / 2;
        const midZ = (a.z + b.z) / 2;
        const groundY = this.heightAt(midX, midZ);
        const heading = Math.atan2(dx, dz);

        const geo = flatPlaneGeometry(RIBBON_WIDTH_METERS, segLen);
        geo.rotateY(heading);
        geo.translate(midX, groundY + RIBBON_Y_OFFSET, midZ);

        const [r, g, b2] = hexToRGB(line.color);
        const position = geo.getAttribute('position');
        const count = position ? position.count : 0;
        const colors = new Float32Array(count * 3);
        for (let v = 0; v < count; v += 1) {
          colors[v * 3] = r;
          colors[v * 3 + 1] = g;
          colors[v * 3 + 2] = b2;
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        segmentGeometries.push(geo);
      }
    }

    if (segmentGeometries.length === 0) return;

    const merged = mergeGeometries(segmentGeometries, false);
    for (const geo of segmentGeometries) geo.dispose();
    if (!merged) return;

    const mesh = new THREE.Mesh(merged, this.ribbonMaterialFor());
    mesh.userData['underground'] = 'keep';
    this.ribbonMesh = mesh;
    this.scene.add(mesh);
  }

  private ribbonMaterialFor(): THREE.Material {
    return new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  }

  /** One set per vehicle the sim says the line runs, spaced at 1/served of the route. */
  private buildBuses(
    lines: readonly TransitLine[],
    served: readonly number[],
    routes: TransitSnapshot['routes'],
  ): void {
    const buses: ActiveVehicle[] = [];
    const colors: number[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      const vehicle = MODE_VEHICLE[modeOf(line)];
      const count = Math.max(0, Math.floor(served[i] ?? 0));
      if (count === 0) continue;

      // With routes sent, a line the sim could not route runs nothing.
      const worldPoints = routes ? routes[line.id] : toWorldPoints(line.stops);
      if (!worldPoints || worldPoints.length < 2) continue;
      const totalLength = polylineLength(worldPoints);
      if (totalLength <= 0) continue;

      // A bus is one vehicle; a train or a tram is a set of cars trailing the
      // one in front, so those modes emit CARS slots per set rather than one.
      // Every car of a set carries the set's own lead distance and its own
      // trail behind it, so the set moves as one thing — see ActiveVehicle.
      // The lead starts far enough along that the whole set is on the route.
      const setLength = (vehicle.carsPerSet - 1) * vehicle.pitch;
      const runway = Math.max(0, totalLength - setLength);
      for (let b = 0; b < count; b += 1) {
        const lead = setLength + (runway * b) / count; // sets evenly spaced along the runway
        for (let car = 0; car < vehicle.carsPerSet; car += 1) {
          if (buses.length >= MAX_TRANSIT_VEHICLE_SLOTS) break;
          const setCar = vehicle.set?.[car] ?? null;
          buses.push({
            points: worldPoints,
            totalLength,
            progress: lead % totalLength,
            trail: car * vehicle.pitch,
            size: vehicle.size,
            speed: vehicle.speed,
            keepsRight: vehicle.keepsRight,
            ridesGuideway: vehicle.ridesGuideway,
            car: setCar,
            flip: setCar?.flip ?? false,
            drawScale: setCar ? [1, 1, 1] : vehicle.size,
            railHeadY: vehicle.railHeadY,
            mesh: 0,
            index: 0,
          });
          colors.push(line.color);
        }
      }
    }

    this.busTotal = buses.length;
    this.buses = buses;
    this.busColors = colors;
    if (buses.length === 0) return;

    // One mesh per distinct geometry: every bus shares the bus kit's box, and a
    // train's two end cars share one geometry between them.
    const meshOf = new Map<unknown, number>();
    const members: ActiveVehicle[][] = [];
    for (const bus of buses) {
      const key = bus.car ? bus.car.geometry : this.busGeometry;
      let at = meshOf.get(key);
      if (at === undefined) {
        at = members.length;
        meshOf.set(key, at);
        members.push([]);
      }
      bus.mesh = at;
      bus.index = members[at]!.length;
      members[at]!.push(bus);
    }
    for (const group of members) {
      const car = group[0]!.car;
      const geometry = car ? this.railGeometry(car, group[0]!.size[1]) : this.busGeometry;
      const material = car ? this.railMaterial : this.busMaterial;
      const mesh = new THREE.InstancedMesh(geometry, material, group.length);
      mesh.count = group.length;
      if (car) {
        // The tint rides the same buffer as instanceColor, read by the region-masked material.
        const tint = new THREE.InstancedBufferAttribute(
          new Float32Array(group.length * 3).fill(1),
          3,
        );
        mesh.instanceColor = tint;
        geometry.setAttribute('vehicleInstanceTint', tint);
      }
      for (let i = 0; i < group.length; i += 1) mesh.setMatrixAt(i, HIDDEN_MATRIX);
      mesh.instanceMatrix.needsUpdate = true;
      this.carMeshes.push(mesh);
      this.scene.add(mesh);
    }

    // Places every bus at its initial position immediately, so a fresh
    // apply() reads correctly even before the next update(dt) call.
    this.update(0);
  }

  /** A rail car's geometry about its middle height, so the instance sits where a bus's does: centred over the track. */
  private railGeometry(car: SetCar, height: number): THREE.BufferGeometry {
    const geometry = car.geometry();
    geometry.translate(0, -height / 2, 0);
    this.carGeometries.push(geometry);
    return geometry;
  }

  private disposeMeshes(): void {
    for (const mesh of [this.shelterMesh, this.signPoleMesh, this.signMesh, ...this.carMeshes]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.dispose();
    }
    for (const geometry of this.carGeometries) geometry.dispose();
    this.carMeshes = [];
    this.carGeometries = [];
    if (this.ribbonMesh) {
      this.scene.remove(this.ribbonMesh);
      this.ribbonMesh.geometry.dispose();
      (this.ribbonMesh.material as THREE.Material).dispose();
    }

    this.shelterMesh = null;
    this.signPoleMesh = null;
    this.signMesh = null;
    this.ribbonMesh = null;
    this.buses = [];
    this.busColors = [];
    this.stopTotal = 0;
    this.busTotal = 0;
  }
}
