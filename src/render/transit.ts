/**
 * Bus transit rendering: instanced
 * bus-stop SHELTERS at every line's stops, a colored route ribbon per line,
 * and cosmetic buses animated along that ribbon whose count derives from the
 * line's statistical ridership. Reuses render/vehicles.ts's shared bus
 * geometry builder + the "drive on the right" lane offset so cosmetic
 * transit buses read exactly like the regular traffic vehicle kit.
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
 * Bus-stop shelter: a
 * low-poly shelter -- a flat roof canopy on 2 posts, a bench slab, and a
 * stop sign on its own pole just beyond one end. The stop's own position/data
 * (`TilePoint`) is untouched; only the visual model at that position grows.
 * Since the transit snapshot carries no road-tangent data, the shelter's
 * "long" axis (the 2 roof posts + bench) instead follows the LINE's own
 * local direction of travel through that stop (heading to the next stop, or
 * from the previous one for a line's last stop, or 0 for a lone-stop line --
 * the same "best available approximation" spirit as the ribbon/bus path
 * above), and it sits laterally offset from the stop's exact tile point, to
 * a side alternated deterministically by hash(tile) -- reading as "beside
 * the route" rather than dead-center on top of the existing stop position.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildVehicleGeometry, laneOffset } from './vehicles';
import { VehicleKind, type TilePoint, type TransitLine } from '../shared/types';
import { TILE_METERS, tileToWorld } from '../shared/constants';

/** Matches SimSnapshot.transit's shape (shared/types.ts) without importing the whole SimSnapshot type. */
export interface TransitSnapshot {
  lines: TransitLine[];
  ridership: number[];
}

// ---------------------------------------------------------------------------
// Bus-stop shelter
// ---------------------------------------------------------------------------

/** The stop SIGN rides its own slim pole just beyond one end of the shelter. */
const STOP_POST_HEIGHT = 3.0;
const STOP_POST_RADIUS = 0.1;
const STOP_SIGN_SIZE: readonly [number, number, number] = [0.6, 0.5, 0.06];
const STOP_SIGN_Y_OFFSET = STOP_POST_HEIGHT * 0.42;

const SHELTER_POST_HEIGHT = 2.6;
const SHELTER_POST_RADIUS = 0.06;
/** Distance between the shelter's 2 roof posts, along its local "long" axis (the line's local direction of travel). */
const SHELTER_WIDTH = 2.4;
/** Roof/bench extent across the shelter's "short" axis (perpendicular to travel). */
const SHELTER_DEPTH = 1.2;
const SHELTER_ROOF_OVERHANG = 0.3;
const SHELTER_ROOF_THICKNESS = 0.08;
const SHELTER_BENCH_HEIGHT = 0.45;
const SHELTER_BENCH_THICKNESS = 0.08;
const SHELTER_BENCH_DEPTH_FRACTION = 0.6;
const SHELTER_BENCH_WIDTH_FRACTION = 0.8;
/** How far the shelter sits from the stop's own tile point, off to one side of the route (its lateral offset). */
const SHELTER_LATERAL_OFFSET_METERS = TILE_METERS * 0.3;
const SHELTER_POST_COLOR = 0x53585d;
const SHELTER_ROOF_COLOR = 0x8a8f94;
const SHELTER_BENCH_COLOR = 0x8a6a4a;

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

/** Cruise speed for cosmetic transit buses along their route polyline. */
const BUS_SPEED_MPS = TILE_METERS * 2; // 32 m/s, in the same ballpark as traffic.ts's cruise speeds

/** Riders "absorbed" per visible cosmetic bus -- purely a density knob, not a capacity model. */
export const RIDERSHIP_PER_BUS = 40;
export const MAX_BUSES_PER_LINE = 6;

/** Fixed-capacity pool sizing: MAX_TRANSIT_LINES * MAX_BUSES_PER_LINE upper bound. */
const MAX_TRANSIT_LINES = 32;
const MAX_BUSES = MAX_TRANSIT_LINES * MAX_BUSES_PER_LINE;

/**
 * Deterministic cosmetic bus count for a line from its ridership figure:
 * one bus per RIDERSHIP_PER_BUS riders, rounded, clamped to
 * [0, MAX_BUSES_PER_LINE]. Monotonic non-decreasing in ridership.
 */
export function ridershipToBusCount(ridership: number): number {
  if (!(ridership > 0)) return 0;
  const raw = Math.round(ridership / RIDERSHIP_PER_BUS);
  return Math.min(MAX_BUSES_PER_LINE, Math.max(0, raw));
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
  /** The 2 roof posts, on either end of the shelter's long axis. */
  postA: WorldPoint;
  postB: WorldPoint;
  roofCenter: WorldPoint;
  benchCenter: WorldPoint;
  /** The stop sign's own pole, just beyond one end of the shelter. */
  signPole: WorldPoint;
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

interface ActiveBus {
  readonly points: readonly WorldPoint[];
  readonly totalLength: number;
  progress: number; // meters travelled along the polyline, loops modulo totalLength
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _identityQuat = new THREE.Quaternion();
/** Scratch quaternion for the shelter roof/bench/sign's heading-aligned yaw (reused per-instance, never retained). */
const _headingQuat = new THREE.Quaternion();
const _unitScale = new THREE.Vector3(1, 1, 1);
const _busScale = new THREE.Vector3(...BUS_SIZE);
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

function hexToRGB(hex: number): readonly [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

function flatPlaneGeometry(w: number, d: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export class TransitRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;

  // -- Shelter: 2 roof posts, a flat roof canopy, a bench
  // slab -- structural, fixed material colors (not route-tinted). ----------
  private readonly shelterPostGeometry = new THREE.CylinderGeometry(
    SHELTER_POST_RADIUS,
    SHELTER_POST_RADIUS * 1.3,
    SHELTER_POST_HEIGHT,
    6,
  );
  private readonly shelterPostMaterial = new THREE.MeshLambertMaterial({
    color: SHELTER_POST_COLOR,
  });
  private readonly shelterRoofGeometry = new THREE.BoxGeometry(
    SHELTER_DEPTH + SHELTER_ROOF_OVERHANG,
    SHELTER_ROOF_THICKNESS,
    SHELTER_WIDTH + SHELTER_ROOF_OVERHANG,
  );
  private readonly shelterRoofMaterial = new THREE.MeshLambertMaterial({
    color: SHELTER_ROOF_COLOR,
  });
  private readonly shelterBenchGeometry = new THREE.BoxGeometry(
    SHELTER_DEPTH * SHELTER_BENCH_DEPTH_FRACTION,
    SHELTER_BENCH_THICKNESS,
    SHELTER_WIDTH * SHELTER_BENCH_WIDTH_FRACTION,
  );
  private readonly shelterBenchMaterial = new THREE.MeshLambertMaterial({
    color: SHELTER_BENCH_COLOR,
  });

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

  private shelterPostMesh: THREE.InstancedMesh | null = null;
  private shelterRoofMesh: THREE.InstancedMesh | null = null;
  private shelterBenchMesh: THREE.InstancedMesh | null = null;
  private signPoleMesh: THREE.InstancedMesh | null = null;
  private signMesh: THREE.InstancedMesh | null = null;
  private ribbonMesh: THREE.Mesh | null = null;
  private busMesh: THREE.InstancedMesh | null = null;

  private buses: (ActiveBus | null)[] = [];
  private busColors: number[] = [];
  private visible = true;
  private stopTotal = 0;
  private lineTotal = 0;
  private busTotal = 0;

  constructor(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
    this.scene = scene;
    this.heightAt = heightAt;
  }

  /** Full rebuild from the worker's transit snapshot (lines change relatively rarely). */
  apply(snapshot: TransitSnapshot): void {
    this.disposeMeshes();

    this.lineTotal = snapshot.lines.length;
    this.buildShelters(snapshot.lines);
    this.buildRibbon(snapshot.lines);
    this.buildBuses(snapshot.lines, snapshot.ridership);

    this.applyVisibility();
  }

  /** Advances every cosmetic bus along its line's polyline by `deltaSeconds` worth of travel. */
  update(deltaSeconds: number): void {
    if (!this.busMesh) return;

    for (let slot = 0; slot < this.buses.length; slot += 1) {
      const bus = this.buses[slot];
      if (!bus) {
        this.busMesh.setMatrixAt(slot, HIDDEN_MATRIX);
        continue;
      }

      if (bus.totalLength > 0) {
        bus.progress = (bus.progress + BUS_SPEED_MPS * deltaSeconds) % bus.totalLength;
        if (bus.progress < 0) bus.progress += bus.totalLength;
      }

      const sample = sampleAlongPolyline(bus.points, bus.progress);
      const offset = laneOffset(sample.heading);
      const renderX = sample.x + offset.dx;
      const renderZ = sample.z + offset.dz;
      const groundY = this.heightAt(renderX, renderZ);

      _position.set(renderX, groundY + BUS_SIZE[1] / 2, renderZ);
      _quaternion.setFromAxisAngle(_yAxis, sample.heading);
      _matrix.compose(_position, _quaternion, _busScale);
      this.busMesh.setMatrixAt(slot, _matrix);

      const [r, g, b] = hexToRGB(this.busColors[slot] ?? 0xffffff);
      _color.setRGB(r, g, b);
      this.busMesh.setColorAt(slot, _color);
    }

    this.busMesh.instanceMatrix.needsUpdate = true;
    if (this.busMesh.instanceColor) this.busMesh.instanceColor.needsUpdate = true;
  }

  /** Transit-lens visibility toggle: hides/shows every owned mesh without disposing them. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.applyVisibility();
  }

  isVisible(): boolean {
    return this.visible;
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

  /** Instance count of the shelter's 2 roof posts layer (2x stopCount() once built). */
  shelterPostInstanceCount(): number {
    return this.shelterPostMesh?.count ?? 0;
  }

  shelterRoofInstanceCount(): number {
    return this.shelterRoofMesh?.count ?? 0;
  }

  shelterBenchInstanceCount(): number {
    return this.shelterBenchMesh?.count ?? 0;
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

  private applyVisibility(): void {
    if (this.shelterPostMesh) this.shelterPostMesh.visible = this.visible;
    if (this.shelterRoofMesh) this.shelterRoofMesh.visible = this.visible;
    if (this.shelterBenchMesh) this.shelterBenchMesh.visible = this.visible;
    if (this.signPoleMesh) this.signPoleMesh.visible = this.visible;
    if (this.signMesh) this.signMesh.visible = this.visible;
    if (this.ribbonMesh) this.ribbonMesh.visible = this.visible;
    if (this.busMesh) this.busMesh.visible = this.visible;
  }

  private buildShelters(lines: readonly TransitLine[]): void {
    const placements: { x: number; z: number; color: number; heading: number }[] = [];
    for (const line of lines) {
      const worldPoints = toWorldPoints(line.stops);
      for (let i = 0; i < line.stops.length; i += 1) {
        const stop = line.stops[i]!;
        const heading = computeStopHeading(worldPoints, i);
        placements.push({ x: stop.x, z: stop.z, color: line.color, heading });
      }
    }

    this.stopTotal = placements.length;
    if (placements.length === 0) return;

    const shelterPostMesh = new THREE.InstancedMesh(
      this.shelterPostGeometry,
      this.shelterPostMaterial,
      placements.length * 2,
    );
    const shelterRoofMesh = new THREE.InstancedMesh(
      this.shelterRoofGeometry,
      this.shelterRoofMaterial,
      placements.length,
    );
    const shelterBenchMesh = new THREE.InstancedMesh(
      this.shelterBenchGeometry,
      this.shelterBenchMaterial,
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
    shelterPostMesh.count = placements.length * 2;
    shelterRoofMesh.count = placements.length;
    shelterBenchMesh.count = placements.length;
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

      const groundYPostA = this.heightAt(layout.postA.x, layout.postA.z);
      _position.set(layout.postA.x, groundYPostA + SHELTER_POST_HEIGHT / 2, layout.postA.z);
      _matrix.compose(_position, _identityQuat, _unitScale);
      shelterPostMesh.setMatrixAt(i * 2, _matrix);

      const groundYPostB = this.heightAt(layout.postB.x, layout.postB.z);
      _position.set(layout.postB.x, groundYPostB + SHELTER_POST_HEIGHT / 2, layout.postB.z);
      _matrix.compose(_position, _identityQuat, _unitScale);
      shelterPostMesh.setMatrixAt(i * 2 + 1, _matrix);

      const groundYRoof = this.heightAt(layout.roofCenter.x, layout.roofCenter.z);
      _position.set(
        layout.roofCenter.x,
        groundYRoof + SHELTER_POST_HEIGHT + SHELTER_ROOF_THICKNESS / 2,
        layout.roofCenter.z,
      );
      _matrix.compose(_position, _headingQuat, _unitScale);
      shelterRoofMesh.setMatrixAt(i, _matrix);

      const groundYBench = this.heightAt(layout.benchCenter.x, layout.benchCenter.z);
      _position.set(
        layout.benchCenter.x,
        groundYBench + SHELTER_BENCH_HEIGHT,
        layout.benchCenter.z,
      );
      _matrix.compose(_position, _headingQuat, _unitScale);
      shelterBenchMesh.setMatrixAt(i, _matrix);

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

    shelterPostMesh.instanceMatrix.needsUpdate = true;
    shelterRoofMesh.instanceMatrix.needsUpdate = true;
    shelterBenchMesh.instanceMatrix.needsUpdate = true;
    signPoleMesh.instanceMatrix.needsUpdate = true;
    signMesh.instanceMatrix.needsUpdate = true;
    if (signPoleMesh.instanceColor) signPoleMesh.instanceColor.needsUpdate = true;
    if (signMesh.instanceColor) signMesh.instanceColor.needsUpdate = true;

    // Shelter parts read as grounded: cast + receive shadows.
    shelterPostMesh.castShadow = true;
    shelterPostMesh.receiveShadow = true;
    shelterRoofMesh.castShadow = true;
    shelterRoofMesh.receiveShadow = true;
    shelterBenchMesh.castShadow = true;
    shelterBenchMesh.receiveShadow = true;
    signPoleMesh.castShadow = true;
    signPoleMesh.receiveShadow = true;
    signMesh.castShadow = true;
    signMesh.receiveShadow = true;

    this.shelterPostMesh = shelterPostMesh;
    this.shelterRoofMesh = shelterRoofMesh;
    this.shelterBenchMesh = shelterBenchMesh;
    this.signPoleMesh = signPoleMesh;
    this.signMesh = signMesh;
    this.scene.add(shelterPostMesh, shelterRoofMesh, shelterBenchMesh, signPoleMesh, signMesh);
  }

  private buildRibbon(lines: readonly TransitLine[]): void {
    const segmentGeometries: THREE.BufferGeometry[] = [];

    for (const line of lines) {
      const worldPoints = toWorldPoints(line.stops);
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
    this.ribbonMesh = mesh;
    this.scene.add(mesh);
  }

  private ribbonMaterialFor(): THREE.Material {
    return new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  }

  private buildBuses(lines: readonly TransitLine[], ridership: readonly number[]): void {
    const buses: (ActiveBus | null)[] = [];
    const colors: number[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      const riders = ridership[i] ?? 0;
      const count = ridershipToBusCount(riders);
      if (count === 0) continue;

      const worldPoints = toWorldPoints(line.stops);
      if (worldPoints.length < 2) continue;
      const totalLength = polylineLength(worldPoints);
      if (totalLength <= 0) continue;

      for (let b = 0; b < count; b += 1) {
        if (buses.length >= MAX_BUSES) break;
        buses.push({
          points: worldPoints,
          totalLength,
          progress: (totalLength * b) / count, // evenly spaced along the route
        });
        colors.push(line.color);
      }
    }

    this.busTotal = buses.length;
    this.buses = buses;
    this.busColors = colors;
    if (buses.length === 0) return;

    const mesh = new THREE.InstancedMesh(this.busGeometry, this.busMaterial, buses.length);
    mesh.count = buses.length;
    for (let i = 0; i < buses.length; i += 1) mesh.setMatrixAt(i, HIDDEN_MATRIX);
    mesh.instanceMatrix.needsUpdate = true;
    this.busMesh = mesh;
    this.scene.add(mesh);

    // Places every bus at its initial position immediately, so a fresh
    // apply() reads correctly even before the next update(dt) call.
    this.update(0);
  }

  private disposeMeshes(): void {
    if (this.shelterPostMesh) this.scene.remove(this.shelterPostMesh);
    if (this.shelterRoofMesh) this.scene.remove(this.shelterRoofMesh);
    if (this.shelterBenchMesh) this.scene.remove(this.shelterBenchMesh);
    if (this.signPoleMesh) this.scene.remove(this.signPoleMesh);
    if (this.signMesh) this.scene.remove(this.signMesh);
    if (this.ribbonMesh) {
      this.scene.remove(this.ribbonMesh);
      this.ribbonMesh.geometry.dispose();
      (this.ribbonMesh.material as THREE.Material).dispose();
    }
    if (this.busMesh) this.scene.remove(this.busMesh);

    this.shelterPostMesh = null;
    this.shelterRoofMesh = null;
    this.shelterBenchMesh = null;
    this.signPoleMesh = null;
    this.signMesh = null;
    this.ribbonMesh = null;
    this.busMesh = null;
    this.buses = [];
    this.busColors = [];
    this.stopTotal = 0;
    this.busTotal = 0;
  }
}
