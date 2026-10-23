/**
 * Service-dispatch vehicle rendering: fire/police/ambulance/garbage/hearse
 * liveries riding the SAME shared vehicle buffer (SimSnapshot.vehicles) as
 * cosmetic cars/trucks/buses -- distinguished only by VehicleKind.Fire/
 * Police/Ambulance/Garbage/Hearse (see shared/types.ts's contract note). This file owns a
 * SEPARATE set of InstancedMeshes from render/vehicles.ts's VehicleRenderer:
 * VehicleRenderer's ALL_KINDS list is [Car, Truck, Bus] only, so it already
 * harmlessly hides any slot whose kind is a service kind (no match in its
 * kind-routing loop) -- this renderer is the one that actually draws those
 * slots, and widening ALL_KINDS would draw each of them twice.
 *
 * Extends the vehicle-kit style at a scope appropriate to a fixed,
 * baked livery per kind (not the per-instance palette-tint system
 * render/vehicles.ts needs for its randomized civilian fleet): a merged
 * multi-part box geometry (body + cabin/light-bar + wheels) with vertex
 * colors baked directly into the geometry per kind, reusing the same
 * lerp/lane-offset helpers as the civilian renderer for exact positioning
 * parity on shared roads. The sizes come from there too: one table of vehicle
 * dimensions serves the whole fleet, so a fire engine and the lorry beside it
 * are measured the same way.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  INACTIVE_VEHICLE_X,
  MAX_VEHICLES,
  VEHICLE_STRIDE,
  VehicleKind,
  type Incident,
} from '../shared/types';
import { tileToWorld } from '../shared/constants';
import { laneOffset, lerpVehicle, sizeForKind } from './vehicles';
import { ROAD_Y_OFFSET } from './roadsmesh';

const SERVICE_KINDS = [
  VehicleKind.Fire,
  VehicleKind.Police,
  VehicleKind.Ambulance,
  VehicleKind.Garbage,
  VehicleKind.Recycling,
  VehicleKind.Hearse,
] as const;
export type ServiceVehicleKind = (typeof SERVICE_KINDS)[number];

function isServiceKind(kind: number): kind is ServiceVehicleKind {
  return (
    kind === VehicleKind.Fire ||
    kind === VehicleKind.Police ||
    kind === VehicleKind.Ambulance ||
    kind === VehicleKind.Garbage ||
    kind === VehicleKind.Recycling ||
    kind === VehicleKind.Hearse
  );
}

function hexToRGB(hex: number): readonly [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

// ---------------------------------------------------------------------------
// Fixed liveries: fire=red, police=blue, ambulance=white, garbage=municipal
// green, plus a roof light-bar accent (red for fire/ambulance, red+blue read
// as "police" via the body blue itself, so the bar stays red -- genre-standard
// single-color bars). Garbage swaps the bar for a rear hopper + amber beacon.
// ---------------------------------------------------------------------------

const FIRE_RED = hexToRGB(0xd9362c);
const POLICE_BLUE = hexToRGB(0x2f6fd6);
const AMBULANCE_WHITE = hexToRGB(0xe9edf0);
/** An unanswered call's pin: its kind's colour dimmed toward ash, so it reads as a call nobody is coming to. */
const UNANSWERED_ASH = 0.22;
const UNANSWERED_KIND_SHARE = 0.2;
/**
 * A call's pin: a cone the selection pin's size, point down, hovering over the
 * roof of the building it marks (over the ground where there is none), grown
 * by up to half again by severity. Taller than a person, shorter than a
 * two-storey house, and never covering what it marks.
 */
export const INCIDENT_PIN_HEIGHT_M = 4.4;
export const INCIDENT_PIN_BASE_M = 1.6;
export const INCIDENT_PIN_HOVER_M = 2.5;
export const INCIDENT_PIN_SEVERITY_GROWTH = 0.5;

/**
 * Where a call on a tile is pinned: the lot centre and roof of the building
 * standing there, in world metres, or null where there is none. A lot's
 * anchor tile may be its back yard; the pin hangs over the building.
 */
export type PinAnchorLookup = (x: number, z: number) => { x: number; y: number; z: number } | null;
const GARBAGE_GREEN = hexToRGB(0x3f7d4f);
const GARBAGE_HOPPER = hexToRGB(0x2f5e3b);
const RECYCLING_TEAL = hexToRGB(0x1d9bb5);
const RECYCLING_HOPPER = hexToRGB(0x15738a);
const RECYCLING_CAB = hexToRGB(0xf2f5f7);
const CABIN_DARK = hexToRGB(0x1a1f26);
const LIGHTBAR_RED = hexToRGB(0xff2a20);
const LIGHTBAR_BLUE = hexToRGB(0x274b8f);
const BEACON_AMBER = hexToRGB(0xe0a020);
const RED_CROSS = hexToRGB(0xc21f2b);

function bodyColorForKind(kind: ServiceVehicleKind): readonly [number, number, number] {
  switch (kind) {
    case VehicleKind.Fire:
      return FIRE_RED;
    case VehicleKind.Police:
      return POLICE_BLUE;
    case VehicleKind.Recycling:
      return RECYCLING_TEAL;
    case VehicleKind.Ambulance:
      return AMBULANCE_WHITE;
    case VehicleKind.Garbage:
    default:
      // A kind this renderer has no livery for is drawn as a refuse truck.
      return GARBAGE_GREEN;
  }
}

function tagGeometry(
  geo: THREE.BufferGeometry,
  colorRGB: readonly [number, number, number],
): THREE.BufferGeometry {
  const position = geo.getAttribute('position');
  const count = position ? position.count : 0;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = colorRGB[0];
    colors[i * 3 + 1] = colorRGB[1];
    colors[i * 3 + 2] = colorRGB[2];
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function box(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  colorRGB: readonly [number, number, number],
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(cx, cy, cz);
  return tagGeometry(geo, colorRGB);
}

function buildWheelParts(): THREE.BufferGeometry[] {
  const centers: ReadonlyArray<readonly [number, number, number]> = [
    [0.46, -0.28, 0.34],
    [0.46, -0.28, -0.34],
    [-0.46, -0.28, 0.34],
    [-0.46, -0.28, -0.34],
  ];
  return centers.map(([cx, cy, cz]) => box(0.16, 0.34, 0.34, cx, cy, cz, CABIN_DARK));
}

// The hearse's livery is the game's own choice: no source for a coach colour
// was found, so it is the black of the funeral trade with chrome-grey trim.
const HEARSE_BLACK = hexToRGB(0x0d0d10);
const HEARSE_ROOF = hexToRGB(0x1d1d22);
const HEARSE_GLASS = hexToRGB(0x34424f);
const HEARSE_CHROME = hexToRGB(0xb9bec4);
const HEARSE_TYRE = hexToRGB(0x15171a);
const HEARSE_HEADLIGHT = hexToRGB(0xf0ecd8);
const HEARSE_TAILLIGHT = hexToRGB(0x8c1f1f);

/**
 * The hearse in unit-box space like every other service body, drawn in metres
 * on the ground and normalised by the kind's own size: a long hood, a short
 * cabin, and a closed landau coach behind it with a padded roof, tinted rear
 * glass and chrome landau bars. No light bar, no cross. The body, wheels and
 * trim reach the whole of the 1.9 × 1.9 × 6.2 m the kind is sized to.
 */
function buildHearseGeometry(): THREE.BufferGeometry {
  const [sx, sy, sz] = sizeForKind(VehicleKind.Hearse);
  const hw = sx / 2;
  const hl = sz / 2;
  // Metre extents (x0..x1 across, y0..y1 up from the road, z0..z1 front-to-rear with +z the nose).
  const slab = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    colorRGB: readonly [number, number, number],
  ): THREE.BufferGeometry =>
    box(
      (x1 - x0) / sx,
      (y1 - y0) / sy,
      (z1 - z0) / sz,
      (x0 + x1) / 2 / sx,
      (y0 + y1) / 2 / sy - 0.5,
      (z0 + z1) / 2 / sz,
      colorRGB,
    );
  const body = hw - 0.02;
  const parts: THREE.BufferGeometry[] = [
    slab(-body, body, 0.3, 1.05, -hl + 0.1, hl - 0.1, HEARSE_BLACK),
    // The coach: closed sides to the roofline, a padded landau roof over it.
    slab(-body + 0.02, body - 0.02, 1.05, 1.82, -hl + 0.1, 0.45, HEARSE_BLACK),
    slab(-body + 0.06, body - 0.06, 1.82, sy, -hl + 0.15, 0.4, HEARSE_ROOF),
    // The cabin's glass and its roof.
    slab(-body + 0.04, body - 0.04, 1.05, 1.56, 0.45, 1.9, HEARSE_GLASS),
    slab(-body + 0.04, body - 0.04, 1.56, 1.62, 0.4, 1.95, HEARSE_BLACK),
  ];
  for (const side of [-1, 1]) {
    const outer = side * body;
    const x0 = Math.min(outer, outer + side * 0.02);
    const x1 = Math.max(outer, outer + side * 0.02);
    // Tinted rear side glass and the chrome landau bars either end of it.
    parts.push(slab(x0, x1, 1.2, 1.65, -hl + 0.55, 0.15, HEARSE_GLASS));
    parts.push(slab(x0, x1, 1.1, 1.8, 0.15, 0.3, HEARSE_CHROME));
    parts.push(slab(x0, x1, 1.1, 1.8, -hl + 0.4, -hl + 0.55, HEARSE_CHROME));
    // The tyres reach the full width; head and tail lamps sit in the nose and tail.
    const tyreOuter = side * hw;
    const tyreInner = tyreOuter - side * 0.3;
    for (const z of [2.0, -1.9]) {
      parts.push(
        slab(
          Math.min(tyreOuter, tyreInner),
          Math.max(tyreOuter, tyreInner),
          0,
          0.7,
          z - 0.35,
          z + 0.35,
          HEARSE_TYRE,
        ),
      );
    }
    parts.push(slab(side * 0.55, side * 0.85, 0.65, 0.85, hl - 0.12, hl, HEARSE_HEADLIGHT));
    parts.push(slab(side * 0.55, side * 0.85, 0.65, 0.85, -hl, -hl + 0.12, HEARSE_TAILLIGHT));
  }
  // The chrome beltline the full width, grille and the two bumpers.
  parts.push(slab(-hw, hw, 1.05, 1.1, -hl + 0.1, hl - 0.1, HEARSE_CHROME));
  parts.push(slab(-0.45, 0.45, 0.5, 0.9, hl - 0.12, hl, HEARSE_CHROME));
  parts.push(slab(-hw + 0.05, hw - 0.05, 0.3, 0.55, hl - 0.1, hl, HEARSE_CHROME));
  parts.push(slab(-hw + 0.05, hw - 0.05, 0.3, 0.55, -hl, -hl + 0.1, HEARSE_CHROME));
  // The rear glass in the tail.
  parts.push(slab(-0.75, 0.75, 1.2, 1.65, -hl + 0.08, -hl + 0.1, HEARSE_GLASS));

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged)
    throw new Error('buildServiceVehicleGeometry: mergeGeometries failed for the hearse');
  return merged;
}

/**
 * Builds the merged multi-part geometry for one service-vehicle kind: body
 * slab (livery color) + cabin/window band (dark) + 4 simple wheel boxes, all
 * vertex-colored (no per-instance tinting is needed since the livery is fixed
 * per kind, not randomized). Emergency kinds add a roof light-bar (kind's
 * accent color); garbage adds a raised rear hopper + amber beacon instead.
 */
export function buildServiceVehicleGeometry(kind: ServiceVehicleKind): THREE.BufferGeometry {
  if (kind === VehicleKind.Hearse) return buildHearseGeometry();
  const body = bodyColorForKind(kind);

  const parts: THREE.BufferGeometry[] = [
    box(0.92, 0.56, 0.94, 0, -0.2, 0, body),
    box(0.7, 0.3, 0.5, 0, 0.22, 0.05, kind === VehicleKind.Recycling ? RECYCLING_CAB : CABIN_DARK),
    ...buildWheelParts(),
  ];

  if (kind === VehicleKind.Garbage || kind === VehicleKind.Recycling) {
    // Refuse/recycling truck: a raised rear hopper/compactor box over the back
    // ~40% of the body (darker than the body) plus a small amber beacon -- no
    // emergency bar.
    const hopper = kind === VehicleKind.Recycling ? RECYCLING_HOPPER : GARBAGE_HOPPER;
    parts.push(box(0.86, 0.66, 0.38, 0, 0.13, -0.27, hopper));
    parts.push(box(0.16, 0.1, 0.14, 0, 0.42, 0.05, BEACON_AMBER));
  } else {
    // Emergency roof light-bar (blue for police, red for fire/ambulance).
    const lightbar = kind === VehicleKind.Police ? LIGHTBAR_BLUE : LIGHTBAR_RED;
    parts.push(box(0.5, 0.12, 0.32, 0, 0.42, -0.05, lightbar));
  }

  if (kind === VehicleKind.Ambulance) {
    // Small red-cross accent on the roof, front of the light bar.
    parts.push(box(0.22, 0.08, 0.08, 0, 0.42, 0.2, RED_CROSS));
    parts.push(box(0.08, 0.08, 0.22, 0, 0.42, 0.2, RED_CROSS));
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged)
    throw new Error(`buildServiceVehicleGeometry: mergeGeometries failed for kind ${kind}`);
  return merged;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Renders fire/police/ambulance InstancedMeshes from the shared
 * SimSnapshot.vehicles buffer (same slot layout/stride as the civilian
 * VehicleRenderer), plus a marker pin InstancedMesh at every active
 * Incident.
 */
export class ServiceVehicleRenderer {
  private readonly heightAt: (x: number, z: number) => number;
  private readonly pinAnchorAt: PinAnchorLookup | null;
  private readonly meshes: Record<ServiceVehicleKind, THREE.InstancedMesh>;
  private prevBuffer: Float32Array | null = null;
  private currBuffer: Float32Array | null = null;

  private readonly incidentMesh: THREE.InstancedMesh;
  private readonly incidentCapacity: number;

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    incidentCapacity = 64,
    /**
     * Where a call on a tile is pinned: the lot centre and roof of the
     * building standing there, in world metres, or null where there is none.
     * Omitted, every pin hovers over its tile's centre on the ground.
     */
    pinAnchorAt: PinAnchorLookup | null = null,
  ) {
    this.heightAt = heightAt;
    this.pinAnchorAt = pinAnchorAt;
    this.incidentCapacity = incidentCapacity;

    const meshes = {} as Record<ServiceVehicleKind, THREE.InstancedMesh>;
    for (const kind of SERVICE_KINDS) {
      const geometry = buildServiceVehicleGeometry(kind);
      const material = new THREE.MeshLambertMaterial({ vertexColors: true });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_VEHICLES);
      mesh.castShadow = true; // shadow sweep: service vehicles cast, matching VehicleRenderer
      mesh.frustumCulled = false; // spans the whole road network, moves every frame (matches VehicleRenderer)
      mesh.userData.vehicleKind = kind;
      for (let i = 0; i < MAX_VEHICLES; i++) mesh.setMatrixAt(i, HIDDEN_MATRIX);
      mesh.count = MAX_VEHICLES;
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      meshes[kind] = mesh;
    }
    this.meshes = meshes;

    // A plain (uncolored) cone; per-marker color is carried entirely by
    // InstancedMesh.setColorAt/instanceColor below (three.js applies it via
    // instancing regardless of the material's own vertexColors flag). Turned
    // point down, with its point at y = 0 and its base at y = 1, so an
    // instance's position is where the point hovers.
    const pinGeometry = new THREE.ConeGeometry(1, 1, 8);
    pinGeometry.rotateX(Math.PI);
    pinGeometry.translate(0, 0.5, 0);
    const pinMaterial = new THREE.MeshBasicMaterial();
    this.incidentMesh = new THREE.InstancedMesh(pinGeometry, pinMaterial, incidentCapacity);
    this.incidentMesh.frustumCulled = false;
    this.incidentMesh.count = incidentCapacity;
    // The colour buffer has to exist before the first draw: a material compiled
    // without it never picks one up later, and every pin drew white.
    _color.setRGB(1, 1, 1);
    for (let i = 0; i < incidentCapacity; i++) {
      this.incidentMesh.setMatrixAt(i, HIDDEN_MATRIX);
      this.incidentMesh.setColorAt(i, _color);
    }
    this.incidentMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.incidentMesh);
  }

  private meshFor(kind: ServiceVehicleKind): THREE.InstancedMesh {
    const mesh = this.meshes[kind];
    if (!mesh) throw new RangeError(`ServiceVehicleRenderer: no mesh for kind ${kind}`);
    return mesh;
  }

  /** Same double-buffer contract as VehicleRenderer.setBuffer -- call once per snapshot with the SHARED vehicles buffer. */
  setBuffer(buf: Float32Array): void {
    this.prevBuffer = this.currBuffer ?? buf;
    this.currBuffer = buf;
  }

  /** Same alpha contract as VehicleRenderer.update -- see its doc comment for the speed-scaling rationale. */
  update(alphaToNext: number): void {
    const curr = this.currBuffer;
    if (!curr) return;
    const prev = this.prevBuffer ?? curr;

    for (let slot = 0; slot < MAX_VEHICLES; slot++) {
      const base = slot * VEHICLE_STRIDE;
      const currKind = curr[base + 4] ?? VehicleKind.Car;

      if (!isServiceKind(currKind)) {
        for (const kind of SERVICE_KINDS) this.meshFor(kind).setMatrixAt(slot, HIDDEN_MATRIX);
        continue;
      }

      const prevSlot = [
        prev[base] ?? INACTIVE_VEHICLE_X,
        prev[base + 1] ?? 0,
        prev[base + 2] ?? 0,
        prev[base + 3] ?? 0,
        prev[base + 4] ?? 0,
      ];
      const currSlot = [
        curr[base] ?? INACTIVE_VEHICLE_X,
        curr[base + 1] ?? 0,
        curr[base + 2] ?? 0,
        curr[base + 3] ?? 0,
        curr[base + 4] ?? 0,
      ];
      const { x, z, heading } = lerpVehicle(prevSlot, currSlot, alphaToNext);

      if (x === INACTIVE_VEHICLE_X) {
        for (const kind of SERVICE_KINDS) this.meshFor(kind).setMatrixAt(slot, HIDDEN_MATRIX);
        continue;
      }

      const kind = currKind;
      const [sx, sy, sz] = sizeForKind(kind);
      const offset = laneOffset(heading);
      const renderX = x + offset.dx;
      const renderZ = z + offset.dz;
      // Ride ON the road plate, not the bare terrain under it (wheel clipping).
      const groundY = this.heightAt(renderX, renderZ) + ROAD_Y_OFFSET;

      _position.set(renderX, groundY + sy / 2, renderZ);
      _quaternion.setFromAxisAngle(_yAxis, heading);
      _scale.set(sx, sy, sz);
      _matrix.compose(_position, _quaternion, _scale);

      for (const meshKind of SERVICE_KINDS) {
        const mesh = this.meshFor(meshKind);
        if (meshKind === kind) mesh.setMatrixAt(slot, _matrix);
        else mesh.setMatrixAt(slot, HIDDEN_MATRIX);
      }
    }

    for (const kind of SERVICE_KINDS) {
      this.meshFor(kind).instanceMatrix.needsUpdate = true;
    }
  }

  /** Colors an incident marker pin by kind: fire=red, crime=blue, medical=white-pink. */
  private colorForIncident(kind: Incident['kind']): readonly [number, number, number] {
    switch (kind) {
      case 'fire':
        return FIRE_RED;
      case 'crime':
        return POLICE_BLUE;
      case 'medical':
      default:
        return AMBULANCE_WHITE;
    }
  }

  /**
   * Places one marker pin per active incident (up to `incidentCapacity`,
   * silently truncating any excess -- MAX_SERVICE_VEHICLES caps the sim side
   * well under any reasonable capacity here), its point hovering over the
   * lot centre and roof of the building it marks, or over its tile's centre
   * on the ground where there is none, and grown by severity. Call once per
   * snapshot.
   */
  setIncidents(incidents: readonly Incident[]): void {
    const n = Math.min(incidents.length, this.incidentCapacity);
    for (let i = 0; i < n; i++) {
      const incident = incidents[i]!;
      const tileX = tileToWorld(incident.x);
      const tileZ = tileToWorld(incident.z);
      const anchor = this.pinAnchorAt?.(incident.x, incident.z) ?? {
        x: tileX,
        y: this.heightAt(tileX, tileZ),
        z: tileZ,
      };
      const severity = Math.min(1, Math.max(0, incident.severity));
      const grown = 1 + INCIDENT_PIN_SEVERITY_GROWTH * severity;

      _position.set(anchor.x, anchor.y + INCIDENT_PIN_HOVER_M, anchor.z);
      _quaternion.identity();
      _scale.set(
        (INCIDENT_PIN_BASE_M / 2) * grown,
        INCIDENT_PIN_HEIGHT_M * grown,
        (INCIDENT_PIN_BASE_M / 2) * grown,
      );
      _matrix.compose(_position, _quaternion, _scale);
      this.incidentMesh.setMatrixAt(i, _matrix);

      const [r, g, b] = this.colorForIncident(incident.kind);
      if (incident.answered === false) {
        _color.setRGB(
          r * UNANSWERED_KIND_SHARE + UNANSWERED_ASH * (1 - UNANSWERED_KIND_SHARE),
          g * UNANSWERED_KIND_SHARE + UNANSWERED_ASH * (1 - UNANSWERED_KIND_SHARE),
          b * UNANSWERED_KIND_SHARE + UNANSWERED_ASH * (1 - UNANSWERED_KIND_SHARE),
        );
      } else {
        _color.setRGB(r, g, b);
      }
      this.incidentMesh.setColorAt(i, _color);
    }
    for (let i = n; i < this.incidentCapacity; i++) {
      this.incidentMesh.setMatrixAt(i, HIDDEN_MATRIX);
    }
    this.incidentMesh.instanceMatrix.needsUpdate = true;
    if (this.incidentMesh.instanceColor) this.incidentMesh.instanceColor.needsUpdate = true;
  }
}
