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
const RED_CROSS = hexToRGB(0xc21f2b);

const POLICE_PANEL = hexToRGB(0xf2f4f6);
const BUMPER_STEEL = hexToRGB(0x3a4048);
const PUMP_PANEL = hexToRGB(0x5b6670);
const LADDER_GREY = hexToRGB(0xb4bcc4);

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

type Rgb = readonly [number, number, number];

/**
 * A metre-space box builder for one kind: x across, y up from the road, z
 * front-to-rear with +z the nose, normalised by the kind's own size into the
 * unit box the instance matrix scales back up (so a part reads as its real
 * dimensions).
 */
type Slab = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  colorRGB: Rgb,
) => THREE.BufferGeometry;

function slabFor(kind: ServiceVehicleKind): Slab {
  const [sx, sy, sz] = sizeForKind(kind);
  return (x0, x1, y0, y1, z0, z1, colorRGB) =>
    box(
      (x1 - x0) / sx,
      (y1 - y0) / sy,
      (z1 - z0) / sz,
      (x0 + x1) / 2 / sx,
      (y0 + y1) / 2 / sy - 0.5,
      (z0 + z1) / 2 / sz,
      colorRGB,
    );
}

/** A box whose top edge at the rear end is dropped by `dropM`, so its roof slopes down to the tail. */
function rampFor(kind: ServiceVehicleKind, slab: Slab) {
  const [, sy, sz] = sizeForKind(kind);
  return (...args: [...Parameters<Slab>, number]): THREE.BufferGeometry => {
    const [x0, x1, y0, y1, z0, z1, colorRGB, dropM] = args;
    const geo = slab(x0, x1, y0, y1, z0, z1, colorRGB);
    const pos = geo.getAttribute('position');
    const midY = (y0 + y1) / 2 / sy - 0.5;
    const midZ = (z0 + z1) / 2 / sz;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > midY && pos.getZ(i) < midZ) pos.setY(i, pos.getY(i) - dropM / sy);
    }
    geo.computeVertexNormals();
    return geo;
  };
}

/** One tyre either side of the body at each of `zs`, `radius` high and reaching the width `outer` from the centre line. */
function tyres(
  slab: Slab,
  zs: readonly number[],
  outer: number,
  radius: number,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of zs) {
    for (const side of [-1, 1]) {
      const a = side * outer;
      const b = side * (outer - 0.3);
      parts.push(
        slab(Math.min(a, b), Math.max(a, b), 0, radius * 2, z - radius, z + radius, CABIN_DARK),
      );
    }
  }
  return parts;
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
  const slab = slabFor(VehicleKind.Hearse);
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
 * A patrol SUV, 2.0 x 1.76 x 5.05 m: a livery body, a glasshouse under a roof,
 * a white door panel each side so it reads as a patrol car without its bar,
 * and a roof light bar (red and blue halves, 1.2 m wide) over the front doors.
 * The first part is the body, in the kind's livery colour.
 */
function buildPoliceParts(): THREE.BufferGeometry[] {
  const slab = slabFor(VehicleKind.Police);
  const parts = [
    slab(-0.97, 0.97, 0.38, 1.0, -2.525, 2.525, POLICE_BLUE),
    slab(-0.88, 0.88, 1.0, 1.5, -1.75, 1.0, CABIN_DARK),
    slab(-0.9, 0.9, 1.5, 1.62, -1.8, 1.05, POLICE_BLUE),
    slab(-0.9, 0.9, 1.0, 1.55, -2.4, -1.75, POLICE_BLUE),
    slab(-0.6, 0, 1.62, 1.76, 0.15, 0.5, LIGHTBAR_RED),
    slab(0, 0.6, 1.62, 1.76, 0.15, 0.5, LIGHTBAR_BLUE),
    ...tyres(slab, [1.5, -1.5], 1.0, 0.38),
  ];
  for (const side of [-1, 1]) {
    for (const [z0, z1] of [
      [0.1, 1.2],
      [-1.3, 0],
    ] as const) {
      parts.push(
        slab(
          Math.min(side * 0.97, side),
          Math.max(side * 0.97, side),
          0.5,
          0.95,
          z0,
          z1,
          POLICE_PANEL,
        ),
      );
    }
  }
  return parts;
}

/**
 * A pumper, 2.5 x 3.0 x 10 m: a four-door cab with a light bar on its roof,
 * a pump section with a pump panel on each side, a lower hose bed behind it,
 * and a ladder carried along the right side over both.
 */
function buildFireParts(): THREE.BufferGeometry[] {
  const slab = slabFor(VehicleKind.Fire);
  const parts = [
    slab(-1.22, 1.22, 0.45, 1.3, -5, 4.95, FIRE_RED),
    slab(-1.2, 1.2, 1.3, 2.8, 2.6, 4.9, FIRE_RED),
    slab(-1.21, 1.21, 1.9, 2.55, 2.7, 4.8, CABIN_DARK),
    slab(-1.0, 1.0, 1.9, 2.55, 4.9, 4.95, CABIN_DARK),
    slab(-1.22, 1.22, 1.3, 2.2, 0.1, 2.6, FIRE_RED),
    slab(-1.22, 1.22, 1.3, 1.65, -5, 0.1, FIRE_RED),
    slab(-1.2, 1.2, 0.5, 0.85, 4.95, 5, BUMPER_STEEL),
    slab(-0.55, 0.55, 2.8, 3.0, 3.5, 4.0, LIGHTBAR_RED),
    // The ladder: on the pump section's roof, then on two posts over the hose bed.
    slab(0.45, 0.95, 2.2, 2.35, -4, 2.4, LADDER_GREY),
    slab(0.5, 0.9, 1.65, 2.2, -3.9, -3.7, FIRE_RED),
    slab(0.5, 0.9, 1.65, 2.2, -0.4, -0.2, FIRE_RED),
    ...tyres(slab, [4.0, -1.8, -3.2], 1.25, 0.5),
  ];
  for (const side of [-1, 1]) {
    const outer = side * 1.25;
    const inner = side * 1.19;
    // The pump panel, and the lines between the cab's four doors.
    parts.push(
      slab(Math.min(outer, inner), Math.max(outer, inner), 1.0, 1.9, 0.7, 2.3, PUMP_PANEL),
    );
    for (const z of [3.2, 3.75, 4.5]) {
      parts.push(
        slab(
          Math.min(side * 1.2, side * 1.215),
          Math.max(side * 1.2, side * 1.215),
          1.3,
          2.7,
          z,
          z + 0.04,
          CABIN_DARK,
        ),
      );
    }
  }
  return parts;
}

/**
 * A Type III ambulance, 2.5 x 2.7 x 6.9 m: a van cab and hood low in front
 * of a taller, wider box body, a red stripe along both, a red cross on the
 * box's sides, and a light bar across the front of the box's roof.
 */
function buildAmbulanceParts(): THREE.BufferGeometry[] {
  const slab = slabFor(VehicleKind.Ambulance);
  const parts = [
    slab(-1.23, 1.23, 0.55, 2.58, -3.45, 1.85, AMBULANCE_WHITE),
    slab(-1.12, 1.12, 0.9, 2.1, 1.85, 2.65, AMBULANCE_WHITE),
    slab(-1.12, 1.12, 0.4, 1.15, 2.65, 3.45, AMBULANCE_WHITE),
    slab(-1.0, 1.0, 1.2, 2.05, 2.62, 2.7, CABIN_DARK),
    slab(-0.8, 0.8, 2.58, 2.7, 1.3, 1.8, LIGHTBAR_RED),
    ...tyres(slab, [2.55, -1.9], 1.25, 0.45),
  ];
  for (const side of [-1, 1]) {
    const range = (a: number, b: number): [number, number] => [
      Math.min(side * a, side * b),
      Math.max(side * a, side * b),
    ];
    const [bx0, bx1] = range(1.23, 1.25);
    const [cx0, cx1] = range(1.12, 1.14);
    parts.push(slab(cx0, cx1, 1.35, 1.95, 2.0, 2.6, CABIN_DARK));
    parts.push(slab(bx0, bx1, 1.0, 1.25, -3.4, 1.8, RED_CROSS));
    parts.push(slab(cx0, cx1, 0.75, 0.95, 1.9, 3.4, RED_CROSS));
    parts.push(slab(bx0, bx1, 1.7, 2.4, -1.1, -0.9, RED_CROSS));
    parts.push(slab(bx0, bx1, 1.95, 2.15, -1.35, -0.65, RED_CROSS));
  }
  return parts;
}

/**
 * A rear-loading refuse truck (or the recycling truck, which is the same
 * body in its own colours), 2.44 x 3.5 x 9 m: a cab-over cab in front, a tall
 * packer body behind it, and a hopper at the tail whose roof slopes down to
 * the loading sill.
 */
function buildRefuseParts(kind: ServiceVehicleKind): THREE.BufferGeometry[] {
  const slab = slabFor(kind);
  const ramp = rampFor(kind, slab);
  const recycling = kind === VehicleKind.Recycling;
  const body = recycling ? RECYCLING_TEAL : GARBAGE_GREEN;
  const hopper = recycling ? RECYCLING_HOPPER : GARBAGE_HOPPER;
  const cab = recycling ? RECYCLING_CAB : GARBAGE_GREEN;
  return [
    slab(-1.2, 1.2, 0.6, 3.5, -3.0, 2.5, body),
    slab(-1.2, 1.2, 0.6, 2.7, 2.55, 4.45, cab),
    slab(-1.21, 1.21, 1.6, 2.45, 3.4, 4.4, CABIN_DARK),
    slab(-1.0, 1.0, 1.5, 2.5, 4.45, 4.5, CABIN_DARK),
    ramp(-1.15, 1.15, 0.6, 3.2, -4.5, -3.0, hopper, 1.6),
    ...tyres(slab, [3.4, -1.8], 1.22, 0.55),
  ];
}

/**
 * Builds the merged multi-part geometry for one service-vehicle kind, drawn in
 * metres on the ground and normalised by the kind's own size so the instance
 * scale restores them. Every part carries its own vertex colour (the livery
 * region it belongs to), so no per-instance tint is needed. The first part is
 * always the body, in the kind's livery colour.
 */
export function buildServiceVehicleGeometry(kind: ServiceVehicleKind): THREE.BufferGeometry {
  if (kind === VehicleKind.Hearse) return buildHearseGeometry();
  let parts: THREE.BufferGeometry[];
  switch (kind) {
    case VehicleKind.Police:
      parts = buildPoliceParts();
      break;
    case VehicleKind.Fire:
      parts = buildFireParts();
      break;
    case VehicleKind.Ambulance:
      parts = buildAmbulanceParts();
      break;
    case VehicleKind.Recycling:
      parts = buildRefuseParts(VehicleKind.Recycling);
      break;
    case VehicleKind.Garbage:
    default:
      // A kind this renderer has no livery for is drawn as a refuse truck.
      parts = buildRefuseParts(VehicleKind.Garbage);
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged)
    throw new Error(`buildServiceVehicleGeometry: mergeGeometries failed for kind ${kind}`);
  return merged;
}

/** The pin of a call nobody is coming to: a plain cone, point at y = 0 and base at y = 1. */
function buildOpenPinGeometry(): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(1, 1, 8);
  cone.rotateX(Math.PI);
  cone.translate(0, 0.5, 0);
  return cone;
}

/** The halo's ring in the cone's unit space (1 unit across is 0.8 m at severity 0): radius, tube and how far up the cone it floats. */
const PIN_HALO_RADIUS = 1.8;
const PIN_HALO_TUBE = 0.28;
const PIN_HALO_HEIGHT = 0.6;

/**
 * The pin of an answered call: the open pin's cone with a flat ring floating
 * around it, wider than the cone's base. The ring is flattened by the pin's
 * height so it stays as thick as it is wide once the instance scale stretches
 * the cone up.
 */
function buildAnsweredPinGeometry(): THREE.BufferGeometry {
  const ring = new THREE.TorusGeometry(PIN_HALO_RADIUS, PIN_HALO_TUBE, 6, 20);
  ring.rotateX(Math.PI / 2);
  ring.scale(1, INCIDENT_PIN_BASE_M / 2 / INCIDENT_PIN_HEIGHT_M, 1);
  ring.translate(0, PIN_HALO_HEIGHT, 0);
  const cone = buildOpenPinGeometry();
  const merged = mergeGeometries([cone, ring], false);
  cone.dispose();
  ring.dispose();
  if (!merged) throw new Error('buildAnsweredPinGeometry: mergeGeometries failed');
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

  /** Pins of calls a station has taken. */
  private readonly incidentMesh: THREE.InstancedMesh;
  /** Pins of calls nobody is coming to. */
  private readonly openMesh: THREE.InstancedMesh;
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
    // An open call is that plain cone; a call a station has taken is the cone
    // ringed by a halo, so the two differ in outline and not only in colour.
    this.incidentMesh = this.makePinMesh(buildAnsweredPinGeometry(), 'answered');
    this.openMesh = this.makePinMesh(buildOpenPinGeometry(), 'open');
    scene.add(this.incidentMesh, this.openMesh);
  }

  private makePinMesh(geometry: THREE.BufferGeometry, state: string): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial(),
      this.incidentCapacity,
    );
    mesh.frustumCulled = false;
    mesh.count = this.incidentCapacity;
    mesh.userData.incidentPin = state;
    // The colour buffer has to exist before the first draw: a material compiled
    // without it never picks one up later, and every pin drew white.
    _color.setRGB(1, 1, 1);
    for (let i = 0; i < this.incidentCapacity; i++) {
      mesh.setMatrixAt(i, HIDDEN_MATRIX);
      mesh.setColorAt(i, _color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
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

      const open = incident.answered === false;
      const [r, g, b] = this.colorForIncident(incident.kind);
      if (open) {
        _color.setRGB(
          r * UNANSWERED_KIND_SHARE + UNANSWERED_ASH * (1 - UNANSWERED_KIND_SHARE),
          g * UNANSWERED_KIND_SHARE + UNANSWERED_ASH * (1 - UNANSWERED_KIND_SHARE),
          b * UNANSWERED_KIND_SHARE + UNANSWERED_ASH * (1 - UNANSWERED_KIND_SHARE),
        );
      } else {
        _color.setRGB(r, g, b);
      }
      // The call's shape is its state: it shows in one mesh and is hidden in the other.
      const shown = open ? this.openMesh : this.incidentMesh;
      const hidden = open ? this.incidentMesh : this.openMesh;
      shown.setMatrixAt(i, _matrix);
      shown.setColorAt(i, _color);
      hidden.setMatrixAt(i, HIDDEN_MATRIX);
    }
    for (const mesh of [this.incidentMesh, this.openMesh]) {
      for (let i = n; i < this.incidentCapacity; i++) mesh.setMatrixAt(i, HIDDEN_MATRIX);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
